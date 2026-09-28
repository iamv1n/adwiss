package analytics_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/analytics"
	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/testdb"
	"github.com/iamv1n/adwise/internal/reports"
)

func TestMain(m *testing.M) { os.Exit(testdb.Run(m)) }

func day(s string) time.Time {
	t, _ := time.Parse(time.DateOnly, s)
	return t
}

func i16(v int16) *int16 { return &v }

const unit = 1_000_000 // micros per currency unit

type env struct {
	svc   *analytics.Service
	org   uuid.UUID
	inAcc uuid.UUID // Meta, INR, Asia/Kolkata
	usAcc uuid.UUID // Google, USD, America/New_York
	st    *entities.Store
	db    *database.DB
}

// setup creates a Meta INR account in Asia/Kolkata and a Google USD account
// in America/New_York, each with one campaign.
func setup(t *testing.T) env {
	db := testdb.New(t)
	fx := testdb.NewFixture(t, db)
	st := entities.NewStore(db)
	ctx := context.Background()
	require.NoError(t, st.UpsertAccounts(ctx, fx.OrganizationID, fx.Integrations["meta"], []ads.Account{
		{Provider: ads.ProviderMeta, ExternalID: "act_in", Name: "India", Currency: "INR", Timezone: "Asia/Kolkata"},
	}))
	require.NoError(t, st.UpsertAccounts(ctx, fx.OrganizationID, fx.Integrations["google"], []ads.Account{
		{Provider: ads.ProviderGoogle, ExternalID: "cust_us", Name: "US", Currency: "USD", Timezone: "America/New_York"},
	}))
	budget := int64(1000 * unit)
	require.NoError(t, st.UpsertCampaigns(ctx, fx.OrganizationID, []ads.Campaign{
		{Provider: ads.ProviderMeta, AccountExternalID: "act_in", ExternalID: "c_in", Name: "India camp", Status: ads.StatusActive, DailyBudget: &budget},
		{Provider: ads.ProviderGoogle, AccountExternalID: "cust_us", ExternalID: "c_us", Name: "US camp", Status: ads.StatusActive},
	}))
	e := env{svc: analytics.NewService(db, metrics.NewPostgresRepository(db.Pool)), org: fx.OrganizationID, st: st, db: db}
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT id FROM ad_accounts WHERE organization_id = $1 AND external_id = 'act_in'`, e.org).Scan(&e.inAcc))
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT id FROM ad_accounts WHERE organization_id = $1 AND external_id = 'cust_us'`, e.org).Scan(&e.usAcc))
	return e
}

func (e env) facts(t *testing.T, facts ...ads.MetricFact) {
	require.NoError(t, e.st.UpsertMetricFacts(context.Background(), e.org, facts))
}

func meta(report, date string, hour *int16, spend, value int64) ads.MetricFact {
	return ads.MetricFact{Provider: ads.ProviderMeta, Report: report, AccountExternalID: "act_in", Date: date, Hour: hour,
		CampaignExternalID: "c_in", Impressions: 1000, Clicks: 20, Spend: spend * unit, Conversions: 2, ConversionValue: value * unit}
}

func google(report, date string, hour *int16, spend, value int64) ads.MetricFact {
	return ads.MetricFact{Provider: ads.ProviderGoogle, Report: report, AccountExternalID: "cust_us", Date: date, Hour: hour,
		CampaignExternalID: "c_us", Impressions: 500, Clicks: 5, Spend: spend * unit, Conversions: 1, ConversionValue: value * unit}
}

func scope(e env, from, to string) analytics.Scope {
	return analytics.Scope{OrganizationID: e.org, Range: params.DateRange{From: day(from), To: day(to)}}
}

