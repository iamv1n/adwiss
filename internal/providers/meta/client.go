// Package meta implements ads.Client for the Meta Marketing API (Graph API).
//
// Verified against the Graph API changelog (latest: v26.0, released
// 2026-07-29): https://developers.facebook.com/docs/graph-api/changelog
// Plain REST over net/http; no SDK.
package meta

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

const (
	DefaultAPIVersion = "v26.0"
	DefaultBaseURL    = "https://graph.facebook.com"
	// DefaultConversionActionType is the actions/action_values entry counted as
	// a conversion. "purchase" is Meta's standard purchase event across pixel,
	// app and offline sources.
	DefaultConversionActionType = "purchase"
)

// Options configure a Client. Zero values select sensible defaults.
type Options struct {
	BaseURL     string // default https://graph.facebook.com (tests pass an httptest URL)
	APIVersion  string // default DefaultAPIVersion
	HTTPClient  *http.Client
	TokenSource oauth2.TokenSource // required
	// AppSecret, when set, adds appsecret_proof to every call, which Meta
	// recommends (and apps may require) for server-to-server calls.
	AppSecret string

	ConversionActionType string // default "purchase"

	// AsyncThresholdDays: insights requests spanning more days than this use
	// async report jobs. 0 selects the default (14); negative disables async.
	AsyncThresholdDays int
	PageSize           int           // default 500
	MaxRetries         int           // default 3
	MaxInlineWait      time.Duration // longest rate-limit wait handled inside a call; default 30s
	PollInterval       time.Duration // async job poll interval; default 5s
	MaxAsyncWait       time.Duration // default 15m

	Sleep  func(context.Context, time.Duration) error // default providers.Sleep
	Logger *slog.Logger
}

// Client is safe for concurrent use.
type Client struct {
	opts       Options
	base       string
	convAction string

	mu         sync.Mutex
	currencies map[string]string // account ID -> currency
	usage      Usage
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
		opts.HTTPClient = &http.Client{Timeout: 60 * time.Second}
	}
	if opts.ConversionActionType == "" {
		opts.ConversionActionType = DefaultConversionActionType
	}
	if opts.AsyncThresholdDays == 0 {
		opts.AsyncThresholdDays = 14
	}
	if opts.PageSize <= 0 {
		opts.PageSize = 500
	}
	if opts.MaxRetries <= 0 {
		opts.MaxRetries = 3
	}
	if opts.MaxInlineWait <= 0 {
		opts.MaxInlineWait = 30 * time.Second
	}
	if opts.PollInterval <= 0 {
		opts.PollInterval = 5 * time.Second
	}
	if opts.MaxAsyncWait <= 0 {
		opts.MaxAsyncWait = 15 * time.Minute
	}
	if opts.Sleep == nil {
		opts.Sleep = providers.Sleep
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	return &Client{
		opts:       opts,
		base:       strings.TrimRight(opts.BaseURL, "/") + "/" + opts.APIVersion,
		convAction: opts.ConversionActionType,
		currencies: map[string]string{},
	}
}

func (c *Client) Provider() ads.Provider { return ads.ProviderMeta }

// Usage is the latest rate-limit utilization reported by Meta, in percent.
type Usage struct {
	MaxPercent  float64       // highest of all reported utilizations
	RegainAfter time.Duration // Meta's estimate until access is restored when throttled
	ObservedAt  time.Time
}

// LastUsage returns the most recent utilization seen in response headers.
func (c *Client) LastUsage() Usage {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.usage
}

// graphError is Meta's error envelope.
type graphError struct {
	Error struct {
		Message      string `json:"message"`
		Type         string `json:"type"`
		Code         int    `json:"code"`
		ErrorSubcode int    `json:"error_subcode"`
		IsTransient  bool   `json:"is_transient"`
		UserTitle    string `json:"error_user_title"`
		UserMsg      string `json:"error_user_msg"`
		FBTraceID    string `json:"fbtrace_id"`
	} `json:"error"`
}

// call performs one Graph API request with retries. path is relative to the
// version root (e.g. "act_1/campaigns"). GET sends params in the query; other
// methods send them form-encoded.
func (c *Client) call(ctx context.Context, method, path string, params url.Values, out any) error {
	var lastErr error
	for attempt := 0; attempt <= c.opts.MaxRetries; attempt++ {
		retry, wait, err := c.once(ctx, method, path, params, out)
		if err == nil {
			return nil
		}
		lastErr = err
		if !retry || attempt == c.opts.MaxRetries {
			break
		}
		if wait <= 0 {
			wait = providers.Backoff(attempt, 500*time.Millisecond, 10*time.Second)
		}
		c.opts.Logger.DebugContext(ctx, "meta: retrying request", "path", path, "attempt", attempt+1, "wait", wait, "err", err)
		if serr := c.opts.Sleep(ctx, wait); serr != nil {
			return serr
		}
	}
	return lastErr
}

