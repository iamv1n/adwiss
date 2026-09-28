package automation

import (
	"math"
	"time"

	"github.com/google/uuid"
)

// Budget planner (plan/budget-planner.md): one total for a period, paced day
// by day over account-local dates and split across campaigns with a
// campaign-level daily budget. Each evaluation writes set_budget actions with
// source "plan" through the same pipeline as schedules and rules.

// Plan allocation modes (how shares were auto-filled; shares are always stored).
const (
	AllocManual    = "manual"
	AllocPastSpend = "past_spend"
	AllocROAS      = "roas"
)

// Plan statuses.
const (
	PlanDraft     = "draft"
	PlanScheduled = "scheduled"
	PlanActive    = "active"
	PlanCompleted = "completed"
)

// Plan limits.
const (
	MaxPlanDays      = 92
	maxPlanCampaigns = 200
	shareTolerance   = 0.01
	planRunAfter     = 5 * time.Minute // first tick after 00:05 local
)

// PlanCampaign is one campaign's share of a plan.
type PlanCampaign struct {
	CampaignID     uuid.UUID `json:"campaign_id"`
	SharePct       float64   `json:"share_pct"`
	MinDailyBudget float64   `json:"min_daily_budget"`
}

// BudgetPlan is a stored plan.
type BudgetPlan struct {
	ID             uuid.UUID
	OrganizationID uuid.UUID
	Name           string
	TotalBudget    float64
	Currency       string
	StartDate      time.Time // UTC midnight of the local calendar day
	EndDate        time.Time
	Timezone       *string
	Curve          string
	CustomWeights  []float64
	AllocationMode string
	Reallocate     bool
	Enabled        bool
	DryRun         bool
	CreatedBy      *uuid.UUID
	LastRunAt      *time.Time
	NextRunAt      *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Campaigns      []PlanCampaign
	// EffectiveTZ is Timezone, else the first campaign's account timezone,
	// else UTC.
	EffectiveTZ string
}

// Location returns the plan's clock.
func (p BudgetPlan) Location() *time.Location {
	loc, err := LoadLocation(p.EffectiveTZ)
	if err != nil {
		return time.UTC
	}
	return loc
}

// Dates returns the plan's inclusive days.
func (p BudgetPlan) Dates() []time.Time { return PlanDates(p.StartDate, p.EndDate) }

// LocalDate returns the plan-local calendar date of t (at UTC midnight).
func LocalDate(t time.Time, loc *time.Location) time.Time {
	l := t.In(loc)
	return time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, time.UTC)
}

// localMidnight returns midnight of date in loc.
func localMidnight(date time.Time, loc *time.Location) time.Time {
	return time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, loc)
}

// NextPlanRun is the first moment after now at which the plan is due again:
// 00:05 on the next local day.
func NextPlanRun(now time.Time, loc *time.Location) time.Time {
	return localMidnight(LocalDate(now, loc).AddDate(0, 0, 1), loc).Add(planRunAfter)
}

// Status derives the plan's status on the local date today.
func (p BudgetPlan) Status(today time.Time) string {
	switch {
	case today.After(p.EndDate):
		return PlanCompleted
	case !p.Enabled:
		return PlanDraft
	case today.Before(p.StartDate):
		return PlanScheduled
	}
	return PlanActive
}

// --- API types (see plan/budget-planner.md "API") ---

// PlanInput is the create/preview body and, with nil fields unchanged, the
// PATCH body.
type PlanInput struct {
	Name           *string         `json:"name"`
	TotalBudget    *float64        `json:"total_budget"`
	Currency       *string         `json:"currency"`
	StartDate      *string         `json:"start_date"`
	EndDate        *string         `json:"end_date"`
	Timezone       *string         `json:"timezone"` // "" or null = first account's timezone
	Curve          *string         `json:"curve"`
	CustomWeights  *[]float64      `json:"custom_weights"`
	AllocationMode *string         `json:"allocation_mode"`
	Reallocate     *bool           `json:"reallocate"`
	Campaigns      *[]PlanCampaign `json:"campaigns"`
	Enabled        *bool           `json:"enabled"`
	DryRun         *bool           `json:"dry_run"`
}

// PlanSummary is a plan in the list.
type PlanSummary struct {
	ID            uuid.UUID  `json:"id"`
	Name          string     `json:"name"`
	TotalBudget   float64    `json:"total_budget"`
	Currency      string     `json:"currency"`
	StartDate     string     `json:"start_date"`
	EndDate       string     `json:"end_date"`
	Curve         string     `json:"curve"`
	Enabled       bool       `json:"enabled"`
	DryRun        bool       `json:"dry_run"`
	Status        string     `json:"status"`
	CampaignCount int        `json:"campaign_count"`
	SpentToDate   float64    `json:"spent_to_date"`
	PlannedToDate float64    `json:"planned_to_date"`
	DeliveryPct   *float64   `json:"delivery_pct"`
	LastRunAt     *time.Time `json:"last_run_at"`
	NextRunAt     *time.Time `json:"next_run_at"`
}

// DayPlan is one day of a plan, summed over its campaigns.
type DayPlan struct {
	Day       string   `json:"day"`
	Planned   float64  `json:"planned"`
	Spent     *float64 `json:"spent"`
	BudgetSet *float64 `json:"budget_set"`
}

// CampaignPlan is one campaign of a plan with its delivery.
type CampaignPlan struct {
	CampaignID         uuid.UUID `json:"campaign_id"`
	Name               string    `json:"name"`
	Provider           string    `json:"provider"`
	SharePct           float64   `json:"share_pct"`
	MinDailyBudget     float64   `json:"min_daily_budget"`
	CurrentDailyBudget *float64  `json:"current_daily_budget"`
	PlannedToday       float64   `json:"planned_today"`
	PlannedTotal       float64   `json:"planned_total"`
	SpentToDate        float64   `json:"spent_to_date"`
	ROAS7d             *float64  `json:"roas_7d"`
}

// PlanView is the full plan (PlanSummary & PlanInput & detail).
type PlanView struct {
	PlanSummary
	Timezone       *string        `json:"timezone"`
	CustomWeights  []float64      `json:"custom_weights"`
	AllocationMode string         `json:"allocation_mode"`
	Reallocate     bool           `json:"reallocate"`
	Days           []DayPlan      `json:"days"`
	Campaigns      []CampaignPlan `json:"campaigns"`
	RecentActions  []Action       `json:"recent_actions"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// PlanPreview is POST /preview's response.
type PlanPreview struct {
	Days      []DayPlan      `json:"days"`
	Campaigns []CampaignPlan `json:"campaigns"`
}

// ShareSuggestion is one campaign's suggested share.
type ShareSuggestion struct {
	CampaignID uuid.UUID `json:"campaign_id"`
	SharePct   float64   `json:"share_pct"`
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }
