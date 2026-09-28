package recommendations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iamv1n/adwise/internal/automation"
)

// store holds the package's SQL (pgx directly, like internal/automation).
type store struct{ pool *pgxpool.Pool }

var errNotFound = errors.New("not found")

// --- targets ---

func (st *store) targets(ctx context.Context, orgID uuid.UUID) (Targets, error) {
	var t Targets
	err := st.pool.QueryRow(ctx, `SELECT currency, target_cpa::float8, target_roas::float8 FROM organization_targets
		WHERE organization_id = $1`, orgID).Scan(&t.Currency, &t.TargetCPA, &t.TargetROAS)
	if errors.Is(err, pgx.ErrNoRows) {
		return Targets{}, nil
	}
	return t, err
}

func (st *store) saveTargets(ctx context.Context, orgID, userID uuid.UUID, t Targets) error {
	_, err := st.pool.Exec(ctx, `
		INSERT INTO organization_targets (organization_id, currency, target_cpa, target_roas, updated_by)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (organization_id) DO UPDATE SET currency = EXCLUDED.currency, target_cpa = EXCLUDED.target_cpa,
		    target_roas = EXCLUDED.target_roas, updated_by = EXCLUDED.updated_by, updated_at = now()`,
		orgID, t.Currency, t.TargetCPA, t.TargetROAS, userID)
	return err
}

// primaryCurrency is the currency most of the organization's accounts use.
func (st *store) primaryCurrency(ctx context.Context, orgID uuid.UUID) (string, error) {
	var c string
	err := st.pool.QueryRow(ctx, `SELECT currency FROM ad_accounts WHERE organization_id = $1
		GROUP BY currency ORDER BY count(*) DESC, currency LIMIT 1`, orgID).Scan(&c)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return c, err
}

// --- inputs ---

type account struct {
	ID       uuid.UUID
	Name     string
	Provider string
	Currency string
	Timezone string
}

