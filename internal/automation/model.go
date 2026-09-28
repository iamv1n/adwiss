// Package automation implements dayparting schedules, automation rules and the
// action log (plan §10–14, §24–25, §36).
//
// Flow:
//
//	asynq scheduler (every 5 min) → TaskTick
//	    → one TaskEvaluateSchedule per enabled schedule (dayparting_evaluation queue)
//	    → one TaskEvaluateRule per enabled rule that is due (automation_evaluation queue)
//	evaluation → action rows (dry_run | pending | skipped), keyed by an
//	    idempotency key of (source, source id, entity, time slot)
//	    → one TaskExecuteAction per pending row (action_execution queue)
//	execution → Mutator (internal/manage when wired, else ads.Client) → action row
//	    succeeded | failed
//
// Everything defaults to dry_run: a dry-run schedule or rule records what it
// would have done (status dry_run) and never calls a provider.
//
// Precedence: a dayparting schedule wins over an automation rule on the same
// entity in the same hour. The rule's change is recorded as skipped with the
// reason, so the conflict is visible in the log.
package automation

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Action statuses.
const (
	StatusDryRun    = "dry_run"
	StatusPending   = "pending"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusSkipped   = "skipped"
)

// Action sources.
const (
	SourceManual   = "manual"
	SourceSchedule = "schedule"
	SourceRule     = "rule"
	SourceRevert   = "revert"
	SourcePlan     = "plan" // budget planner
)

// Action types.
const (
	ActionPause     = "pause"
	ActionActivate  = "activate"
	ActionSetBudget = "set_budget"
	ActionNotify    = "notify"
	ActionArchive   = "archive"
	ActionUpdate    = "update"
)

// Entity levels a schedule or rule can target.
const (
	LevelCampaign = "campaign"
	LevelAdGroup  = "ad_group"
	LevelAd       = "ad" // rules only: pause, activate or notify
)

// RuleLevels are the entity levels a rule can evaluate and act on.
var RuleLevels = []string{LevelCampaign, LevelAdGroup, LevelAd}

// Grid is a weekly schedule: Grid[d][h] for ISO weekday d (0 = Monday … 6 =
// Sunday) and local hour h. 0 = off (pause), 1 = on, any other positive value
// multiplies the daily budget for that hour.
type Grid [7][24]float64

// Limits on a budget multiplier.
const (
	MinMultiplier = 0.1
	MaxMultiplier = 5
)

// Validate reports the first invalid cell.
func (g Grid) Validate() error {
	for d := range g {
		for h, v := range g[d] {
			if math.IsNaN(v) || v < 0 || (v > 0 && (v < MinMultiplier || v > MaxMultiplier)) {
				return fmt.Errorf("cell %s %02d:00 is %v; use 0 (off), 1 (on) or a multiplier between %v and %v",
					weekdayShort[d], h, v, MinMultiplier, MaxMultiplier)
			}
		}
	}
	return nil
}

// FullGrid returns a grid with every hour on.
func FullGrid() Grid {
	var g Grid
	for d := range g {
		for h := range g[d] {
			g[d][h] = 1
		}
	}
	return g
}

var weekdayShort = [7]string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}

