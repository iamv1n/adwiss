package integrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/config"
	"github.com/iamv1n/adwise/internal/providers"
	"github.com/iamv1n/adwise/internal/providers/google"
	"github.com/iamv1n/adwise/internal/providers/meta"
)

// Grant is the result of a successful OAuth code exchange.
type Grant struct {
	Token          *oauth2.Token
	ExternalUserID string
	DisplayName    string
	Scopes         []string
}

// App is one provider's OAuth application plus the factory for its ads.Client.
type App interface {
	Provider() ads.Provider
	Configured() bool
	// UsesPKCE reports whether the provider supports PKCE (S256).
	UsesPKCE() bool
	AuthCodeURL(state, verifier string) string
	// Exchange trades the authorization code for tokens and resolves the
	// provider user who granted access.
	Exchange(ctx context.Context, code, verifier string) (Grant, error)
	// TokenSource returns a source that refreshes tok when possible.
	TokenSource(tok *oauth2.Token) oauth2.TokenSource
	NewClient(ts oauth2.TokenSource, metadata Metadata) ads.Client
	// Revoke invalidates the grant at the provider (best effort).
	Revoke(ctx context.Context, tok *oauth2.Token) error
}

// Metadata is the non-secret JSON stored in integrations.metadata.
type Metadata struct {
	// Google: operating customer -> manager customer used as login-customer-id.
	LoginCustomerIDs map[string]string `json:"login_customer_ids,omitempty"`
}

func parseMetadata(b []byte) Metadata {
	var m Metadata
	_ = json.Unmarshal(b, &m)
	return m
}

func callbackURL(apiBaseURL string, p ads.Provider) string {
	return strings.TrimRight(apiBaseURL, "/") + "/v1/integrations/" + string(p) + "/callback"
}

// NewApps builds the Meta and Google apps from configuration. Unconfigured
// apps are still returned so handlers can answer provider_not_configured.
func NewApps(cfg config.Integrations, httpClient *http.Client, logger *slog.Logger) map[ads.Provider]App {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 60 * time.Second}
	}
	return map[ads.Provider]App{
		ads.ProviderMeta:   newMetaApp(cfg, httpClient, logger),
		ads.ProviderGoogle: newGoogleApp(cfg, httpClient, logger),
	}
}

// --- Meta ---

type metaApp struct {
	oauth      *oauth2.Config
	client     meta.OAuthClient
	httpClient *http.Client
	cfg        config.Integrations
	logger     *slog.Logger
}

func newMetaApp(cfg config.Integrations, hc *http.Client, logger *slog.Logger) *metaApp {
	return &metaApp{
		oauth: &oauth2.Config{
			ClientID: cfg.MetaAppID, ClientSecret: cfg.MetaAppSecret,
			Endpoint:    meta.Endpoint(cfg.MetaAPIVersion),
			RedirectURL: callbackURL(cfg.APIBaseURL, ads.ProviderMeta),
			Scopes:      meta.Scopes,
		},
		client:     meta.OAuthClient{APIVersion: cfg.MetaAPIVersion, HTTPClient: hc, AppID: cfg.MetaAppID, AppSecret: cfg.MetaAppSecret},
		httpClient: hc,
		cfg:        cfg,
		logger:     logger,
	}
}

func (a *metaApp) Provider() ads.Provider { return ads.ProviderMeta }
func (a *metaApp) Configured() bool       { return a.cfg.MetaConfigured() }
func (a *metaApp) UsesPKCE() bool         { return false }

func (a *metaApp) AuthCodeURL(state, _ string) string {
	return a.oauth.AuthCodeURL(state)
}

func (a *metaApp) Exchange(ctx context.Context, code, _ string) (Grant, error) {
	short, err := a.client.ExchangeCode(ctx, code, a.oauth.RedirectURL)
	if err != nil {
		return Grant{}, fmt.Errorf("meta: exchange code: %w", err)
	}
	long, err := a.client.ExchangeLongLived(ctx, short.AccessToken)
	if err != nil {
		return Grant{}, fmt.Errorf("meta: long-lived exchange: %w", err)
	}
	me, err := a.client.Me(ctx, long.AccessToken)
	if err != nil {
		return Grant{}, fmt.Errorf("meta: identity: %w", err)
	}
	scopes, err := a.client.GrantedScopes(ctx, long.AccessToken)
	if err != nil {
		a.logger.WarnContext(ctx, "meta: could not read granted permissions", "err", err)
		scopes = meta.Scopes
	}
	return Grant{Token: long, ExternalUserID: me.ID, DisplayName: me.Name, Scopes: scopes}, nil
}

// TokenSource: Meta long-lived tokens cannot be refreshed; once expired the
// user must reconnect.
func (a *metaApp) TokenSource(tok *oauth2.Token) oauth2.TokenSource {
	return expiringTokenSource{tok: tok}
}

func (a *metaApp) NewClient(ts oauth2.TokenSource, _ Metadata) ads.Client {
	return meta.New(meta.Options{
		APIVersion: a.cfg.MetaAPIVersion, HTTPClient: a.httpClient, TokenSource: ts,
		AppSecret: a.cfg.MetaAppSecret, ConversionActionType: a.cfg.MetaConversionActionType,
		Logger: a.logger,
	})
}

func (a *metaApp) Revoke(ctx context.Context, tok *oauth2.Token) error {
	return a.client.Revoke(ctx, tok.AccessToken)
}

