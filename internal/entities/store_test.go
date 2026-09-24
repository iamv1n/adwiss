package entities_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/testdb"
	"github.com/iamv1n/adwise/internal/reports"
)

func TestMain(m *testing.M) { os.Exit(testdb.Run(m)) }

func i64(v int64) *int64 { return &v }
func i16(v int16) *int16 { return &v }

type tenant struct {
	testdb.Fixture
	db *database.DB
	st *entities.Store
}

func newTenant(t *testing.T) tenant {
	db := testdb.New(t)
	return tenant{Fixture: testdb.NewFixture(t, db), db: db, st: entities.NewStore(db)}
}

func (tn tenant) seedTree(t *testing.T) {
	ctx := context.Background()
	require.NoError(t, tn.st.UpsertAccounts(ctx, tn.OrganizationID, tn.Integrations["meta"], []ads.Account{
		{Provider: ads.ProviderMeta, ExternalID: "act_1", Name: "Main", Currency: "inr", Timezone: "Asia/Kolkata", Status: ads.StatusActive},
	}))
	require.NoError(t, tn.st.UpsertCampaigns(ctx, tn.OrganizationID, []ads.Campaign{
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", ExternalID: "c1", Name: "Camp 1", Status: ads.StatusActive, DailyBudget: i64(5_000_000_000)},
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", ExternalID: "c2", Name: "Camp 2", Status: "weird"},
	}))
	require.NoError(t, tn.st.UpsertAdGroups(ctx, tn.OrganizationID, []ads.AdGroup{
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", CampaignExternalID: "c1", ExternalID: "g1", Name: "Set 1", Status: ads.StatusActive},
	}))
	require.NoError(t, tn.st.UpsertAds(ctx, tn.OrganizationID, []ads.Ad{
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", CampaignExternalID: "c1", AdGroupExternalID: "g1", ExternalID: "a1", Name: "Ad 1", CreativeExternalID: "cr1"},
	}))
	require.NoError(t, tn.st.UpsertCreatives(ctx, tn.OrganizationID, []ads.Creative{
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", ExternalID: "cr1", Name: "Creative 1", Type: "image", Raw: json.RawMessage(`{"a":1}`)},
	}))
}

// snapshot returns every entity row of the tenant (including xmin, which
// changes on any rewrite of the row).
func (tn tenant) snapshot(t *testing.T) []string {
	var out []string
	rows, err := tn.db.Pool.Query(context.Background(), `
SELECT 'acct:' || a.xmin::text || ':' || row_to_json(a)::text FROM ad_accounts a WHERE organization_id = $1
UNION ALL SELECT 'camp:' || c.xmin::text || ':' || row_to_json(c)::text FROM campaigns c WHERE organization_id = $1
UNION ALL SELECT 'grp:' || g.xmin::text || ':' || row_to_json(g)::text FROM ad_groups g WHERE organization_id = $1
UNION ALL SELECT 'ad:' || x.xmin::text || ':' || row_to_json(x)::text FROM ads x WHERE organization_id = $1
UNION ALL SELECT 'cr:' || y.xmin::text || ':' || row_to_json(y)::text FROM creatives y WHERE organization_id = $1
ORDER BY 1`, tn.OrganizationID)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		var s string
		require.NoError(t, rows.Scan(&s))
		out = append(out, s)
	}
	require.NoError(t, rows.Err())
	return out
}

func TestEntityUpsertsAreIdempotent(t *testing.T) {
	tn := newTenant(t)
	tn.seedTree(t)
	first := tn.snapshot(t)
	require.Len(t, first, 6)

	tn.seedTree(t)
	assert.Equal(t, first, tn.snapshot(t), "second identical sync must not rewrite any row")

	var status, currency string
	require.NoError(t, tn.db.Pool.QueryRow(context.Background(),
		`SELECT c.status::text, a.currency FROM campaigns c JOIN ad_accounts a ON a.id = c.account_id WHERE c.organization_id = $1 AND c.external_id = 'c2'`,
		tn.OrganizationID).Scan(&status, &currency))
	assert.Equal(t, "unknown", status, "unrecognized statuses normalize to unknown")
	assert.Equal(t, "INR", currency, "currency is upper-cased")

	var syncEnabled bool
	require.NoError(t, tn.db.Pool.QueryRow(context.Background(),
		`SELECT sync_enabled FROM ad_accounts WHERE organization_id = $1`, tn.OrganizationID).Scan(&syncEnabled))
	assert.False(t, syncEnabled, "discovered accounts start with sync disabled")
}