// Schedule is a dayparting schedule.
type Schedule struct {
	ID              uuid.UUID   `json:"id"`
	OrganizationID  uuid.UUID   `json:"organization_id"`
	Name            string      `json:"name"`
	Level           string      `json:"level"`
	TargetIDs       []uuid.UUID `json:"target_ids"`
	Timezone        *string     `json:"timezone"` // nil = each target's account timezone
	Grid            Grid        `json:"grid"`
	Enabled         bool        `json:"enabled"`
	DryRun          bool        `json:"dry_run"`
	CreatedBy       *uuid.UUID  `json:"created_by"`
	LastEvaluatedAt *time.Time  `json:"last_evaluated_at"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
}

// Condition metrics.
var ConditionMetrics = []string{
	"spend", "conversions", "revenue", "cpa", "roas", "ctr", "cpc", "cpm", "impressions", "clicks", "frequency",
}

// Condition operators. change_gt and change_lt are trend operators: they
// compare the metric over the lookback window with the previous window of the
// same length, and Value is the relative change as a fraction (-0.25 = fell by
// more than 25% for change_lt, 0.2 = rose by more than 20% for change_gt).
var ConditionOps = []string{"gt", "gte", "lt", "lte", "eq", OpChangeGT, OpChangeLT}

// Trend operators.
const (
	OpChangeGT = "change_gt"
	OpChangeLT = "change_lt"
)

// IsTrend reports whether the condition compares two windows.
func (c Condition) IsTrend() bool { return c.Op == OpChangeGT || c.Op == OpChangeLT }

// HasTrend reports whether any condition compares two windows.
func HasTrend(conds []Condition) bool {
	for _, c := range conds {
		if c.IsTrend() {
			return true
		}
	}
	return false
}

// Condition compares one metric over the rule's lookback window with a value
// (or, for the change_* operators, with the previous window).
// Money is in major currency units; ratios are fractions (CTR 0.01 = 1%).
type Condition struct {
	Metric string  `json:"metric"`
	Op     string  `json:"op"`
	Value  float64 `json:"value"`
}

// Rule action types.
const (
	RulePause          = "pause"
	RuleActivate       = "activate"
	RuleIncreaseBudget = "increase_budget"
	RuleDecreaseBudget = "decrease_budget"
	RuleSetBudget      = "set_budget"
	RuleNotify         = "notify"
)

var RuleActionTypes = []string{RulePause, RuleActivate, RuleIncreaseBudget, RuleDecreaseBudget, RuleSetBudget, RuleNotify}

// RuleAction is what a rule does to each matching campaign. Value is a
// percentage for increase/decrease and an amount in the account currency for
// set_budget.
type RuleAction struct {
	Type  string  `json:"type"`
	Value float64 `json:"value,omitempty"`
}

// ChangesBudget reports whether the action writes a budget.
func (a RuleAction) ChangesBudget() bool {
	return a.Type == RuleIncreaseBudget || a.Type == RuleDecreaseBudget || a.Type == RuleSetBudget
}

// ValidateFor checks the action against the rule's level: ads have no
// budget, so ad-level rules only pause, activate or notify.
func (a RuleAction) ValidateFor(level string) error {
	if level == LevelAd && a.ChangesBudget() {
		return fmt.Errorf("ads have no budget; ad-level rules can pause, activate or notify")
	}
	return a.Validate()
}

// Validate checks the action's value range.
func (a RuleAction) Validate() error {
	switch a.Type {
	case RulePause, RuleActivate, RuleNotify:
		return nil
	case RuleIncreaseBudget:
		if a.Value <= 0 || a.Value > 200 {
			return fmt.Errorf("increase must be between 0 and 200 percent")
		}
	case RuleDecreaseBudget:
		if a.Value <= 0 || a.Value >= 100 {
			return fmt.Errorf("decrease must be between 0 and 100 percent")
		}
	case RuleSetBudget:
		if a.Value <= 0 {
			return fmt.Errorf("budget must be positive")
		}
	default:
		return fmt.Errorf("unknown action %q", a.Type)
	}
	return nil
}

// Rule scopes.
const (
	ScopeOrg       = "org"
	ScopeAccount   = "account"
	ScopeCampaigns = "campaigns"
)

// Rule is an automation rule.
type Rule struct {
	ID                   uuid.UUID   `json:"id"`
	OrganizationID       uuid.UUID   `json:"organization_id"`
	Name                 string      `json:"name"`
	Level                string      `json:"level"` // campaign, ad_group or ad
	ScopeType            string      `json:"scope_type"`
	ScopeIDs             []uuid.UUID `json:"scope_ids"`
	Conditions           []Condition `json:"conditions"`
	LookbackDays         int         `json:"lookback_days"`
	Action               RuleAction  `json:"action"`
	CheckIntervalMinutes int         `json:"check_interval_minutes"`
	CooldownMinutes      int         `json:"cooldown_minutes"`
	MaxChangesPerRun     int         `json:"max_changes_per_run"`
	Enabled              bool        `json:"enabled"`
	DryRun               bool        `json:"dry_run"`
	CreatedBy            *uuid.UUID  `json:"created_by"`
	LastRunAt            *time.Time  `json:"last_run_at"`
	LastRunMatched       int         `json:"last_run_matched"`
	LastRunChanges       int         `json:"last_run_changes"`
	NextRunAt            *time.Time  `json:"next_run_at"`
	CreatedAt            time.Time   `json:"created_at"`
	UpdatedAt            time.Time   `json:"updated_at"`
	// Stats over the action log (list and get only).
	ChangesTotal int `json:"changes_total"`
	Changes7d    int `json:"changes_7d"`
}

// EntityState is the before/after state stored on an action. Budgets are in
// major units of the account currency.
type EntityState struct {
	Status      string   `json:"status,omitempty"`
	DailyBudget *float64 `json:"daily_budget,omitempty"`
	// Multiplier is the dayparting grid value a schedule applied.
	Multiplier *float64 `json:"multiplier,omitempty"`
}

// Map returns the state as a JSON object.
func (s EntityState) Map() map[string]any {
	m := map[string]any{}
	if s.Status != "" {
		m["status"] = s.Status
	}
	if s.DailyBudget != nil {
		m["daily_budget"] = *s.DailyBudget
	}
	if s.Multiplier != nil {
		m["multiplier"] = *s.Multiplier
	}
	return m
}

// Action is one row of the action log.
type Action struct {
	ID             uuid.UUID      `json:"id"`
	OrganizationID uuid.UUID      `json:"organization_id"`
	Source         string         `json:"source"`
	SourceID       *uuid.UUID     `json:"source_id"`
	SourceName     string         `json:"source_name"`
	ActorUserID    *uuid.UUID     `json:"actor_user_id"`
	ActorName      string         `json:"actor_name"`
	Provider       *string        `json:"provider"`
	AccountID      *uuid.UUID     `json:"account_id"`
	EntityType     string         `json:"entity_type"`
	EntityID       uuid.UUID      `json:"entity_id"`
	EntityName     string         `json:"entity_name"`
	Currency       string         `json:"currency"`
	ActionType     string         `json:"action_type"`
	Before         map[string]any `json:"before"`
	After          map[string]any `json:"after"`
	Status         string         `json:"status"`
	Reason         string         `json:"reason"`
	Error          string         `json:"error"`
	SlotStart      *time.Time     `json:"slot_start"`
	RevertedBy     *uuid.UUID     `json:"reverted_by"`
	Revertible     bool           `json:"revertible"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	ExecutedAt     *time.Time     `json:"executed_at"`
}

// microsToUnits converts micros to major units, rounded to cents.
func microsToUnits(m int64) float64 { return math.Round(float64(m)/1e4) / 100 }

// unitsToMicros converts major units to micros, rounded to cents.
func unitsToMicros(u float64) int64 { return int64(math.Round(u*100)) * 1e4 }

func ptrF(v float64) *float64 { return &v }

func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
