package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/secrets"
	"github.com/iamv1n/adwise/internal/providers"
	"github.com/iamv1n/adwise/internal/queue"
	"github.com/iamv1n/adwise/internal/store"
)

// These tests need the development Postgres and Redis (make up && make migrate).
// They are skipped when DATABASE_URL is not set.

// --- fakes ---

type memStore struct {
	mu        sync.Mutex
	accounts  map[uuid.UUID][]ads.Account
	campaigns []ads.Campaign
	adGroups  []ads.AdGroup
	ads       []ads.Ad
	creatives []ads.Creative
	facts     []ads.MetricFact
	synced    []string
}

func newMemStore() *memStore { return &memStore{accounts: map[uuid.UUID][]ads.Account{}} }

func (m *memStore) UpsertAccounts(_ context.Context, _, integrationID uuid.UUID, a []ads.Account) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.accounts[integrationID] = append(m.accounts[integrationID], a...)
	return nil
}
func (m *memStore) UpsertCampaigns(_ context.Context, _ uuid.UUID, c []ads.Campaign) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.campaigns = append(m.campaigns, c...)
	return nil
}
func (m *memStore) UpsertAdGroups(_ context.Context, _ uuid.UUID, g []ads.AdGroup) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.adGroups = append(m.adGroups, g...)
	return nil
}
func (m *memStore) UpsertAds(_ context.Context, _ uuid.UUID, a []ads.Ad) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ads = append(m.ads, a...)
	return nil
}
func (m *memStore) UpsertCreatives(_ context.Context, _ uuid.UUID, c []ads.Creative) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.creatives = append(m.creatives, c...)
	return nil
}
func (m *memStore) UpsertMetricFacts(_ context.Context, _ uuid.UUID, f []ads.MetricFact) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.facts = append(m.facts, f...)
	return nil
}
func (m *memStore) MarkSynced(_ context.Context, _ uuid.UUID, p ads.Provider, acct, scope string, _ time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.synced = append(m.synced, string(p)+"/"+acct+"/"+scope)
	return nil
}

type fakeClient struct {
	accounts    []ads.Account
	accountsErr error
	reportErr   error
	tokens      oauth2.TokenSource
}

func (f *fakeClient) Provider() ads.Provider { return ads.ProviderMeta }
func (f *fakeClient) Capabilities() ads.Capabilities {
	return ads.Capabilities{Reports: []string{"campaign_daily", "campaign_hourly"}}
}
func (f *fakeClient) ListAccounts(context.Context) ([]ads.Account, error) {
	if f.tokens != nil {
		if _, err := f.tokens.Token(); err != nil {
			return nil, err
		}
	}
	return f.accounts, f.accountsErr
}
func (f *fakeClient) ListCampaigns(_ context.Context, a string) ([]ads.Campaign, error) {
	return []ads.Campaign{{Provider: ads.ProviderMeta, AccountExternalID: a, ExternalID: "c1"}}, nil
}
func (f *fakeClient) ListAdGroups(_ context.Context, a string) ([]ads.AdGroup, error) {
	return []ads.AdGroup{{Provider: ads.ProviderMeta, AccountExternalID: a, CampaignExternalID: "c1", ExternalID: "g1"}}, nil
}
func (f *fakeClient) ListAds(_ context.Context, a string) ([]ads.Ad, error) {
	return []ads.Ad{{Provider: ads.ProviderMeta, AccountExternalID: a, ExternalID: "ad1"}}, nil
}
func (f *fakeClient) ListCreatives(_ context.Context, a string) ([]ads.Creative, error) {
	return []ads.Creative{{Provider: ads.ProviderMeta, AccountExternalID: a, ExternalID: "cr1"}}, nil
}
func (f *fakeClient) FetchReport(_ context.Context, def ads.ReportDefinition, a string, r ads.DateRange) ([]ads.MetricFact, error) {
	if f.reportErr != nil {
		return nil, f.reportErr
	}
	return []ads.MetricFact{{Provider: ads.ProviderMeta, Report: def.Name, AccountExternalID: a, Date: r.Start}}, nil
}
func (f *fakeClient) SetCampaignStatus(context.Context, string, string, ads.Status) error { return nil }
func (f *fakeClient) UpdateCampaignBudget(context.Context, string, string, ads.Micros) error {
	return nil
}

