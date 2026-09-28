package alerts

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/platform/mailer"
	"github.com/iamv1n/adwise/internal/platform/testdb"
)

func TestMain(m *testing.M) { os.Exit(testdb.Run(m)) }

type fakeEnq struct {
	mu    sync.Mutex
	msgs  []mailer.Message
	ids   map[string]bool
	tasks []string
}

func (f *fakeEnq) EnqueueContext(_ context.Context, t *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.ids == nil {
		f.ids = map[string]bool{}
	}
	for _, o := range opts {
		if o.Type() == asynq.TaskIDOpt {
			id := o.Value().(string)
			if f.ids[id] {
				return nil, asynq.ErrTaskIDConflict
			}
			f.ids[id] = true
		}
	}
	var m mailer.Message
	if err := json.Unmarshal(t.Payload(), &m); err != nil {
		return nil, err
	}
	f.tasks = append(f.tasks, t.Type())
	f.msgs = append(f.msgs, m)
	return &asynq.TaskInfo{}, nil
}

func TestRunDedupeResolveAndEmail(t *testing.T) {
	db := testdb.New(t)
	ctx := context.Background()
	fx := testdb.NewFixture(t, db)
	enq := &fakeEnq{}
	svc := NewService(db, enq, "http://web.test")
	owner := organizations.Membership{OrganizationID: fx.OrganizationID, UserID: fx.UserID, Role: organizations.RoleOwner}

	// A member with default prefs (in-app only).
	var memberID uuid.UUID
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO users (email, name, password_hash) VALUES ($1, 'M', 'x') RETURNING id`,
		"m-"+fx.OrganizationID.String()[:8]+"@test.local").Scan(&memberID))
	_, err := db.Pool.Exec(ctx, `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'member')`, fx.OrganizationID, memberID)
	require.NoError(t, err)
	member := organizations.Membership{OrganizationID: fx.OrganizationID, UserID: memberID, Role: organizations.RoleMember}

	// An account that synced today, with a campaign that delivered until 2 days ago.
	var accountID, campaignID uuid.UUID
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO ad_accounts (organization_id, integration_id, provider, external_id, name, currency, timezone, sync_enabled)
		VALUES ($1, $2, 'meta', 'act_1', 'Acc', 'USD', 'UTC', true) RETURNING id`, fx.OrganizationID, fx.Integrations["meta"]).Scan(&accountID))
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO campaigns (organization_id, account_id, provider, external_id, name, status)
		VALUES ($1, $2, 'meta', 'c1', 'Prospecting', 'active') RETURNING id`, fx.OrganizationID, accountID).Scan(&campaignID))
	_, err = db.Pool.Exec(ctx, `INSERT INTO ad_account_sync_state (account_id, scope, organization_id, provider, last_synced_at)
		VALUES ($1, 'metrics:campaign_daily', $2, 'meta', now())`, accountID, fx.OrganizationID)
	require.NoError(t, err)
	for i := 2; i <= 9; i++ {
		_, err = db.Pool.Exec(ctx, `INSERT INTO metric_facts (organization_id, account_id, provider, report, date, campaign_external_id, currency, impressions, spend_micros)
			VALUES ($1, $2, 'meta', 'campaign_daily', (now() AT TIME ZONE 'UTC')::date - $3::int, 'c1', 'USD', 1000, 100000000)`, fx.OrganizationID, accountID, i)
		require.NoError(t, err)
	}
	// One connection needs reconnecting; a rule action failed.
	_, err = db.Pool.Exec(ctx, `UPDATE integrations SET status = 'needs_reauth' WHERE id = $1`, fx.Integrations["google"])
	require.NoError(t, err)
	ruleID := uuid.New()
	_, err = db.Pool.Exec(ctx, `INSERT INTO actions (organization_id, source, source_id, source_name, entity_type, entity_id, entity_name, action_type, status, error)
		VALUES ($1, 'rule', $2, 'Pause losers', 'campaign', $3, 'Prospecting', 'pause', 'failed', 'boom')`, fx.OrganizationID, ruleID, campaignID)
	require.NoError(t, err)

	res, err := svc.RunOrg(ctx, fx.OrganizationID)
	require.NoError(t, err)
	assert.Equal(t, 3, res.Created, "stopped delivering + reconnect + failed rule")
	assert.Equal(t, 1, res.Emails, "one batched email for the owner, none for the member")
	require.Len(t, enq.msgs, 1)
	assert.Equal(t, mailer.TaskSend, enq.tasks[0])
	assert.Contains(t, enq.msgs[0].Subject, "3 new alerts")
	assert.Contains(t, enq.msgs[0].Text, "http://web.test/app/campaigns/"+campaignID.String())

	// Second run: same conditions, no new alerts, no new email.
	res, err = svc.RunOrg(ctx, fx.OrganizationID)
	require.NoError(t, err)
	assert.Equal(t, 0, res.Created)
	assert.Equal(t, 3, res.Updated)
	assert.Len(t, enq.msgs, 1)

	// Read state is per user.
	list, unread, err := svc.List(ctx, owner, ListFilter{})
	require.NoError(t, err)
	require.Len(t, list, 3)
	assert.Equal(t, 3, unread)
	require.NoError(t, svc.MarkRead(ctx, owner, list[0].ID))
	n, err := svc.UnreadCount(ctx, owner)
	require.NoError(t, err)
	assert.Equal(t, 2, n)
	n, err = svc.UnreadCount(ctx, member)
	require.NoError(t, err)
	assert.Equal(t, 3, n)
	list, _, err = svc.List(ctx, owner, ListFilter{})
	require.NoError(t, err)
	assert.Nil(t, list[0].ReadAt, "unread first")
	assert.NotNil(t, list[2].ReadAt)
	assert.ErrorIs(t, svc.MarkRead(ctx, member, uuid.New()), httpx.ErrNotFound)
	_, err = svc.MarkAllRead(ctx, member)
	require.NoError(t, err)
	n, _ = svc.UnreadCount(ctx, member)
	assert.Equal(t, 0, n)

	// Reconnect + delivery resumes: both stateful alerts resolve.
	_, err = db.Pool.Exec(ctx, `UPDATE integrations SET status = 'active' WHERE id = $1`, fx.Integrations["google"])
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `INSERT INTO metric_facts (organization_id, account_id, provider, report, date, campaign_external_id, currency, impressions, spend_micros)
		VALUES ($1, $2, 'meta', 'campaign_daily', (now() AT TIME ZONE 'UTC')::date - 1, 'c1', 'USD', 900, 90000000)`, fx.OrganizationID, accountID)
	require.NoError(t, err)
	res, err = svc.RunOrg(ctx, fx.OrganizationID)
	require.NoError(t, err)
	assert.Equal(t, 2, res.Resolved)
	open, _, err := svc.List(ctx, owner, ListFilter{Status: "open"})
	require.NoError(t, err)
	require.Len(t, open, 1)
	assert.Equal(t, KindActionFailed, open[0].Kind)
	assert.Equal(t, "/app/actions", open[0].Link)

	// A new reauth after resolution is a new occurrence.
	_, err = db.Pool.Exec(ctx, `UPDATE integrations SET status = 'needs_reauth' WHERE id = $1`, fx.Integrations["google"])
	require.NoError(t, err)
	res, err = svc.RunOrg(ctx, fx.OrganizationID)
	require.NoError(t, err)
	assert.Equal(t, 1, res.Created)
	assert.Len(t, enq.msgs, 2)
}

func TestPreferencesRoundTrip(t *testing.T) {
	db := testdb.New(t)
	ctx := context.Background()
	fx := testdb.NewFixture(t, db)
	svc := NewService(db, nil, "http://web.test")
	m := organizations.Membership{OrganizationID: fx.OrganizationID, UserID: fx.UserID, Role: organizations.RoleOwner}

	p, err := svc.Preferences(ctx, m)
	require.NoError(t, err)
	assert.Equal(t, Preferences{EmailLevel: EmailWarning, EmailMutedKinds: []string{}, IsDefault: true}, p)

	p, err = svc.SavePreferences(ctx, m, PreferencesInput{EmailLevel: EmailCritical, EmailMutedKinds: []string{KindSpendSpike, KindSpendSpike}})
	require.NoError(t, err)
	assert.Equal(t, []string{KindSpendSpike}, p.EmailMutedKinds)
	p, err = svc.Preferences(ctx, m)
	require.NoError(t, err)
	assert.Equal(t, Preferences{EmailLevel: EmailCritical, EmailMutedKinds: []string{KindSpendSpike}}, p)

	_, err = svc.SavePreferences(ctx, m, PreferencesInput{EmailLevel: EmailAll, EmailMutedKinds: []string{"bogus"}})
	assert.Error(t, err)

	var audits int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT count(*) FROM audit_logs WHERE organization_id = $1 AND action = 'alert_preferences.updated'`, fx.OrganizationID).Scan(&audits))
	assert.Equal(t, 1, audits)

	// Recipients reflect saved and default preferences.
	r, err := svc.st.recipients(ctx, fx.OrganizationID)
	require.NoError(t, err)
	require.Len(t, r, 1)
	assert.Equal(t, EmailCritical, r[0].Prefs.EmailLevel)
}
