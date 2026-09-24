// Package google implements ads.Client for the Google Ads API over REST
// (googleads.googleapis.com), using GAQL searchStream for reads.
//
// Verified against the release notes (latest major: v25, 2026-07-22; minor
// v25.2 on 2026-09-23 keeps the /v25 path):
// https://developers.google.com/google-ads/api/docs/release-notes
// REST search/searchStream: https://developers.google.com/google-ads/api/rest/common/search
package google

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

const (
	DefaultAPIVersion = "v25"
	DefaultBaseURL    = "https://googleads.googleapis.com"
)

// Options configure a Client. Zero values select defaults.
type Options struct {
	BaseURL        string // default https://googleads.googleapis.com
	APIVersion     string // default DefaultAPIVersion
	HTTPClient     *http.Client
	TokenSource    oauth2.TokenSource // required
	DeveloperToken string             // required by the API on every call

	// LoginCustomerID is the default manager (MCC) customer to authenticate
	// as. LoginCustomerIDs overrides it per operating customer; it is
	// learned by ListAccounts (see LoginCustomerIDs()) and persisted by the
	// integrations service so later syncs reach clients under a manager.
	LoginCustomerID  string
	LoginCustomerIDs map[string]string

	MaxRetries    int           // default 3
	MaxInlineWait time.Duration // default 30s
	Sleep         func(context.Context, time.Duration) error
	Logger        *slog.Logger
}

// Client is safe for concurrent use.
type Client struct {
	opts Options
	base string

	mu     sync.Mutex
	logins map[string]string // operating customer -> login customer
}

var _ ads.Client = (*Client)(nil)

func New(opts Options) *Client {
	if opts.BaseURL == "" {
		opts.BaseURL = DefaultBaseURL
	}
	if opts.APIVersion == "" {
		opts.APIVersion = DefaultAPIVersion
	}
	if opts.HTTPClient == nil {
		opts.HTTPClient = &http.Client{Timeout: 5 * time.Minute}
	}
	if opts.MaxRetries <= 0 {
		opts.MaxRetries = 3
	}
	if opts.MaxInlineWait <= 0 {
		opts.MaxInlineWait = 30 * time.Second
	}
	if opts.Sleep == nil {
		opts.Sleep = providers.Sleep
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	logins := make(map[string]string, len(opts.LoginCustomerIDs))
	for k, v := range opts.LoginCustomerIDs {
		logins[normalizeCID(k)] = normalizeCID(v)
	}
	return &Client{
		opts:   opts,
		base:   strings.TrimRight(opts.BaseURL, "/") + "/" + opts.APIVersion,
		logins: logins,
	}
}

func (c *Client) Provider() ads.Provider { return ads.ProviderGoogle }

// LoginCustomerIDs returns the operating-customer -> login-customer mapping
// known to the client (configured plus discovered by ListAccounts).
func (c *Client) LoginCustomerIDs() map[string]string {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make(map[string]string, len(c.logins))
	for k, v := range c.logins {
		out[k] = v
	}
	return out
}

func (c *Client) loginFor(customerID string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if l, ok := c.logins[customerID]; ok {
		return l
	}
	return normalizeCID(c.opts.LoginCustomerID)
}

// normalizeCID strips dashes and a "customers/" prefix: "123-456-7890" -> "1234567890".
func normalizeCID(id string) string {
	id = strings.TrimPrefix(strings.TrimSpace(id), "customers/")
	return strings.ReplaceAll(id, "-", "")
}

// apiError is the google.rpc.Status envelope with GoogleAdsFailure details.
type apiError struct {
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
		Details []struct {
			Type   string `json:"@type"`
			Errors []struct {
				ErrorCode map[string]string `json:"errorCode"`
				Message   string            `json:"message"`
				Details   struct {
					QuotaErrorDetails struct {
						RateScope  string `json:"rateScope"`
						RateName   string `json:"rateName"`
						RetryDelay string `json:"retryDelay"`
					} `json:"quotaErrorDetails"`
				} `json:"details"`
			} `json:"errors"`
			RequestID  string `json:"requestId"`
			RetryDelay string `json:"retryDelay"` // google.rpc.RetryInfo
		} `json:"details"`
	} `json:"error"`
}

// unauthenticatedCodes are AuthenticationError values that a new OAuth grant fixes.
var unauthenticatedCodes = map[string]bool{
	"OAUTH_TOKEN_EXPIRED": true, "OAUTH_TOKEN_INVALID": true, "OAUTH_TOKEN_REVOKED": true,
	"OAUTH_TOKEN_DISABLED": true, "OAUTH_TOKEN_HEADER_INVALID": true, "AUTHENTICATION_ERROR": true,
	"NOT_ADS_USER": true, "GOOGLE_ACCOUNT_DELETED": true, "GOOGLE_ACCOUNT_COOKIE_INVALID": true,
	"GOOGLE_ACCOUNT_AUTHENTICATION_FAILED": true, "USER_ID_INVALID": true, "TWO_STEP_VERIFICATION_NOT_ENROLLED": true,
	"ADVANCED_PROTECTION_NOT_ENROLLED": true,
}

