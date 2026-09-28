package integrations

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
	"github.com/iamv1n/adwise/internal/providers/meta"
	"github.com/iamv1n/adwise/internal/queue"
)

// --- fakes for the Meta-only client interfaces ---

func (f *fakeClient) GetLead(_ context.Context, id string) (ads.Lead, error) {
	if f.leadErr != nil {
		return ads.Lead{}, f.leadErr
	}
	return ads.Lead{ExternalID: id, AdID: "ad-" + id, FormID: "form1", CreatedAt: time.Now().UTC(),
		Fields: map[string]string{"email": "x@example.com"}}, nil
}

func (f *fakeClient) ListManagedPages(context.Context) ([]meta.ManagedPage, error) {
	return f.pages, nil
}

func (f *fakeClient) SubscribePageLeadgen(_ context.Context, pageID, token string) error {
	if f.subscribed != nil {
		f.subscribed.Lock()
		f.subscribed.calls = append(f.subscribed.calls, pageID+"="+token)
		f.subscribed.Unlock()
	}
	if pageID == "denied" {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrPermissionDenied, Message: "nope"}
	}
	return nil
}

type subscribeLog struct {
	sync.Mutex
	calls []string
}

type fakeSink struct {
	mu   sync.Mutex
	orgs []uuid.UUID
	accs []string
	got  []ads.Lead
}

func (f *fakeSink) SyncTargets(context.Context, uuid.UUID, ads.Provider, string) ([]string, time.Time, error) {
	return nil, time.Time{}, nil
}

func (f *fakeSink) UpsertImported(_ context.Context, org uuid.UUID, _ ads.Provider, acct string, l []ads.Lead) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.orgs = append(f.orgs, org)
	f.accs = append(f.accs, acct)
	f.got = append(f.got, l...)
	return len(l), nil
}

// --- webhook handler (no database) ---

const testSecret = "app-secret"

func webhookServer(t *testing.T, enq Enqueuer) *httptest.Server {
	t.Helper()
	svc := NewService(Options{Enqueuer: enq, MetaAppSecret: testSecret, MetaWebhookVerifyToken: "verify-me"})
	r := chi.NewRouter()
	r.Route("/v1", NewHandlers(svc).RegisterPublic)
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv
}

func sign(body []byte, secret string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return "sha256=" + hex.EncodeToString(m.Sum(nil))
}