type fakeApp struct {
	provider   ads.Provider
	configured bool
	grant      Grant
	client     *fakeClient
	tokenSrc   func(tok *oauth2.Token) oauth2.TokenSource
	revoked    []string
	lastCode   string
	lastVerif  string
}

func (a *fakeApp) Provider() ads.Provider { return a.provider }
func (a *fakeApp) Configured() bool       { return a.configured }
func (a *fakeApp) UsesPKCE() bool         { return a.provider == ads.ProviderGoogle }
func (a *fakeApp) AuthCodeURL(state, verifier string) string {
	q := url.Values{"state": {state}}
	if verifier != "" {
		q.Set("code_challenge", oauth2.S256ChallengeFromVerifier(verifier))
	}
	return "https://provider.example/auth?" + q.Encode()
}
func (a *fakeApp) Exchange(_ context.Context, code, verifier string) (Grant, error) {
	a.lastCode, a.lastVerif = code, verifier
	if code == "bad" {
		return Grant{}, errors.New("invalid code")
	}
	return a.grant, nil
}
func (a *fakeApp) TokenSource(tok *oauth2.Token) oauth2.TokenSource {
	if a.tokenSrc != nil {
		return a.tokenSrc(tok)
	}
	return oauth2.StaticTokenSource(tok)
}
func (a *fakeApp) NewClient(ts oauth2.TokenSource, _ Metadata) ads.Client {
	c := *a.client
	c.tokens = ts
	return &c
}
func (a *fakeApp) Revoke(_ context.Context, tok *oauth2.Token) error {
	a.revoked = append(a.revoked, tok.AccessToken)
	return nil
}

type fakeEnqueuer struct {
	mu    sync.Mutex
	tasks []*asynq.Task
	ids   map[string]bool
}

func (f *fakeEnqueuer) EnqueueContext(_ context.Context, t *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.ids == nil {
		f.ids = map[string]bool{}
	}
	for _, o := range opts {
		if o.Type() == asynq.TaskIDOpt {
			id := o.Value().(string)
			if f.ids[id] {
				return nil, asynq.ErrTaskIDConflict
			}
			f.ids[id] = true
		}
	}
	f.tasks = append(f.tasks, t)
	return &asynq.TaskInfo{}, nil
}

func (f *fakeEnqueuer) ofType(typ string) []*asynq.Task {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []*asynq.Task
	for _, t := range f.tasks {
		if t.Type() == typ {
			out = append(out, t)
		}
	}
	return out
}

// --- harness ---

type env struct {
	t        *testing.T
	db       *database.DB
	rdb      *redis.Client
	svc      *Service
	store    *memStore
	enq      *fakeEnqueuer
	meta     *fakeApp
	google   *fakeApp
	srv      *httptest.Server
	orgID    uuid.UUID
	owner    string // bearer tokens
	member   string
	outsider string
	ownerID  uuid.UUID
}

