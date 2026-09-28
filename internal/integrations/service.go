// Package integrations connects organizations to ad providers over OAuth,
// stores encrypted tokens, discovers ad accounts and schedules sync jobs
// (plan §6, §21, §22, §33).
package integrations

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/platform/secrets"
	"github.com/iamv1n/adwise/internal/providers"
	"github.com/iamv1n/adwise/internal/store"
)

var (
	ErrProviderNotConfigured = httpx.NewError(http.StatusServiceUnavailable, "provider_not_configured",
		"this provider is not configured on the server")
	ErrUnknownProvider  = httpx.NewError(http.StatusNotFound, "unknown_provider", "unknown provider")
	ErrIntegrationState = httpx.NewError(http.StatusConflict, "integration_inactive",
		"this integration is not active; reconnect it first")
	ErrReauthRequired = httpx.NewError(http.StatusConflict, "reauth_required",
		"the provider rejected the stored credentials; reconnect this integration")
	ErrProviderPermission = httpx.NewError(http.StatusForbidden, "provider_permission_denied",
		"the connected provider account lacks permission for this operation")
	ErrProviderRateLimited = httpx.NewError(http.StatusServiceUnavailable, "provider_rate_limited",
		"the provider is rate limiting requests; try again later")
	ErrProviderUnavailable = httpx.NewError(http.StatusBadGateway, "provider_error",
		"the provider request failed")
	errValidation = httpx.NewError(http.StatusUnprocessableEntity, "validation_failed", "request validation failed")

	ErrSyncUnavailable = httpx.NewError(http.StatusServiceUnavailable, "sync_unavailable",
		"background sync is not available")
)

// StateTTL bounds how long a user has to complete the provider consent screen.
const StateTTL = 10 * time.Minute

type Service struct {
	db         *database.DB
	rdb        *redis.Client
	keys       *secrets.Keyring
	store      ads.Store
	apps       map[ads.Provider]App
	enqueuer   Enqueuer
	webBaseURL string
	logger     *slog.Logger
	now        func() time.Time

	// Meta leadgen webhook (leadwebhook.go).
	metaAppSecret          string
	metaWebhookVerifyToken string
}

type Options struct {
	DB         *database.DB
	Redis      *redis.Client
	Keys       *secrets.Keyring
	Store      ads.Store // implemented by internal/entities
	Apps       map[ads.Provider]App
	Enqueuer   Enqueuer // optional; nil disables POST .../sync
	WebBaseURL string
	Logger     *slog.Logger

	// MetaAppSecret verifies webhook signatures; MetaWebhookVerifyToken
	// answers the webhook handshake. Empty disables each.
	MetaAppSecret          string
	MetaWebhookVerifyToken string
}

func NewService(o Options) *Service {
	if o.Logger == nil {
		o.Logger = slog.Default()
	}
	return &Service{
		db: o.DB, rdb: o.Redis, keys: o.Keys, store: o.Store, apps: o.Apps, enqueuer: o.Enqueuer,
		webBaseURL: strings.TrimRight(o.WebBaseURL, "/"), logger: o.Logger, now: time.Now,
		metaAppSecret: o.MetaAppSecret, metaWebhookVerifyToken: o.MetaWebhookVerifyToken,
	}
}

func (s *Service) app(p string) (App, error) {
	a, ok := s.apps[ads.Provider(p)]
	if !ok {
		return nil, ErrUnknownProvider
	}
	if !a.Configured() {
		return nil, ErrProviderNotConfigured
	}
	return a, nil
}

// --- OAuth state ---

type oauthState struct {
	OrganizationID uuid.UUID    `json:"organization_id"`
	UserID         uuid.UUID    `json:"user_id"`
	Provider       ads.Provider `json:"provider"`
	Verifier       string       `json:"verifier,omitempty"`
}

// The Redis key is a hash of the state so the raw value never sits in Redis.
func stateKey(state string) string {
	sum := sha256.Sum256([]byte(state))
	return "oauth_state:" + hex.EncodeToString(sum[:])
}