func postWebhook(t *testing.T, srv *httptest.Server, body []byte, sig string) int {
	t.Helper()
	req, _ := http.NewRequest("POST", srv.URL+"/v1/webhooks/meta", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if sig != "" {
		req.Header.Set("X-Hub-Signature-256", sig)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	resp.Body.Close()
	return resp.StatusCode
}

func TestValidSignature(t *testing.T) {
	body := []byte(`{"object":"page"}`)
	require.True(t, validSignature(sign(body, testSecret), body, testSecret))
	require.False(t, validSignature(sign(body, "other"), body, testSecret))
	require.False(t, validSignature(sign(body, testSecret), []byte(`{"object":"page" }`), testSecret))
	require.False(t, validSignature("", body, testSecret))
	require.False(t, validSignature("sha1=abc", body, testSecret))
	require.False(t, validSignature("sha256=zz", body, testSecret))
	require.False(t, validSignature(sign(body, ""), body, ""), "no secret configured")
}

func TestWebhookVerifyHandshake(t *testing.T) {
	srv := webhookServer(t, &fakeEnqueuer{})
	get := func(q url.Values) (int, string) {
		resp, err := http.Get(srv.URL + "/v1/webhooks/meta?" + q.Encode())
		require.NoError(t, err)
		defer resp.Body.Close()
		var b bytes.Buffer
		_, _ = b.ReadFrom(resp.Body)
		return resp.StatusCode, b.String()
	}
	code, body := get(url.Values{"hub.mode": {"subscribe"}, "hub.verify_token": {"verify-me"}, "hub.challenge": {"12345"}})
	require.Equal(t, 200, code)
	require.Equal(t, "12345", body)

	code, _ = get(url.Values{"hub.mode": {"subscribe"}, "hub.verify_token": {"wrong"}, "hub.challenge": {"1"}})
	require.Equal(t, 403, code)
	code, _ = get(url.Values{"hub.mode": {"unsubscribe"}, "hub.verify_token": {"verify-me"}, "hub.challenge": {"1"}})
	require.Equal(t, 403, code)
}

func TestWebhookReceiveEnqueues(t *testing.T) {
	enq := &fakeEnqueuer{}
	srv := webhookServer(t, enq)
	body := []byte(`{"object":"page","entry":[{"id":"p1","time":1790000000,"changes":[
		{"field":"leadgen","value":{"leadgen_id":"L1","page_id":"p1","form_id":"F1","ad_id":"A1","adgroup_id":"G1","created_time":1790000000}},
		{"field":"leadgen","value":{"leadgen_id":2002,"form_id":"F1","created_time":1790000001}},
		{"field":"feed","value":{"item":"status"}}]}]}`)

	require.Equal(t, 401, postWebhook(t, srv, body, ""), "missing signature")
	require.Equal(t, 401, postWebhook(t, srv, body, sign(body, "wrong")), "bad signature")
	require.Empty(t, enq.tasks)

	require.Equal(t, 200, postWebhook(t, srv, body, sign(body, testSecret)))
	tasks := enq.ofType(queue.TaskLeadWebhook)
	require.Len(t, tasks, 2)
	var p LeadWebhookPayload
	require.NoError(t, json.Unmarshal(tasks[0].Payload(), &p))
	require.Equal(t, LeadWebhookPayload{LeadgenID: "L1", PageID: "p1", FormID: "F1", AdID: "A1", AdgroupID: "G1", CreatedTime: 1790000000}, p)
	p = LeadWebhookPayload{}
	require.NoError(t, json.Unmarshal(tasks[1].Payload(), &p))
	require.Equal(t, "2002", p.LeadgenID)
	require.Equal(t, "p1", p.PageID, "falls back to the entry id")
	require.Empty(t, p.AdID)

	// Redelivery is deduplicated by task ID and still acknowledged.
	require.Equal(t, 200, postWebhook(t, srv, body, sign(body, testSecret)))
	require.Len(t, enq.ofType(queue.TaskLeadWebhook), 2)

	// Other objects are ignored; oversized bodies are rejected.
	other := []byte(`{"object":"user","entry":[]}`)
	require.Equal(t, 200, postWebhook(t, srv, other, sign(other, testSecret)))
	big := []byte(`{"object":"page","x":"` + strings.Repeat("a", maxWebhookBody) + `"}`)
	require.Equal(t, 413, postWebhook(t, srv, big, sign(big, testSecret)))
}

// --- worker and page subscription (database) ---

func TestWebhookLeadWorker(t *testing.T) {
	e := setup(t)
	e.meta.grant.Scopes = []string{"ads_read", leadScope}
	loc := e.connect("meta", "good")
	integID := uuid.MustParse(loc.Query().Get("integration_id"))
	ctx := context.Background()

	adExt := "ad-" + uuid.NewString()[:8]
	var acctID, campID, groupID uuid.UUID
	require.NoError(t, e.db.Pool.QueryRow(ctx, `INSERT INTO ad_accounts (organization_id, integration_id, provider, external_id, currency, timezone)
		VALUES ($1, $2, 'meta', $3, 'USD', 'UTC') RETURNING id`, e.orgID, integID, "acct-"+adExt).Scan(&acctID))
	require.NoError(t, e.db.Pool.QueryRow(ctx, `INSERT INTO campaigns (organization_id, account_id, provider, external_id)
		VALUES ($1, $2, 'meta', 'c1') RETURNING id`, e.orgID, acctID).Scan(&campID))
	require.NoError(t, e.db.Pool.QueryRow(ctx, `INSERT INTO ad_groups (organization_id, account_id, campaign_id, provider, external_id)
		VALUES ($1, $2, $3, 'meta', 'g1') RETURNING id`, e.orgID, acctID, campID).Scan(&groupID))
	_, err := e.db.Pool.Exec(ctx, `INSERT INTO ads (organization_id, account_id, campaign_id, ad_group_id, provider, external_id)
		VALUES ($1, $2, $3, $4, 'meta', $5)`, e.orgID, acctID, campID, groupID, adExt)
	require.NoError(t, err)

	sink := &fakeSink{}
	w := NewWorker(e.svc, e.store, e.rdb, e.enq).WithLeads(sink)
	run := func(p LeadWebhookPayload) error {
		b, _ := json.Marshal(p)
		return w.handleLeadWebhook(ctx, asynq.NewTask(queue.TaskLeadWebhook, b))
	}

	require.NoError(t, run(LeadWebhookPayload{LeadgenID: "L1", AdID: adExt}))
	require.Len(t, sink.got, 1)
	require.Equal(t, "L1", sink.got[0].ExternalID)
	require.Equal(t, e.orgID, sink.orgs[0])
	require.Equal(t, "acct-"+adExt, sink.accs[0])

	// Organic and unknown ads are skipped without error.
	require.NoError(t, run(LeadWebhookPayload{LeadgenID: "L2"}))
	require.NoError(t, run(LeadWebhookPayload{LeadgenID: "L3", AdID: "unknown-" + adExt}))
	require.Len(t, sink.got, 1)

	// Permission errors are logged, not retried.
	e.meta.client.leadErr = &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrPermissionDenied, Message: "no"}
	require.NoError(t, run(LeadWebhookPayload{LeadgenID: "L4", AdID: adExt}))
	// Transient errors are retried.
	e.meta.client.leadErr = &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: "down"}
	require.Error(t, run(LeadWebhookPayload{LeadgenID: "L5", AdID: adExt}))
	require.Len(t, sink.got, 1)
}

