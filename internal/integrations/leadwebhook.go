package integrations

// Instant leads: Meta's leadgen webhook pushes each new lead-form submission,
// so leads arrive within seconds instead of waiting for the hourly import in
// syncLeads (which stays on as the safety net).
//
// Setup in the Meta App Dashboard (Webhooks product):
//   - Object "Page", callback URL <API public URL>/v1/webhooks/meta (for
//     example https://api.example.com/v1/webhooks/meta; the Next.js /api proxy
//     also works), verify token = META_WEBHOOK_VERIFY_TOKEN.
//   - Subscribe the Page object to the "leadgen" field.
//   - The app needs leads_retrieval (read the lead) and pages_manage_metadata
//     (subscribe each Page to the app); both require Advanced Access for
//     non-test users. Meta signs deliveries with the app secret
//     (META_APP_SECRET) in X-Hub-Signature-256.
//
// Each Page must also subscribe the app (POST /{page-id}/subscribed_apps):
// admins do that from the Leads setup (POST /v1/orgs/{orgID}/leads/instant).
//
// Flow: POST /v1/webhooks/meta verifies the signature and enqueues one
// leads:webhook_lead task per leadgen change; the worker resolves the ad to
// the organizations that synced it, fetches the lead with an integration that
// granted leads_retrieval and stores it with LeadSink.UpsertImported.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/providers"
	"github.com/iamv1n/adwise/internal/providers/meta"
	"github.com/iamv1n/adwise/internal/queue"
)

// leadScope is the Meta permission needed to read lead-form leads (same as
// leads.LeadScope; not imported to avoid a package cycle).
const leadScope = "leads_retrieval"

// maxWebhookBody bounds a webhook delivery. Meta batches at most a few
// hundred changes per request, far below this.
const maxWebhookBody = 1 << 20

var ErrNoMetaConnection = httpx.NewError(http.StatusConflict, "meta_not_connected",
	"connect a Meta account first")

// LeadWebhookPayload is the leads:webhook_lead task payload: one leadgen
// change. It holds IDs only, never lead answers.
type LeadWebhookPayload struct {
	LeadgenID   string `json:"leadgen_id"`
	PageID      string `json:"page_id,omitempty"`
	FormID      string `json:"form_id,omitempty"`
	AdID        string `json:"ad_id,omitempty"`
	AdgroupID   string `json:"adgroup_id,omitempty"`
	CreatedTime int64  `json:"created_time,omitempty"`
}

type webhookBody struct {
	Object string `json:"object"`
	Entry  []struct {
		ID      string `json:"id"`
		Changes []struct {
			Field string `json:"field"`
			Value struct {
				LeadgenID   providers.FlexString `json:"leadgen_id"`
				PageID      providers.FlexString `json:"page_id"`
				FormID      providers.FlexString `json:"form_id"`
				AdID        providers.FlexString `json:"ad_id"`
				AdgroupID   providers.FlexString `json:"adgroup_id"`
				CreatedTime providers.FlexInt    `json:"created_time"`
			} `json:"value"`
		} `json:"changes"`
	} `json:"entry"`
}

// parseLeadgen extracts the leadgen changes of a Page webhook delivery.
// Other objects and fields are ignored.
func parseLeadgen(body []byte) ([]LeadWebhookPayload, error) {
	var b webhookBody
	if err := json.Unmarshal(body, &b); err != nil {
		return nil, err
	}
	if b.Object != "page" {
		return nil, nil
	}
	var out []LeadWebhookPayload
	for _, e := range b.Entry {
		for _, c := range e.Changes {
			v := c.Value
			if c.Field != "leadgen" || v.LeadgenID == "" {
				continue
			}
			p := LeadWebhookPayload{
				LeadgenID: string(v.LeadgenID), PageID: string(v.PageID), FormID: string(v.FormID),
				AdID: string(v.AdID), AdgroupID: string(v.AdgroupID), CreatedTime: int64(v.CreatedTime),
			}
			if p.PageID == "" {
				p.PageID = e.ID
			}
			out = append(out, p)
		}
	}
	return out, nil
}

