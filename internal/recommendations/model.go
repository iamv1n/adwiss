// Package recommendations generates suggested changes (the recommendations
// inbox) and detects creative fatigue per ad.
//
// Flow:
//
//	asynq scheduler (hourly) → TaskGenerate
//	    → for each organization with sync-enabled accounts:
//	      ad windows (ad_daily) → creative fatigue → "pause this ad"
//	      campaign windows (campaign_daily) + org targets
//	          → scale winners, wasted spend, losing money
//	    → upsert open recommendations by dedupe key; expire the ones not
//	      re-detected this run
//	accept → automation.Service.ApplyManual (a live manual action, executed
//	    now; it shows in the actions log and can be reverted)
//
// Everything here is a suggestion: nothing changes on a provider until a
// person accepts it.
package recommendations

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/automation"
)

// Kinds.
const (
	KindCreativeFatigue = "creative_fatigue"
	KindScaleWinner     = "scale_winner"
	KindWastedSpend     = "wasted_spend"
	KindLosingMoney     = "losing_money"
)

// Statuses.
const (
	StatusOpen      = "open"
	StatusAccepted  = "accepted"
	StatusDismissed = "dismissed"
	StatusExpired   = "expired"
	StatusFailed    = "failed"
)

var Statuses = []string{StatusOpen, StatusAccepted, StatusDismissed, StatusExpired, StatusFailed}

// Tunables.
const (
	// WindowDays is the evaluation window; trends compare it with the
	// window of the same length before it.
	WindowDays = 7
	// TTL is how long an open recommendation lives without being
	// re-detected (the generator refreshes it every run while it holds).
	TTL = 48 * time.Hour
	// A dismissed suggestion is not re-created for DismissQuiet; an accepted
	// or failed one for DecidedQuiet.
	DismissQuiet = 14 * 24 * time.Hour
	DecidedQuiet = 7 * 24 * time.Hour
	// RecentChange: no budget or status suggestion for an entity someone
	// (or something) changed this recently.
	RecentChange = 24 * time.Hour

	ScaleROASFactor  = 1.5 // ROAS ≥ 1.5 × target
	ScaleMinConv     = 10  // conversions over the window
	ScaleIncreasePct = 20
	WasteCPAFactor   = 3 // spend ≥ 3 × CPA with no conversions
	LosingCutPct     = 30
	LosingMinConv    = 5 // meaningful volume when no CPA reference exists
	LosingCPAFactor  = 3 // or spend ≥ 3 × CPA reference
)

// ProposedAction is the change a recommendation makes, using the action log's
// types. Value is the new daily budget (set_budget); Before the budget it was
// computed from.
type ProposedAction struct {
	Type   string   `json:"type"`
	Value  float64  `json:"value,omitempty"`
	Before *float64 `json:"before,omitempty"`
}

