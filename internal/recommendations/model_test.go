package recommendations

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/automation"
)

func detect(cur, prev automation.Window) Fatigue {
	return DetectFatigue(cur, prev, "2026-09-20", "2026-09-26", "2026-09-13", "2026-09-19", DefaultFatigue)
}

func TestDetectFatigue(t *testing.T) {
	prev := automation.Window{Impressions: 20000, Clicks: 400, Reach: 10000}    // freq 2.0, CTR 2%
	fatigued := automation.Window{Impressions: 21000, Clicks: 294, Reach: 7000} // freq 3.0 (+50%), CTR 1.4% (-30%)
	f := detect(fatigued, prev)
	require.True(t, f.Fatigued, f.Reason)
	require.InDelta(t, 0.5, *f.FrequencyChange, 1e-9)
	require.InDelta(t, -0.3, *f.CTRChange, 1e-9)
	require.Equal(t, int64(21000), f.Current.Impressions)
	require.InDelta(t, 2.0, *f.Previous.Frequency, 1e-9)

	cases := map[string]automation.Window{
		// Frequency 2.4 < 2.5 even though it rose 20%.
		"low frequency": {Impressions: 24000, Clicks: 300, Reach: 10000},
		// Frequency +10% only (2.2 → below the rise threshold and 2.5 floor).
		"small rise": {Impressions: 22000, Clicks: 300, Reach: 10000},
		// CTR only -10%.
		"ctr steady": {Impressions: 21000, Clicks: 378, Reach: 7000},
		// Too few impressions.
		"noise": {Impressions: 2000, Clicks: 10, Reach: 500},
		// No reach data.
		"no reach": {Impressions: 21000, Clicks: 294},
	}
	for name, cur := range cases {
		f := detect(cur, prev)
		require.False(t, f.Fatigued, name)
		require.NotEmpty(t, f.Reason, name)
	}
	// Exactly at the thresholds: freq +20% to 2.5 (from 2.0833), CTR -20%.
	edgePrev := automation.Window{Impressions: 25000, Clicks: 500, Reach: 12000}
	edge := automation.Window{Impressions: 25000, Clicks: 400, Reach: 10000}
	require.True(t, detect(edge, edgePrev).Fatigued)
	// Previous window too small also blocks.
	require.False(t, detect(fatigued, automation.Window{Impressions: 1000, Clicks: 20, Reach: 500}).Fatigued)
}

func TestSuggestCampaign(t *testing.T) {
	budget := 1000.0
	cpa, roas := 500.0, 2.0
	base := Campaign{ID: uuid.New(), Name: "C", Status: "active", DailyBudget: &budget, Currency: "INR"}
	ref := Reference{TargetCPA: &cpa, TargetROAS: &roas, TracksRevenue: true}

	// Wasted spend: 3× target CPA with no conversions → pause.
	c := base
	c.Window = automation.Window{Spend: 1600}
	s := SuggestCampaign(c, ref)
	require.NotNil(t, s)
	require.Equal(t, KindWastedSpend, s.Kind)
	require.Equal(t, automation.ActionPause, s.Action.Type)
	c.Window.Spend = 1400
	require.Nil(t, SuggestCampaign(c, ref))

	// Scale winner: ROAS 3.2 ≥ 1.5 × 2 with 12 conversions → +20%.
	c.Window = automation.Window{Spend: 5000, Revenue: 16000, Conversions: 12}
	s = SuggestCampaign(c, ref)
	require.NotNil(t, s)
	require.Equal(t, KindScaleWinner, s.Kind)
	require.Equal(t, automation.ActionSetBudget, s.Action.Type)
	require.InDelta(t, 1200, s.Action.Value, 1e-9)
	require.InDelta(t, 1000, *s.Action.Before, 1e-9)
	// Not enough conversions.
	c.Window.Conversions = 5
	require.Nil(t, SuggestCampaign(c, ref))
	// A dayparting schedule controls the budget.
	c.Window.Conversions = 12
	c.ScheduleControl = "Weekdays"
	require.Nil(t, SuggestCampaign(c, ref))
	c.ScheduleControl = ""
	// Recently changed.
	c.RecentlyChanged = true
	require.Nil(t, SuggestCampaign(c, ref))
	c.RecentlyChanged = false

	// Losing money: ROAS 0.6 after 3× CPA of spend → -30%.
	c.Window = automation.Window{Spend: 2000, Revenue: 1200, Conversions: 3}
	s = SuggestCampaign(c, ref)
	require.NotNil(t, s)
	require.Equal(t, KindLosingMoney, s.Kind)
	require.InDelta(t, 700, s.Action.Value, 1e-9)
	// Not tracking revenue: ROAS is meaningless.
	require.Nil(t, SuggestCampaign(c, Reference{TargetCPA: &cpa, TargetROAS: &roas}))

	// No targets: no scaling, wasted spend falls back to the account CPA.
	acct := 400.0
	noTargets := Reference{AccountCPA: &acct, TracksRevenue: true}
	c.Window = automation.Window{Spend: 5000, Revenue: 16000, Conversions: 12}
	require.Nil(t, SuggestCampaign(c, noTargets))
	c.Window = automation.Window{Spend: 1300}
	s = SuggestCampaign(c, noTargets)
	require.NotNil(t, s)
	require.Equal(t, KindWastedSpend, s.Kind)
	require.Contains(t, s.Reason, "No targets are set")
	require.Contains(t, s.Reason, "30-day CPA")

	// Paused campaigns get nothing.
	c.Status = "paused"
	require.Nil(t, SuggestCampaign(c, noTargets))
}

func TestTargetsFor(t *testing.T) {
	cpa := 100.0
	tg := Targets{Currency: "INR", TargetCPA: &cpa}
	got, _ := tg.For("INR")
	require.NotNil(t, got)
	got, _ = tg.For("USD")
	require.Nil(t, got)
}