// validSignature checks X-Hub-Signature-256 ("sha256=<hex>"), the HMAC-SHA256
// of the raw body keyed with the app secret, in constant time.
func validSignature(header string, body []byte, secret string) bool {
	hexSig, ok := strings.CutPrefix(header, "sha256=")
	if !ok || secret == "" {
		return false
	}
	got, err := hex.DecodeString(hexSig)
	if err != nil {
		return false
	}
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return hmac.Equal(got, m.Sum(nil))
}

// --- handlers (public, no session) ---

// webhookVerify answers Meta's subscription handshake.
func (h *Handlers) webhookVerify(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	want := h.svc.metaWebhookVerifyToken
	if want == "" || q.Get("hub.mode") != "subscribe" ||
		subtle.ConstantTimeCompare([]byte(q.Get("hub.verify_token")), []byte(want)) != 1 {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = io.WriteString(w, q.Get("hub.challenge"))
}

// webhookReceive verifies and enqueues a delivery. It answers quickly; Meta
// retries non-2xx responses, so enqueue failures return 503.
func (h *Handlers) webhookReceive(w http.ResponseWriter, r *http.Request) error {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWebhookBody))
	if err != nil {
		return httpx.NewError(http.StatusRequestEntityTooLarge, "body_too_large", "request body too large")
	}
	if !validSignature(r.Header.Get("X-Hub-Signature-256"), body, h.svc.metaAppSecret) {
		return httpx.NewError(http.StatusUnauthorized, "invalid_signature", "missing or invalid X-Hub-Signature-256")
	}
	changes, err := parseLeadgen(body)
	if err != nil {
		return httpx.NewError(http.StatusBadRequest, "invalid_payload", "invalid webhook payload")
	}
	if err := h.svc.enqueueLeadWebhooks(r.Context(), changes); err != nil {
		return err
	}
	w.WriteHeader(http.StatusOK)
	return nil
}

func (s *Service) enqueueLeadWebhooks(ctx context.Context, changes []LeadWebhookPayload) error {
	if len(changes) == 0 {
		return nil
	}
	if s.enqueuer == nil {
		return ErrSyncUnavailable
	}
	for _, p := range changes {
		b, _ := json.Marshal(p)
		_, err := s.enqueuer.EnqueueContext(ctx, asynq.NewTask(queue.TaskLeadWebhook, b),
			asynq.Queue(queue.QueueAccountSync), asynq.TaskID("meta-lead:"+p.LeadgenID),
			asynq.MaxRetry(8), asynq.Retention(24*time.Hour))
		if err != nil && !errors.Is(err, asynq.ErrTaskIDConflict) {
			s.logger.ErrorContext(ctx, "lead webhook: enqueue", "leadgen_id", p.LeadgenID, "err", err)
			return ErrSyncUnavailable
		}
	}
	s.logger.DebugContext(ctx, "lead webhook: enqueued", "leads", len(changes))
	return nil
}

// --- worker ---

type leadTarget struct {
	orgID         uuid.UUID
	accountExtID  string
	integrationID *uuid.UUID
}

func (w *Worker) handleLeadWebhook(ctx context.Context, t *asynq.Task) error {
	var p LeadWebhookPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("decode payload: %w: %w", err, asynq.SkipRetry)
	}
	return w.importWebhookLead(ctx, p)
}

