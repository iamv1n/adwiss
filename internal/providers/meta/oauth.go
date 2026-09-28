package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

// Facebook Login (manual flow):
// https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
// Long-lived tokens:
// https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
//
// Facebook Login does not document PKCE for the server-side code flow, so
// the integrations service relies on the state parameter plus the app secret.

// Scopes needed to read and manage ads and to read lead-form leads. All but
// ads_read require App Review (Advanced Access) before non-test users can grant
// them. leads_retrieval and the pages_* scopes are for Lead Ads; connections
// made before they were added must reconnect to import leads.
// pages_manage_metadata lets Adwise subscribe a Page to the leadgen webhook
// (POST /{page-id}/subscribed_apps) for instant leads.
var Scopes = []string{
	"ads_read", "ads_management", "business_management",
	"leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_ads",
	"pages_manage_metadata",
}

// Endpoint returns the OAuth endpoints for a Graph API version.
func Endpoint(apiVersion string) oauth2.Endpoint {
	if apiVersion == "" {
		apiVersion = DefaultAPIVersion
	}
	return oauth2.Endpoint{
		AuthURL:   "https://www.facebook.com/" + apiVersion + "/dialog/oauth",
		TokenURL:  "https://graph.facebook.com/" + apiVersion + "/oauth/access_token",
		AuthStyle: oauth2.AuthStyleInParams,
	}
}

// OAuthClient does the token exchange, identity and revocation calls that
// happen outside an ads.Client.
type OAuthClient struct {
	BaseURL    string // default https://graph.facebook.com
	APIVersion string
	HTTPClient *http.Client
	AppID      string
	AppSecret  string
}

func (o OAuthClient) url(path string) string {
	base, v := o.BaseURL, o.APIVersion
	if base == "" {
		base = DefaultBaseURL
	}
	if v == "" {
		v = DefaultAPIVersion
	}
	return strings.TrimRight(base, "/") + "/" + v + "/" + path
}

func (o OAuthClient) httpClient() *http.Client {
	if o.HTTPClient != nil {
		return o.HTTPClient
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (o OAuthClient) do(ctx context.Context, method, rawURL string, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, rawURL, nil)
	if err != nil {
		return err
	}
	resp, err := o.httpClient().Do(req)
	if err != nil {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: err.Error()}
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return classify(resp.StatusCode, body, parseUsage(resp.Header))
	}
	if out != nil {
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("meta: decode: %w", err)
		}
	}
	return nil
}

// ExchangeCode trades an authorization code for a short-lived user token
// (GET oauth/access_token, as documented for the manual login flow).
func (o OAuthClient) ExchangeCode(ctx context.Context, code, redirectURI string) (*oauth2.Token, error) {
	q := url.Values{
		"client_id":     {o.AppID},
		"client_secret": {o.AppSecret},
		"redirect_uri":  {redirectURI},
		"code":          {code},
	}
	return o.tokenRequest(ctx, q)
}

func (o OAuthClient) tokenRequest(ctx context.Context, q url.Values) (*oauth2.Token, error) {
	var res struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := o.do(ctx, http.MethodGet, o.url("oauth/access_token")+"?"+q.Encode(), &res); err != nil {
		return nil, err
	}
	if res.AccessToken == "" {
		return nil, &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrUnauthorized, Message: "token endpoint returned no access token"}
	}
	tok := &oauth2.Token{AccessToken: res.AccessToken, TokenType: "Bearer"}
	if res.ExpiresIn > 0 {
		tok.Expiry = time.Now().Add(time.Duration(res.ExpiresIn) * time.Second)
	}
	return tok, nil
}

// ExchangeLongLived swaps a short-lived user token (about 1–2 hours) for a
// long-lived one (about 60 days). Meta issues no refresh token; users must
// reconnect before expiry, which the integration surfaces as needs_reauth.
func (o OAuthClient) ExchangeLongLived(ctx context.Context, shortLived string) (*oauth2.Token, error) {
	q := url.Values{
		"grant_type":        {"fb_exchange_token"},
		"client_id":         {o.AppID},
		"client_secret":     {o.AppSecret},
		"fb_exchange_token": {shortLived},
	}
	return o.tokenRequest(ctx, q)
}

// Identity is the Meta user who granted access.
type Identity struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (o OAuthClient) authed(path, token string, extra url.Values) string {
	q := url.Values{"access_token": {token}}
	if o.AppSecret != "" {
		q.Set("appsecret_proof", appSecretProof(token, o.AppSecret))
	}
	for k, v := range extra {
		q[k] = v
	}
	return o.url(path) + "?" + q.Encode()
}

// Me returns the token's user.
func (o OAuthClient) Me(ctx context.Context, token string) (Identity, error) {
	var id Identity
	err := o.do(ctx, http.MethodGet, o.authed("me", token, url.Values{"fields": {"id,name"}}), &id)
	return id, err
}

// GrantedScopes returns the permissions the user actually granted.
func (o OAuthClient) GrantedScopes(ctx context.Context, token string) ([]string, error) {
	var res struct {
		Data []struct {
			Permission string `json:"permission"`
			Status     string `json:"status"`
		} `json:"data"`
	}
	if err := o.do(ctx, http.MethodGet, o.authed("me/permissions", token, nil), &res); err != nil {
		return nil, err
	}
	var out []string
	for _, p := range res.Data {
		if p.Status == "granted" {
			out = append(out, p.Permission)
		}
	}
	return out, nil
}

// Revoke removes the app's permissions for the token's user (DELETE /me/permissions).
func (o OAuthClient) Revoke(ctx context.Context, token string) error {
	return o.do(ctx, http.MethodDelete, o.authed("me/permissions", token, nil), nil)
}
