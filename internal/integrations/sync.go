package integrations

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/providers"
	"github.com/iamv1n/adwise/internal/queue"
	reportreg "github.com/iamv1n/adwise/internal/reports"
	"github.com/iamv1n/adwise/internal/store"
)

// DefaultMetricLookbackDays is how many days back a default metric sync
// reaches; providers restate recent days (late conversions, invalid clicks).
const DefaultMetricLookbackDays = 3

// Enqueuer submits sync tasks. *asynq.Client satisfies it.
type Enqueuer interface {
	EnqueueContext(ctx context.Context, task *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error)
}

// SyncOptions narrow a sync request. Zero values mean "everything".
type SyncOptions struct {
	AccountIDs []string      `json:"account_ids,omitempty"`
	Scope      string        `json:"scope,omitempty"` // entities, metrics, all
	Reports    []string      `json:"reports,omitempty"`
	Range      ads.DateRange `json:"range"`
}

func (o SyncOptions) entities() bool {
	return o.Scope == "" || o.Scope == "all" || o.Scope == "entities"
}
func (o SyncOptions) metrics() bool { return o.Scope == "" || o.Scope == "all" || o.Scope == "metrics" }

// IntegrationSyncPayload is the payload of queue.TaskIntegrationSync.
type IntegrationSyncPayload struct {
	OrganizationID uuid.UUID   `json:"organization_id"`
	IntegrationID  uuid.UUID   `json:"integration_id"`
	Options        SyncOptions `json:"options"`
}

// EntitySyncPayload is the payload of queue.TaskEntitySync.
type EntitySyncPayload struct {
	OrganizationID uuid.UUID   `json:"organization_id"`
	IntegrationID  uuid.UUID   `json:"integration_id"`
	AccountID      string      `json:"account_id"`
	Options        SyncOptions `json:"options"`
}

// MetricSyncPayload is the payload of queue.TaskMetricSync.
type MetricSyncPayload struct {
	OrganizationID uuid.UUID            `json:"organization_id"`
	IntegrationID  uuid.UUID            `json:"integration_id"`
	AccountID      string               `json:"account_id"`
	Report         ads.ReportDefinition `json:"report"`
	Range          ads.DateRange        `json:"range"`
}

// SyncResult is returned by POST .../sync.
type SyncResult struct {
	TaskID        string   `json:"task_id"`
	AlreadyQueued bool     `json:"already_queued"`
	AccountIDs    []string `json:"account_ids"` // sync-enabled accounts that will be synced
}

func (o *SyncOptions) normalize(now time.Time) error {
	if o.Range.Start == "" && o.Range.End == "" {
		end := now.UTC()
		o.Range = ads.DateRange{
			Start: end.AddDate(0, 0, -DefaultMetricLookbackDays).Format(time.DateOnly),
			End:   end.Format(time.DateOnly),
		}
	}
	if o.Range.Start == "" || o.Range.End == "" {
		return fmt.Errorf("both start and end are required")
	}
	start, end, err := providers.ParseDateRange(o.Range)
	if err != nil {
		return fmt.Errorf("invalid date range")
	}
	if end.Sub(start) > 400*24*time.Hour {
		return fmt.Errorf("date range may span at most 400 days")
	}
	return nil
}

// RequestSync enqueues an integration sync. It is idempotent: while a sync for
// the integration is queued or running, further requests return it.
func (s *Service) RequestSync(ctx context.Context, m organizations.Membership, id uuid.UUID, opts SyncOptions) (SyncResult, error) {
	if s.enqueuer == nil {
		return SyncResult{}, ErrSyncUnavailable
	}
	integ, err := s.get(ctx, m.OrganizationID, id)
	if err != nil {
		return SyncResult{}, err
	}
	if integ.Status != store.IntegrationStatusActive {
		return SyncResult{}, ErrIntegrationState
	}
	if err := opts.normalize(s.now()); err != nil {
		e := *errValidation
		e.Message = err.Error()
		return SyncResult{}, &e
	}
	accounts, err := s.syncAccounts(ctx, integ, opts.AccountIDs)
	if err != nil {
		return SyncResult{}, err
	}
	payload, err := json.Marshal(IntegrationSyncPayload{OrganizationID: m.OrganizationID, IntegrationID: id, Options: opts})
	if err != nil {
		return SyncResult{}, err
	}
	taskID := "isync:" + id.String()
	_, err = s.enqueuer.EnqueueContext(ctx, asynq.NewTask(queue.TaskIntegrationSync, payload),
		asynq.TaskID(taskID), asynq.Queue(queue.QueueAccountSync), asynq.MaxRetry(5), asynq.Timeout(10*time.Minute))
	res := SyncResult{TaskID: taskID, AccountIDs: accounts}
	if errors.Is(err, asynq.ErrTaskIDConflict) {
		res.AlreadyQueued = true
		return res, nil
	}
	if err != nil {
		return SyncResult{}, fmt.Errorf("enqueue sync: %w", err)
	}
	s.progressReset(ctx, id, ProgressQueued)
	return res, nil
}