func TestDaypartingShapeAndAccountLocalTime(t *testing.T) {
	e := setup(t)
	// 2026-03-02 is a Monday. Both facts are at 09:00 in their own account's
	// timezone (03:30 UTC for India, 14:00 UTC for New York): they must land
	// in the same Monday-09 cell, without timezone conversion.
	e.facts(t,
		meta(reports.CampaignHourly, "2026-03-02", i16(9), 100, 300),
		google(reports.CampaignHourly, "2026-03-02", i16(9), 10, 5),
		meta(reports.CampaignHourly, "2026-03-08", i16(23), 40, 0), // Sunday 23:00
	)
	d, err := e.svc.Dayparting(context.Background(), scope(e, "2026-03-02", "2026-03-08"), "roas")
	require.NoError(t, err)

	require.Len(t, d.Days, 7)
	for i, row := range d.Days {
		assert.Equal(t, i+1, row.Weekday)
		require.Len(t, row.Cells, 24)
		assert.Equal(t, 1, row.DayCount)
		for h, c := range row.Cells {
			assert.Equal(t, h, c.Hour)
		}
	}
	assert.Equal(t, "Monday", d.Days[0].Name)
	assert.Equal(t, "Sunday", d.Days[6].Name)
	assert.Equal(t, 1, d.WeeksCovered)
	assert.Equal(t, "account_local", d.TimeBasis)
	assert.Equal(t, []string{"America/New_York", "Asia/Kolkata"}, d.Timezones)
	assert.True(t, d.MixedTimezones)

	mon9 := d.Days[0].Cells[9]
	assert.Equal(t, int64(1500), mon9.Impressions, "both accounts' 09:00 in the same cell")
	// INR + USD: money and ROAS are not computable.
	assert.True(t, d.MixedCurrency)
	assert.Nil(t, d.Currency)
	assert.Nil(t, mon9.Spend)
	assert.Nil(t, mon9.Value)
	assert.Nil(t, d.Min)
	assert.Equal(t, 0, int(d.Days[0].Cells[3].Impressions))

	// Restricted to one currency, values are computed.
	sc := scope(e, "2026-03-02", "2026-03-08")
	sc.Currency = "INR"
	d, err = e.svc.Dayparting(context.Background(), sc, "roas")
	require.NoError(t, err)
	assert.False(t, d.MixedCurrency)
	assert.Equal(t, []string{"Asia/Kolkata"}, d.Timezones)
	assert.Equal(t, 3.0, *d.Days[0].Cells[9].Value)
	assert.Equal(t, 0.0, *d.Days[6].Cells[23].Value, "spend without revenue: ROAS 0")
	assert.Nil(t, d.Days[1].Cells[9].Value, "no spend: ROAS null")
	assert.Equal(t, 0.0, *d.Min)
	assert.Equal(t, 3.0, *d.Max)

	// Additive metrics are averaged per occurrence of the weekday.
	sc.Range = params.DateRange{From: day("2026-03-02"), To: day("2026-03-15")} // two Mondays
	d, err = e.svc.Dayparting(context.Background(), sc, "spend")
	require.NoError(t, err)
	assert.Equal(t, "average_per_day", d.Aggregation)
	assert.Equal(t, 2, d.Days[0].DayCount)
	assert.Equal(t, 50.0, *d.Days[0].Cells[9].Value)
	assert.Equal(t, 100.0, *d.Days[0].Cells[9].Spend, "cells also carry the underlying sums")
	assert.Equal(t, 2, d.WeeksCovered)
}

