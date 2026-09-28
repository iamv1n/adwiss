package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// --- budget plans ---

const planCols = `p.id, p.organization_id, p.name, p.total_budget::float8, p.currency, p.start_date, p.end_date, p.timezone,
	p.curve, p.custom_weights, p.allocation_mode, p.reallocate, p.enabled, p.dry_run, p.created_by, p.last_run_at,
	p.next_run_at, p.created_at, p.updated_at,
	coalesce(nullif(p.timezone, ''), (SELECT a.timezone FROM budget_plan_campaigns pc
	    JOIN campaigns c ON c.id = pc.campaign_id JOIN ad_accounts a ON a.id = c.account_id
	    WHERE pc.plan_id = p.id ORDER BY a.created_at, a.id LIMIT 1), 'UTC')`

func scanPlan(row pgx.Row) (BudgetPlan, error) {
	var p BudgetPlan
	var weights []byte
	err := row.Scan(&p.ID, &p.OrganizationID, &p.Name, &p.TotalBudget, &p.Currency, &p.StartDate, &p.EndDate, &p.Timezone,
		&p.Curve, &weights, &p.AllocationMode, &p.Reallocate, &p.Enabled, &p.DryRun, &p.CreatedBy, &p.LastRunAt,
		&p.NextRunAt, &p.CreatedAt, &p.UpdatedAt, &p.EffectiveTZ)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, errNotFound
	}
	if err != nil {
		return p, err
	}
	if len(weights) > 0 && string(weights) != "null" {
		if err := json.Unmarshal(weights, &p.CustomWeights); err != nil {
			return p, fmt.Errorf("decode custom weights: %w", err)
		}
	}
	p.StartDate, p.EndDate = asDate(p.StartDate), asDate(p.EndDate)
	return p, nil
}

