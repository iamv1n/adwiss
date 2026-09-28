package automation

import (
	"fmt"
	"math"
	"slices"
	"strings"

	"github.com/google/uuid"
)

// Pure decision logic: what a schedule or rule wants to do to one target,
// given its current state. No I/O, so it is table-tested and shared by
// evaluation, preview and simulation.

// Target is an entity a schedule or rule acts on, with its current state.
type Target struct {
	ID                uuid.UUID `json:"id"`
	Level             string    `json:"level"`
	Name              string    `json:"name"`
	AccountID         uuid.UUID `json:"account_id"`
	AccountName       string    `json:"account_name"`
	Provider          string    `json:"provider"`
	Currency          string    `json:"currency"`
	Timezone          string    `json:"timezone"`
	Status            string    `json:"status"`
	DailyBudgetMicros *int64    `json:"-"`
	ExternalID        string    `json:"-"`
}

// State returns the target's state as stored on actions.
func (t Target) State() EntityState {
	s := EntityState{Status: t.Status}
	if t.DailyBudgetMicros != nil {
		s.DailyBudget = ptrF(microsToUnits(*t.DailyBudgetMicros))
	}
	return s
}

func (t Target) manageable() bool { return t.Status == "active" || t.Status == "paused" }

// ScheduleMemo is what a schedule remembers about a target
// (dayparting_entity_state).
type ScheduleMemo struct {
	PausedBySchedule  bool
	BaseBudgetMicros  *int64
	AppliedMultiplier float64
}

// Change is one mutation to a target.
type Change struct {
	Type         string      `json:"type"` // pause, activate, set_budget, notify
	Before       EntityState `json:"before"`
	After        EntityState `json:"after"`
	BudgetMicros int64       `json:"-"`
	Multiplier   float64     `json:"multiplier,omitempty"` // schedules: the grid value applied
	Reason       string      `json:"reason"`
}

// DecideSchedule returns the changes a schedule makes to t while the grid
// value v is in effect. Rules, in order:
//
//   - Only active or paused targets are managed.
//   - v = 0 pauses an active target.
//   - v > 0 re-activates a target only if this schedule paused it; a target
//     someone else paused stays paused and is not touched at all.
//   - With a daily budget, v > 0 sets it to base × v, where base is the
//     budget captured while no multiplier was applied. v = 1 restores base.
func DecideSchedule(v float64, t Target, m ScheduleMemo) []Change {
	if !t.manageable() {
		return nil
	}
	label := DescribeValue(v)
	if v == 0 {
		if t.Status == "active" {
			return []Change{{Type: ActionPause, Before: t.State(), After: EntityState{Status: "paused"}, Multiplier: 0,
				Reason: "schedule is off this hour"}}
		}
		return nil
	}
	var out []Change
	status := t.Status
	if t.Status == "paused" {
		if !m.PausedBySchedule {
			return nil
		}
		out = append(out, Change{Type: ActionActivate, Before: t.State(), After: EntityState{Status: "active"}, Multiplier: v,
			Reason: "schedule is " + label + " this hour"})
		status = "active"
	}
	if t.DailyBudgetMicros != nil {
		cur := *t.DailyBudgetMicros
		base := cur
		if m.AppliedMultiplier != 1 && m.AppliedMultiplier != 0 && m.BaseBudgetMicros != nil {
			base = *m.BaseBudgetMicros
		}
		want := roundMicros(float64(base) * v)
		if want != cur && want > 0 {
			reason := "schedule is " + label + " this hour"
			if v == 1 {
				reason = "schedule restores the normal budget"
			}
			out = append(out, Change{Type: ActionSetBudget,
				Before:       EntityState{Status: status, DailyBudget: ptrF(microsToUnits(cur))},
				After:        EntityState{Status: status, DailyBudget: ptrF(microsToUnits(want))},
				BudgetMicros: want, Multiplier: v, Reason: reason})
		}
	}
	return out
}

// ApplyScheduleChange updates the target and memo as if c succeeded. The
// executor persists the memo; previews use it to simulate the next hours.
func ApplyScheduleChange(t *Target, m *ScheduleMemo, c Change) {
	switch c.Type {
	case ActionPause:
		t.Status = "paused"
		m.PausedBySchedule = true
	case ActionActivate:
		t.Status = "active"
		m.PausedBySchedule = false
	case ActionSetBudget:
		if m.AppliedMultiplier == 1 || m.AppliedMultiplier == 0 || m.BaseBudgetMicros == nil {
			if t.DailyBudgetMicros != nil {
				b := *t.DailyBudgetMicros
				m.BaseBudgetMicros = &b
			}
		}
		b := c.BudgetMicros
		t.DailyBudgetMicros = &b
		m.AppliedMultiplier = c.Multiplier
	}
}