func TestEnableInstantLeads(t *testing.T) {
	e := setup(t)
	path := "/v1/orgs/" + e.orgID.String() + "/leads/instant"

	resp, body := e.do("POST", path, e.owner, nil)
	require.Equal(t, 409, resp.StatusCode)
	require.Equal(t, "meta_not_connected", errCode(body))

	log := &subscribeLog{}
	e.meta.client.pages = []meta.ManagedPage{{ID: "p1", Name: "Shop", AccessToken: "page-tok-1"}, {ID: "denied", Name: "Other", AccessToken: "page-tok-2"}}
	e.meta.client.subscribed = log
	e.connect("meta", "good")

	resp, _ = e.do("POST", path, e.member, nil)
	require.Equal(t, 403, resp.StatusCode)
	resp, body = e.do("POST", path, e.owner, nil)
	require.Equal(t, 200, resp.StatusCode, body)
	pages := body["pages"].([]any)
	require.Len(t, pages, 2)
	require.Equal(t, map[string]any{"id": "p1", "name": "Shop", "ok": true}, pages[0])
	require.Equal(t, false, pages[1].(map[string]any)["ok"])
	require.Contains(t, pages[1].(map[string]any)["error"], "no permission")
	require.Equal(t, []string{"p1=page-tok-1", "denied=page-tok-2"}, log.calls, "each Page uses its own token")

	ctx := context.Background()
	var n int
	require.NoError(t, e.db.Pool.QueryRow(ctx, `SELECT count(*) FROM lead_page_subscriptions WHERE organization_id = $1`, e.orgID).Scan(&n))
	require.Equal(t, 1, n)
	require.NoError(t, e.db.Pool.QueryRow(ctx,
		`SELECT count(*) FROM audit_logs WHERE organization_id = $1 AND action = 'leads.instant_enabled'`, e.orgID).Scan(&n))
	require.Equal(t, 1, n)

	// Re-running is safe.
	resp, _ = e.do("POST", path, e.owner, nil)
	require.Equal(t, 200, resp.StatusCode)
	require.NoError(t, e.db.Pool.QueryRow(ctx, `SELECT count(*) FROM lead_page_subscriptions WHERE organization_id = $1`, e.orgID).Scan(&n))
	require.Equal(t, 1, n)
}