func TestOverviewPreviousPeriodBoundaries(t *testing.T) {
	e := setup(t)
	e.facts(t,
		meta(reports.CampaignDaily, "2026-01-28", nil, 1000, 0), // before the previous period
		meta(reports.CampaignDaily, "2026-01-29", nil, 30, 60),  // first day of previous period (31 days)
		meta(reports.CampaignDaily, "2026-02-28", nil, 50, 100), // last day of previous period
		meta(reports.CampaignDaily, "2026-03-01", nil, 70, 210), // first day of range
		meta(reports.CampaignDaily, "2026-03-31", nil, 20, 60),  // last day of range
		meta(reports.CampaignDaily, "2026-04-01", nil, 999, 0),  // after the range
		meta(reports.CampaignDaily, "2025-03-15", nil, 45, 90),  // previous year
		// Hourly facts must never leak into daily totals.
		meta(reports.CampaignHourly, "2026-03-01", i16(5), 12345, 0),
	)
	sc := scope(e, "2026-03-01", "2026-03-31")
	sc.Compare = analytics.ComparePreviousPeriod
	o, err := e.svc.Overview(context.Background(), sc)
	require.NoError(t, err)

	require.NotNil(t, o.Comparison)
	assert.Equal(t, "2026-01-29", o.Comparison.From)
	assert.Equal(t, "2026-02-28", o.Comparison.To)
	assert.Equal(t, "INR", *o.Currency)
	assert.Equal(t, 90.0, *o.Totals.Spend)
	assert.Equal(t, 270.0, *o.Totals.ConversionValue)
	assert.Equal(t, 3.0, *o.Totals.ROAS)
	require.NotNil(t, o.Previous)
	assert.Equal(t, 80.0, *o.Previous.Spend)
	assert.Equal(t, 0.125, *o.Deltas["spend"])
	assert.Len(t, o.Timeseries, 31)
	assert.Equal(t, "2026-03-01", o.Timeseries[0].Date)
	assert.Equal(t, 70.0, *o.Timeseries[0].Spend)
	assert.Equal(t, 0.0, *o.Timeseries[1].Spend, "zero-filled")
	assert.Nil(t, o.Timeseries[1].ROAS, "no spend: ROAS null")
	assert.Len(t, o.PreviousTimeseries, 31)

	sc.Compare = analytics.ComparePreviousYear
	o, err = e.svc.Overview(context.Background(), sc)
	require.NoError(t, err)
	assert.Equal(t, "2025-03-01", o.Comparison.From)
	assert.Equal(t, 45.0, *o.Previous.Spend)

	sc.Compare = analytics.CompareNone
	o, err = e.svc.Overview(context.Background(), sc)
	require.NoError(t, err)
	assert.Nil(t, o.Comparison)
	assert.Nil(t, o.Previous)
	assert.Nil(t, o.Deltas)
}

func TestOverviewMixedCurrency(t *testing.T) {
	e := setup(t)
	e.facts(t,
		meta(reports.CampaignDaily, "2026-03-01", nil, 100, 300),
		google(reports.CampaignDaily, "2026-03-01", nil, 10, 40),
	)
	ctx := context.Background()
	o, err := e.svc.Overview(ctx, scope(e, "2026-03-01", "2026-03-07"))
	require.NoError(t, err)

	assert.True(t, o.MixedCurrency)
	assert.Nil(t, o.Currency)
	assert.Equal(t, []string{"INR", "USD"}, o.Currencies)
	assert.Nil(t, o.Totals.Spend, "INR and USD are never summed")
	assert.Nil(t, o.Totals.ROAS)
	assert.Nil(t, o.Timeseries[0].Spend)
	assert.Equal(t, int64(1500), o.Totals.Impressions)
	assert.Equal(t, 100.0, *o.ByCurrency["INR"].Spend)
	assert.Equal(t, 10.0, *o.ByCurrency["USD"].Spend)
	assert.Equal(t, 4.0, *o.ByCurrency["USD"].ROAS)

	require.Len(t, o.ByProvider, 2)
	assert.Equal(t, "INR", *o.ByProvider[ads.ProviderMeta].Currency)
	assert.Equal(t, 100.0, *o.ByProvider[ads.ProviderMeta].Totals.Spend)
	assert.Equal(t, 10.0, *o.ByProvider[ads.ProviderGoogle].Totals.Spend)

	// A provider filter narrows to one currency and drops by_provider.
	sc := scope(e, "2026-03-01", "2026-03-07")
	sc.Provider = ads.ProviderGoogle
	o, err = e.svc.Overview(ctx, sc)
	require.NoError(t, err)
	assert.Equal(t, "USD", *o.Currency)
	assert.Equal(t, 10.0, *o.Totals.Spend)
	assert.Nil(t, o.ByProvider)

	// Account filter; with no data the account's currency is still reported.
	sc = scope(e, "2020-01-01", "2020-01-07")
	sc.AccountID = &e.inAcc
	o, err = e.svc.Overview(ctx, sc)
	require.NoError(t, err)
	assert.Equal(t, "INR", *o.Currency)
	assert.Equal(t, 0.0, *o.Totals.Spend)
	assert.Nil(t, o.Totals.CPC)
}