// classify maps an HTTP error body to a typed provider error.
func classify(httpStatus int, body []byte) *providers.Error {
	pe := &providers.Error{Provider: ads.ProviderGoogle, HTTPStatus: httpStatus}
	var ae apiError
	if err := json.Unmarshal(body, &ae); err != nil || ae.Error == nil {
		// searchStream wraps errors in an array.
		var arr []apiError
		if json.Unmarshal(body, &arr) == nil {
			for _, a := range arr {
				if a.Error != nil {
					ae = a
					break
				}
			}
		}
	}
	status := ""
	if e := ae.Error; e != nil {
		status = e.Status
		pe.Message = e.Message
		if pe.HTTPStatus == 0 {
			pe.HTTPStatus = e.Code
		}
	}
	if pe.Message == "" {
		pe.Message = http.StatusText(httpStatus)
	}

	var category, code, retryDelay string
	if e := ae.Error; e != nil {
		for _, d := range e.Details {
			if d.RequestID != "" {
				pe.RequestID = d.RequestID
			}
			if d.RetryDelay != "" {
				retryDelay = d.RetryDelay
			}
			for _, fe := range d.Errors {
				if category == "" {
					for k, v := range fe.ErrorCode {
						category, code = k, v
					}
					if fe.Message != "" {
						pe.Message = fe.Message
					}
				}
				if rd := fe.Details.QuotaErrorDetails.RetryDelay; rd != "" {
					retryDelay = rd
				}
			}
		}
	}
	if category != "" {
		pe.Code = category + "." + code
	} else if status != "" {
		pe.Code = status
	}

	switch {
	case category == "authenticationError" && unauthenticatedCodes[code],
		category == "" && (status == "UNAUTHENTICATED" || httpStatus == http.StatusUnauthorized):
		pe.Kind = providers.ErrUnauthorized
	case category == "quotaError" || status == "RESOURCE_EXHAUSTED" || httpStatus == http.StatusTooManyRequests:
		pe.Kind = providers.ErrRateLimited
		pe.RetryAfter = parseDuration(retryDelay)
		if pe.RetryAfter <= 0 {
			// RESOURCE_EXHAUSTED without a delay is usually the daily
			// operations quota of the developer token.
			pe.RetryAfter = 5 * time.Minute
			if code == "RESOURCE_TEMPORARILY_EXHAUSTED" {
				pe.RetryAfter = 30 * time.Second
			}
		}
	case category == "authenticationError" && code == "CUSTOMER_NOT_FOUND",
		category == "mutateError" && code == "RESOURCE_NOT_FOUND",
		status == "NOT_FOUND" || httpStatus == http.StatusNotFound:
		pe.Kind = providers.ErrNotFound
	case category == "authenticationError" || category == "authorizationError",
		status == "PERMISSION_DENIED" || httpStatus == http.StatusForbidden:
		pe.Kind = providers.ErrPermissionDenied
	case category == "internalError" || status == "UNAVAILABLE" || status == "INTERNAL" ||
		status == "DEADLINE_EXCEEDED" || httpStatus >= 500:
		pe.Kind = providers.ErrTemporary
	default:
		pe.Kind = providers.ErrInvalidRequest
	}
	return pe
}

// parseDuration reads a protobuf Duration JSON string such as "30s" or "1.5s".
func parseDuration(s string) time.Duration {
	if s == "" {
		return 0
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return 0
	}
	return d
}

// post sends a JSON request with retries and returns the raw response body.
func (c *Client) post(ctx context.Context, path, loginCID string, reqBody any) ([]byte, error) {
	return c.do(ctx, http.MethodPost, path, loginCID, reqBody)
}

func (c *Client) do(ctx context.Context, method, path, loginCID string, reqBody any) ([]byte, error) {
	var payload []byte
	if reqBody != nil {
		var err error
		if payload, err = json.Marshal(reqBody); err != nil {
			return nil, err
		}
	}
	var lastErr error
	for attempt := 0; attempt <= c.opts.MaxRetries; attempt++ {
		body, retry, wait, err := c.once(ctx, method, path, loginCID, payload)
		if err == nil {
			return body, nil
		}
		lastErr = err
		if !retry || attempt == c.opts.MaxRetries {
			break
		}
		if wait <= 0 {
			wait = providers.Backoff(attempt, time.Second, 20*time.Second)
		}
		c.opts.Logger.DebugContext(ctx, "google ads: retrying request", "path", path, "attempt", attempt+1, "wait", wait, "err", err)
		if serr := c.opts.Sleep(ctx, wait); serr != nil {
			return nil, serr
		}
	}
	return nil, lastErr
}