func (c *Client) once(ctx context.Context, method, path string, params url.Values, out any) (retry bool, wait time.Duration, err error) {
	tok, err := c.opts.TokenSource.Token()
	if err != nil {
		return false, 0, c.tokenError(err)
	}
	q := url.Values{}
	for k, v := range params {
		q[k] = v
	}
	if c.opts.AppSecret != "" {
		q.Set("appsecret_proof", appSecretProof(tok.AccessToken, c.opts.AppSecret))
	}

	u := c.base + "/" + strings.TrimLeft(path, "/")
	var body io.Reader
	if method == http.MethodGet || method == http.MethodDelete {
		if len(q) > 0 {
			u += "?" + q.Encode()
		}
	} else {
		body = strings.NewReader(q.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return false, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}

	resp, err := c.opts.HTTPClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return false, 0, ctx.Err()
		}
		return true, 0, &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: err.Error()}
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return true, 0, &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: err.Error()}
	}

	usage := c.observeUsage(resp.Header)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// Slow down before Meta starts rejecting calls (plan §23: rate-limit coordination).
		if d := softThrottle(usage.MaxPercent); d > 0 {
			if err := c.opts.Sleep(ctx, d); err != nil {
				return false, 0, err
			}
		}
		if out == nil {
			return false, 0, nil
		}
		if err := json.Unmarshal(data, out); err != nil {
			return false, 0, fmt.Errorf("meta: decode %s: %w", path, err)
		}
		return false, 0, nil
	}

	perr := classify(resp.StatusCode, data, usage)
	switch {
	case errors.Is(perr, providers.ErrRateLimited):
		return perr.RetryAfter <= c.opts.MaxInlineWait, perr.RetryAfter, perr
	case errors.Is(perr, providers.ErrTemporary):
		return true, 0, perr
	}
	return false, 0, perr
}

func (c *Client) tokenError(err error) error {
	var re *oauth2.RetrieveError
	if errors.As(err, &re) || errors.Is(err, providers.ErrUnauthorized) {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrUnauthorized, Message: err.Error()}
	}
	return fmt.Errorf("meta: token: %w", err)
}

func classify(status int, body []byte, usage Usage) *providers.Error {
	var ge graphError
	_ = json.Unmarshal(body, &ge)
	e := ge.Error
	pe := &providers.Error{
		Provider: ads.ProviderMeta, HTTPStatus: status,
		Message: e.Message, RequestID: e.FBTraceID,
	}
	if e.Code != 0 {
		pe.Code = strconv.Itoa(e.Code)
		if e.ErrorSubcode != 0 {
			pe.Code += "/" + strconv.Itoa(e.ErrorSubcode)
		}
	}
	if e.UserMsg != "" {
		pe.Message = strings.TrimSpace(e.Message + " " + e.UserMsg)
	}
	if pe.Message == "" {
		pe.Message = http.StatusText(status)
	}

	switch {
	case e.Code == 190 || e.Code == 102 || e.Code == 2500 || status == http.StatusUnauthorized:
		pe.Kind = providers.ErrUnauthorized
	case isRateLimitCode(e.Code) || status == http.StatusTooManyRequests:
		pe.Kind = providers.ErrRateLimited
		pe.RetryAfter = usage.RegainAfter
		if pe.RetryAfter <= 0 {
			pe.RetryAfter = time.Minute
		}
	case e.Code == 10 || (e.Code >= 200 && e.Code <= 299) || status == http.StatusForbidden:
		pe.Kind = providers.ErrPermissionDenied
	case (e.Code == 100 && e.ErrorSubcode == 33) || e.Code == 803 || status == http.StatusNotFound:
		pe.Kind = providers.ErrNotFound
	case e.IsTransient || e.Code == 1 || e.Code == 2 || status >= 500:
		pe.Kind = providers.ErrTemporary
	default:
		pe.Kind = providers.ErrInvalidRequest
	}
	return pe
}

// isRateLimitCode covers app (4), user (17), page (32), API-specific (613)
// and business use case (80000–80014) throttling.
// https://developers.facebook.com/docs/graph-api/overview/rate-limiting
func isRateLimitCode(code int) bool {
	return code == 4 || code == 17 || code == 32 || code == 613 || (code >= 80000 && code <= 80014)
}

// softThrottle returns a pause after a successful call when utilization is high.
func softThrottle(pct float64) time.Duration {
	switch {
	case pct >= 95:
		return 5 * time.Second
	case pct >= 85:
		return time.Second
	}
	return 0
}