func setup(t *testing.T) *env {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; start Postgres/Redis with make up")
	}
	ctx := context.Background()
	db, err := database.Connect(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(db.Close)
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	opts, err := redis.ParseURL(redisURL)
	require.NoError(t, err)
	rdb := redis.NewClient(opts)
	t.Cleanup(func() { rdb.Close() })
	require.NoError(t, rdb.Ping(ctx).Err())

	keys, err := secrets.Parse(secrets.DevKeySpec)
	require.NoError(t, err)

	e := &env{t: t, db: db, rdb: rdb, store: newMemStore(), enq: &fakeEnqueuer{}}
	e.meta = &fakeApp{provider: ads.ProviderMeta, configured: true,
		grant: Grant{Token: &oauth2.Token{AccessToken: "meta-access", Expiry: time.Now().Add(60 * 24 * time.Hour)},
			ExternalUserID: "fb-" + uuid.NewString(), DisplayName: "Jane FB", Scopes: []string{"ads_read"}},
		client: &fakeClient{accounts: []ads.Account{
			{Provider: ads.ProviderMeta, ExternalID: "1001", Name: "Acme", Currency: "USD", Timezone: "America/New_York", Status: ads.StatusActive},
			{Provider: ads.ProviderMeta, ExternalID: "1002", Name: "Broken", Currency: "", Timezone: "America/New_York"},
		}}}
	e.google = &fakeApp{provider: ads.ProviderGoogle, configured: false, client: &fakeClient{}}
	e.svc = NewService(Options{
		DB: db, Redis: rdb, Keys: keys, Store: e.store, Enqueuer: e.enq,
		Apps:       map[ads.Provider]App{ads.ProviderMeta: e.meta, ads.ProviderGoogle: e.google},
		WebBaseURL: "http://web.test",
	})

	authSvc := auth.NewService(db, time.Hour)
	signup := func(name string) (store.User, string) {
		u, sess, err := authSvc.Signup(ctx, fmt.Sprintf("%s-%s@example.com", name, uuid.NewString()[:8]), name, "correct-horse-battery", auth.ClientInfo{})
		require.NoError(t, err)
		return u, sess.Token
	}
	owner, ownerTok := signup("owner")
	member, memberTok := signup("member")
	outsider, outsiderTok := signup("outsider")
	t.Cleanup(func() {
		_, _ = db.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = ANY($1)`, []uuid.UUID{owner.ID, member.ID, outsider.ID})
	})
	org, err := organizations.NewService(db, time.Hour).Create(ctx, owner.ID, "Integrations Test")
	require.NoError(t, err)
	require.NoError(t, db.AddOrganizationUser(ctx, store.AddOrganizationUserParams{OrganizationID: org.ID, UserID: member.ID, Role: organizations.RoleMember}))
	t.Cleanup(func() {
		_, _ = db.Pool.Exec(context.Background(), `DELETE FROM organizations WHERE id = $1`, org.ID)
	})
	e.orgID, e.owner, e.member, e.outsider, e.ownerID = org.ID, ownerTok, memberTok, outsiderTok, owner.ID

	h := NewHandlers(e.svc)
	r := chi.NewRouter()
	r.Route("/v1", func(r chi.Router) {
		h.RegisterPublic(r)
		r.Group(func(r chi.Router) {
			r.Use(authSvc.RequireUser)
			r.Use(organizations.RequireMember(db))
			h.Register(r)
		})
	})
	e.srv = httptest.NewServer(r)
	t.Cleanup(e.srv.Close)
	return e
}

func (e *env) do(method, path, token string, body any) (*http.Response, map[string]any) {
	e.t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, e.srv.URL+path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	require.NoError(e.t, err)
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp, out
}

func (e *env) orgPath(suffix string) string {
	return "/v1/orgs/" + e.orgID.String() + "/integrations" + suffix
}

func errCode(body map[string]any) string {
	if e, ok := body["error"].(map[string]any); ok {
		return e["code"].(string)
	}
	return ""
}

// connect runs connect + callback and returns the redirect location.
func (e *env) connect(provider, code string) *url.URL {
	e.t.Helper()
	resp, body := e.do("POST", e.orgPath("/"+provider+"/connect"), e.owner, nil)
	require.Equal(e.t, 200, resp.StatusCode, body)
	au, err := url.Parse(body["authorize_url"].(string))
	require.NoError(e.t, err)
	state := au.Query().Get("state")
	resp, _ = e.do("GET", "/v1/integrations/"+provider+"/callback?"+url.Values{"state": {state}, "code": {code}}.Encode(), "", nil)
	require.Equal(e.t, http.StatusFound, resp.StatusCode)
	loc, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(e.t, err)
	return loc
}

// --- tests ---

func TestConnectAuthAndRBAC(t *testing.T) {
	e := setup(t)
	resp, _ := e.do("POST", e.orgPath("/meta/connect"), "", nil)
	require.Equal(t, 401, resp.StatusCode)
	resp, _ = e.do("POST", e.orgPath("/meta/connect"), e.outsider, nil)
	require.Equal(t, 404, resp.StatusCode, "non-members cannot probe orgs")
	resp, body := e.do("POST", e.orgPath("/meta/connect"), e.member, nil)
	require.Equal(t, 403, resp.StatusCode)
	require.Equal(t, "forbidden", errCode(body))
	resp, body = e.do("POST", e.orgPath("/google/connect"), e.owner, nil)
	require.Equal(t, 503, resp.StatusCode)
	require.Equal(t, "provider_not_configured", errCode(body))
	resp, _ = e.do("POST", e.orgPath("/tiktok/connect"), e.owner, nil)
	require.Equal(t, 404, resp.StatusCode)

	resp, body = e.do("GET", e.orgPath(""), e.member, nil)
	require.Equal(t, 200, resp.StatusCode)
	require.Empty(t, body["integrations"])
	require.Equal(t, []any{
		map[string]any{"provider": "meta", "configured": true},
		map[string]any{"provider": "google", "configured": false},
	}, body["providers"])
}

func TestConnectCallbackDiscoverFlow(t *testing.T) {
	e := setup(t)
	loc := e.connect("meta", "good")
	require.Equal(t, "web.test", loc.Host)
	require.Equal(t, "/app/integrations", loc.Path)
	require.Equal(t, "meta", loc.Query().Get("connected"), loc.String())
	require.Equal(t, "1", loc.Query().Get("accounts"), "invalid account skipped")
	integID := uuid.MustParse(loc.Query().Get("integration_id"))
	require.Len(t, e.store.accounts[integID], 1)

	// Tokens are encrypted at rest and bound to the row.
	integ, err := e.db.GetIntegration(context.Background(), store.GetIntegrationParams{ID: integID, OrganizationID: e.orgID})
	require.NoError(t, err)
	require.NotContains(t, string(integ.AccessTokenEncrypted), "meta-access")
	require.JSONEq(t, `{}`, string(integ.Metadata))
	require.NotNil(t, integ.LastDiscoveredAt)

	// List never exposes secrets.
	resp, body := e.do("GET", e.orgPath(""), e.member, nil)
	require.Equal(t, 200, resp.StatusCode)
	items := body["integrations"].([]any)
	require.Len(t, items, 1)
	item := items[0].(map[string]any)
	require.Equal(t, "active", item["status"])
	require.Equal(t, "Jane FB", item["display_name"])
	for k := range item {
		require.NotContains(t, k, "token_encrypted")
	}

	// Explicit discover (admin+).
	resp, _ = e.do("POST", e.orgPath("/"+integID.String()+"/discover"), e.member, nil)
	require.Equal(t, 403, resp.StatusCode)
	resp, body = e.do("POST", e.orgPath("/"+integID.String()+"/discover"), e.owner, nil)
	require.Equal(t, 200, resp.StatusCode, body)
	require.Len(t, body["accounts"], 1)

	// Audit trail.
	var n int
	require.NoError(t, e.db.Pool.QueryRow(context.Background(),
		`SELECT count(*) FROM audit_logs WHERE entity_id = $1 AND action IN ('integration.connected','integration.accounts_discovered')`,
		integID.String()).Scan(&n))
	require.Equal(t, 3, n)

	// Reconnecting the same provider user updates the same row.
	e.meta.grant.Token = &oauth2.Token{AccessToken: "meta-access-2"}
	loc = e.connect("meta", "good")
	require.Equal(t, integID.String(), loc.Query().Get("integration_id"))

	// Disconnect wipes tokens and revokes at the provider.
	resp, _ = e.do("DELETE", e.orgPath("/"+integID.String()), e.member, nil)
	require.Equal(t, 403, resp.StatusCode)
	resp, _ = e.do("DELETE", e.orgPath("/"+integID.String()), e.owner, nil)
	require.Equal(t, 204, resp.StatusCode)
	require.Equal(t, []string{"meta-access-2"}, e.meta.revoked)
	integ, err = e.db.GetIntegration(context.Background(), store.GetIntegrationParams{ID: integID, OrganizationID: e.orgID})
	require.NoError(t, err)
	require.Equal(t, store.IntegrationStatusDisconnected, integ.Status)
	require.Nil(t, integ.AccessTokenEncrypted)
	require.Nil(t, integ.RefreshTokenEncrypted)

	resp, body = e.do("POST", e.orgPath("/"+integID.String()+"/discover"), e.owner, nil)
	require.Equal(t, 409, resp.StatusCode)
	require.Equal(t, "integration_inactive", errCode(body))
}

func TestCallbackFailures(t *testing.T) {
	e := setup(t)
	check := func(query url.Values, want string) {
		t.Helper()
		resp, _ := e.do("GET", "/v1/integrations/meta/callback?"+query.Encode(), "", nil)
		require.Equal(t, http.StatusFound, resp.StatusCode)
		loc, _ := url.Parse(resp.Header.Get("Location"))
		require.Equal(t, want, loc.Query().Get("error"), loc.String())
	}
	check(url.Values{"code": {"x"}}, "invalid_state")
	check(url.Values{"code": {"x"}, "state": {"forged"}}, "invalid_state")

	// State is single-use.
	resp, body := e.do("POST", e.orgPath("/meta/connect"), e.owner, nil)
	require.Equal(t, 200, resp.StatusCode)
	au, _ := url.Parse(body["authorize_url"].(string))
	state := au.Query().Get("state")
	check(url.Values{"state": {state}, "error": {"access_denied"}}, "access_denied")
	check(url.Values{"state": {state}, "code": {"good"}}, "invalid_state")

	// State bound to another provider is rejected.
	e.google.configured = true
	resp, body = e.do("POST", e.orgPath("/google/connect"), e.owner, nil)
	require.Equal(t, 200, resp.StatusCode)
	au, _ = url.Parse(body["authorize_url"].(string))
	require.NotEmpty(t, au.Query().Get("code_challenge"), "PKCE for Google")
	check(url.Values{"state": {au.Query().Get("state")}, "code": {"good"}}, "invalid_state")

	// Bad code.
	resp, body = e.do("POST", e.orgPath("/meta/connect"), e.owner, nil)
	require.Equal(t, 200, resp.StatusCode)
	au, _ = url.Parse(body["authorize_url"].(string))
	check(url.Values{"state": {au.Query().Get("state")}, "code": {"bad"}}, "exchange_failed")
}

func TestUnauthorizedMarksNeedsReauth(t *testing.T) {
	e := setup(t)
	loc := e.connect("meta", "good")
	integID := uuid.MustParse(loc.Query().Get("integration_id"))

	e.meta.client.accountsErr = &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrUnauthorized, Message: "token expired"}
	resp, body := e.do("POST", e.orgPath("/"+integID.String()+"/discover"), e.owner, nil)
	require.Equal(t, 409, resp.StatusCode)
	require.Equal(t, "reauth_required", errCode(body))

	integ, err := e.db.GetIntegration(context.Background(), store.GetIntegrationParams{ID: integID, OrganizationID: e.orgID})
	require.NoError(t, err)
	require.Equal(t, store.IntegrationStatusNeedsReauth, integ.Status)
	require.NotNil(t, integ.LastError)

	// Reconnecting re-activates it.
	e.meta.client.accountsErr = nil
	e.connect("meta", "good")
	integ, err = e.db.GetIntegration(context.Background(), store.GetIntegrationParams{ID: integID, OrganizationID: e.orgID})
	require.NoError(t, err)
	require.Equal(t, store.IntegrationStatusActive, integ.Status)
	require.Nil(t, integ.LastError)
}

// refreshingSource simulates oauth2 refresh: it returns a new access token.
type refreshingSource struct{ n int }

func (r *refreshingSource) Token() (*oauth2.Token, error) {
	r.n++
	return &oauth2.Token{AccessToken: fmt.Sprintf("refreshed-%d", r.n), RefreshToken: "rt-2", Expiry: time.Now().Add(time.Hour)}, nil
}

func TestTokenRefreshPersisted(t *testing.T) {
	e := setup(t)
	e.meta.grant.Token.RefreshToken = "rt-1"
	loc := e.connect("meta", "good")
	integID := uuid.MustParse(loc.Query().Get("integration_id"))

	integ, err := e.db.GetIntegration(context.Background(), store.GetIntegrationParams{ID: integID, OrganizationID: e.orgID})
	require.NoError(t, err)
	e.meta.tokenSrc = func(*oauth2.Token) oauth2.TokenSource { return &refreshingSource{} }
	client, err := e.svc.ClientFor(integ)
	require.NoError(t, err)
	_, err = client.ListAccounts(context.Background())
	require.NoError(t, err)

	integ, err = e.db.GetIntegration(context.Background(), store.GetIntegrationParams{ID: integID, OrganizationID: e.orgID})
	require.NoError(t, err)
	tok, err := e.svc.loadToken(integ)
	require.NoError(t, err)
	require.Equal(t, "refreshed-1", tok.AccessToken)
	require.Equal(t, "rt-2", tok.RefreshToken)

	// A failed refresh marks the integration needs_reauth.
	e.meta.tokenSrc = func(*oauth2.Token) oauth2.TokenSource {
		return oauth2.ReuseTokenSource(nil, failingSource{})
	}
	client, err = e.svc.ClientFor(integ)
	require.NoError(t, err)
	_, err = client.ListAccounts(context.Background())
	require.ErrorIs(t, err, providers.ErrUnauthorized)
	integ, err = e.db.GetIntegration(context.Background(), store.GetIntegrationParams{ID: integID, OrganizationID: e.orgID})
	require.NoError(t, err)
	require.Equal(t, store.IntegrationStatusNeedsReauth, integ.Status)
}

type failingSource struct{}

func (failingSource) Token() (*oauth2.Token, error) {
	return nil, &oauth2.RetrieveError{ErrorCode: "invalid_grant"}
}

func TestSyncEndpointAndWorker(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	loc := e.connect("meta", "good")
	integID := uuid.MustParse(loc.Query().Get("integration_id"))

	// The real entities store owns ad_accounts; insert a sync-enabled row directly.
	_, err := e.db.Pool.Exec(ctx, `INSERT INTO ad_accounts (organization_id, integration_id, provider, external_id, name, currency, timezone, sync_enabled)
		VALUES ($1, $2, 'meta', '1001', 'Acme', 'USD', 'America/New_York', true)`, e.orgID, integID)
	require.NoError(t, err)

	resp, _ := e.do("POST", e.orgPath("/"+integID.String()+"/sync"), e.member, nil)
	require.Equal(t, 403, resp.StatusCode)
	resp, body := e.do("POST", e.orgPath("/"+integID.String()+"/sync"), e.owner, map[string]any{"start": "2026-09-10", "end": "2026-09-01"})
	require.Equal(t, 422, resp.StatusCode, body)
	resp, body = e.do("POST", e.orgPath("/"+integID.String()+"/sync"), e.owner, map[string]any{"start": "2026-09-01", "end": "2026-09-02"})
	require.Equal(t, 202, resp.StatusCode, body)
	require.Equal(t, []any{"1001"}, body["account_ids"])
	require.Equal(t, false, body["already_queued"])
	resp, body = e.do("POST", e.orgPath("/"+integID.String()+"/sync"), e.owner, nil)
	require.Equal(t, 202, resp.StatusCode)
	require.Equal(t, true, body["already_queued"], "idempotent while queued")

	w := NewWorker(e.svc, e.store, e.rdb, e.enq)
	isync := e.enq.ofType(queue.TaskIntegrationSync)
	require.Len(t, isync, 1)
	require.NoError(t, w.handleIntegrationSync(ctx, isync[0]))

	esync := e.enq.ofType(queue.TaskEntitySync)
	require.Len(t, esync, 1)
	require.NoError(t, w.handleEntitySync(ctx, esync[0]))
	require.Len(t, e.store.campaigns, 1)
	require.Len(t, e.store.adGroups, 1)
	require.Len(t, e.store.ads, 1)
	require.Len(t, e.store.creatives, 1)
	require.Contains(t, e.store.synced, "meta/1001/entities")

	msync := e.enq.ofType(queue.TaskMetricSync)
	require.Len(t, msync, 2, "one per supported catalog report")
	require.NoError(t, w.handleMetricSync(ctx, msync[0]))
	require.Len(t, e.store.facts, 1)
	require.Equal(t, "2026-09-01", e.store.facts[0].Date)

	// Lock: a concurrent sync for the same account is deferred, not run.
	unlock, err := w.lock(ctx, integID, "1001")
	require.NoError(t, err)
	err = w.handleMetricSync(ctx, msync[1])
	var ra *retryAfterError
	require.ErrorAs(t, err, &ra)
	require.Equal(t, 30*time.Second, RetryDelay(1, err, msync[1]))
	unlock()

	// Rate limits retry after the provider's delay; auth errors stop retrying.
	e.meta.client.reportErr = &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrRateLimited, RetryAfter: 5 * time.Minute}
	err = w.handleMetricSync(ctx, msync[1])
	require.ErrorIs(t, err, providers.ErrRateLimited)
	require.False(t, errors.Is(err, asynq.SkipRetry))
	require.Equal(t, 5*time.Minute+time.Second, RetryDelay(1, err, msync[1]))

	e.meta.client.reportErr = &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrUnauthorized}
	err = w.handleMetricSync(ctx, msync[1])
	require.ErrorIs(t, err, asynq.SkipRetry)
	integ, err := e.db.GetIntegrationByID(ctx, integID)
	require.NoError(t, err)
	require.Equal(t, store.IntegrationStatusNeedsReauth, integ.Status)
}
