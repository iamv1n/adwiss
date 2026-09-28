package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/manage"
	"github.com/iamv1n/adwise/internal/queue"
)

// Task types.
const (
	// TaskTick runs every TickInterval and fans out evaluations.
	TaskTick             = "automation:tick"
	TaskEvaluateSchedule = "dayparting:evaluate"
	TaskEvaluateRule     = "automation:evaluate_rule"
	TaskExecuteAction    = "action:execute"
	TaskEvaluatePlan     = "budget_plan:evaluate"
)

// TickSpec is the asynq scheduler spec for TaskTick.
const TickSpec = "@every 5m"

// Enqueuer submits tasks. *asynq.Client satisfies it.
type Enqueuer interface {
	EnqueueContext(ctx context.Context, task *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error)
}

// Worker runs the automation tasks.
type Worker struct {
	svc *Service
	enq Enqueuer
	log *slog.Logger
}

func NewWorker(svc *Service, enq Enqueuer) *Worker {
	return &Worker{svc: svc, enq: enq, log: slog.Default().With("component", "automation.worker")}
}

func (w *Worker) Register(mux *asynq.ServeMux) {
	mux.HandleFunc(TaskTick, w.handleTick)
	mux.HandleFunc(TaskEvaluateSchedule, w.handleSchedule)
	mux.HandleFunc(TaskEvaluateRule, w.handleRule)
	mux.HandleFunc(TaskExecuteAction, w.handleExecute)
	mux.HandleFunc(TaskEvaluatePlan, w.handlePlan)
}

type idPayload struct {
	ID uuid.UUID `json:"id"`
}

func (w *Worker) enqueue(ctx context.Context, typ, queueName, taskID string, id uuid.UUID, opts ...asynq.Option) error {
	payload, _ := json.Marshal(idPayload{ID: id})
	opts = append([]asynq.Option{asynq.Queue(queueName), asynq.TaskID(taskID), asynq.Retention(time.Hour)}, opts...)
	_, err := w.enq.EnqueueContext(ctx, asynq.NewTask(typ, payload), opts...)
	if errors.Is(err, asynq.ErrTaskIDConflict) {
		return nil
	}
	return err
}

// handleTick enqueues every enabled schedule and every due rule. Task IDs
// carry the 5-minute bucket, so overlapping ticks cannot double-enqueue.
func (w *Worker) handleTick(ctx context.Context, _ *asynq.Task) error {
	now := w.svc.engine.now()
	bucket := now.Truncate(5 * time.Minute).Unix()
	schedules, err := w.svc.st.enabledSchedules(ctx, nil)
	if err != nil {
		return err
	}
	for _, s := range schedules {
		if err := w.enqueue(ctx, TaskEvaluateSchedule, queue.QueueDaypartingEvaluation,
			fmt.Sprintf("daypart:%s:%d", s.ID, bucket), s.ID, asynq.MaxRetry(2), asynq.Timeout(2*time.Minute)); err != nil {
			return err
		}
	}
	rules, err := w.svc.st.dueRules(ctx, now)
	if err != nil {
		return err
	}
	for _, r := range rules {
		if err := w.enqueue(ctx, TaskEvaluateRule, queue.QueueAutomationEvaluation,
			fmt.Sprintf("rule:%s:%d", r.ID, bucket), r.ID, asynq.MaxRetry(2), asynq.Timeout(5*time.Minute)); err != nil {
			return err
		}
	}
	// Budget plans: once per plan-local day (next_run_at is 00:05 local).
	plans, err := w.svc.st.duePlans(ctx, now)
	if err != nil {
		return err
	}
	for _, p := range plans {
		date := LocalDate(now, p.Location()).Format(time.DateOnly)
		if err := w.enqueue(ctx, TaskEvaluatePlan, queue.QueueAutomationEvaluation,
			fmt.Sprintf("plan:%s:%s", p.ID, date), p.ID, asynq.MaxRetry(2), asynq.Timeout(5*time.Minute)); err != nil {
			return err
		}
	}
	// Surface manual changes in the log even when nobody opens it.
	orgs := map[uuid.UUID]bool{}
	for _, s := range schedules {
		orgs[s.OrganizationID] = true
	}
	for _, r := range rules {
		orgs[r.OrganizationID] = true
	}
	for org := range orgs {
		if err := w.svc.ImportManual(ctx, org); err != nil {
			w.log.ErrorContext(ctx, "import manual changes", "org", org, "err", err)
		}
	}
	w.log.InfoContext(ctx, "automation tick", "schedules", len(schedules), "rules_due", len(rules), "plans_due", len(plans))
	return nil
}