// importWebhookLead imports one pushed lead into every organization that
// synced its ad. Leads without an ad (organic) cannot be attributed.
func (w *Worker) importWebhookLead(ctx context.Context, p LeadWebhookPayload) error {
	log := w.svc.logger.With("leadgen_id", p.LeadgenID, "ad", p.AdID)
	if w.leads == nil {
		return nil
	}
	if p.AdID == "" {
		log.DebugContext(ctx, "lead webhook: organic lead has no ad; skipped")
		return nil
	}
	rows, err := w.svc.db.Pool.Query(ctx, `
		SELECT DISTINCT acc.organization_id, acc.external_id, acc.integration_id
		FROM ads a JOIN ad_accounts acc ON acc.id = a.account_id
		WHERE a.provider = 'meta' AND a.external_id = $1`, p.AdID)
	if err != nil {
		return err
	}
	targets, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (leadTarget, error) {
		var t leadTarget
		return t, r.Scan(&t.orgID, &t.accountExtID, &t.integrationID)
	})
	if err != nil {
		return err
	}
	if len(targets) == 0 {
		// Not synced yet; the hourly import picks it up once the ad is known.
		log.DebugContext(ctx, "lead webhook: ad not found in any organization")
		return nil
	}
	var retry error
	for _, tg := range targets {
		if err := w.importLeadForOrg(ctx, tg, p.LeadgenID); err != nil {
			log.WarnContext(ctx, "lead webhook: import", "organization_id", tg.orgID, "err", err)
			retry = err
		}
	}
	return retry
}

// importLeadForOrg fetches the lead with one of the org's Meta connections
// that granted leadScope (the account's own connection first). Permission
// problems are logged and not retried; transient errors are returned.
func (w *Worker) importLeadForOrg(ctx context.Context, tg leadTarget, leadID string) error {
	log := w.svc.logger.With("organization_id", tg.orgID, "account", tg.accountExtID, "leadgen_id", leadID)
	rows, err := w.svc.db.Pool.Query(ctx, `
		SELECT id FROM integrations
		WHERE organization_id = $1 AND provider = 'meta' AND status = 'active' AND $2 = ANY(scopes)
		ORDER BY (id = $3) DESC NULLS LAST, created_at`, tg.orgID, leadScope, tg.integrationID)
	if err != nil {
		return err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return err
	}
	if len(ids) == 0 {
		log.InfoContext(ctx, "lead webhook: no active Meta connection with leads_retrieval")
		return nil
	}
	for _, id := range ids {
		integ, err := w.svc.db.GetIntegrationByID(ctx, id)
		if err != nil {
			return err
		}
		client, err := w.svc.ClientFor(integ)
		if err != nil {
			log.WarnContext(ctx, "lead webhook: client", "integration_id", id, "err", err)
			continue
		}
		getter, ok := client.(ads.LeadGetter)
		if !ok {
			return nil
		}
		lead, err := getter.GetLead(ctx, leadID)
		switch {
		case errors.Is(err, providers.ErrUnauthorized):
			w.svc.markNeedsReauth(ctx, id, err)
			continue
		case errors.Is(err, providers.ErrPermissionDenied), errors.Is(err, providers.ErrNotFound),
			errors.Is(err, providers.ErrInvalidRequest):
			log.WarnContext(ctx, "lead webhook: cannot read lead with this connection", "integration_id", id, "err", err)
			continue
		case err != nil:
			return err
		}
		lead.AccountID = tg.accountExtID
		n, err := w.leads.UpsertImported(ctx, tg.orgID, ads.ProviderMeta, tg.accountExtID, []ads.Lead{lead})
		if err != nil {
			return err
		}
		log.InfoContext(ctx, "lead webhook: imported", "new_leads", n)
		return nil
	}
	log.WarnContext(ctx, "lead webhook: no connection could read the lead; reconnect to grant leads_retrieval")
	return nil
}

// --- page subscription ---

// pageSubscriber is implemented by the Meta client.
type pageSubscriber interface {
	ListManagedPages(ctx context.Context) ([]meta.ManagedPage, error)
	SubscribePageLeadgen(ctx context.Context, pageID, pageToken string) error
}

var _ pageSubscriber = (*meta.Client)(nil)