func randomState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// StartConnect creates a one-time state bound to (org, user, provider) and
// returns the provider consent URL.
func (s *Service) StartConnect(ctx context.Context, m organizations.Membership, provider string) (string, error) {
	app, err := s.app(provider)
	if err != nil {
		return "", err
	}
	state, err := randomState()
	if err != nil {
		return "", err
	}
	st := oauthState{OrganizationID: m.OrganizationID, UserID: m.UserID, Provider: app.Provider()}
	if app.UsesPKCE() {
		st.Verifier = oauth2.GenerateVerifier()
	}
	payload, err := json.Marshal(st)
	if err != nil {
		return "", err
	}
	if err := s.rdb.Set(ctx, stateKey(state), payload, StateTTL).Err(); err != nil {
		return "", fmt.Errorf("store oauth state: %w", err)
	}
	return app.AuthCodeURL(state, st.Verifier), nil
}

// CallbackParams are the query parameters of the provider redirect.
type CallbackParams struct {
	State            string
	Code             string
	Error            string // provider error, e.g. access_denied
	ErrorDescription string
}

// Callback completes the OAuth flow and returns where to redirect the
// browser. It never returns an error: failures become ?error=<code>.
func (s *Service) Callback(ctx context.Context, provider string, p CallbackParams) string {
	redirect := func(q url.Values) string {
		return s.webBaseURL + "/app/integrations?" + q.Encode()
	}
	fail := func(code string, err error) string {
		if err != nil {
			s.logger.WarnContext(ctx, "integration callback failed", "provider", provider, "error_code", code, "err", err)
		}
		return redirect(url.Values{"error": {code}, "provider": {provider}})
	}

	app, err := s.app(provider)
	if err != nil {
		var he *httpx.Error
		if errors.As(err, &he) {
			return fail(he.Code, nil)
		}
		return fail("server_error", err)
	}
	if p.State == "" {
		return fail("invalid_state", nil)
	}
	// GETDEL consumes the state: each authorization can complete only once.
	raw, err := s.rdb.GetDel(ctx, stateKey(p.State)).Bytes()
	if errors.Is(err, redis.Nil) {
		return fail("invalid_state", nil)
	}
	if err != nil {
		return fail("server_error", err)
	}
	var st oauthState
	if err := json.Unmarshal(raw, &st); err != nil || st.Provider != app.Provider() {
		return fail("invalid_state", err)
	}
	if p.Error != "" {
		code := "access_denied"
		if p.Error != "access_denied" {
			code = "provider_error"
		}
		s.logger.InfoContext(ctx, "provider returned an OAuth error", "provider", provider, "error", p.Error, "description", p.ErrorDescription)
		return fail(code, nil)
	}
	if p.Code == "" {
		return fail("invalid_request", nil)
	}

	// The user must still be an admin of the organization.
	mem, err := s.db.GetMembership(ctx, store.GetMembershipParams{OrganizationID: st.OrganizationID, UserID: st.UserID})
	if err != nil || !organizations.AtLeast(mem.Role, organizations.RoleAdmin) {
		return fail("forbidden", err)
	}

	grant, err := app.Exchange(ctx, p.Code, st.Verifier)
	if err != nil {
		if errors.Is(err, errMissingScope) {
			return fail("missing_scope", err)
		}
		return fail("exchange_failed", err)
	}
	integ, err := s.saveGrant(ctx, st, grant)
	if err != nil {
		return fail("server_error", err)
	}

	q := url.Values{"connected": {provider}, "integration_id": {integ.ID.String()}}
	// Discover right away so accounts appear without another click. A failure
	// here leaves the integration connected with last_error set.
	accounts, err := s.discover(ctx, integ, &st.UserID)
	if err != nil {
		s.logger.WarnContext(ctx, "discovery after connect failed", "integration_id", integ.ID, "err", err)
		q.Set("discover_error", "1")
	} else {
		q.Set("accounts", fmt.Sprint(len(accounts)))
	}
	return redirect(q)
}

// associatedData binds a ciphertext to its integration row.
func associatedData(orgID uuid.UUID, provider ads.Provider, externalUserID, kind string) []byte {
	return []byte("integration|" + orgID.String() + "|" + string(provider) + "|" + externalUserID + "|" + kind)
}

func (s *Service) saveGrant(ctx context.Context, st oauthState, g Grant) (store.Integration, error) {
	if g.ExternalUserID == "" {
		return store.Integration{}, errors.New("provider returned no user id")
	}
	access, err := s.keys.SealString(g.Token.AccessToken, associatedData(st.OrganizationID, st.Provider, g.ExternalUserID, "access"))
	if err != nil {
		return store.Integration{}, err
	}
	var refresh []byte
	if g.Token.RefreshToken != "" {
		if refresh, err = s.keys.SealString(g.Token.RefreshToken, associatedData(st.OrganizationID, st.Provider, g.ExternalUserID, "refresh")); err != nil {
			return store.Integration{}, err
		}
	}
	var expiry *time.Time
	if !g.Token.Expiry.IsZero() {
		e := g.Token.Expiry
		expiry = &e
	}
	scopes := g.Scopes
	if scopes == nil {
		scopes = []string{}
	}

	var integ store.Integration
	err = s.db.InTx(ctx, func(q *store.Queries) error {
		var err error
		integ, err = q.UpsertIntegration(ctx, store.UpsertIntegrationParams{
			OrganizationID: st.OrganizationID, Provider: store.AdProvider(st.Provider),
			ExternalUserID: g.ExternalUserID, DisplayName: g.DisplayName, Scopes: scopes,
			AccessTokenEncrypted: access, RefreshTokenEncrypted: refresh, TokenExpiresAt: expiry,
			CreatedBy: &st.UserID,
		})
		if err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &st.OrganizationID, ActorUserID: &st.UserID,
			Action: "integration.connected", EntityType: "integration", EntityID: integ.ID.String(),
			Metadata: map[string]any{"provider": st.Provider, "external_user_id": g.ExternalUserID, "scopes": scopes},
		})
	})
	return integ, err
}

// --- tokens ---

func (s *Service) loadToken(integ store.Integration) (*oauth2.Token, error) {
	if len(integ.AccessTokenEncrypted) == 0 {
		return nil, ErrIntegrationState
	}
	p := ads.Provider(integ.Provider)
	access, err := s.keys.OpenString(integ.AccessTokenEncrypted, associatedData(integ.OrganizationID, p, integ.ExternalUserID, "access"))
	if err != nil {
		return nil, fmt.Errorf("decrypt access token: %w", err)
	}
	tok := &oauth2.Token{AccessToken: access, TokenType: "Bearer"}
	if len(integ.RefreshTokenEncrypted) > 0 {
		if tok.RefreshToken, err = s.keys.OpenString(integ.RefreshTokenEncrypted, associatedData(integ.OrganizationID, p, integ.ExternalUserID, "refresh")); err != nil {
			return nil, fmt.Errorf("decrypt refresh token: %w", err)
		}
	}
	if integ.TokenExpiresAt != nil {
		tok.Expiry = *integ.TokenExpiresAt
	}
	return tok, nil
}

// persistingTokenSource refreshes through the provider, stores rotated tokens
// and marks the integration needs_reauth when the grant is no longer valid.
type persistingTokenSource struct {
	svc   *Service
	integ store.Integration
	base  oauth2.TokenSource

	mu   sync.Mutex
	last string
}