// Recommendation is one row of the inbox.
type Recommendation struct {
	ID             uuid.UUID      `json:"id"`
	OrganizationID uuid.UUID      `json:"organization_id"`
	Kind           string         `json:"kind"`
	EntityType     string         `json:"entity_type"`
	EntityID       uuid.UUID      `json:"entity_id"`
	EntityName     string         `json:"entity_name"`
	AccountID      *uuid.UUID     `json:"account_id"`
	AccountName    string         `json:"account_name"`
	Provider       *string        `json:"provider"`
	Currency       string         `json:"currency"`
	Title          string         `json:"title"`
	Reason         string         `json:"reason"`
	Evidence       map[string]any `json:"evidence"`
	Action         ProposedAction `json:"proposed_action"`
	Status         string         `json:"status"`
	ActionID       *uuid.UUID     `json:"action_id"`
	Error          string         `json:"error"`
	DedupeKey      string         `json:"-"`
	DecidedBy      *uuid.UUID     `json:"decided_by"`
	DecidedAt      *time.Time     `json:"decided_at"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	ExpiresAt      time.Time      `json:"expires_at"`
}

// Targets are an organization's performance targets. Money is in major units
// of Currency; a target only applies to accounts in that currency.
type Targets struct {
	Currency   string   `json:"currency"`
	TargetCPA  *float64 `json:"target_cpa"`
	TargetROAS *float64 `json:"target_roas"`
}

// For returns the targets that apply to an account currency.
func (t Targets) For(currency string) (cpa, roas *float64) {
	if t.Currency != "" && t.Currency != currency {
		return nil, nil
	}
	return t.TargetCPA, t.TargetROAS
}

// --- creative fatigue ---

// FatigueConfig holds the fatigue thresholds.
type FatigueConfig struct {
	Days int `json:"days"`
	// MinFrequency: the current window's frequency must reach it.
	MinFrequency float64 `json:"min_frequency"`
	// FrequencyRise and CTRDrop are relative changes as fractions.
	FrequencyRise float64 `json:"frequency_rise"`
	CTRDrop       float64 `json:"ctr_drop"`
	// MinImpressions in each window, so noise does not trigger.
	MinImpressions int64 `json:"min_impressions"`
}

// DefaultFatigue: last 7 days vs the 7 before; frequency up ≥ 20% and ≥ 2.5;
// CTR down ≥ 20%; at least 3,000 impressions in each window.
var DefaultFatigue = FatigueConfig{Days: WindowDays, MinFrequency: 2.5, FrequencyRise: 0.2, CTRDrop: 0.2, MinImpressions: 3000}

// WindowStats is one window's numbers behind a fatigue verdict.
type WindowStats struct {
	From        string   `json:"from"`
	To          string   `json:"to"`
	Impressions int64    `json:"impressions"`
	Clicks      int64    `json:"clicks"`
	Reach       int64    `json:"reach"`
	Spend       float64  `json:"spend"`
	Frequency   *float64 `json:"frequency"`
	CTR         *float64 `json:"ctr"`
}

func stats(w automation.Window, from, to string) WindowStats {
	s := WindowStats{From: from, To: to, Impressions: w.Impressions, Clicks: w.Clicks, Reach: w.Reach, Spend: w.Spend}
	if v, ok := w.Metric("frequency"); ok {
		s.Frequency = ptr(round(v, 4))
	}
	if v, ok := w.Metric("ctr"); ok {
		s.CTR = ptr(round(v, 6))
	}
	return s
}

// Fatigue is the verdict for one ad.
type Fatigue struct {
	Fatigued bool `json:"fatigued"`
	// Reason says why it is (or is not) fatigued in plain language.
	Reason          string      `json:"reason"`
	Current         WindowStats `json:"current"`
	Previous        WindowStats `json:"previous"`
	FrequencyChange *float64    `json:"frequency_change"`
	CTRChange       *float64    `json:"ctr_change"`
}

// DetectFatigue compares an ad's current window with the previous one.
// Frequency is impressions ÷ reach summed over daily rows (see
// automation.Window): the average daily frequency, computed the same way
// for both windows.
func DetectFatigue(cur, prev automation.Window, curFrom, curTo, prevFrom, prevTo string, cfg FatigueConfig) Fatigue {
	f := Fatigue{Current: stats(cur, curFrom, curTo), Previous: stats(prev, prevFrom, prevTo)}
	if cur.Impressions < cfg.MinImpressions || prev.Impressions < cfg.MinImpressions {
		f.Reason = fmt.Sprintf("not enough impressions (needs %d in each window)", cfg.MinImpressions)
		return f
	}
	c, p := f.Current, f.Previous
	if c.Frequency == nil || p.Frequency == nil {
		f.Reason = "no reach data, so frequency is unknown"
		return f
	}
	if c.CTR == nil || p.CTR == nil || *p.CTR == 0 || *p.Frequency == 0 {
		f.Reason = "no clicks in the previous window"
		return f
	}
	fc := round(*c.Frequency / *p.Frequency - 1, 4)
	cc := round(*c.CTR / *p.CTR - 1, 4)
	f.FrequencyChange, f.CTRChange = &fc, &cc
	switch {
	case *c.Frequency < cfg.MinFrequency:
		f.Reason = fmt.Sprintf("frequency %.2f is below %.1f", *c.Frequency, cfg.MinFrequency)
	case fc < cfg.FrequencyRise:
		f.Reason = fmt.Sprintf("frequency changed %+.0f%% (needs +%.0f%%)", fc*100, cfg.FrequencyRise*100)
	case cc > -cfg.CTRDrop:
		f.Reason = fmt.Sprintf("CTR changed %+.0f%% (needs −%.0f%%)", cc*100, cfg.CTRDrop*100)
	default:
		f.Fatigued = true
		f.Reason = fmt.Sprintf("frequency rose %.0f%% to %.1f while CTR fell %.0f%% (%.2f%% → %.2f%%) vs the previous %d days",
			fc*100, *c.Frequency, -cc*100, *p.CTR*100, *c.CTR*100, cfg.Days)
	}
	return f
}

// --- campaign heuristics ---

// Campaign is an active campaign with its current window.
type Campaign struct {
	ID          uuid.UUID
	Name        string
	Status      string
	DailyBudget *float64 // nil: lifetime or ad set budgets
	Currency    string
	Window      automation.Window
	// ScheduleControl names a dayparting schedule that manages the budget
	// with multipliers ("" = none); budget suggestions are not made then.
	ScheduleControl string
	// RecentlyChanged: a status or budget change was made in the last 24h.
	RecentlyChanged bool
}

// Reference is what a campaign is judged against: the org targets for the
// account currency and, as the target-independent fallback, the account's
// own 30-day CPA.
type Reference struct {
	TargetCPA  *float64
	TargetROAS *float64
	AccountCPA *float64
	// TracksRevenue: the account reported conversion value in the last 30
	// days, so ROAS is meaningful.
	TracksRevenue bool
}

// Suggestion is a recommendation before it is stored.
type Suggestion struct {
	Kind     string
	Title    string
	Reason   string
	Evidence map[string]any
	Action   ProposedAction
}

// SuggestCampaign returns at most one suggestion for a campaign, in order of
// urgency: wasted spend, losing money, scale winner.
func SuggestCampaign(c Campaign, ref Reference) *Suggestion {
	if c.Status != "active" || c.RecentlyChanged {
		return nil
	}
	w := c.Window
	cur := c.Currency
	ev := map[string]any{
		"window_days": WindowDays, "spend": round(w.Spend, 2), "conversions": w.Conversions, "revenue": round(w.Revenue, 2),
		"impressions": w.Impressions, "clicks": w.Clicks,
	}
	if v, ok := w.Metric("roas"); ok {
		ev["roas"] = round(v, 3)
	}
	if v, ok := w.Metric("cpa"); ok {
		ev["cpa"] = round(v, 2)
	}
	if ref.TargetCPA != nil {
		ev["target_cpa"] = *ref.TargetCPA
	}
	if ref.TargetROAS != nil {
		ev["target_roas"] = *ref.TargetROAS
	}
	cpaRef, cpaLabel := ref.TargetCPA, "your target CPA"
	noTargets := ref.TargetCPA == nil && ref.TargetROAS == nil
	if cpaRef == nil && ref.AccountCPA != nil {
		cpaRef, cpaLabel = ref.AccountCPA, "this account's 30-day CPA"
		ev["account_cpa"] = round(*ref.AccountCPA, 2)
	}
	note := ""
	if noTargets {
		note = " No targets are set, so this uses your account's own averages; set a target CPA/ROAS for sharper suggestions."
	}
	ev["targets_set"] = !noTargets

	// Wasted spend: spend ≥ 3 × CPA with no conversions → pause.
	if w.Conversions == 0 && cpaRef != nil && *cpaRef > 0 && w.Spend >= WasteCPAFactor**cpaRef {
		ev["threshold"] = round(WasteCPAFactor**cpaRef, 2)
		return &Suggestion{Kind: KindWastedSpend, Title: "Pause campaign with spend and no conversions",
			Reason: fmt.Sprintf("Spent %s in the last %d days with 0 conversions — over %d× %s (%s).%s",
				money(cur, w.Spend), WindowDays, WasteCPAFactor, cpaLabel, money(cur, *cpaRef), note),
			Evidence: ev, Action: ProposedAction{Type: automation.ActionPause}}
	}

	budgetOK := c.DailyBudget != nil && *c.DailyBudget > 0 && c.ScheduleControl == ""

	// Losing money: ROAS < 1 after meaningful spend → cut the budget 30%.
	if roas, ok := w.Metric("roas"); ok && ref.TracksRevenue && w.Conversions > 0 && roas < 1 && budgetOK {
		meaningful := w.Conversions >= LosingMinConv
		if cpaRef != nil {
			meaningful = w.Spend >= LosingCPAFactor**cpaRef
		}
		if meaningful {
			nb := round(*c.DailyBudget*(1-LosingCutPct/100.0), 2)
			return &Suggestion{Kind: KindLosingMoney, Title: fmt.Sprintf("Cut budget %d%% on a campaign losing money", LosingCutPct),
				Reason: fmt.Sprintf("ROAS was %.2f over the last %d days (%s revenue on %s spend): it returns less than it costs.%s",
					roas, WindowDays, money(cur, w.Revenue), money(cur, w.Spend), note),
				Evidence: ev, Action: ProposedAction{Type: automation.ActionSetBudget, Value: nb, Before: c.DailyBudget}}
		}
	}

	// Scale winners: ROAS ≥ 1.5 × target with enough conversions → +20%.
	if ref.TargetROAS != nil && budgetOK {
		if roas, ok := w.Metric("roas"); ok && roas >= ScaleROASFactor**ref.TargetROAS && w.Conversions >= ScaleMinConv {
			nb := round(*c.DailyBudget*(1+ScaleIncreasePct/100.0), 2)
			return &Suggestion{Kind: KindScaleWinner, Title: fmt.Sprintf("Raise budget %d%% on a winning campaign", ScaleIncreasePct),
				Reason: fmt.Sprintf("ROAS was %.2f over the last %d days — %.1f× your target of %.2f — with %.0f conversions.",
					roas, WindowDays, roas / *ref.TargetROAS, *ref.TargetROAS, w.Conversions),
				Evidence: ev, Action: ProposedAction{Type: automation.ActionSetBudget, Value: nb, Before: c.DailyBudget}}
		}
	}
	return nil
}

// DedupeKey identifies "the same suggestion" across runs.
func DedupeKey(kind string, entityID uuid.UUID) string { return kind + ":" + entityID.String() }

func round(v float64, places int) float64 {
	p := math.Pow(10, float64(places))
	return math.Round(v*p) / p
}

func ptr[T any](v T) *T { return &v }

func money(currency string, v float64) string {
	sym := map[string]string{"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}[currency]
	if sym == "" && currency != "" {
		sym = currency + " "
	}
	if math.Abs(v) >= 100 || v == math.Trunc(v) {
		return sym + group(int64(math.Round(v)))
	}
	return fmt.Sprintf("%s%.2f", sym, v)
}

// group formats n with thousands separators.
func group(n int64) string {
	s := fmt.Sprint(n)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	if neg {
		return "-" + s
	}
	return s
}