func TestEntityUpsertUpdatesChangedFields(t *testing.T) {
	tn := newTenant(t)
	tn.seedTree(t)
	ctx := context.Background()
	require.NoError(t, tn.st.UpsertCampaigns(ctx, tn.OrganizationID, []ads.Campaign{
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", ExternalID: "c1", Name: "Renamed", Status: ads.StatusPaused},
		// Duplicate key in one call: last one wins.
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", ExternalID: "c1", Name: "Renamed again", Status: ads.StatusPaused},
	}))
	var name, status string
	var budget *int64
	require.NoError(t, tn.db.Pool.QueryRow(ctx, `SELECT name, status::text, daily_budget_micros FROM campaigns WHERE organization_id = $1 AND external_id = 'c1'`,
		tn.OrganizationID).Scan(&name, &status, &budget))
	assert.Equal(t, "Renamed again", name)
	assert.Equal(t, "paused", status)
	assert.Nil(t, budget)
}

func TestUnresolvedParentsAreSkippedAndReported(t *testing.T) {
	tn := newTenant(t)
	tn.seedTree(t)
	err := tn.st.UpsertAdGroups(context.Background(), tn.OrganizationID, []ads.AdGroup{
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", CampaignExternalID: "c1", ExternalID: "g2", Name: "ok"},
		{Provider: ads.ProviderMeta, AccountExternalID: "act_1", CampaignExternalID: "missing", ExternalID: "g3"},
		{Provider: ads.ProviderMeta, AccountExternalID: "act_unknown", CampaignExternalID: "c1", ExternalID: "g4"},
	})
	var ue *entities.UnresolvedError
	require.ErrorAs(t, err, &ue)
	assert.Equal(t, 2, ue.Count)
	assert.Equal(t, ads.EntityCampaign, ue.Parent)

	var n int
	require.NoError(t, tn.db.Pool.QueryRow(context.Background(), `SELECT count(*) FROM ad_groups WHERE organization_id = $1`, tn.OrganizationID).Scan(&n))
	assert.Equal(t, 2, n, "the resolvable ad group was written")
}

func TestUpsertAccountsRejectsForeignIntegration(t *testing.T) {
	a, b := newTenant(t), newTenant(t)
	err := a.st.UpsertAccounts(context.Background(), a.OrganizationID, b.Integrations["meta"], []ads.Account{
		{Provider: ads.ProviderMeta, ExternalID: "act_x", Currency: "INR", Timezone: "UTC"},
	})
	assert.ErrorIs(t, err, entities.ErrInvalidEntity)

	err = a.st.UpsertAccounts(context.Background(), a.OrganizationID, a.Integrations["meta"], []ads.Account{
		{Provider: ads.ProviderGoogle, ExternalID: "123", Currency: "INR", Timezone: "UTC"},
	})
	assert.ErrorIs(t, err, entities.ErrInvalidEntity, "provider must match the integration")

	err = a.st.UpsertAccounts(context.Background(), a.OrganizationID, a.Integrations["meta"], []ads.Account{
		{Provider: ads.ProviderMeta, ExternalID: "act_x", Currency: "INR", Timezone: "Mars/Olympus"},
	})
	assert.ErrorIs(t, err, entities.ErrInvalidEntity)
}

func hourlyFacts(hours int, spend int64) []ads.MetricFact {
	var out []ads.MetricFact
	for h := range hours {
		out = append(out, ads.MetricFact{
			Provider: ads.ProviderMeta, Report: reports.CampaignHourly, AccountExternalID: "act_1",
			Date: "2026-03-02", Hour: i16(int16(h)), CampaignExternalID: "c1",
			Impressions: 1000, Clicks: 10, Spend: spend, Conversions: 1.5, ConversionValue: 3 * spend,
		})
	}
	return out
}

func factStats(t *testing.T, tn tenant) (n int, spend int64, xmins string) {
	require.NoError(t, tn.db.Pool.QueryRow(context.Background(), `
SELECT count(*), coalesce(sum(spend_micros), 0)::bigint, coalesce(string_agg(xmin::text, ',' ORDER BY hour), '')
FROM metric_facts WHERE organization_id = $1`, tn.OrganizationID).Scan(&n, &spend, &xmins))
	return
}

func TestFactUpsertsAreIdempotent(t *testing.T) {
	tn := newTenant(t)
	tn.seedTree(t)
	ctx := context.Background()
	facts := hourlyFacts(24, 1_000_000)
	facts = append(facts, facts[3]) // duplicate key within a call

	require.NoError(t, tn.st.UpsertMetricFacts(ctx, tn.OrganizationID, facts))
	n1, s1, x1 := factStats(t, tn)
	assert.Equal(t, 24, n1)
	assert.Equal(t, int64(24_000_000), s1)

	require.NoError(t, tn.st.UpsertMetricFacts(ctx, tn.OrganizationID, facts))
	n2, s2, x2 := factStats(t, tn)
	assert.Equal(t, n1, n2)
	assert.Equal(t, s1, s2)
	assert.Equal(t, x1, x2, "identical re-sync rewrites no rows")

	// Restatement: same keys, new values replace the old ones.
	require.NoError(t, tn.st.UpsertMetricFacts(ctx, tn.OrganizationID, hourlyFacts(24, 2_000_000)))
	n3, s3, _ := factStats(t, tn)
	assert.Equal(t, 24, n3)
	assert.Equal(t, int64(48_000_000), s3)

	var currency string
	require.NoError(t, tn.db.Pool.QueryRow(ctx, `SELECT DISTINCT currency FROM metric_facts WHERE organization_id = $1`, tn.OrganizationID).Scan(&currency))
	assert.Equal(t, "INR", currency, "facts carry the account currency")
}