// DecideRule returns the change a rule action makes to a matching target.
// noop means the target is already in the desired state; skip explains why
// the change cannot be made.
func DecideRule(a RuleAction, t Target) (c Change, noop bool, skip string) {
	if !t.manageable() {
		return Change{}, true, ""
	}
	switch a.Type {
	case RulePause:
		if t.Status != "active" {
			return Change{}, true, ""
		}
		return Change{Type: ActionPause, Before: t.State(), After: EntityState{Status: "paused"}}, false, ""
	case RuleActivate:
		if t.Status != "paused" {
			return Change{}, true, ""
		}
		return Change{Type: ActionActivate, Before: t.State(), After: EntityState{Status: "active"}}, false, ""
	case RuleNotify:
		return Change{Type: ActionNotify, Before: t.State(), After: t.State()}, false, ""
	case RuleIncreaseBudget, RuleDecreaseBudget, RuleSetBudget:
		c := Change{Type: ActionSetBudget, Before: t.State()}
		if t.DailyBudgetMicros == nil {
			return c, false, "no daily budget on this " + levelNoun(t.Level) + " (it uses a lifetime or ad set budget)"
		}
		cur := *t.DailyBudgetMicros
		var want int64
		switch a.Type {
		case RuleIncreaseBudget:
			want = roundMicros(float64(cur) * (1 + a.Value/100))
		case RuleDecreaseBudget:
			want = roundMicros(float64(cur) * (1 - a.Value/100))
		default:
			want = unitsToMicros(a.Value)
		}
		if want <= 0 {
			return c, false, "the new budget would be zero"
		}
		if want == cur {
			return Change{}, true, ""
		}
		c.BudgetMicros = want
		c.After = EntityState{Status: t.Status, DailyBudget: ptrF(microsToUnits(want))}
		return c, false, ""
	}
	return Change{}, true, ""
}

// ScheduleClaim is an enabled schedule targeting an entity, with the grid
// value it has in effect right now.
type ScheduleClaim struct {
	ScheduleID   uuid.UUID
	ScheduleName string
	DryRun       bool
	Value        float64
	// ActedThisSlot is true when the schedule recorded a change for the
	// entity in the current hour.
	ActedThisSlot bool
}

// ScheduleConflict decides precedence between a rule and the schedules that
// target the same entity: the schedule wins whenever it holds the entity in
// this slot (paused or budget-adjusted, i.e. value ≠ 1) or changed it this
// hour. A live rule only yields to live schedules; a dry-run rule yields to
// any enabled schedule so its preview matches what would happen.
func ScheduleConflict(ruleDryRun bool, claims []ScheduleClaim) (conflict bool, reason string) {
	for _, c := range claims {
		if c.DryRun && !ruleDryRun {
			continue
		}
		if c.Value != 1 || c.ActedThisSlot {
			what := DescribeValue(c.Value)
			if c.Value == 1 {
				what = "changed it this hour"
			} else {
				what = "is " + what + " this hour"
			}
			return true, fmt.Sprintf("dayparting schedule %q %s; schedules take precedence over rules", c.ScheduleName, what)
		}
	}
	return false, ""
}

func roundMicros(v float64) int64 { return int64(math.Round(v/1e4)) * 1e4 }

func levelNoun(level string) string {
	switch level {
	case LevelAdGroup:
		return "ad set"
	case LevelAd:
		return "ad"
	}
	return "campaign"
}

// DescribeRule renders a rule in plain language, e.g. "If spend > ₹500 and
// conversions = 0 in the last 3 days, pause the campaign".
func DescribeRule(r Rule, currency string) string {
	parts := make([]string, 0, len(r.Conditions))
	for _, c := range r.Conditions {
		if c.IsTrend() {
			parts = append(parts, describeTrend(c, r.LookbackDays))
			continue
		}
		parts = append(parts, c.Metric+" "+opSymbol(c.Op)+" "+formatConditionValue(c, currency))
	}
	out := fmt.Sprintf("If %s in the last %d days, %s", strings.Join(parts, " and "), r.LookbackDays, describeAction(r.Action, currency))
	if r.Level == LevelAd || r.Level == LevelAdGroup {
		out = "For each " + levelNoun(r.Level) + ": " + strings.ToLower(out[:1]) + out[1:]
	}
	return out
}

// describeTrend renders a trend condition, e.g. "ctr fell > 25% vs the
// previous 7 days".
func describeTrend(c Condition, days int) string {
	verb := "rose"
	if c.Op == OpChangeLT {
		verb = "fell"
	}
	return fmt.Sprintf("%s %s > %g%% vs the previous %d days", c.Metric, verb, math.Round(math.Abs(c.Value)*1e4)/100, days)
}

func opSymbol(op string) string {
	switch op {
	case "gt":
		return ">"
	case "gte":
		return "≥"
	case "lt":
		return "<"
	case "lte":
		return "≤"
	}
	return "="
}

func formatConditionValue(c Condition, currency string) string {
	if slices.Contains([]string{"spend", "revenue", "cpa", "cpc", "cpm"}, c.Metric) {
		return fmt.Sprintf("%s%g", currencyPrefix(currency), c.Value)
	}
	if c.Metric == "ctr" {
		return fmt.Sprintf("%g%%", c.Value*100)
	}
	return fmt.Sprintf("%g", c.Value)
}

func describeAction(a RuleAction, currency string) string {
	switch a.Type {
	case RulePause:
		return "pause it"
	case RuleActivate:
		return "activate it"
	case RuleIncreaseBudget:
		return fmt.Sprintf("increase its daily budget by %g%%", a.Value)
	case RuleDecreaseBudget:
		return fmt.Sprintf("decrease its daily budget by %g%%", a.Value)
	case RuleSetBudget:
		return fmt.Sprintf("set its daily budget to %s%g", currencyPrefix(currency), a.Value)
	}
	return "notify me"
}

func currencyPrefix(c string) string {
	switch c {
	case "INR":
		return "₹"
	case "USD":
		return "$"
	case "EUR":
		return "€"
	case "GBP":
		return "£"
	case "":
		return ""
	}
	return c + " "
}