func (s *Service) syncAccounts(ctx context.Context, integ store.Integration, only []string) ([]string, error) {
	ids, err := s.db.ListSyncEnabledAccounts(ctx, store.ListSyncEnabledAccountsParams{IntegrationID: &integ.ID, OrganizationID: integ.OrganizationID})
	if err != nil {
		return nil, err
	}
	if len(only) > 0 {
		ids = slices.DeleteFunc(ids, func(id string) bool { return !slices.Contains(only, id) })
	}
	if ids == nil {
		ids = []string{}
	}
	return ids, nil
}

// --- worker ---

// Worker runs the sync tasks. Register its handlers on the asynq mux and use
// RetryDelay as the server's RetryDelayFunc.
type Worker struct {
	svc      *Service
	store    ads.Store
	rdb      *redis.Client
	enqueuer Enqueuer
	lockTTL  time.Duration
	leads    LeadSink
}

// LeadSink stores imported lead-form leads (implemented by internal/leads).
type LeadSink interface {
	// SyncTargets returns the provider IDs of the account's ads that can
	// collect leads and the time to import from.
	SyncTargets(ctx context.Context, orgID uuid.UUID, provider ads.Provider, accountID string) ([]string, time.Time, error)
	UpsertImported(ctx context.Context, orgID uuid.UUID, provider ads.Provider, accountID string, leads []ads.Lead) (int, error)
}

// WithLeads makes entity syncs also import lead-form leads.
func (w *Worker) WithLeads(sink LeadSink) *Worker {
	w.leads = sink
	return w
}

func NewWorker(svc *Service, st ads.Store, rdb *redis.Client, enq Enqueuer) *Worker {
	return &Worker{svc: svc, store: st, rdb: rdb, enqueuer: enq, lockTTL: 45 * time.Minute}
}

// Register adds the task handlers to mux.
func (w *Worker) Register(mux *asynq.ServeMux) {
	mux.HandleFunc(queue.TaskIntegrationSyncAll, w.handleSyncAll)
	mux.HandleFunc(queue.TaskIntegrationSync, w.handleIntegrationSync)
	mux.HandleFunc(queue.TaskEntitySync, w.handleEntitySync)
	mux.HandleFunc(queue.TaskMetricSync, w.handleMetricSync)
	mux.HandleFunc(queue.TaskLeadWebhook, w.handleLeadWebhook)
}

// retryAfterError asks asynq to retry after a specific delay.
type retryAfterError struct {
	err   error
	delay time.Duration
}

func (e *retryAfterError) Error() string { return e.err.Error() }
func (e *retryAfterError) Unwrap() error { return e.err }

// RetryDelay honours provider Retry-After hints and lock contention, and
// otherwise backs off exponentially (30s, 1m, 2m, ... capped at 1h).
func RetryDelay(n int, err error, t *asynq.Task) time.Duration {
	var ra *retryAfterError
	if errors.As(err, &ra) && ra.delay > 0 {
		return ra.delay
	}
	if d, ok := providers.RetryAfter(err); ok {
		return d + time.Second
	}
	if strings.HasPrefix(t.Type(), "integration:") {
		return providers.Backoff(n, 30*time.Second, time.Hour)
	}
	return asynq.DefaultRetryDelayFunc(n, err, t)
}

// IsFailure is the worker's asynq IsFailure func. Waiting for another task's
// per-account lock is not a failure: the task retries without using up an
// attempt, so an account's many metric syncs queue behind each other instead
// of dying after MaxRetry lost races.
func IsFailure(err error) bool {
	return err != nil && !errors.Is(err, errLocked)
}