func decodeID(t *asynq.Task) (uuid.UUID, error) {
	var p idPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return uuid.Nil, fmt.Errorf("decode payload: %v: %w", err, asynq.SkipRetry)
	}
	return p.ID, nil
}

func (w *Worker) handleSchedule(ctx context.Context, t *asynq.Task) error {
	id, err := decodeID(t)
	if err != nil {
		return err
	}
	s, err := w.svc.st.scheduleByID(ctx, id)
	if errors.Is(err, errNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if !s.Enabled {
		return nil
	}
	pending, recorded, err := w.svc.engine.EvaluateSchedule(ctx, s)
	if err != nil {
		return err
	}
	if recorded > 0 {
		w.log.InfoContext(ctx, "schedule evaluated", "schedule_id", s.ID, "recorded", recorded, "pending", len(pending), "dry_run", s.DryRun)
	}
	return w.enqueueExecutions(ctx, pending)
}

func (w *Worker) handleRule(ctx context.Context, t *asynq.Task) error {
	id, err := decodeID(t)
	if err != nil {
		return err
	}
	r, err := w.svc.st.ruleByID(ctx, id)
	if errors.Is(err, errNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if !r.Enabled {
		return nil
	}
	pending, err := w.svc.engine.EvaluateRule(ctx, r)
	if err != nil {
		return err
	}
	return w.enqueueExecutions(ctx, pending)
}

func (w *Worker) handlePlan(ctx context.Context, t *asynq.Task) error {
	id, err := decodeID(t)
	if err != nil {
		return err
	}
	p, err := w.svc.st.planByID(ctx, id)
	if errors.Is(err, errNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if !p.Enabled {
		return nil
	}
	pending, recorded, err := w.svc.EvaluatePlan(ctx, p)
	if err != nil {
		return err
	}
	w.log.InfoContext(ctx, "budget plan evaluated", "plan_id", p.ID, "recorded", len(recorded), "pending", len(pending), "dry_run", p.DryRun)
	return w.enqueueExecutions(ctx, pending)
}

func (w *Worker) enqueueExecutions(ctx context.Context, ids []uuid.UUID) error {
	for _, id := range ids {
		// No retries: a provider write that failed is recorded as failed
		// rather than repeated. The action ID as task ID makes enqueueing
		// idempotent.
		if err := w.enqueue(ctx, TaskExecuteAction, queue.QueueActionExecution, "action:"+id.String(), id,
			asynq.MaxRetry(0), asynq.Timeout(2*time.Minute)); err != nil {
			return err
		}
	}
	return nil
}

func (w *Worker) handleExecute(ctx context.Context, t *asynq.Task) error {
	id, err := decodeID(t)
	if err != nil {
		return err
	}
	a, err := w.svc.exec.Execute(ctx, id)
	if err != nil {
		return err
	}
	w.log.InfoContext(ctx, "action executed", "action_id", id, "status", a.Status, "entity", a.EntityName, "type", a.ActionType)
	return nil
}

// --- internal/manage adapter ---

// ManageMutator performs writes through internal/manage, which validates,
// writes to the provider, re-reads the entity and records an audit entry.
type ManageMutator struct{ Svc *manage.Service }

func (m ManageMutator) SetStatus(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, level string, id uuid.UUID, status ads.Status) error {
	return m.Svc.SetStatus(ctx, orgID, actorID, level, id, status)
}

func (m ManageMutator) SetDailyBudget(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, level string, id uuid.UUID, amount float64) error {
	switch level {
	case LevelCampaign:
		_, err := m.Svc.UpdateCampaign(ctx, orgID, actorID, id, manage.CampaignPatch{DailyBudget: manage.Some(amount)})
		return err
	case LevelAdGroup:
		_, err := m.Svc.UpdateAdGroup(ctx, orgID, actorID, id, manage.AdGroupPatch{DailyBudget: manage.Some(amount)})
		return err
	}
	return fmt.Errorf("budgets cannot be set on %s", level)
}

func (ManageMutator) RefreshesLocalState() bool { return true }