func TestHourlyBreakdownsAndWastedSpend(t *testing.T) {
	e := setup(t)
	f := meta(reports.CampaignCountryDaily, "2026-03-01", nil, 60, 180)
	f.Country = "IN"
	g := meta(reports.CampaignCountryDaily, "2026-03-01", nil, 40, 0)
	g.Country = ""
	e.facts(t,
		meta(reports.CampaignHourly, "2026-03-01", i16(0), 5, 1),
		meta(reports.CampaignHourly, "2026-03-01", i16(20), 50, 200),
		meta(reports.CampaignDaily, "2026-03-01", nil, 55, 201),
		google(reports.CampaignDaily, "2026-03-01", nil, 80, 20), // ROAS 0.25: wasteful
		f, g,
	)
	ctx := context.Background()

	sc := scope(e, "2026-03-01", "2026-03-01")
	sc.Provider = ads.ProviderMeta
	h, err := e.svc.Hourly(ctx, sc)
	require.NoError(t, err)
	require.Len(t, h.Hours, 24)
	assert.Equal(t, 50.0, *h.Hours[20].Spend)
	assert.Equal(t, 4.0, *h.Hours[20].ROAS)
	assert.Nil(t, h.Hours[12].ROAS)
	assert.Equal(t, 55.0, *h.Totals.Spend)

	b, err := e.svc.Breakdowns(ctx, sc, "country")
	require.NoError(t, err)
	require.Len(t, b.Rows, 2)
	assert.Equal(t, "IN", b.Rows[0].Value)
	assert.Equal(t, 0.6, *b.Rows[0].SpendShare)
	assert.Equal(t, "unknown", b.Rows[1].Value)
	_, err = e.svc.Breakdowns(ctx, sc, "planet")
	assert.Error(t, err)

	w, err := e.svc.WastedSpend(ctx, analytics.WastedQuery{Scope: scope(e, "2026-03-01", "2026-03-01"),
		Criteria: analytics.WastedCriteria{Level: "campaign", ROASBelow: 1}, Page: params.Page{Limit: 10}})
	require.NoError(t, err)
	require.Len(t, w.Rows, 1)
	assert.Equal(t, "c_us", w.Rows[0].ExternalID)
	assert.Equal(t, []string{analytics.ReasonLowROAS}, w.Rows[0].Reasons)
	assert.Equal(t, 60.0, w.Rows[0].WastedSpend, "spend − value / roas_below = 80 − 20")
	assert.Equal(t, 60.0, w.WastedByCurrency["USD"])
	assert.Equal(t, "USD", *w.Currency, "only flagged rows count")
}

func TestCampaignTablePacing(t *testing.T) {
	e := setup(t)
	now := time.Now()
	loc, _ := time.LoadLocation("Asia/Kolkata")
	today := now.In(loc).Format(time.DateOnly)
	e.facts(t, meta(reports.CampaignHourly, today, i16(0), 1500, 0)) // > daily budget of 1000

	sc := analytics.Scope{OrganizationID: e.org, Range: params.DateRange{From: day(today), To: day(today)}}
	tbl, err := e.svc.Campaigns(context.Background(), analytics.CampaignQuery{Scope: sc, Sort: "spend", Order: "desc", Page: params.Page{Limit: 10}})
	require.NoError(t, err)
	require.Len(t, tbl.Campaigns, 2, "active campaigns are listed even without data")
	c := tbl.Campaigns[0]
	assert.Equal(t, "c_in", c.ExternalID)
	require.NotNil(t, c.Pacing)
	assert.Equal(t, today, c.Pacing.Date)
	assert.Equal(t, 1500.0, c.Pacing.SpendToday)
	assert.Equal(t, 1.5, *c.Pacing.SpentFraction)
	assert.Equal(t, metrics.PacingOver, c.Pacing.Status)
	assert.Equal(t, metrics.PacingNoBudget, tbl.Campaigns[1].Pacing.Status)
	assert.Nil(t, tbl.Campaigns[1].Metrics.ROAS, "nulls sort last")
}