// classifyTaskError decides between retry and giving up.
func (w *Worker) classifyTaskError(ctx context.Context, integID uuid.UUID, err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, providers.ErrUnauthorized):
		w.svc.markNeedsReauth(ctx, integID, err)
		return fmt.Errorf("%w: %w", err, asynq.SkipRetry)
	case errors.Is(err, providers.ErrUnsupported), errors.Is(err, providers.ErrInvalidRequest),
		errors.Is(err, providers.ErrPermissionDenied), errors.Is(err, ErrIntegrationState),
		errors.Is(err, ErrProviderNotConfigured):
		w.svc.setLastError(ctx, integID, err)
		return fmt.Errorf("%w: %w", err, asynq.SkipRetry)
	}
	return err
}

func (w *Worker) loadActive(ctx context.Context, orgID, integID uuid.UUID) (store.Integration, error) {
	integ, err := w.svc.db.GetIntegrationByID(ctx, integID)
	if err != nil {
		return integ, err
	}
	if integ.OrganizationID != orgID {
		return integ, fmt.Errorf("integration %s does not belong to organization %s: %w", integID, orgID, asynq.SkipRetry)
	}
	if integ.Status != store.IntegrationStatusActive {
		return integ, fmt.Errorf("integration %s is %s: %w", integID, integ.Status, asynq.SkipRetry)
	}
	return integ, nil
}

func (w *Worker) handleSyncAll(ctx context.Context, _ *asynq.Task) error {
	rows, err := w.svc.db.ListActiveIntegrations(ctx)
	if err != nil {
		return err
	}
	for _, r := range rows {
		payload, _ := json.Marshal(IntegrationSyncPayload{OrganizationID: r.OrganizationID, IntegrationID: r.ID})
		_, err := w.enqueuer.EnqueueContext(ctx, asynq.NewTask(queue.TaskIntegrationSync, payload),
			asynq.TaskID("isync:"+r.ID.String()), asynq.Queue(queue.QueueAccountSync), asynq.MaxRetry(5), asynq.Timeout(10*time.Minute))
		if err != nil && !errors.Is(err, asynq.ErrTaskIDConflict) {
			return err
		}
	}
	return nil
}

// handleIntegrationSync refreshes accounts, then fans out entity syncs.
func (w *Worker) handleIntegrationSync(ctx context.Context, t *asynq.Task) error {
	var p IntegrationSyncPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("decode payload: %v: %w", err, asynq.SkipRetry)
	}
	err := w.integrationSync(ctx, p)
	if err != nil && finalAttempt(ctx, err) {
		w.svc.progressFail(ctx, p.IntegrationID, err)
	}
	return err
}

func (w *Worker) integrationSync(ctx context.Context, p IntegrationSyncPayload) error {
	integ, err := w.loadActive(ctx, p.OrganizationID, p.IntegrationID)
	if err != nil {
		return err
	}
	if err := p.Options.normalize(time.Now()); err != nil {
		return fmt.Errorf("%v: %w", err, asynq.SkipRetry)
	}
	if _, err := w.svc.discover(ctx, integ, nil); err != nil {
		// discover already converted provider errors to API errors.
		if errors.Is(err, ErrReauthRequired) {
			return fmt.Errorf("%w: %w", err, asynq.SkipRetry)
		}
		return err
	}
	accounts, err := w.svc.syncAccounts(ctx, integ, p.Options.AccountIDs)
	if err != nil {
		return err
	}
	w.svc.progressReset(ctx, p.IntegrationID, ProgressRunning, pAccountsTotal, len(accounts))
	for _, acct := range accounts {
		if err := w.enqueueEntity(ctx, EntitySyncPayload{OrganizationID: p.OrganizationID, IntegrationID: p.IntegrationID, AccountID: acct, Options: p.Options}); err != nil {
			return err
		}
	}
	return nil
}

func (w *Worker) enqueueEntity(ctx context.Context, p EntitySyncPayload) error {
	payload, err := json.Marshal(p)
	if err != nil {
		return err
	}
	_, err = w.enqueuer.EnqueueContext(ctx, asynq.NewTask(queue.TaskEntitySync, payload),
		asynq.TaskID("esync:"+p.IntegrationID.String()+":"+p.AccountID),
		asynq.Queue(queue.QueueCampaignSync), asynq.MaxRetry(8), asynq.Timeout(30*time.Minute))
	if errors.Is(err, asynq.ErrTaskIDConflict) {
		return nil
	}
	return err
}