func (t *persistingTokenSource) Token() (*oauth2.Token, error) {
	tok, err := t.base.Token()
	ctx := context.Background()
	if err != nil {
		var re *oauth2.RetrieveError
		if errors.As(err, &re) || errors.Is(err, providers.ErrUnauthorized) {
			t.svc.markNeedsReauth(ctx, t.integ.ID, err)
			return nil, fmt.Errorf("%w: %v", providers.ErrUnauthorized, err)
		}
		return nil, err
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if tok.AccessToken != t.last {
		if t.last != "" {
			if perr := t.svc.persistToken(ctx, t.integ, tok); perr != nil {
				t.svc.logger.Error("persist refreshed token", "integration_id", t.integ.ID, "err", perr)
			}
		}
		t.last = tok.AccessToken
	}
	return tok, nil
}

func (s *Service) persistToken(ctx context.Context, integ store.Integration, tok *oauth2.Token) error {
	p := ads.Provider(integ.Provider)
	access, err := s.keys.SealString(tok.AccessToken, associatedData(integ.OrganizationID, p, integ.ExternalUserID, "access"))
	if err != nil {
		return err
	}
	var refresh []byte
	if tok.RefreshToken != "" {
		if refresh, err = s.keys.SealString(tok.RefreshToken, associatedData(integ.OrganizationID, p, integ.ExternalUserID, "refresh")); err != nil {
			return err
		}
	}
	var expiry *time.Time
	if !tok.Expiry.IsZero() {
		e := tok.Expiry
		expiry = &e
	}
	return s.db.UpdateIntegrationTokens(ctx, store.UpdateIntegrationTokensParams{
		ID: integ.ID, AccessTokenEncrypted: access, RefreshTokenEncrypted: refresh, TokenExpiresAt: expiry,
	})
}

func (s *Service) markNeedsReauth(ctx context.Context, id uuid.UUID, cause error) {
	msg := "provider rejected credentials"
	if cause != nil {
		msg = truncate(cause.Error(), 500)
	}
	if err := s.db.MarkIntegrationNeedsReauth(ctx, store.MarkIntegrationNeedsReauthParams{ID: id, LastError: &msg}); err != nil {
		s.logger.Error("mark integration needs_reauth", "integration_id", id, "err", err)
		return
	}
	s.logger.Warn("integration needs re-authorization", "integration_id", id, "cause", msg)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// ClientFor builds an authenticated provider client for an active integration.
func (s *Service) ClientFor(integ store.Integration) (ads.Client, error) {
	if integ.Status != store.IntegrationStatusActive {
		return nil, ErrIntegrationState
	}
	app, err := s.app(string(integ.Provider))
	if err != nil {
		return nil, err
	}
	tok, err := s.loadToken(integ)
	if err != nil {
		return nil, err
	}
	ts := &persistingTokenSource{svc: s, integ: integ, base: app.TokenSource(tok), last: tok.AccessToken}
	return app.NewClient(ts, parseMetadata(integ.Metadata)), nil
}

// ProviderError converts provider failures into API errors, marking the
// integration needs_reauth on ErrUnauthorized.
func (s *Service) ProviderError(ctx context.Context, integID uuid.UUID, err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, providers.ErrUnauthorized):
		s.markNeedsReauth(ctx, integID, err)
		return ErrReauthRequired
	case errors.Is(err, providers.ErrPermissionDenied):
		s.setLastError(ctx, integID, err)
		return ErrProviderPermission
	case errors.Is(err, providers.ErrRateLimited):
		return ErrProviderRateLimited
	}
	var pe *providers.Error
	if errors.As(err, &pe) {
		s.setLastError(ctx, integID, err)
		e := *ErrProviderUnavailable
		e.Message = "the provider request failed: " + truncate(pe.Message, 300)
		return &e
	}
	var he *httpx.Error
	if errors.As(err, &he) {
		return he
	}
	return err
}

func (s *Service) setLastError(ctx context.Context, id uuid.UUID, err error) {
	msg := truncate(err.Error(), 500)
	if e := s.db.SetIntegrationError(ctx, store.SetIntegrationErrorParams{ID: id, LastError: &msg}); e != nil {
		s.logger.Error("record integration error", "integration_id", id, "err", e)
	}
}

// --- queries and commands ---

