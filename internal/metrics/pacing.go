package metrics

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/reports"
)

// Pacing statuses.
const (
	PacingInactive = "inactive"  // campaign is not active
	PacingNoBudget = "no_budget" // campaign has no daily budget (lifetime or ad-set budgets)
	PacingUnder    = "under"     // < 80% of the budget expected by now
	PacingOnTrack  = "on_track"
	PacingOver     = "over" // > 120% of the budget expected by now
)

// Pacing compares today's spend with the daily budget. "Today" is the
// campaign's account-local date, and today's spend comes from campaign_hourly
// facts (the freshest report).
//
// Spend is not linear through the day, so the expected share of the budget
// spent by now (ExpectedFraction) comes from the campaign's own hour-of-day
// spend curve over the previous PacingHistoryDays days, counting completed
// account-local hours only. Without history it falls back to the elapsed
// share of the day.
type Pacing struct {
	Date               string   `json:"date"` // account-local today
	SpendToday         float64  `json:"spend_today"`
	DailyBudget        *float64 `json:"daily_budget"`
	SpentFraction      *float64 `json:"spent_fraction"`       // spend_today / daily_budget
	DayElapsedFraction float64  `json:"day_elapsed_fraction"` // share of the account-local day elapsed
	ExpectedFraction   float64  `json:"expected_fraction"`    // share of a normal day's spend usually done by now
	// ProjectedSpend extrapolates today's spend to the full day using
	// ExpectedFraction. Null early in the day (expected fraction < 5%).
	ProjectedSpend *float64 `json:"projected_spend"`
	Status         string   `json:"status"`
}

// PacingHistoryDays is the look-back used for the hour-of-day spend curve.
const PacingHistoryDays = 14

type PacingInput struct {
	AccountID          uuid.UUID
	Timezone           string
	CampaignExternalID string
	DailyBudgetMicros  *int64
	Active             bool
}

// BudgetPacing computes Pacing for each input (same order).
func BudgetPacing(ctx context.Context, repo Repository, orgID uuid.UUID, in []PacingInput, now time.Time) ([]Pacing, error) {
	type campKey struct {
		account uuid.UUID
		ext     string
	}
	type local struct {
		date    time.Time
		hour    int
		elapsed float64
	}
	locals := make([]local, len(in))
	// Accounts in different timezones can be on different local dates; query
	// each date once.
	byDate := map[time.Time]*Filter{}
	for i, p := range in {
		loc, err := time.LoadLocation(p.Timezone)
		if err != nil {
			loc = time.UTC
		}
		t := now.In(loc)
		y, m, d := t.Date()
		midnight := time.Date(y, m, d, 0, 0, 0, 0, loc)
		dayLen := time.Date(y, m, d+1, 0, 0, 0, 0, loc).Sub(midnight) // 23–25h across DST changes
		date := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
		locals[i] = local{date: date, hour: t.Hour(), elapsed: min(1, t.Sub(midnight).Seconds()/dayLen.Seconds())}
		f := byDate[date]
		if f == nil {
			f = &Filter{OrganizationID: orgID, Report: reports.CampaignHourly}
			byDate[date] = f
		}
		f.AccountIDs = append(f.AccountIDs, p.AccountID)
		f.CampaignExternalIDs = append(f.CampaignExternalIDs, p.CampaignExternalID)
	}
	type dateKey struct {
		campKey
		date time.Time
	}
	today := map[dateKey]int64{}
	curve := map[dateKey]*[24]int64{}
	for date, f := range byDate {
		q := *f
		q.From, q.To = date, date
		rows, err := repo.Aggregate(ctx, AggregateQuery{Filter: q, GroupBy: []Field{FieldAccount, FieldCampaign}})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			today[dateKey{campKey{r.AccountID, r.CampaignID}, date}] = r.SpendMicros
		}
		q.From, q.To = date.AddDate(0, 0, -PacingHistoryDays), date.AddDate(0, 0, -1)
		rows, err = repo.Aggregate(ctx, AggregateQuery{Filter: q, GroupBy: []Field{FieldAccount, FieldCampaign, FieldHour}})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			k := dateKey{campKey{r.AccountID, r.CampaignID}, date}
			if curve[k] == nil {
				curve[k] = &[24]int64{}
			}
			curve[k][r.Hour] += r.SpendMicros
		}
	}
	out := make([]Pacing, len(in))
	for i, p := range in {
		l := locals[i]
		k := dateKey{campKey{p.AccountID, p.CampaignExternalID}, l.date}
		s := today[k]
		expected := l.elapsed
		if c := curve[k]; c != nil {
			var before, total int64
			for h, v := range c {
				total += v
				if h < l.hour {
					before += v
				}
			}
			if total > 0 {
				expected = float64(before) / float64(total)
			}
		}
		pc := Pacing{Date: l.date.Format(time.DateOnly), SpendToday: MicrosToUnits(s),
			DayElapsedFraction: round(l.elapsed), ExpectedFraction: round(expected)}
		if expected >= 0.05 {
			pc.ProjectedSpend = ptr(round(float64(s) / 1e6 / expected))
		}
		if p.DailyBudgetMicros != nil && *p.DailyBudgetMicros > 0 {
			b := float64(*p.DailyBudgetMicros)
			pc.DailyBudget = ptr(MicrosToUnits(*p.DailyBudgetMicros))
			pc.SpentFraction = ptr(round(float64(s) / b))
			pc.Status = pacingStatus(float64(s), b, expected)
		} else {
			pc.Status = PacingNoBudget
		}
		if !p.Active {
			pc.Status = PacingInactive
		}
		out[i] = pc
	}
	return out, nil
}

// pacingStatus compares spend with the spend expected by now; spend above the
// full budget is always "over". Early in the day (<2% expected) small
// amounts count as on track.
func pacingStatus(spent, budget, expectedFraction float64) string {
	if spent > budget {
		return PacingOver
	}
	expected := budget * max(expectedFraction, 0.02)
	switch r := spent / expected; {
	case r > 1.2:
		return PacingOver
	case r < 0.8:
		return PacingUnder
	default:
		return PacingOnTrack
	}
}
