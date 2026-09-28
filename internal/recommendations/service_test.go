package recommendations

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/automation"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
)

// These tests need the development Postgres (make up && make migrate). They
// are skipped when DATABASE_URL is not set, and delete everything they create.

type fakeMutator struct {
	calls []string
	err   error
}

func (f *fakeMutator) SetStatus(_ context.Context, _ uuid.UUID, _ *uuid.UUID, level string, _ uuid.UUID, s ads.Status) error {
	f.calls = append(f.calls, level+":"+string(s))
	return f.err
}

func (f *fakeMutator) SetDailyBudget(_ context.Context, _ uuid.UUID, _ *uuid.UUID, level string, _ uuid.UUID, _ float64) error {
	f.calls = append(f.calls, level+":budget")
	return f.err
}

func (*fakeMutator) RefreshesLocalState() bool { return false }

type fixture struct {
	db       *database.DB
	svc      *Service
	mut      *fakeMutator
	m        organizations.Membership
	ad       uuid.UUID
	campaign uuid.UUID
}

func setup(t *testing.T) *fixture {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; start Postgres with make up")
	}
	ctx := context.Background()
	db, err := database.Connect(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(db.Close)

	f := &fixture{db: db, mut: &fakeMutator{}}
	var orgID, userID, acct, group uuid.UUID
	q := func(sql string, args ...any) {
		t.Helper()
		_, err := db.Pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Reco test', $1) RETURNING id`,
		"reco-test-"+uuid.NewString()[:8]).Scan(&orgID))
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO users (email, name, password_hash) VALUES ($1, 'Reco', 'x') RETURNING id`,
		"reco-"+uuid.NewString()[:8]+"@example.test").Scan(&userID))
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = db.Pool.Exec(ctx, `DELETE FROM audit_logs WHERE organization_id = $1`, orgID)
		_, _ = db.Pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)
		_, _ = db.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO ad_accounts (organization_id, provider, external_id, name, currency, timezone, sync_enabled, status)
		VALUES ($1, 'meta', $2, 'Test acct', 'INR', 'UTC', true, 'active') RETURNING id`, orgID, "act-"+uuid.NewString()[:8]).Scan(&acct))
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO campaigns (organization_id, account_id, provider, external_id, name, status, daily_budget_micros)
		VALUES ($1, $2, 'meta', 'c1', 'Winner', 'active', 1000000000) RETURNING id`, orgID, acct).Scan(&f.campaign))
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO ad_groups (organization_id, account_id, campaign_id, provider, external_id, name, status)
		VALUES ($1, $2, $3, 'meta', 'g1', 'Set', 'active') RETURNING id`, orgID, acct, f.campaign).Scan(&group))
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO ads (organization_id, account_id, campaign_id, ad_group_id, provider, external_id, name, status)
		VALUES ($1, $2, $3, $4, 'meta', 'a1', 'Diwali video 2', 'active') RETURNING id`, orgID, acct, f.campaign, group).Scan(&f.ad))

	// 14 complete days ending yesterday: the ad's frequency rises from 2 to
	// 3 and CTR falls from 2% to 1.4%; the campaign's ROAS is 3.2 with 14
	// conversions in the last 7 days.
	today := time.Now().UTC().Truncate(24 * time.Hour)
	for i := 1; i <= 14; i++ {
		d := today.AddDate(0, 0, -i).Format(time.DateOnly)
		imps, clicks, reach := int64(3000), int64(42), int64(1000)
		if i > 7 {
			imps, clicks, reach = 3000, 60, 1500
		}
		q(`INSERT INTO metric_facts (organization_id, account_id, provider, report, date, campaign_external_id, ad_group_external_id,
			ad_external_id, currency, impressions, clicks, reach, spend_micros) VALUES ($1, $2, 'meta', 'ad_daily', $3, 'c1', 'g1', 'a1', 'INR', $4, $5, $6, 700000000)`,
			orgID, acct, d, imps, clicks, reach)
		q(`INSERT INTO metric_facts (organization_id, account_id, provider, report, date, campaign_external_id, currency, impressions,
			clicks, spend_micros, conversions, conversion_value_micros) VALUES ($1, $2, 'meta', 'campaign_daily', $3, 'c1', 'INR', $4, $5,
			1000000000, 2, 3200000000)`, orgID, acct, d, imps, clicks)
	}
	auto := automation.NewService(db, f.mut)
	f.svc = NewService(db, auto)
	f.m = organizations.Membership{OrganizationID: orgID, UserID: userID, Role: organizations.RoleOwner}
	return f
}

func TestGenerateDedupeAccept(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	// Without targets: fatigue only (no scaling without a target ROAS).
	res, err := f.svc.Generate(ctx, f.m.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, 1, res.Created)
	open, err := f.svc.List(ctx, f.m.OrganizationID, StatusOpen)
	require.NoError(t, err)
	require.Len(t, open, 1)
	fat := open[0]
	require.Equal(t, KindCreativeFatigue, fat.Kind)
	require.Equal(t, f.ad, fat.EntityID)
	require.Equal(t, automation.ActionPause, fat.Action.Type)

	// With a target ROAS of 2: the campaign (ROAS 3.2) is a winner.
	roas := 2.0
	_, err = f.svc.SetTargets(ctx, f.m, Targets{TargetROAS: &roas})
	require.NoError(t, err)
	res, err = f.svc.Generate(ctx, f.m.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, 1, res.Created)
	require.Equal(t, 1, res.Refreshed) // fatigue is not duplicated
	open, err = f.svc.List(ctx, f.m.OrganizationID, StatusOpen)
	require.NoError(t, err)
	require.Len(t, open, 2)
	var scale Recommendation
	for _, r := range open {
		if r.Kind == KindScaleWinner {
			scale = r
		}
	}
	require.Equal(t, f.campaign, scale.EntityID)
	require.InDelta(t, 1200, scale.Action.Value, 1e-9)

	// Dismissed suggestions are not re-created.
	_, err = f.svc.Dismiss(ctx, f.m, scale.ID)
	require.NoError(t, err)
	res, err = f.svc.Generate(ctx, f.m.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, 0, res.Created)
	counts, err := f.svc.Counts(ctx, f.m.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, 1, counts[StatusOpen])
	require.Equal(t, 1, counts[StatusDismissed])

	// Accept → a manual action row, executed through the mutator.
	out, err := f.svc.Accept(ctx, f.m, fat.ID)
	require.NoError(t, err)
	require.Equal(t, StatusAccepted, out.Recommendation.Status)
	require.NotNil(t, out.Action)
	require.Equal(t, automation.StatusSucceeded, out.Action.Status)
	require.Equal(t, automation.SourceManual, out.Action.Source)
	require.Equal(t, automation.LevelAd, out.Action.EntityType)
	require.True(t, out.Action.Revertible)
	require.Equal(t, out.Action.ID, *out.Recommendation.ActionID)
	require.Equal(t, []string{"ad:paused"}, f.mut.calls)
	// Accepting twice is refused.
	_, err = f.svc.Accept(ctx, f.m, fat.ID)
	require.Error(t, err)

	// The paused ad is no longer suggested; nothing open is left, and the
	// accepted key stays quiet.
	res, err = f.svc.Generate(ctx, f.m.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, 0, res.Created)
}

func TestAcceptProviderError(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	_, err := f.svc.Generate(ctx, f.m.OrganizationID)
	require.NoError(t, err)
	open, err := f.svc.List(ctx, f.m.OrganizationID, StatusOpen)
	require.NoError(t, err)
	require.Len(t, open, 1)
	f.mut.err = context.DeadlineExceeded
	out, err := f.svc.Accept(ctx, f.m, open[0].ID)
	require.NoError(t, err)
	require.Equal(t, StatusFailed, out.Recommendation.Status)
	require.Contains(t, out.Recommendation.Error, "deadline")
	require.Equal(t, automation.StatusFailed, out.Action.Status)
}

func TestCampaignFatigue(t *testing.T) {
	f := setup(t)
	list, _, err := f.svc.CampaignFatigue(context.Background(), f.m.OrganizationID, f.campaign)
	require.NoError(t, err)
	require.Len(t, list, 1)
	require.True(t, list[0].Fatigued, list[0].Reason)
	require.InDelta(t, 3.0, *list[0].Current.Frequency, 1e-9)
	require.InDelta(t, 2.0, *list[0].Previous.Frequency, 1e-9)
}
