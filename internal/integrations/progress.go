package integrations

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

// Sync progress is a Redis hash per integration, written by the worker as a
// sync moves through its stages and read by GET .../sync/progress, which the
// web app polls while a sync is active:
//
//	queued → running (accounts discovered; entity tasks enqueued)
//	       → done | failed (every entity and metric task finished or gave up)
//
// Metric totals grow while entity tasks run (each enqueues its reports), so a
// sync is complete once every entity task is finished and every enqueued
// metric task is too. Only a task's final outcome is counted: a failure that
// will be retried is not.

const progressTTL = 24 * time.Hour

// Progress states.
const (
	ProgressIdle    = "idle"
	ProgressQueued  = "queued"
	ProgressRunning = "running"
	ProgressDone    = "done"
	ProgressFailed  = "failed"
)

// Hash fields.
const (
	pState          = "state"
	pStartedAt      = "started_at"
	pUpdatedAt      = "updated_at"
	pAccountsTotal  = "accounts_total"
	pEntitiesDone   = "entities_done"
	pEntitiesFailed = "entities_failed"
	pMetricsTotal   = "metrics_total"
	pMetricsDone    = "metrics_done"
	pMetricsFailed  = "metrics_failed"
	pError          = "error"
)

// SyncProgress is the API shape of an integration's latest sync.
type SyncProgress struct {
	State          string     `json:"state"`
	StartedAt      *time.Time `json:"started_at"`
	UpdatedAt      *time.Time `json:"updated_at"`
	AccountsTotal  int        `json:"accounts_total"`
	EntitiesDone   int        `json:"entities_done"`
	EntitiesFailed int        `json:"entities_failed"`
	MetricsTotal   int        `json:"metrics_total"`
	MetricsDone    int        `json:"metrics_done"`
	MetricsFailed  int        `json:"metrics_failed"`
	// Percent is 0–100, over entity and metric tasks known so far.
	Percent int     `json:"percent"`
	Error   *string `json:"error"`
}

func progressKey(id uuid.UUID) string { return "syncprog:" + id.String() }

// progressReset starts a fresh record in the given state.
func (s *Service) progressReset(ctx context.Context, id uuid.UUID, state string, fields ...any) {
	if s.rdb == nil {
		return
	}
	now := s.now().UTC().Format(time.RFC3339)
	key := progressKey(id)
	_, err := s.rdb.TxPipelined(ctx, func(p redis.Pipeliner) error {
		p.Del(ctx, key)
		p.HSet(ctx, key, append([]any{pState, state, pStartedAt, now, pUpdatedAt, now}, fields...)...)
		p.Expire(ctx, key, progressTTL)
		return nil
	})
	if err != nil {
		s.logger.Warn("sync progress: reset", "integration_id", id, "err", err)
	}
}

// progressIncr adds n to a counter.
func (s *Service) progressIncr(ctx context.Context, id uuid.UUID, field string, n int64) {
	if s.rdb == nil || n == 0 {
		return
	}
	key := progressKey(id)
	_, err := s.rdb.TxPipelined(ctx, func(p redis.Pipeliner) error {
		p.HIncrBy(ctx, key, field, n)
		p.HSet(ctx, key, pUpdatedAt, s.now().UTC().Format(time.RFC3339))
		p.Expire(ctx, key, progressTTL)
		return nil
	})
	if err != nil {
		s.logger.Warn("sync progress: incr", "integration_id", id, "field", field, "err", err)
	}
}

// progressFail marks the whole sync failed (it could not start).
func (s *Service) progressFail(ctx context.Context, id uuid.UUID, cause error) {
	if s.rdb == nil {
		return
	}
	key := progressKey(id)
	_, err := s.rdb.TxPipelined(ctx, func(p redis.Pipeliner) error {
		p.HSet(ctx, key, pState, ProgressFailed, pError, cause.Error(), pUpdatedAt, s.now().UTC().Format(time.RFC3339))
		p.Expire(ctx, key, progressTTL)
		return nil
	})
	if err != nil {
		s.logger.Warn("sync progress: fail", "integration_id", id, "err", err)
	}
}

// progressTaskError records a task's error if it is final (no retry follows)
// and bumps the failed counter.
func (s *Service) progressTaskError(ctx context.Context, id uuid.UUID, field string, err error) {
	if err == nil || !finalAttempt(ctx, err) {
		return
	}
	s.progressIncr(ctx, id, field, 1)
	if s.rdb != nil {
		_ = s.rdb.HSet(ctx, progressKey(id), pError, err.Error()).Err()
	}
}

// finalAttempt reports whether asynq will not retry the task after err.
func finalAttempt(ctx context.Context, err error) bool {
	if errors.Is(err, errLocked) {
		return false
	}
	if errors.Is(err, asynq.SkipRetry) {
		return true
	}
	n, ok1 := asynq.GetRetryCount(ctx)
	max, ok2 := asynq.GetMaxRetry(ctx)
	return ok1 && ok2 && n >= max
}

// SyncProgress returns the integration's latest sync progress.
func (s *Service) SyncProgress(ctx context.Context, orgID, id uuid.UUID) (SyncProgress, error) {
	if _, err := s.get(ctx, orgID, id); err != nil {
		return SyncProgress{}, err
	}
	out := SyncProgress{State: ProgressIdle}
	if s.rdb == nil {
		return out, nil
	}
	h, err := s.rdb.HGetAll(ctx, progressKey(id)).Result()
	if err != nil {
		return SyncProgress{}, err
	}
	if len(h) == 0 {
		return out, nil
	}
	num := func(f string) int { n, _ := strconv.Atoi(h[f]); return n }
	ts := func(f string) *time.Time {
		t, err := time.Parse(time.RFC3339, h[f])
		if err != nil {
			return nil
		}
		return &t
	}
	out = SyncProgress{
		State: h[pState], StartedAt: ts(pStartedAt), UpdatedAt: ts(pUpdatedAt),
		AccountsTotal: num(pAccountsTotal), EntitiesDone: num(pEntitiesDone), EntitiesFailed: num(pEntitiesFailed),
		MetricsTotal: num(pMetricsTotal), MetricsDone: num(pMetricsDone), MetricsFailed: num(pMetricsFailed),
	}
	if e := h[pError]; e != "" {
		out.Error = &e
	}
	if out.State == ProgressRunning {
		entitiesFinished := out.EntitiesDone+out.EntitiesFailed >= out.AccountsTotal
		metricsFinished := out.MetricsDone+out.MetricsFailed >= out.MetricsTotal
		if entitiesFinished && metricsFinished {
			out.State = ProgressDone
			if out.EntitiesFailed+out.MetricsFailed > 0 && out.EntitiesDone+out.MetricsDone == 0 {
				out.State = ProgressFailed
			}
		}
	}
	total := out.AccountsTotal + out.MetricsTotal
	finished := out.EntitiesDone + out.EntitiesFailed + out.MetricsDone + out.MetricsFailed
	switch {
	case out.State == ProgressDone:
		out.Percent = 100
	case total > 0:
		out.Percent = min(99, finished*100/total)
	}
	return out, nil
}