type expiringTokenSource struct{ tok *oauth2.Token }

func (s expiringTokenSource) Token() (*oauth2.Token, error) {
	if !s.tok.Expiry.IsZero() && time.Now().After(s.tok.Expiry) {
		return nil, fmt.Errorf("%w: access token expired at %s", providers.ErrUnauthorized, s.tok.Expiry.Format(time.RFC3339))
	}
	return s.tok, nil
}

// --- Google ---

// Google OAuth 2.0 for web server apps:
// https://developers.google.com/identity/protocols/oauth2/web-server
var googleEndpoint = oauth2.Endpoint{
	AuthURL:   "https://accounts.google.com/o/oauth2/v2/auth",
	TokenURL:  "https://oauth2.googleapis.com/token",
	AuthStyle: oauth2.AuthStyleInParams,
}

const (
	googleAdsScope     = "https://www.googleapis.com/auth/adwords"
	googleUserInfoURL  = "https://openidconnect.googleapis.com/v1/userinfo"
	googleRevokeURL    = "https://oauth2.googleapis.com/revoke"
	googleIdentityHint = "openid email profile"
)

type googleApp struct {
	oauth       *oauth2.Config
	httpClient  *http.Client
	cfg         config.Integrations
	logger      *slog.Logger
	userInfoURL string
	revokeURL   string
}

func newGoogleApp(cfg config.Integrations, hc *http.Client, logger *slog.Logger) *googleApp {
	return &googleApp{
		oauth: &oauth2.Config{
			ClientID: cfg.GoogleClientID, ClientSecret: cfg.GoogleClientSecret,
			Endpoint:    googleEndpoint,
			RedirectURL: callbackURL(cfg.APIBaseURL, ads.ProviderGoogle),
			Scopes:      append([]string{googleAdsScope}, strings.Fields(googleIdentityHint)...),
		},
		httpClient: hc, cfg: cfg, logger: logger,
		userInfoURL: googleUserInfoURL, revokeURL: googleRevokeURL,
	}
}

func (a *googleApp) Provider() ads.Provider { return ads.ProviderGoogle }
func (a *googleApp) Configured() bool       { return a.cfg.GoogleConfigured() }
func (a *googleApp) UsesPKCE() bool         { return true }

func (a *googleApp) AuthCodeURL(state, verifier string) string {
	// offline + consent guarantees a refresh token, also on reconnects.
	return a.oauth.AuthCodeURL(state,
		oauth2.AccessTypeOffline, oauth2.ApprovalForce,
		oauth2.SetAuthURLParam("include_granted_scopes", "true"),
		oauth2.S256ChallengeOption(verifier))
}

func (a *googleApp) Exchange(ctx context.Context, code, verifier string) (Grant, error) {
	ctx = context.WithValue(ctx, oauth2.HTTPClient, a.httpClient)
	tok, err := a.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Grant{}, fmt.Errorf("google: exchange code: %w", err)
	}
	var scopes []string
	if s, ok := tok.Extra("scope").(string); ok {
		scopes = strings.Fields(s)
	}
	if len(scopes) > 0 && !containsScope(scopes, googleAdsScope) {
		return Grant{}, errMissingScope
	}
	info, err := a.userInfo(ctx, tok.AccessToken)
	if err != nil {
		return Grant{}, fmt.Errorf("google: identity: %w", err)
	}
	name := info.Email
	if name == "" {
		name = info.Name
	}
	return Grant{Token: tok, ExternalUserID: info.Sub, DisplayName: name, Scopes: scopes}, nil
}

var errMissingScope = errors.New("the Google Ads permission was not granted")

func containsScope(scopes []string, want string) bool {
	for _, s := range scopes {
		if s == want {
			return true
		}
	}
	return false
}

type googleUserInfo struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func (a *googleApp) userInfo(ctx context.Context, accessToken string) (googleUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.userInfoURL, nil)
	if err != nil {
		return googleUserInfo{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return googleUserInfo{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return googleUserInfo{}, fmt.Errorf("userinfo: HTTP %d", resp.StatusCode)
	}
	var info googleUserInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return googleUserInfo{}, err
	}
	if info.Sub == "" {
		return googleUserInfo{}, errors.New("userinfo: missing sub")
	}
	return info, nil
}

func (a *googleApp) TokenSource(tok *oauth2.Token) oauth2.TokenSource {
	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, a.httpClient)
	return a.oauth.TokenSource(ctx, tok)
}

func (a *googleApp) NewClient(ts oauth2.TokenSource, md Metadata) ads.Client {
	return google.New(google.Options{
		APIVersion: a.cfg.GoogleAPIVersion, HTTPClient: a.httpClient, TokenSource: ts,
		DeveloperToken: a.cfg.GoogleDeveloperToken, LoginCustomerID: a.cfg.GoogleLoginCustomerID,
		LoginCustomerIDs: md.LoginCustomerIDs, Logger: a.logger,
	})
}

func (a *googleApp) Revoke(ctx context.Context, tok *oauth2.Token) error {
	// Revoking the refresh token also revokes its access tokens.
	t := tok.RefreshToken
	if t == "" {
		t = tok.AccessToken
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.revokeURL, strings.NewReader(url.Values{"token": {t}}.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusBadRequest { // 400 = already invalid
		return fmt.Errorf("google revoke: HTTP %d", resp.StatusCode)
	}
	return nil
}