func TestFactUpsertCreatesPartitionsOnDemand(t *testing.T) {
	tn := newTenant(t)
	tn.seedTree(t)
	f := hourlyFacts(1, 1)[0]
	f.Date = "2031-07-04" // outside the pre-created partitions
	require.NoError(t, tn.st.UpsertMetricFacts(context.Background(), tn.OrganizationID, []ads.MetricFact{f}))
	var exists bool
	require.NoError(t, tn.db.Pool.QueryRow(context.Background(), `SELECT to_regclass('metric_facts_203107') IS NOT NULL`).Scan(&exists))
	assert.True(t, exists)
}

func TestFactValidation(t *testing.T) {
	tn := newTenant(t)
	tn.seedTree(t)
	base := ads.MetricFact{Provider: ads.ProviderMeta, Report: reports.CampaignDaily, AccountExternalID: "act_1", Date: "2026-03-02", CampaignExternalID: "c1"}
	cases := map[string]func(f *ads.MetricFact){
		"unknown report":       func(f *ads.MetricFact) { f.Report = "everything" },
		"hour on daily report": func(f *ads.MetricFact) { f.Hour = i16(3) },
		"missing hour":         func(f *ads.MetricFact) { f.Report = reports.CampaignHourly },
		"undeclared dimension": func(f *ads.MetricFact) { f.Country = "IN" },
		"bad date":             func(f *ads.MetricFact) { f.Date = "02/03/2026" },
		"negative spend":       func(f *ads.MetricFact) { f.Spend = -1 },
		"unknown account":      func(f *ads.MetricFact) { f.AccountExternalID = "act_nope" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			f := base
			mutate(&f)
			err := tn.st.UpsertMetricFacts(context.Background(), tn.OrganizationID, []ads.MetricFact{base, f})
			assert.ErrorIs(t, err, metrics.ErrInvalidFact)
		})
	}
	n, _, _ := factStats(t, tn)
	assert.Zero(t, n, "nothing is written when any fact is invalid")
}

func TestFactsAreTenantScoped(t *testing.T) {
	a, b := newTenant(t), newTenant(t)
	a.seedTree(t)
	// Tenant b has no act_1: a's external account ID must not resolve for b.
	err := b.st.UpsertMetricFacts(context.Background(), b.OrganizationID, hourlyFacts(1, 1))
	assert.True(t, errors.Is(err, metrics.ErrInvalidFact))
}

func TestMarkSynced(t *testing.T) {
	tn := newTenant(t)
	tn.seedTree(t)
	ctx := context.Background()
	t1 := time.Date(2026, 3, 2, 8, 3, 0, 0, time.UTC)
	require.NoError(t, tn.st.MarkSynced(ctx, tn.OrganizationID, ads.ProviderMeta, "act_1", "entities", t1))
	require.NoError(t, tn.st.MarkSynced(ctx, tn.OrganizationID, ads.ProviderMeta, "act_1", "entities", t1.Add(-time.Hour)))
	var got time.Time
	require.NoError(t, tn.db.Pool.QueryRow(ctx, `SELECT last_synced_at FROM ad_account_sync_state WHERE organization_id = $1`, tn.OrganizationID).Scan(&got))
	assert.True(t, got.Equal(t1), "last_synced_at never moves backwards")

	assert.ErrorIs(t, tn.st.MarkSynced(ctx, tn.OrganizationID, ads.ProviderMeta, "act_nope", "entities", t1), entities.ErrInvalidEntity)

	svc := entities.NewService(tn.db, metrics.NewPostgresRepository(tn.db.Pool))
	accts, err := svc.ListAccounts(ctx, tn.OrganizationID, "")
	require.NoError(t, err)
	require.Len(t, accts, 1)
	assert.Equal(t, entities.SyncDisabled, accts[0].SyncStatus)
	require.NotNil(t, accts[0].FreshnessLagSeconds)

	acct, err := svc.SetSyncEnabled(ctx, tn.OrganizationID, tn.UserID, accts[0].ID, true)
	require.NoError(t, err)
	assert.True(t, acct.SyncEnabled)
	assert.Equal(t, entities.SyncStale, acct.SyncStatus, "last sync was long ago")

	var audits int
	require.NoError(t, tn.db.Pool.QueryRow(ctx, `SELECT count(*) FROM audit_logs WHERE organization_id = $1 AND action = 'ad_account.sync_updated'`, tn.OrganizationID).Scan(&audits))
	assert.Equal(t, 1, audits)

	_, err = svc.SetSyncEnabled(ctx, tn.OrganizationID, tn.UserID, uuid.New(), true)
	assert.ErrorIs(t, err, entities.ErrAccountNotFound)
}
