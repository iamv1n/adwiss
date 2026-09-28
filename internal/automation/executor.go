package automation

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

// Mutator performs provider writes. cmd/api and cmd/worker wire
// ManageMutator (internal/manage); tests use a fake. actorID is nil for
// schedules and rules, so their changes are not re-imported from the audit
// log as manual ones.
type Mutator interface {
	SetStatus(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, level string, id uuid.UUID, status ads.Status) error
	SetDailyBudget(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, level string, id uuid.UUID, amount float64) error
	// RefreshesLocalState reports whether the mutator re-reads the entity
	// into the local tables itself.
	RefreshesLocalState() bool
}

// Executor runs pending actions: exactly once per action row, never for
// dry-run rows.
type Executor struct {
	st  *store
	mut Mutator
	log *slog.Logger
}

func newExecutor(st *store, mut Mutator) *Executor {
	return &Executor{st: st, mut: mut, log: slog.Default().With("component", "automation.executor")}
}

// Execute runs one pending action and returns its final row. It re-checks
// the entity first: a target that no longer needs the change is skipped.
func (x *Executor) Execute(ctx context.Context, id uuid.UUID) (Action, error) {
	ok, err := x.st.claimAction(ctx, id)
	if err != nil {
		return Action{}, err
	}
	a, err := x.st.actionByID(ctx, id)
	if err != nil {
		return Action{}, err
	}
	if !ok {
		return a, nil // already executed, dry run, or skipped
	}
	finish := func(status, reason, msg string, after map[string]any) (Action, error) {
		if err := x.st.finishAction(ctx, id, status, reason, msg, after); err != nil {
			return a, err
		}
		return x.st.actionByID(ctx, id)
	}
	if x.mut == nil {
		return finish(StatusFailed, "", "no provider writer configured", nil)
	}
	level := a.EntityType
	t, err := x.st.target(ctx, a.OrganizationID, level, a.EntityID)
	if errors.Is(err, errNotFound) {
		return finish(StatusSkipped, "the entity no longer exists", "", nil)
	}
	if err != nil {
		return finish(StatusFailed, "", err.Error(), nil)
	}
	if !t.manageable() {
		return finish(StatusSkipped, "the entity is "+t.Status, "", nil)
	}

	var status *string
	var budget *int64
	switch a.ActionType {
	case ActionPause, ActionActivate:
		want := "paused"
		if a.ActionType == ActionActivate {
			want = "active"
		}
		if t.Status == want {
			return finish(StatusSkipped, "already "+want, "", nil)
		}
		err = x.mut.SetStatus(ctx, a.OrganizationID, nil, level, a.EntityID, ads.Status(want))
		status = &want
	case ActionSetBudget:
		amount, ok := a.After["daily_budget"].(float64)
		if !ok || amount <= 0 {
			return finish(StatusFailed, "", "the action has no target budget", nil)
		}
		if t.DailyBudgetMicros == nil {
			return finish(StatusSkipped, "the "+levelNoun(level)+" has no daily budget", "", nil)
		}
		m := unitsToMicros(amount)
		if *t.DailyBudgetMicros == m {
			return finish(StatusSkipped, "the budget is already set", "", nil)
		}
		err = x.mut.SetDailyBudget(ctx, a.OrganizationID, nil, level, a.EntityID, amount)
		budget = &m
	case ActionNotify:
		return finish(StatusSucceeded, "", "", nil)
	default:
		return finish(StatusSkipped, "this action type cannot be executed", "", nil)
	}
	if err != nil {
		x.log.WarnContext(ctx, "action failed", "action_id", id, "entity_id", a.EntityID, "err", err)
		return finish(StatusFailed, "", providerMessage(err), nil)
	}
	if !x.mut.RefreshesLocalState() {
		if err := x.st.setLocalState(ctx, level, a.EntityID, status, budget); err != nil {
			x.log.ErrorContext(ctx, "mirror local state", "action_id", id, "err", err)
		}
	}
	if a.Source == SourceSchedule && a.SourceID != nil {
		x.rememberSchedule(ctx, a, t)
	}
	if a.Source == SourcePlan {
		x.rememberPlanBase(ctx, a)
	}
	return finish(StatusSucceeded, "", "", nil)
}

// rememberSchedule updates the schedule's memo so it only undoes its own changes.
func (x *Executor) rememberSchedule(ctx context.Context, a Action, before Target) {
	m, err := x.st.memo(ctx, *a.SourceID, a.EntityID)
	if err != nil {
		x.log.ErrorContext(ctx, "load schedule memo", "err", err)
		return
	}
	c := Change{Type: a.ActionType}
	if a.ActionType == ActionSetBudget {
		c.BudgetMicros = unitsToMicros(a.After["daily_budget"].(float64))
		c.Multiplier = 1
		if v, ok := a.After["multiplier"].(float64); ok {
			c.Multiplier = v
		}
	}
	ApplyScheduleChange(&before, &m, c)
	if err := x.st.saveMemo(ctx, *a.SourceID, a.EntityID, m); err != nil {
		x.log.ErrorContext(ctx, "save schedule memo", "err", err)
	}
}

func providerMessage(err error) string {
	var he *httpx.Error
	msg := err.Error()
	if errors.As(err, &he) {
		msg = fmt.Sprintf("%s: %s", he.Code, he.Message)
	}
	if len(msg) > 1000 {
		msg = msg[:1000]
	}
	return strings.TrimSpace(msg)
}

// revertible reports whether POST /actions/{id}/revert can undo a.
func revertible(a Action) bool {
	if a.Status != StatusSucceeded || a.RevertedBy != nil {
		return false
	}
	switch a.EntityType {
	case LevelCampaign, LevelAdGroup:
	case LevelAd:
		if a.ActionType == ActionSetBudget {
			return false
		}
	default:
		return false
	}
	switch a.ActionType {
	case ActionPause, ActionActivate:
		s, _ := a.Before["status"].(string)
		return s == "active" || s == "paused"
	case ActionSetBudget:
		b, ok := a.Before["daily_budget"].(float64)
		return ok && b > 0
	}
	return false
}

// rememberPlanBase: a plan action carrying base_daily_budget was written as
// base × the multiplier a live dayparting schedule holds. The schedule's
// memo base becomes the plan's budget, so the schedule keeps multiplying the
// plan's budget and restores it (not the old one) when the multiplier ends.
func (x *Executor) rememberPlanBase(ctx context.Context, a Action) {
	base, ok := a.After["base_daily_budget"].(float64)
	if !ok || base <= 0 {
		return
	}
	schedules, err := x.st.enabledSchedules(ctx, &a.OrganizationID)
	if err != nil {
		x.log.ErrorContext(ctx, "load schedules for plan base", "err", err)
		return
	}
	for _, s := range schedules {
		if s.DryRun || s.Level != a.EntityType || !slices.Contains(s.TargetIDs, a.EntityID) {
			continue
		}
		m, err := x.st.memo(ctx, s.ID, a.EntityID)
		if err != nil {
			x.log.ErrorContext(ctx, "load schedule memo", "err", err)
			continue
		}
		if m.AppliedMultiplier == 1 || m.AppliedMultiplier == 0 || m.BaseBudgetMicros == nil {
			continue
		}
		b := unitsToMicros(base)
		m.BaseBudgetMicros = &b
		if err := x.st.saveMemo(ctx, s.ID, a.EntityID, m); err != nil {
			x.log.ErrorContext(ctx, "save schedule memo", "err", err)
		}
	}
}