// View is the public representation of an integration (no secrets).
type View struct {
	ID               uuid.UUID  `json:"id"`
	Provider         string     `json:"provider"`
	Status           string     `json:"status"`
	ExternalUserID   string     `json:"external_user_id"`
	DisplayName      string     `json:"display_name"`
	Scopes           []string   `json:"scopes"`
	TokenExpiresAt   *time.Time `json:"token_expires_at"`
	LastError        *string    `json:"last_error"`
	LastDiscoveredAt *time.Time `json:"last_discovered_at"`
	AccountCount     int64      `json:"account_count"`
	SyncEnabledCount int64      `json:"sync_enabled_count"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

func toView(i store.Integration) View {
	return View{
		ID: i.ID, Provider: string(i.Provider), Status: string(i.Status), ExternalUserID: i.ExternalUserID,
		DisplayName: i.DisplayName, Scopes: i.Scopes, TokenExpiresAt: i.TokenExpiresAt, LastError: i.LastError,
		LastDiscoveredAt: i.LastDiscoveredAt, CreatedAt: i.CreatedAt, UpdatedAt: i.UpdatedAt,
	}
}

func (s *Service) List(ctx context.Context, orgID uuid.UUID) ([]View, error) {
	rows, err := s.db.ListIntegrations(ctx, orgID)
	if err != nil {
		return nil, err
	}
	counts, err := s.db.CountIntegrationAccounts(ctx, orgID)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]store.CountIntegrationAccountsRow, len(counts))
	for _, c := range counts {
		if c.IntegrationID != nil {
			byID[*c.IntegrationID] = c
		}
	}
	out := make([]View, len(rows))
	for i, r := range rows {
		out[i] = toView(r)
		if c, ok := byID[r.ID]; ok {
			out[i].AccountCount, out[i].SyncEnabledCount = c.Accounts, c.SyncEnabled
		}
	}
	return out, nil
}

func (s *Service) get(ctx context.Context, orgID, id uuid.UUID) (store.Integration, error) {
	integ, err := s.db.GetIntegration(ctx, store.GetIntegrationParams{ID: id, OrganizationID: orgID})
	if database.IsNotFound(err) {
		return integ, httpx.ErrNotFound
	}
	return integ, err
}

// Disconnect revokes the grant at the provider (best effort), wipes the
// tokens and marks the integration disconnected. Synced data is kept.
func (s *Service) Disconnect(ctx context.Context, m organizations.Membership, id uuid.UUID) error {
	integ, err := s.get(ctx, m.OrganizationID, id)
	if err != nil {
		return err
	}
	revoked := false
	if len(integ.AccessTokenEncrypted) > 0 {
		if app, ok := s.apps[ads.Provider(integ.Provider)]; ok && app.Configured() {
			if tok, err := s.loadToken(integ); err == nil {
				rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
				if err := app.Revoke(rctx, tok); err != nil {
					s.logger.WarnContext(ctx, "provider token revocation failed", "integration_id", id, "err", err)
				} else {
					revoked = true
				}
				cancel()
			}
		}
	}
	return s.db.InTx(ctx, func(q *store.Queries) error {
		if _, err := q.LockIntegration(ctx, store.LockIntegrationParams{ID: id, OrganizationID: m.OrganizationID}); err != nil {
			if database.IsNotFound(err) {
				return httpx.ErrNotFound
			}
			return err
		}
		if err := q.DisconnectIntegration(ctx, store.DisconnectIntegrationParams{ID: id, OrganizationID: m.OrganizationID}); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &m.OrganizationID, ActorUserID: &m.UserID,
			Action: "integration.disconnected", EntityType: "integration", EntityID: id.String(),
			Metadata: map[string]any{"provider": integ.Provider, "revoked_at_provider": revoked},
		})
	})
}

// Discover lists the provider accounts and upserts them into ad_accounts.
func (s *Service) Discover(ctx context.Context, m organizations.Membership, id uuid.UUID) ([]ads.Account, error) {
	integ, err := s.get(ctx, m.OrganizationID, id)
	if err != nil {
		return nil, err
	}
	return s.discover(ctx, integ, &m.UserID)
}

func (s *Service) discover(ctx context.Context, integ store.Integration, actor *uuid.UUID) ([]ads.Account, error) {
	if s.store == nil {
		return nil, ErrSyncUnavailable
	}
	client, err := s.ClientFor(integ)
	if err != nil {
		return nil, err
	}
	accounts, err := client.ListAccounts(ctx)
	if err != nil {
		return nil, s.ProviderError(ctx, integ.ID, err)
	}
	valid := accounts[:0:0]
	for _, a := range accounts {
		if a.ExternalID == "" || len(a.Currency) != 3 || a.Timezone == "" {
			s.logger.WarnContext(ctx, "skipping account without currency/timezone", "integration_id", integ.ID, "external_id", a.ExternalID)
			continue
		}
		if _, err := time.LoadLocation(a.Timezone); err != nil {
			s.logger.WarnContext(ctx, "skipping account with unknown timezone", "integration_id", integ.ID, "external_id", a.ExternalID, "timezone", a.Timezone)
			continue
		}
		valid = append(valid, a)
	}
	if err := s.store.UpsertAccounts(ctx, integ.OrganizationID, integ.ID, valid); err != nil {
		return nil, fmt.Errorf("upsert accounts: %w", err)
	}

	md := parseMetadata(integ.Metadata)
	if lc, ok := client.(interface{ LoginCustomerIDs() map[string]string }); ok {
		md.LoginCustomerIDs = lc.LoginCustomerIDs()
	}
	mdJSON, err := json.Marshal(md)
	if err != nil {
		return nil, err
	}
	err = s.db.InTx(ctx, func(q *store.Queries) error {
		if err := q.RecordIntegrationDiscovery(ctx, store.RecordIntegrationDiscoveryParams{ID: integ.ID, Metadata: mdJSON}); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &integ.OrganizationID, ActorUserID: actor,
			Action: "integration.accounts_discovered", EntityType: "integration", EntityID: integ.ID.String(),
			Metadata: map[string]any{"provider": integ.Provider, "accounts": len(valid)},
		})
	})
	if err != nil {
		return nil, err
	}
	if valid == nil {
		valid = []ads.Account{}
	}
	return valid, nil
}