func (c *Client) once(ctx context.Context, method, path, loginCID string, payload []byte) ([]byte, bool, time.Duration, error) {
	tok, err := c.opts.TokenSource.Token()
	if err != nil {
		var re *oauth2.RetrieveError
		if errors.As(err, &re) || errors.Is(err, providers.ErrUnauthorized) {
			return nil, false, 0, &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrUnauthorized, Message: err.Error()}
		}
		return nil, false, 0, fmt.Errorf("google ads: token: %w", err)
	}
	var rdr io.Reader
	if payload != nil {
		rdr = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+"/"+strings.TrimLeft(path, "/"), rdr)
	if err != nil {
		return nil, false, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	req.Header.Set("developer-token", c.opts.DeveloperToken)
	if loginCID != "" {
		req.Header.Set("login-customer-id", loginCID)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.opts.HTTPClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, false, 0, ctx.Err()
		}
		return nil, true, 0, &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrTemporary, Message: err.Error()}
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 512<<20))
	if err != nil {
		return nil, true, 0, &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrTemporary, Message: err.Error()}
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// searchStream reports errors that happen mid-stream inside the array.
		if len(body) > 0 && body[0] == '[' && bytes.Contains(body, []byte(`"error"`)) {
			if pe := streamError(body); pe != nil {
				return nil, pe.Kind == providers.ErrTemporary, 0, pe
			}
		}
		return body, false, 0, nil
	}
	pe := classify(resp.StatusCode, body)
	switch {
	case errors.Is(pe, providers.ErrRateLimited):
		return nil, pe.RetryAfter <= c.opts.MaxInlineWait, pe.RetryAfter, pe
	case errors.Is(pe, providers.ErrTemporary):
		return nil, true, 0, pe
	}
	return nil, false, 0, pe
}

func streamError(body []byte) *providers.Error {
	var arr []json.RawMessage
	if json.Unmarshal(body, &arr) != nil {
		return nil
	}
	for _, el := range arr {
		var probe struct {
			Error json.RawMessage `json:"error"`
		}
		if json.Unmarshal(el, &probe) == nil && len(probe.Error) > 0 {
			return classify(0, el)
		}
	}
	return nil
}

// searchStream runs a GAQL query and returns every result row.
func (c *Client) searchStream(ctx context.Context, customerID, query string) ([]json.RawMessage, error) {
	return c.searchStreamAs(ctx, customerID, c.loginFor(customerID), query)
}

func (c *Client) searchStreamAs(ctx context.Context, customerID, loginCID, query string) ([]json.RawMessage, error) {
	if !isNumeric(customerID) {
		return nil, &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrInvalidRequest, Message: "invalid customer id"}
	}
	body, err := c.post(ctx, "customers/"+customerID+"/googleAds:searchStream", loginCID, map[string]string{"query": query})
	if err != nil {
		return nil, err
	}
	var batches []struct {
		Results []json.RawMessage `json:"results"`
	}
	if err := json.Unmarshal(body, &batches); err != nil {
		return nil, fmt.Errorf("google ads: decode searchStream: %w", err)
	}
	var rows []json.RawMessage
	for _, b := range batches {
		rows = append(rows, b.Results...)
	}
	return rows, nil
}

// mutateResponse covers partial-failure reporting on mutate endpoints.
type mutateResponse struct {
	Results []struct {
		ResourceName string `json:"resourceName"`
	} `json:"results"`
	PartialFailureError json.RawMessage `json:"partialFailureError"`
}

// mutate sends a single-operation mutate. partialFailure is off, so the
// whole request fails atomically; a partialFailureError in a 200 response is
// still treated as a failure.
func (c *Client) mutate(ctx context.Context, customerID, service string, op any) error {
	if !isNumeric(customerID) {
		return &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrInvalidRequest, Message: "invalid customer id"}
	}
	body, err := c.post(ctx, "customers/"+customerID+"/"+service+":mutate", c.loginFor(customerID),
		map[string]any{"operations": []any{op}, "partialFailure": false})
	if err != nil {
		return err
	}
	var res mutateResponse
	if err := json.Unmarshal(body, &res); err != nil {
		return fmt.Errorf("google ads: decode mutate: %w", err)
	}
	if len(res.PartialFailureError) > 0 && string(res.PartialFailureError) != "null" && string(res.PartialFailureError) != "{}" {
		pe := classify(0, append(append([]byte(`{"error":`), res.PartialFailureError...), '}'))
		return pe
	}
	if len(res.Results) == 0 {
		return &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrTemporary, Message: "mutate returned no results"}
	}
	return nil
}