func asDate(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func (st *store) queryPlans(ctx context.Context, sql string, args ...any) ([]BudgetPlan, error) {
	rows, err := st.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	out := []BudgetPlan{}
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		if out[i].Campaigns, err = st.planCampaigns(ctx, out[i].ID); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (st *store) onePlan(ctx context.Context, sql string, args ...any) (BudgetPlan, error) {
	ps, err := st.queryPlans(ctx, sql, args...)
	if err != nil {
		return BudgetPlan{}, err
	}
	if len(ps) == 0 {
		return BudgetPlan{}, errNotFound
	}
	return ps[0], nil
}

func (st *store) listPlans(ctx context.Context, orgID uuid.UUID) ([]BudgetPlan, error) {
	return st.queryPlans(ctx, `SELECT `+planCols+` FROM budget_plans p WHERE p.organization_id = $1 ORDER BY p.created_at DESC`, orgID)
}

func (st *store) getPlan(ctx context.Context, orgID, id uuid.UUID) (BudgetPlan, error) {
	return st.onePlan(ctx, `SELECT `+planCols+` FROM budget_plans p WHERE p.organization_id = $1 AND p.id = $2`, orgID, id)
}

func (st *store) planByID(ctx context.Context, id uuid.UUID) (BudgetPlan, error) {
	return st.onePlan(ctx, `SELECT `+planCols+` FROM budget_plans p WHERE p.id = $1`, id)
}

// duePlans returns enabled plans whose next run is due.
func (st *store) duePlans(ctx context.Context, now time.Time) ([]BudgetPlan, error) {
	return st.queryPlans(ctx, `SELECT `+planCols+` FROM budget_plans p
		WHERE p.enabled AND (p.next_run_at IS NULL OR p.next_run_at <= $1) ORDER BY p.created_at`, now)
}

func (st *store) planCampaigns(ctx context.Context, planID uuid.UUID) ([]PlanCampaign, error) {
	rows, err := st.pool.Query(ctx, `SELECT pc.campaign_id, pc.share_pct::float8, pc.min_daily_budget::float8
		FROM budget_plan_campaigns pc JOIN campaigns c ON c.id = pc.campaign_id
		WHERE pc.plan_id = $1 ORDER BY pc.share_pct DESC, c.name, c.id`, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PlanCampaign{}
	for rows.Next() {
		var c PlanCampaign
		if err := rows.Scan(&c.CampaignID, &c.SharePct, &c.MinDailyBudget); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func weightsJSON(w []float64) []byte {
	if w == nil {
		return nil
	}
	b, _ := json.Marshal(w)
	return b
}

// savePlan inserts (ID nil) or updates the plan and replaces its campaigns.
func (st *store) savePlan(ctx context.Context, p BudgetPlan) (uuid.UUID, error) {
	id := p.ID
	err := pgx.BeginFunc(ctx, st.pool, func(tx pgx.Tx) error {
		start, end := p.StartDate.Format(time.DateOnly), p.EndDate.Format(time.DateOnly)
		if id == uuid.Nil {
			if err := tx.QueryRow(ctx, `
				INSERT INTO budget_plans (organization_id, name, total_budget, currency, start_date, end_date, timezone, curve,
				    custom_weights, allocation_mode, reallocate, enabled, dry_run, created_by)
				VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
				p.OrganizationID, p.Name, p.TotalBudget, p.Currency, start, end, p.Timezone, p.Curve, weightsJSON(p.CustomWeights),
				p.AllocationMode, p.Reallocate, p.Enabled, p.DryRun, p.CreatedBy).Scan(&id); err != nil {
				return err
			}
		} else {
			tag, err := tx.Exec(ctx, `
				UPDATE budget_plans SET name = $3, total_budget = $4, currency = $5, start_date = $6::date, end_date = $7::date,
				    timezone = $8, curve = $9, custom_weights = $10, allocation_mode = $11, reallocate = $12, enabled = $13,
				    dry_run = $14, next_run_at = $15, updated_at = now()
				WHERE organization_id = $1 AND id = $2`,
				p.OrganizationID, id, p.Name, p.TotalBudget, p.Currency, start, end, p.Timezone, p.Curve,
				weightsJSON(p.CustomWeights), p.AllocationMode, p.Reallocate, p.Enabled, p.DryRun, p.NextRunAt)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return errNotFound
			}
			if _, err := tx.Exec(ctx, `DELETE FROM budget_plan_campaigns WHERE plan_id = $1`, id); err != nil {
				return err
			}
		}
		for _, c := range p.Campaigns {
			if _, err := tx.Exec(ctx, `INSERT INTO budget_plan_campaigns (plan_id, campaign_id, share_pct, min_daily_budget)
				VALUES ($1, $2, $3, $4)`, id, c.CampaignID, c.SharePct, c.MinDailyBudget); err != nil {
				return err
			}
		}
		// Drop day rows for removed campaigns or days outside the period.
		ids := make([]uuid.UUID, len(p.Campaigns))
		for i, c := range p.Campaigns {
			ids[i] = c.CampaignID
		}
		_, err := tx.Exec(ctx, `DELETE FROM budget_plan_days WHERE plan_id = $1
			AND (campaign_id <> ALL($2) OR day < $3::date OR day > $4::date)`, id, ids, start, end)
		return err
	})
	return id, err
}

func (st *store) deletePlan(ctx context.Context, orgID, id uuid.UUID) error {
	tag, err := st.pool.Exec(ctx, `DELETE FROM budget_plans WHERE organization_id = $1 AND id = $2`, orgID, id)
	if err == nil && tag.RowsAffected() == 0 {
		return errNotFound
	}
	return err
}

func (st *store) finishPlanRun(ctx context.Context, id uuid.UUID, at, next time.Time) error {
	_, err := st.pool.Exec(ctx, `UPDATE budget_plans SET last_run_at = $2, next_run_at = $3 WHERE id = $1`, id, at, next)
	return err
}

// planConflict is a campaign already in another enabled plan.
type planConflict struct {
	CampaignID uuid.UUID
	PlanName   string
}

func (st *store) planConflicts(ctx context.Context, orgID uuid.UUID, exclude uuid.UUID, campaignIDs []uuid.UUID) ([]planConflict, error) {
	rows, err := st.pool.Query(ctx, `SELECT pc.campaign_id, p.name FROM budget_plan_campaigns pc
		JOIN budget_plans p ON p.id = pc.plan_id
		WHERE p.organization_id = $1 AND p.enabled AND p.id <> $2 AND pc.campaign_id = ANY($3)
		ORDER BY p.created_at`, orgID, exclude, campaignIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []planConflict
	for rows.Next() {
		var c planConflict
		if err := rows.Scan(&c.CampaignID, &c.PlanName); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// planDayRow is one budget_plan_days row.
type planDayRow struct {
	CampaignID uuid.UUID
	Day        time.Time
	Planned    float64
	BudgetSet  *float64
	Spent      *float64
}

type dayKey struct {
	campaign uuid.UUID
	day      time.Time
}

func (st *store) planDays(ctx context.Context, planID uuid.UUID) (map[dayKey]planDayRow, error) {
	rows, err := st.pool.Query(ctx, `SELECT campaign_id, day, planned::float8, budget_set::float8, spent::float8
		FROM budget_plan_days WHERE plan_id = $1`, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[dayKey]planDayRow{}
	for rows.Next() {
		var r planDayRow
		if err := rows.Scan(&r.CampaignID, &r.Day, &r.Planned, &r.BudgetSet, &r.Spent); err != nil {
			return nil, err
		}
		r.Day = asDate(r.Day)
		out[dayKey{r.CampaignID, r.Day}] = r
	}
	return out, rows.Err()
}

// savePlanDays upserts day rows. planned is only overwritten for days on or
// after today (past days keep the plan they had); budget_set and spent are
// only overwritten with non-null values.
func (st *store) savePlanDays(ctx context.Context, planID uuid.UUID, today time.Time, rows []planDayRow) error {
	if len(rows) == 0 {
		return nil
	}
	camps := make([]uuid.UUID, len(rows))
	days := make([]string, len(rows))
	planned := make([]float64, len(rows))
	set := make([]*float64, len(rows))
	spent := make([]*float64, len(rows))
	for i, r := range rows {
		camps[i], days[i], planned[i], set[i], spent[i] = r.CampaignID, r.Day.Format(time.DateOnly), r.Planned, r.BudgetSet, r.Spent
	}
	_, err := st.pool.Exec(ctx, `
		INSERT INTO budget_plan_days (plan_id, campaign_id, day, planned, budget_set, spent)
		SELECT $1, c, d::date, pl, bs, sp FROM unnest($2::uuid[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[])
		    AS u(c, d, pl, bs, sp)
		ON CONFLICT (plan_id, campaign_id, day) DO UPDATE SET
		    planned = CASE WHEN EXCLUDED.day >= $7::date THEN EXCLUDED.planned ELSE budget_plan_days.planned END,
		    budget_set = coalesce(EXCLUDED.budget_set, budget_plan_days.budget_set),
		    spent = coalesce(EXCLUDED.spent, budget_plan_days.spent),
		    updated_at = now()`,
		planID, camps, days, planned, set, spent, today.Format(time.DateOnly))
	return err
}

// dailySpend returns campaign_daily spend per external campaign ID and date
// for one account over the inclusive date range.
func (st *store) dailySpend(ctx context.Context, orgID, accountID uuid.UUID, from, to time.Time, externalIDs []string) (map[string]map[time.Time]float64, error) {
	rows, err := st.pool.Query(ctx, `
		SELECT campaign_external_id, date, sum(spend_micros)::bigint FROM metric_facts
		WHERE organization_id = $1 AND account_id = $2 AND report = 'campaign_daily'
		  AND date BETWEEN $3::date AND $4::date AND campaign_external_id = ANY($5)
		GROUP BY campaign_external_id, date`,
		orgID, accountID, from.Format(time.DateOnly), to.Format(time.DateOnly), externalIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[time.Time]float64{}
	for rows.Next() {
		var id string
		var d time.Time
		var m int64
		if err := rows.Scan(&id, &d, &m); err != nil {
			return nil, err
		}
		if out[id] == nil {
			out[id] = map[time.Time]float64{}
		}
		out[id][asDate(d)] = microsToUnits(m)
	}
	return out, rows.Err()
}
