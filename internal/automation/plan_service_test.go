package automation

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/testdb"
)

func TestMain(m *testing.M) { os.Exit(testdb.Run(m)) }

const micros = 1_000_000

type fakeMutator struct {
	mu      sync.Mutex
	budgets map[uuid.UUID]float64
}

func (f *fakeMutator) SetStatus(context.Context, uuid.UUID, *uuid.UUID, string, uuid.UUID, ads.Status) error {
	return nil
}

func (f *fakeMutator) SetDailyBudget(_ context.Context, _ uuid.UUID, _ *uuid.UUID, _ string, id uuid.UUID, amount float64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.budgets[id] = amount
	return nil
}

func (f *fakeMutator) RefreshesLocalState() bool { return false }

func TestBudgetPlanLifecycle(t *testing.T) {
	db := testdb.New(t)
	fx := testdb.NewFixture(t, db)
	ctx := context.Background()
	es := entities.NewStore(db)
	require.NoError(t, es.UpsertAccounts(ctx, fx.OrganizationID, fx.Integrations["meta"], []ads.Account{
		{Provider: ads.ProviderMeta, ExternalID: "act_in", Name: "India", Currency: "INR", Timezone: "Asia/Kolkata"},
	}))
	require.NoError(t, es.UpsertAccounts(ctx, fx.OrganizationID, fx.Integrations["google"], []ads.Account{
		{Provider: ads.ProviderGoogle, ExternalID: "cust_us", Name: "US", Currency: "USD", Timezone: "America/New_York"},
	}))
	budget := int64(1000 * micros)
	require.NoError(t, es.UpsertCampaigns(ctx, fx.OrganizationID, []ads.Campaign{
		{Provider: ads.ProviderMeta, AccountExternalID: "act_in", ExternalID: "c1", Name: "Retargeting", Status: ads.StatusActive, DailyBudget: &budget},
		{Provider: ads.ProviderMeta, AccountExternalID: "act_in", ExternalID: "c2", Name: "Prospecting", Status: ads.StatusActive, DailyBudget: &budget},
		{Provider: ads.ProviderMeta, AccountExternalID: "act_in", ExternalID: "c3", Name: "Lifetime", Status: ads.StatusActive},
		{Provider: ads.ProviderGoogle, AccountExternalID: "cust_us", ExternalID: "u1", Name: "US", Status: ads.StatusActive, DailyBudget: &budget},
	}))
	id := func(ext string) uuid.UUID {
		var v uuid.UUID
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT id FROM campaigns WHERE organization_id = $1 AND external_id = $2`,
			fx.OrganizationID, ext).Scan(&v))
		return v
	}
	c1, c2, c3, u1 := id("c1"), id("c2"), id("c3"), id("u1")
	fact := func(ext, date string, spend, value int64) ads.MetricFact {
		return ads.MetricFact{Provider: ads.ProviderMeta, Report: "campaign_daily", AccountExternalID: "act_in", Date: date,
			CampaignExternalID: ext, Impressions: 1000, Clicks: 10, Spend: spend * micros, ConversionValue: value * micros}
	}

	mut := &fakeMutator{budgets: map[uuid.UUID]float64{}}
	svc := NewService(db, mut)
	ist, _ := time.LoadLocation("Asia/Kolkata")
	now := time.Date(2026, 3, 2, 0, 10, 0, 0, ist)
	svc.engine.now = func() time.Time { return now }
	m := organizations.Membership{OrganizationID: fx.OrganizationID, UserID: fx.UserID, Role: organizations.RoleOwner}

	str := func(s string) *string { return &s }
	f := func(v float64) *float64 { return &v }
	in := PlanInput{Name: str("March week"), TotalBudget: f(7000), Currency: str("INR"), StartDate: str("2026-03-01"),
		EndDate: str("2026-03-07"), Curve: str(CurveEven), AllocationMode: str(AllocManual),
		Campaigns: &[]PlanCampaign{{CampaignID: c1, SharePct: 60}, {CampaignID: c2, SharePct: 40, MinDailyBudget: 100}}}

	// Validation.
	bad := in
	bad.Campaigns = &[]PlanCampaign{{CampaignID: c1, SharePct: 60}, {CampaignID: c2, SharePct: 30}}
	_, err := svc.CreatePlan(ctx, m, bad)
	require.ErrorContains(t, err, "add up to 100")
	bad.Campaigns = &[]PlanCampaign{{CampaignID: c1, SharePct: 50}, {CampaignID: u1, SharePct: 50}}
	_, err = svc.CreatePlan(ctx, m, bad)
	require.ErrorContains(t, err, "every campaign in the plan must be in INR")
	bad.Campaigns = &[]PlanCampaign{{CampaignID: c3, SharePct: 100}}
	_, err = svc.CreatePlan(ctx, m, bad)
	require.ErrorContains(t, err, "no campaign-level daily budget")
	bad = in
	bad.EndDate = str("2026-06-30")
	_, err = svc.CreatePlan(ctx, m, bad)
	require.ErrorContains(t, err, "at most 92 days")
	bad = in
	bad.Curve = str(CurveCustom)
	bad.CustomWeights = &[]float64{1, 2}
	_, err = svc.CreatePlan(ctx, m, bad)
	require.ErrorContains(t, err, "one weight per day")

	// Preview is pure.
	pv, err := svc.PreviewPlan(ctx, fx.OrganizationID, in)
	require.NoError(t, err)
	require.Len(t, pv.Days, 7)
	require.InDelta(t, 1000, pv.Days[0].Planned, 0.01)
	require.Nil(t, pv.Days[0].Spent)
	require.InDelta(t, 700, pv.Campaigns[0].PlannedToday, 0.01, "re-paced: nothing spent yet")

	// Day 1: c1 capped, c2 underspent.
	require.NoError(t, es.UpsertMetricFacts(ctx, fx.OrganizationID, []ads.MetricFact{
		fact("c1", "2026-03-01", 600, 1800), fact("c2", "2026-03-01", 200, 100),
	}))
	in.Enabled = new(bool)
	*in.Enabled = true
	plan, err := svc.CreatePlan(ctx, m, in)
	require.NoError(t, err)
	require.True(t, plan.DryRun)
	require.Equal(t, PlanActive, plan.Status)
	require.Equal(t, "meta", plan.Campaigns[0].Provider)
	require.InDelta(t, 1000, *plan.Campaigns[0].CurrentDailyBudget, 0.001)

	// A campaign can be in one enabled plan at a time.
	other := in
	other.Name = str("Other")
	_, err = svc.CreatePlan(ctx, m, other)
	require.ErrorContains(t, err, "already in the enabled plan")

	// Day 2, dry run: re-paced over 6 days, 1033.33/day; no provider writes.
	res, err := svc.RunPlan(ctx, m, plan.ID)
	require.NoError(t, err)
	require.Equal(t, 2, res.Recorded)
	require.Len(t, res.Actions, 2)
	for _, a := range res.Actions {
		require.Equal(t, StatusDryRun, a.Status)
		require.Equal(t, SourcePlan, a.Source)
		require.Equal(t, plan.ID, *a.SourceID)
	}
	require.Empty(t, mut.budgets)
	res, err = svc.RunPlan(ctx, m, plan.ID)
	require.NoError(t, err)
	require.Equal(t, 0, res.Recorded, "idempotent per day")

	got, err := svc.GetPlan(ctx, fx.OrganizationID, plan.ID)
	require.NoError(t, err)
	require.Len(t, got.Days, 7)
	require.InDelta(t, 800, *got.Days[0].Spent, 0.001)
	require.InDelta(t, 1033.33, got.Days[1].Planned, 0.02)
	require.InDelta(t, 2000, *got.Days[1].BudgetSet, 0.01, "dry run: live budgets unchanged")
	require.Nil(t, got.Days[2].Spent)
	require.NotNil(t, got.DeliveryPct)
	require.InDelta(t, 79.4, *got.DeliveryPct, 0.5)
	require.InDelta(t, 620, got.Campaigns[0].PlannedToday, 0.01)
	require.Len(t, got.RecentActions, 2)

	// Go live the same day: the change is made.
	live := false
	_, err = svc.UpdatePlan(ctx, m, plan.ID, PlanInput{DryRun: &live})
	require.NoError(t, err)
	res, err = svc.RunPlan(ctx, m, plan.ID)
	require.NoError(t, err)
	require.Equal(t, 2, res.Recorded)
	require.InDelta(t, 620, mut.budgets[c1], 0.001)
	require.InDelta(t, 413.33, mut.budgets[c2], 0.001)

	// Day 3: c1 capped yesterday, c2 underspent → reallocation. c1 is also in
	// a live dayparting schedule holding a 1.5× multiplier: the plan sets the
	// schedule's base.
	require.NoError(t, es.UpsertMetricFacts(ctx, fx.OrganizationID, []ads.MetricFact{
		fact("c1", "2026-03-02", 620, 1860), fact("c2", "2026-03-02", 100, 50),
	}))
	var schedID uuid.UUID
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO dayparting_schedules (organization_id, name, target_ids, grid, enabled, dry_run)
		VALUES ($1, 'Evenings', $2, '[]', true, false) RETURNING id`, fx.OrganizationID, []uuid.UUID{c1}).Scan(&schedID))
	base := int64(620 * micros)
	require.NoError(t, svc.st.saveMemo(ctx, schedID, c1, ScheduleMemo{BaseBudgetMicros: &base, AppliedMultiplier: 1.5}))
	_, _ = db.Pool.Exec(ctx, `UPDATE dayparting_schedules SET grid = $2 WHERE id = $1`, schedID, mustJSON(FullGrid()))

	now = time.Date(2026, 3, 3, 0, 10, 0, 0, ist)
	res, err = svc.RunPlan(ctx, m, plan.ID)
	require.NoError(t, err)
	require.Equal(t, 2, res.Recorded)
	byEntity := map[uuid.UUID]Action{}
	for _, a := range res.Actions {
		byEntity[a.EntityID] = a
	}
	a1 := byEntity[c1]
	require.Equal(t, StatusSucceeded, a1.Status)
	require.InDelta(t, 970.93, a1.After["base_daily_budget"].(float64), 0.01)
	require.InDelta(t, 1456.40, a1.After["daily_budget"].(float64), 0.02)
	require.Contains(t, a1.Reason, "reallocated ₹313.33 from Prospecting")
	require.Contains(t, a1.Reason, "dayparting schedule")
	require.InDelta(t, 125.07, mut.budgets[c2], 0.01)
	memo, err := svc.st.memo(ctx, schedID, c1)
	require.NoError(t, err)
	require.InDelta(t, 970.93, microsToUnits(*memo.BaseBudgetMicros), 0.001)
	require.Equal(t, 1.5, memo.AppliedMultiplier)

	// Suggest split from past spend (c1 1220, c2 300).
	shares, err := svc.SuggestSplit(ctx, fx.OrganizationID, []uuid.UUID{c1, c2}, AllocPastSpend, 30)
	require.NoError(t, err)
	require.InDelta(t, 80.26, shares[0].SharePct, 0.01)
	require.InDelta(t, 100, shares[0].SharePct+shares[1].SharePct, 1e-9)

	// After the end: completed, no more changes.
	now = time.Date(2026, 3, 9, 0, 10, 0, 0, ist)
	res, err = svc.RunPlan(ctx, m, plan.ID)
	require.NoError(t, err)
	require.Equal(t, 0, res.Recorded)
	got, err = svc.GetPlan(ctx, fx.OrganizationID, plan.ID)
	require.NoError(t, err)
	require.Equal(t, PlanCompleted, got.Status)

	list, err := svc.ListPlans(ctx, fx.OrganizationID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	require.NoError(t, svc.DeletePlan(ctx, m, plan.ID))
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