type bucUsage struct {
	Type                        string              `json:"type"`
	CallCount                   providers.FlexFloat `json:"call_count"`
	TotalCPUTime                providers.FlexFloat `json:"total_cputime"`
	TotalTime                   providers.FlexFloat `json:"total_time"`
	EstimatedTimeToRegainAccess providers.FlexFloat `json:"estimated_time_to_regain_access"` // minutes
}

type accountUsage struct {
	AccIDUtilPct      providers.FlexFloat `json:"acc_id_util_pct"`
	ResetTimeDuration providers.FlexFloat `json:"reset_time_duration"` // seconds
}

type appUsage struct {
	CallCount    providers.FlexFloat `json:"call_count"`
	TotalCPUTime providers.FlexFloat `json:"total_cputime"`
	TotalTime    providers.FlexFloat `json:"total_time"`
}

type insightsThrottle struct {
	AppIDUtilPct providers.FlexFloat `json:"app_id_util_pct"`
	AccIDUtilPct providers.FlexFloat `json:"acc_id_util_pct"`
}

// parseUsage reads X-Business-Use-Case-Usage, X-Ad-Account-Usage,
// X-App-Usage and X-FB-Ads-Insights-Throttle. Malformed headers are ignored.
func parseUsage(h http.Header) Usage {
	var u Usage
	bump := func(v providers.FlexFloat) { u.MaxPercent = max(u.MaxPercent, float64(v)) }

	if v := h.Get("X-Business-Use-Case-Usage"); v != "" {
		var m map[string][]bucUsage
		if json.Unmarshal([]byte(v), &m) == nil {
			for _, entries := range m {
				for _, e := range entries {
					bump(e.CallCount)
					bump(e.TotalCPUTime)
					bump(e.TotalTime)
					u.RegainAfter = max(u.RegainAfter, time.Duration(float64(e.EstimatedTimeToRegainAccess)*float64(time.Minute)))
				}
			}
		}
	}
	if v := h.Get("X-Ad-Account-Usage"); v != "" {
		var a accountUsage
		if json.Unmarshal([]byte(v), &a) == nil {
			bump(a.AccIDUtilPct)
			if a.AccIDUtilPct >= 100 {
				u.RegainAfter = max(u.RegainAfter, time.Duration(float64(a.ResetTimeDuration)*float64(time.Second)))
			}
		}
	}
	if v := h.Get("X-App-Usage"); v != "" {
		var a appUsage
		if json.Unmarshal([]byte(v), &a) == nil {
			bump(a.CallCount)
			bump(a.TotalCPUTime)
			bump(a.TotalTime)
		}
	}
	if v := h.Get("X-FB-Ads-Insights-Throttle"); v != "" {
		var t insightsThrottle
		if json.Unmarshal([]byte(v), &t) == nil {
			bump(t.AppIDUtilPct)
			bump(t.AccIDUtilPct)
		}
	}
	return u
}

func (c *Client) observeUsage(h http.Header) Usage {
	u := parseUsage(h)
	u.ObservedAt = time.Now()
	c.mu.Lock()
	c.usage = u
	c.mu.Unlock()
	if u.MaxPercent >= 75 {
		c.opts.Logger.Warn("meta: high API utilization", "max_pct", u.MaxPercent, "regain_after", u.RegainAfter)
	}
	return u
}

func appSecretProof(token, secret string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(token))
	return hex.EncodeToString(m.Sum(nil))
}

// page is a Graph API collection page.
type page struct {
	Data   []json.RawMessage `json:"data"`
	Paging struct {
		Cursors struct {
			After string `json:"after"`
		} `json:"cursors"`
		Next string `json:"next"`
	} `json:"paging"`
}

// each walks every page of a collection edge using the "after" cursor. It
// deliberately does not follow paging.next verbatim, so requests always go to
// the configured host with the header-based token.
func (c *Client) each(ctx context.Context, path string, params url.Values, fn func(json.RawMessage) error) error {
	q := url.Values{}
	for k, v := range params {
		q[k] = v
	}
	if q.Get("limit") == "" {
		q.Set("limit", strconv.Itoa(c.opts.PageSize))
	}
	for pages := 0; ; pages++ {
		if pages > 10_000 {
			return fmt.Errorf("meta: %s: too many pages", path)
		}
		var p page
		if err := c.call(ctx, http.MethodGet, path, q, &p); err != nil {
			return err
		}
		for _, raw := range p.Data {
			if err := fn(raw); err != nil {
				return err
			}
		}
		if p.Paging.Next == "" || p.Paging.Cursors.After == "" {
			return nil
		}
		q.Set("after", p.Paging.Cursors.After)
	}
}

// actPath returns "act_<id>" for either "123" or "act_123".
func actPath(accountID string) string { return "act_" + strings.TrimPrefix(accountID, "act_") }

func normalizeAccountID(accountID string) string { return strings.TrimPrefix(accountID, "act_") }