func (st *store) orgsToScan(ctx context.Context) ([]uuid.UUID, error) {
	rows, err := st.pool.Query(ctx, `SELECT DISTINCT organization_id FROM ad_accounts WHERE sync_enabled`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
}

func (st *store) accounts(ctx context.Context, orgID uuid.UUID) ([]account, error) {
	rows, err := st.pool.Query(ctx, `SELECT id, name, provider::text, currency, timezone FROM ad_accounts
		WHERE organization_id = $1 AND sync_enabled ORDER BY name`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []account
	for rows.Next() {
		var a account
		if err := rows.Scan(&a.ID, &a.Name, &a.Provider, &a.Currency, &a.Timezone); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type entity struct {
	ID           uuid.UUID
	Name         string
	ExternalID   string
	Status       string
	CampaignID   uuid.UUID
	CampaignName string
	BudgetMicros *int64
}

// activeAds lists the account's active ads in active campaigns (optionally
// one campaign's ads in any status, for the campaign page).
func (st *store) ads(ctx context.Context, orgID, accountID uuid.UUID, campaignID *uuid.UUID) ([]entity, error) {
	sql := `SELECT d.id, d.name, d.external_id, d.status::text, c.id, c.name, NULL::bigint
		FROM ads d JOIN campaigns c ON c.id = d.campaign_id
		WHERE d.organization_id = $1 AND d.account_id = $2`
	args := []any{orgID, accountID}
	if campaignID != nil {
		sql += ` AND d.campaign_id = $3`
		args = append(args, *campaignID)
	} else {
		sql += ` AND d.status = 'active' AND c.status = 'active'`
	}
	return st.entities(ctx, sql+` ORDER BY d.name, d.id`, args...)
}

func (st *store) activeCampaigns(ctx context.Context, orgID, accountID uuid.UUID) ([]entity, error) {
	return st.entities(ctx, `SELECT c.id, c.name, c.external_id, c.status::text, c.id, c.name, c.daily_budget_micros
		FROM campaigns c WHERE c.organization_id = $1 AND c.account_id = $2 AND c.status = 'active' ORDER BY c.name, c.id`,
		orgID, accountID)
}

func (st *store) entities(ctx context.Context, sql string, args ...any) ([]entity, error) {
	rows, err := st.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []entity
	for rows.Next() {
		var e entity
		if err := rows.Scan(&e.ID, &e.Name, &e.ExternalID, &e.Status, &e.CampaignID, &e.CampaignName, &e.BudgetMicros); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// windows sums daily facts of one report per external ID (col) over the
// inclusive date range. Reach is summed over daily rows (see
// automation.Window for what that means for frequency).
func (st *store) windows(ctx context.Context, orgID, accountID uuid.UUID, report, col, from, to string, ids []string) (map[string]automation.Window, error) {
	out := map[string]automation.Window{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := st.pool.Query(ctx, `
		SELECT `+col+`, sum(impressions)::bigint, sum(clicks)::bigint, sum(spend_micros)::bigint,
		       sum(conversions)::float8, sum(conversion_value_micros)::bigint, coalesce(sum(reach), 0)::bigint
		FROM metric_facts
		WHERE organization_id = $1 AND account_id = $2 AND report = $3
		  AND date BETWEEN $4::date AND $5::date AND `+col+` = ANY($6)
		GROUP BY `+col, orgID, accountID, report, from, to, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var w automation.Window
		var spend, value int64
		if err := rows.Scan(&id, &w.Impressions, &w.Clicks, &spend, &w.Conversions, &value, &w.Reach); err != nil {
			return nil, err
		}
		w.Spend, w.Revenue = units(spend), units(value)
		out[id] = w
	}
	return out, rows.Err()
}

// accountTotals sums the account's campaign_daily facts over a date range.
func (st *store) accountTotals(ctx context.Context, orgID, accountID uuid.UUID, from, to string) (automation.Window, error) {
	var w automation.Window
	var spend, value int64
	err := st.pool.QueryRow(ctx, `
		SELECT coalesce(sum(impressions), 0)::bigint, coalesce(sum(clicks), 0)::bigint, coalesce(sum(spend_micros), 0)::bigint,
		       coalesce(sum(conversions), 0)::float8, coalesce(sum(conversion_value_micros), 0)::bigint
		FROM metric_facts WHERE organization_id = $1 AND account_id = $2 AND report = 'campaign_daily'
		  AND date BETWEEN $3::date AND $4::date`, orgID, accountID, from, to).
		Scan(&w.Impressions, &w.Clicks, &spend, &w.Conversions, &value)
	w.Spend, w.Revenue = units(spend), units(value)
	return w, err
}

func units(m int64) float64 { return float64(m) / 1e6 }

// --- recommendations ---

const recCols = `r.id, r.organization_id, r.kind, r.entity_type, r.entity_id, r.entity_name, r.account_id, coalesce(a.name, ''),
	r.provider::text, r.currency, r.title, r.reason, r.evidence, r.proposed_action, r.status, r.action_id, r.error, r.dedupe_key,
	r.decided_by, r.decided_at, r.created_at, r.updated_at, r.expires_at`

const recFrom = ` FROM recommendations r LEFT JOIN ad_accounts a ON a.id = r.account_id`

func scanRec(row pgx.Row) (Recommendation, error) {
	var r Recommendation
	var ev, act []byte
	err := row.Scan(&r.ID, &r.OrganizationID, &r.Kind, &r.EntityType, &r.EntityID, &r.EntityName, &r.AccountID, &r.AccountName,
		&r.Provider, &r.Currency, &r.Title, &r.Reason, &ev, &act, &r.Status, &r.ActionID, &r.Error, &r.DedupeKey,
		&r.DecidedBy, &r.DecidedAt, &r.CreatedAt, &r.UpdatedAt, &r.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, errNotFound
	}
	if err != nil {
		return r, err
	}
	_ = json.Unmarshal(ev, &r.Evidence)
	if r.Evidence == nil {
		r.Evidence = map[string]any{}
	}
	if err := json.Unmarshal(act, &r.Action); err != nil {
		return r, fmt.Errorf("decode proposed action: %w", err)
	}
	return r, nil
}

func (st *store) list(ctx context.Context, orgID uuid.UUID, status string, limit int) ([]Recommendation, error) {
	rows, err := st.pool.Query(ctx, `SELECT `+recCols+recFrom+` WHERE r.organization_id = $1 AND ($2 = '' OR r.status = $2)
		ORDER BY coalesce(r.decided_at, r.created_at) DESC, r.id LIMIT $3`, orgID, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Recommendation{}
	for rows.Next() {
		r, err := scanRec(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (st *store) get(ctx context.Context, orgID, id uuid.UUID) (Recommendation, error) {
	return scanRec(st.pool.QueryRow(ctx, `SELECT `+recCols+recFrom+` WHERE r.organization_id = $1 AND r.id = $2`, orgID, id))
}

func (st *store) counts(ctx context.Context, orgID uuid.UUID) (map[string]int, error) {
	rows, err := st.pool.Query(ctx, `SELECT status, count(*) FROM recommendations WHERE organization_id = $1 GROUP BY status`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for _, s := range Statuses {
		out[s] = 0
	}
	for rows.Next() {
		var s string
		var n int
		if err := rows.Scan(&s, &n); err != nil {
			return nil, err
		}
		out[s] = n
	}
	return out, rows.Err()
}

// quiet reports whether the key was dismissed, accepted or failed recently
// enough that it should not be suggested again yet.
func (st *store) quiet(ctx context.Context, orgID uuid.UUID, key string, now time.Time) (bool, error) {
	var ok bool
	err := st.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM recommendations WHERE organization_id = $1 AND dedupe_key = $2
		AND ((status = 'dismissed' AND decided_at >= $3) OR (status IN ('accepted', 'failed') AND decided_at >= $4)))`,
		orgID, key, now.Add(-DismissQuiet), now.Add(-DecidedQuiet)).Scan(&ok)
	return ok, err
}

// upsertOpen creates the open recommendation for r.DedupeKey or refreshes
// the existing one (evidence, reason, proposal, expiry). created=false on a
// refresh.
func (st *store) upsertOpen(ctx context.Context, r Recommendation, now time.Time) (created bool, err error) {
	ev, _ := json.Marshal(r.Evidence)
	act, _ := json.Marshal(r.Action)
	err = st.pool.QueryRow(ctx, `
		INSERT INTO recommendations (organization_id, kind, entity_type, entity_id, entity_name, account_id, provider, currency,
		    title, reason, evidence, proposed_action, dedupe_key, created_at, updated_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7::ad_provider, $8, $9, $10, $11, $12, $13, $14, $14, $15)
		ON CONFLICT (organization_id, dedupe_key) WHERE status = 'open' DO UPDATE SET entity_name = EXCLUDED.entity_name,
		    title = EXCLUDED.title, reason = EXCLUDED.reason, evidence = EXCLUDED.evidence,
		    proposed_action = EXCLUDED.proposed_action, updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at
		RETURNING (xmax = 0)`,
		r.OrganizationID, r.Kind, r.EntityType, r.EntityID, r.EntityName, r.AccountID, r.Provider, r.Currency, r.Title, r.Reason,
		ev, act, r.DedupeKey, now, now.Add(TTL)).Scan(&created)
	return created, err
}

// expireStale expires open recommendations past their expiry or not
// refreshed by the run that started at runStart.
func (st *store) expireStale(ctx context.Context, orgID uuid.UUID, runStart time.Time) (int64, error) {
	tag, err := st.pool.Exec(ctx, `UPDATE recommendations SET status = 'expired', updated_at = now()
		WHERE organization_id = $1 AND status = 'open' AND (expires_at < now() OR updated_at < $2)`, orgID, runStart)
	return tag.RowsAffected(), err
}

// decide moves an open recommendation to status; ok=false when it was no
// longer open.
func (st *store) decide(ctx context.Context, orgID, id uuid.UUID, status string, userID uuid.UUID, actionID *uuid.UUID, errMsg string) (bool, error) {
	tag, err := st.pool.Exec(ctx, `UPDATE recommendations SET status = $3, decided_by = $4, decided_at = now(), action_id = $5,
		error = $6, updated_at = now() WHERE organization_id = $1 AND id = $2 AND status = 'open'`,
		orgID, id, status, userID, actionID, errMsg)
	return tag.RowsAffected() == 1, err
}