func (w *Worker) enqueueMetric(ctx context.Context, p MetricSyncPayload) error {
	payload, err := json.Marshal(p)
	if err != nil {
		return err
	}
	id := strings.Join([]string{"msync", p.IntegrationID.String(), p.AccountID, p.Report.Name, p.Range.Start, p.Range.End}, ":")
	_, err = w.enqueuer.EnqueueContext(ctx, asynq.NewTask(queue.TaskMetricSync, payload),
		asynq.TaskID(id), asynq.Queue(queue.QueueMetricSync), asynq.MaxRetry(8), asynq.Timeout(30*time.Minute))
	if errors.Is(err, asynq.ErrTaskIDConflict) {
		return nil
	}
	if err == nil {
		w.svc.progressIncr(ctx, p.IntegrationID, pMetricsTotal, 1)
	}
	return err
}

// handleEntitySync syncs campaigns → ad groups → ads → creatives for one
// account, then enqueues its metric syncs.
func (w *Worker) handleEntitySync(ctx context.Context, t *asynq.Task) error {
	var p EntitySyncPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("decode payload: %v: %w", err, asynq.SkipRetry)
	}
	err := w.entitySync(ctx, p)
	if err == nil {
		w.svc.progressIncr(ctx, p.IntegrationID, pEntitiesDone, 1)
	}
	w.svc.progressTaskError(ctx, p.IntegrationID, pEntitiesFailed, err)
	return err
}

