package automation

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

// Entry points for other packages (internal/recommendations): a one-off
// change a person approved, recorded and executed through the same action
// path as rules, so it shows in the actions log and can be reverted.

// ManualChange is a change to one entity. Budget is the new daily budget in
// major units of the account currency (set_budget only).
type ManualChange struct {
	Level    string
	EntityID uuid.UUID
	Type     string // pause, activate or set_budget
	Budget   float64
	// ExpectBudget, when set, is the daily budget the change was computed
	// from; the change is refused if the budget has changed since.
	ExpectBudget *float64
	// SourceID and SourceName identify what proposed the change (e.g. a
	// recommendation); Key makes recording idempotent.
	SourceID   *uuid.UUID
	SourceName string
	Reason     string
	Key        string
}

// ApplyManual records c as a live manual action by m's user and executes it
// synchronously. It returns the final action row (succeeded, failed or
// skipped). An already-used key returns a conflict error.
func (s *Service) ApplyManual(ctx context.Context, m organizations.Membership, c ManualChange) (Action, error) {
	if !slices.Contains(RuleLevels, c.Level) {
		return Action{}, invalid("level", "must be campaign, ad_group or ad")
	}
	t, err := s.st.target(ctx, m.OrganizationID, c.Level, c.EntityID)
	if err != nil {
		return Action{}, notFound(err)
	}
	before := t.State()
	var after EntityState
	switch c.Type {
	case ActionPause:
		after = EntityState{Status: "paused"}
	case ActionActivate:
		after = EntityState{Status: "active"}
	case ActionSetBudget:
		if c.Level == LevelAd {
			return Action{}, invalid("type", "ads have no budget")
		}
		if c.Budget <= 0 {
			return Action{}, invalid("budget", "must be positive")
		}
		if c.ExpectBudget != nil && (before.DailyBudget == nil || *before.DailyBudget != *c.ExpectBudget) {
			return Action{}, httpx.NewError(http.StatusConflict, "stale", "the daily budget changed since this was suggested")
		}
		b := c.Budget
		after = EntityState{Status: t.Status, DailyBudget: &b}
	default:
		return Action{}, invalid("type", "must be pause, activate or set_budget")
	}
	uid := m.UserID
	key := c.Key
	var keyPtr *string
	if key != "" {
		keyPtr = &key
	}
	id, ok, err := s.st.insertAction(ctx, newAction{OrganizationID: m.OrganizationID, Source: SourceManual, SourceID: c.SourceID,
		SourceName: c.SourceName, ActorUserID: &uid, Target: t, ActionType: c.Type, Before: before.Map(), After: after.Map(),
		Status: StatusPending, Reason: c.Reason, IdempotencyKey: keyPtr})
	if err != nil {
		return Action{}, err
	}
	if !ok {
		return Action{}, httpx.NewError(http.StatusConflict, "already_applied", "this change was already applied")
	}
	return s.exec.Execute(ctx, id)
}

// ScheduleControl reports the enabled, live dayparting schedule, if any, that
// manages the campaign's (or ad set's) daily budget through multipliers, so a
// one-off budget change would fight it. Schedules that only switch on and off
// leave budgets alone.
func (s *Service) ScheduleControl(ctx context.Context, orgID uuid.UUID, level string, id uuid.UUID) (string, bool, error) {
	schedules, err := s.st.enabledSchedules(ctx, &orgID)
	if err != nil {
		return "", false, err
	}
	for _, sc := range schedules {
		if !sc.DryRun && sc.Level == level && slices.Contains(sc.TargetIDs, id) && usesMultiplier(sc.Grid) {
			return sc.Name, true, nil
		}
	}
	return "", false, nil
}

// RecentlyChanged reports whether any live or pending change was recorded for
// the entity since since (by anyone: rules, schedules, people).
func (s *Service) RecentlyChanged(ctx context.Context, orgID, entityID uuid.UUID, since time.Time) (bool, error) {
	var ok bool
	err := s.db.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM actions WHERE organization_id = $1 AND entity_id = $2
		AND status IN ('pending', 'running', 'succeeded') AND action_type IN ('pause', 'activate', 'set_budget', 'archive')
		AND created_at >= $3)`, orgID, entityID, since).Scan(&ok)
	return ok, err
}

// ActionByID returns an action of the organization.
func (s *Service) ActionByID(ctx context.Context, orgID, id uuid.UUID) (Action, error) {
	a, err := s.st.getAction(ctx, orgID, id)
	if errors.Is(err, errNotFound) {
		return a, fmt.Errorf("action %s: %w", id, httpx.ErrNotFound)
	}
	return a, err
}