// PageResult is one Page's subscribe outcome.
type PageResult struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// EnableInstantLeads subscribes the app to the leadgen field of every Page
// the org's active Meta connections can manage, and records the Pages that
// succeeded. Re-running it is safe.
func (s *Service) EnableInstantLeads(ctx context.Context, m organizations.Membership) ([]PageResult, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT id FROM integrations
		WHERE organization_id = $1 AND provider = 'meta' AND status = 'active' ORDER BY created_at`, m.OrganizationID)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, ErrNoMetaConnection
	}
	out := []PageResult{}
	var ok []PageResult
	okIntegration := map[string]uuid.UUID{}
	var lastErr error
	for _, id := range ids {
		integ, err := s.db.GetIntegrationByID(ctx, id)
		if err != nil {
			return nil, err
		}
		client, err := s.ClientFor(integ)
		if err != nil {
			var he *httpx.Error
			if !errors.As(err, &he) {
				// Unreadable stored token: only a reconnect fixes it.
				s.logger.WarnContext(ctx, "instant leads: client", "integration_id", id, "err", err)
				err = ErrReauthRequired
			}
			lastErr = err
			continue
		}
		ps, isPS := client.(pageSubscriber)
		if !isPS {
			continue
		}
		pages, err := ps.ListManagedPages(ctx)
		if err != nil {
			lastErr = s.ProviderError(ctx, id, err)
			continue
		}
		for _, p := range pages {
			if slices.ContainsFunc(out, func(r PageResult) bool { return r.ID == p.ID && r.OK }) {
				continue
			}
			res := PageResult{ID: p.ID, Name: p.Name}
			if err := ps.SubscribePageLeadgen(ctx, p.ID, p.AccessToken); err != nil {
				res.Error = pageError(err)
			} else {
				res.OK = true
				ok = append(ok, res)
				okIntegration[p.ID] = id
			}
			// A later connection may succeed where an earlier one failed.
			out = slices.DeleteFunc(out, func(r PageResult) bool { return r.ID == p.ID })
			out = append(out, res)
		}
	}
	if len(out) == 0 && lastErr != nil {
		return nil, lastErr
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit
	pageIDs := make([]string, 0, len(ok))
	for _, p := range ok {
		if _, err := tx.Exec(ctx, `
			INSERT INTO lead_page_subscriptions (organization_id, page_id, page_name, integration_id)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (organization_id, page_id) DO UPDATE SET
			    page_name = EXCLUDED.page_name, integration_id = EXCLUDED.integration_id, subscribed_at = now()`,
			m.OrganizationID, p.ID, p.Name, okIntegration[p.ID]); err != nil {
			return nil, err
		}
		pageIDs = append(pageIDs, p.ID)
	}
	if err := audit.Record(ctx, s.db.Queries.WithTx(tx), audit.Entry{
		OrganizationID: &m.OrganizationID, ActorUserID: &m.UserID,
		Action: "leads.instant_enabled", EntityType: "organization", EntityID: m.OrganizationID.String(),
		Metadata: map[string]any{"pages_subscribed": pageIDs, "pages_failed": len(out) - len(ok)},
	}); err != nil {
		return nil, err
	}
	return out, tx.Commit(ctx)
}

// pageError is a short, user-facing reason a Page could not be subscribed.
func pageError(err error) string {
	switch {
	case errors.Is(err, providers.ErrPermissionDenied):
		return "no permission: you need full control of this Page and to grant pages_manage_metadata (reconnect Meta)"
	case errors.Is(err, providers.ErrUnauthorized):
		return "Meta rejected the Page token; reconnect Meta"
	}
	var pe *providers.Error
	if errors.As(err, &pe) {
		return truncate(pe.Message, 200)
	}
	return "subscribe failed"
}

func (h *Handlers) enableInstantLeads(w http.ResponseWriter, r *http.Request) error {
	pages, err := h.svc.EnableInstantLeads(r.Context(), organizations.MembershipFromContext(r.Context()))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"pages": pages})
	return nil
}