func (w *Worker) entitySync(ctx context.Context, p EntitySyncPayload) error {
	integ, err := w.loadActive(ctx, p.OrganizationID, p.IntegrationID)
	if err != nil {
		return err
	}
	unlock, err := w.lock(ctx, p.IntegrationID, p.AccountID)
	if err != nil {
		return err
	}
	defer unlock()

	client, err := w.svc.ClientFor(integ)
	if err != nil {
		return w.classifyTaskError(ctx, integ.ID, err)
	}
	if p.Options.entities() {
		if err := w.syncEntities(ctx, client, p.OrganizationID, p.AccountID); err != nil {
			return w.classifyTaskError(ctx, integ.ID, err)
		}
		w.syncLeads(ctx, client, p.OrganizationID, p.AccountID)
	}
	if p.Options.metrics() {
		reports := client.Capabilities().Reports
		if len(p.Options.Reports) > 0 {
			reports = slices.DeleteFunc(slices.Clone(reports), func(n string) bool { return !slices.Contains(p.Options.Reports, n) })
		}
		for _, name := range reports {
			def, ok := providers.CatalogReport(name)
			if !ok {
				continue
			}
			// Facts of an unregistered report would be rejected on write.
			if _, ok := reportreg.Get(name); !ok {
				continue
			}
			if err := w.enqueueMetric(ctx, MetricSyncPayload{
				OrganizationID: p.OrganizationID, IntegrationID: p.IntegrationID, AccountID: p.AccountID,
				Report: def, Range: p.Options.Range,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (w *Worker) syncEntities(ctx context.Context, c ads.Client, orgID uuid.UUID, acct string) error {
	camps, err := c.ListCampaigns(ctx, acct)
	if err != nil {
		return fmt.Errorf("list campaigns: %w", err)
	}
	if err := w.store.UpsertCampaigns(ctx, orgID, camps); err != nil {
		return fmt.Errorf("upsert campaigns: %w", err)
	}
	groups, err := c.ListAdGroups(ctx, acct)
	if err != nil {
		return fmt.Errorf("list ad groups: %w", err)
	}
	if err := w.store.UpsertAdGroups(ctx, orgID, groups); err != nil {
		return fmt.Errorf("upsert ad groups: %w", err)
	}
	// Creatives before ads, so ads can link to their creative.
	creatives, err := c.ListCreatives(ctx, acct)
	if err != nil {
		return fmt.Errorf("list creatives: %w", err)
	}
	if err := w.store.UpsertCreatives(ctx, orgID, creatives); err != nil {
		return fmt.Errorf("upsert creatives: %w", err)
	}
	adList, err := c.ListAds(ctx, acct)
	if err != nil {
		return fmt.Errorf("list ads: %w", err)
	}
	if err := w.store.UpsertAds(ctx, orgID, adList); err != nil {
		return fmt.Errorf("upsert ads: %w", err)
	}
	return w.store.MarkSynced(ctx, orgID, c.Provider(), acct, "entities", time.Now())
}

func (w *Worker) handleMetricSync(ctx context.Context, t *asynq.Task) error {
	var p MetricSyncPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("decode payload: %v: %w", err, asynq.SkipRetry)
	}
	err := w.metricSync(ctx, p)
	if err == nil {
		w.svc.progressIncr(ctx, p.IntegrationID, pMetricsDone, 1)
	}
	w.svc.progressTaskError(ctx, p.IntegrationID, pMetricsFailed, err)
	return err
}

func (w *Worker) metricSync(ctx context.Context, p MetricSyncPayload) error {
	integ, err := w.loadActive(ctx, p.OrganizationID, p.IntegrationID)
	if err != nil {
		return err
	}
	unlock, err := w.lock(ctx, p.IntegrationID, p.AccountID)
	if err != nil {
		return err
	}
	defer unlock()

	client, err := w.svc.ClientFor(integ)
	if err != nil {
		return w.classifyTaskError(ctx, integ.ID, err)
	}
	facts, err := client.FetchReport(ctx, p.Report, p.AccountID, p.Range)
	if err != nil {
		return w.classifyTaskError(ctx, integ.ID, fmt.Errorf("fetch %s: %w", p.Report.Name, err))
	}
	if err := w.store.UpsertMetricFacts(ctx, p.OrganizationID, facts); err != nil {
		return fmt.Errorf("upsert metric facts: %w", err)
	}
	return w.store.MarkSynced(ctx, p.OrganizationID, client.Provider(), p.AccountID, "metrics:"+p.Report.Name, time.Now())
}

// --- per-account lock ---

var errLocked = errors.New("account sync already running")

var unlockScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
return 0`)

// lock ensures one sync task per (integration, account) at a time. A busy
// lock makes the task retry shortly instead of running concurrently.
func (w *Worker) lock(ctx context.Context, integID uuid.UUID, acct string) (func(), error) {
	key := "lock:sync:" + integID.String() + ":" + acct
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	token := hex.EncodeToString(b)
	ok, err := w.rdb.SetNX(ctx, key, token, w.lockTTL).Result()
	if err != nil {
		return nil, fmt.Errorf("acquire sync lock: %w", err)
	}
	if !ok {
		return nil, &retryAfterError{err: errLocked, delay: 30 * time.Second}
	}
	return func() {
		_ = unlockScript.Run(context.WithoutCancel(ctx), w.rdb, []string{key}, token).Err()
	}, nil
}

// syncLeads imports new lead-form leads for an account's lead ads. Failures
// are logged, not returned: leads are best effort and must not make the
// entity sync retry (a connection made before leads_retrieval was requested
// gets permission errors until it is reconnected).
func (w *Worker) syncLeads(ctx context.Context, c ads.Client, orgID uuid.UUID, acct string) {
	reader, ok := c.(ads.LeadReader)
	if w.leads == nil || !ok {
		return
	}
	log := w.svc.logger.With("organization_id", orgID, "account", acct)
	adIDs, since, err := w.leads.SyncTargets(ctx, orgID, c.Provider(), acct)
	if err != nil {
		log.Warn("lead sync: targets", "err", err)
		return
	}
	added := 0
	for _, adID := range adIDs {
		leads, err := reader.ListAdLeads(ctx, acct, adID, since)
		if err != nil {
			if errors.Is(err, providers.ErrPermissionDenied) || errors.Is(err, providers.ErrUnauthorized) {
				log.Warn("lead sync: no permission to read leads; reconnect to grant leads_retrieval", "err", err)
				return
			}
			log.Warn("lead sync: list", "ad", adID, "err", err)
			continue
		}
		n, err := w.leads.UpsertImported(ctx, orgID, c.Provider(), acct, leads)
		if err != nil {
			log.Warn("lead sync: store", "ad", adID, "err", err)
			continue
		}
		added += n
	}
	if added > 0 {
		log.Info("lead sync: imported", "new_leads", added, "ads", len(adIDs))
	}
}
