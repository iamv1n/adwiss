package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// store holds the package's SQL. It uses pgx directly (not sqlc) so the
// automation tables stay self-contained in this package.
type store struct{ pool *pgxpool.Pool }

var errNotFound = errors.New("not found")

// --- schedules ---

const scheduleCols = `id, organization_id, name, level, target_ids, timezone, grid, enabled, dry_run, created_by, last_evaluated_at, created_at, updated_at`

func scanSchedule(row pgx.Row) (Schedule, error) {
	var s Schedule
	var grid []byte
	err := row.Scan(&s.ID, &s.OrganizationID, &s.Name, &s.Level, &s.TargetIDs, &s.Timezone, &grid, &s.Enabled, &s.DryRun,
		&s.CreatedBy, &s.LastEvaluatedAt, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, errNotFound
	}
	if err != nil {
		return s, err
	}
	if err := json.Unmarshal(grid, &s.Grid); err != nil {
		return s, fmt.Errorf("decode grid: %w", err)
	}
	if s.TargetIDs == nil {
		s.TargetIDs = []uuid.UUID{}
	}
	return s, nil
}

func (st *store) listSchedules(ctx context.Context, orgID uuid.UUID) ([]Schedule, error) {
	return st.querySchedules(ctx, `SELECT `+scheduleCols+` FROM dayparting_schedules WHERE organization_id = $1 ORDER BY created_at`, orgID)
}

func (st *store) enabledSchedules(ctx context.Context, orgID *uuid.UUID) ([]Schedule, error) {
	if orgID != nil {
		return st.querySchedules(ctx, `SELECT `+scheduleCols+` FROM dayparting_schedules WHERE enabled AND organization_id = $1 ORDER BY created_at`, *orgID)
	}
	return st.querySchedules(ctx, `SELECT `+scheduleCols+` FROM dayparting_schedules WHERE enabled ORDER BY created_at`)
}

func (st *store) querySchedules(ctx context.Context, sql string, args ...any) ([]Schedule, error) {
	rows, err := st.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Schedule{}
	for rows.Next() {
		s, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (st *store) getSchedule(ctx context.Context, orgID, id uuid.UUID) (Schedule, error) {
	return scanSchedule(st.pool.QueryRow(ctx, `SELECT `+scheduleCols+` FROM dayparting_schedules WHERE organization_id = $1 AND id = $2`, orgID, id))
}

func (st *store) scheduleByID(ctx context.Context, id uuid.UUID) (Schedule, error) {
	return scanSchedule(st.pool.QueryRow(ctx, `SELECT `+scheduleCols+` FROM dayparting_schedules WHERE id = $1`, id))
}

func (st *store) insertSchedule(ctx context.Context, s Schedule) (Schedule, error) {
	grid, _ := json.Marshal(s.Grid)
	return scanSchedule(st.pool.QueryRow(ctx, `
		INSERT INTO dayparting_schedules (organization_id, name, level, target_ids, timezone, grid, enabled, dry_run, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING `+scheduleCols,
		s.OrganizationID, s.Name, s.Level, s.TargetIDs, s.Timezone, grid, s.Enabled, s.DryRun, s.CreatedBy))
}

func (st *store) updateSchedule(ctx context.Context, s Schedule) (Schedule, error) {
	grid, _ := json.Marshal(s.Grid)
	return scanSchedule(st.pool.QueryRow(ctx, `
		UPDATE dayparting_schedules SET name = $3, level = $4, target_ids = $5, timezone = $6, grid = $7, enabled = $8,
		       dry_run = $9, updated_at = now()
		WHERE organization_id = $1 AND id = $2 RETURNING `+scheduleCols,
		s.OrganizationID, s.ID, s.Name, s.Level, s.TargetIDs, s.Timezone, grid, s.Enabled, s.DryRun))
}

func (st *store) deleteSchedule(ctx context.Context, orgID, id uuid.UUID) error {
	tag, err := st.pool.Exec(ctx, `DELETE FROM dayparting_schedules WHERE organization_id = $1 AND id = $2`, orgID, id)
	if err == nil && tag.RowsAffected() == 0 {
		return errNotFound
	}
	return err
}

func (st *store) touchSchedule(ctx context.Context, id uuid.UUID, at time.Time) error {
	_, err := st.pool.Exec(ctx, `UPDATE dayparting_schedules SET last_evaluated_at = $2 WHERE id = $1`, id, at)
	return err
}

func (st *store) memo(ctx context.Context, scheduleID, entityID uuid.UUID) (ScheduleMemo, error) {
	m := ScheduleMemo{AppliedMultiplier: 1}
	err := st.pool.QueryRow(ctx, `SELECT paused_by_schedule, base_budget_micros, applied_multiplier
		FROM dayparting_entity_state WHERE schedule_id = $1 AND entity_id = $2`, scheduleID, entityID).
		Scan(&m.PausedBySchedule, &m.BaseBudgetMicros, &m.AppliedMultiplier)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, nil
	}
	return m, err
}

func (st *store) saveMemo(ctx context.Context, scheduleID, entityID uuid.UUID, m ScheduleMemo) error {
	_, err := st.pool.Exec(ctx, `
		INSERT INTO dayparting_entity_state (schedule_id, entity_id, paused_by_schedule, base_budget_micros, applied_multiplier)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (schedule_id, entity_id) DO UPDATE SET paused_by_schedule = EXCLUDED.paused_by_schedule,
		    base_budget_micros = EXCLUDED.base_budget_micros, applied_multiplier = EXCLUDED.applied_multiplier, updated_at = now()`,
		scheduleID, entityID, m.PausedBySchedule, m.BaseBudgetMicros, m.AppliedMultiplier)
	return err
}

// scheduleChanges counts each schedule's non-skipped actions.
func (st *store) scheduleChanges(ctx context.Context, orgID uuid.UUID) (map[uuid.UUID]int, error) {
	rows, err := st.pool.Query(ctx, `SELECT source_id, count(*) FROM actions
		WHERE organization_id = $1 AND source = 'schedule' AND status <> 'skipped' GROUP BY source_id`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID]int{}
	for rows.Next() {
		var id uuid.UUID
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, err
		}
		out[id] = n
	}
	return out, rows.Err()
}

// --- rules ---

const ruleCols = `id, organization_id, name, level, scope_type, scope_ids, conditions, lookback_days, action, check_interval_minutes,
	cooldown_minutes, max_changes_per_run, enabled, dry_run, created_by, last_run_at, last_run_matched, last_run_changes,
	next_run_at, created_at, updated_at`

func scanRule(row pgx.Row) (Rule, error) {
	var r Rule
	var conds, action []byte
	err := row.Scan(&r.ID, &r.OrganizationID, &r.Name, &r.Level, &r.ScopeType, &r.ScopeIDs, &conds, &r.LookbackDays, &action,
		&r.CheckIntervalMinutes, &r.CooldownMinutes, &r.MaxChangesPerRun, &r.Enabled, &r.DryRun, &r.CreatedBy, &r.LastRunAt,
		&r.LastRunMatched, &r.LastRunChanges, &r.NextRunAt, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, errNotFound
	}
	if err != nil {
		return r, err
	}
	if err := json.Unmarshal(conds, &r.Conditions); err != nil {
		return r, fmt.Errorf("decode conditions: %w", err)
	}
	if err := json.Unmarshal(action, &r.Action); err != nil {
		return r, fmt.Errorf("decode action: %w", err)
	}
	if r.ScopeIDs == nil {
		r.ScopeIDs = []uuid.UUID{}
	}
	return r, nil
}

func (st *store) queryRules(ctx context.Context, sql string, args ...any) ([]Rule, error) {
	rows, err := st.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Rule{}
	for rows.Next() {
		r, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (st *store) listRules(ctx context.Context, orgID uuid.UUID) ([]Rule, error) {
	return st.queryRules(ctx, `SELECT `+ruleCols+` FROM automation_rules WHERE organization_id = $1 ORDER BY created_at`, orgID)
}

func (st *store) dueRules(ctx context.Context, now time.Time) ([]Rule, error) {
	return st.queryRules(ctx, `SELECT `+ruleCols+` FROM automation_rules
		WHERE enabled AND (next_run_at IS NULL OR next_run_at <= $1) ORDER BY created_at`, now)
}

func (st *store) getRule(ctx context.Context, orgID, id uuid.UUID) (Rule, error) {
	return scanRule(st.pool.QueryRow(ctx, `SELECT `+ruleCols+` FROM automation_rules WHERE organization_id = $1 AND id = $2`, orgID, id))
}

func (st *store) ruleByID(ctx context.Context, id uuid.UUID) (Rule, error) {
	return scanRule(st.pool.QueryRow(ctx, `SELECT `+ruleCols+` FROM automation_rules WHERE id = $1`, id))
}

func (st *store) insertRule(ctx context.Context, r Rule) (Rule, error) {
	conds, _ := json.Marshal(r.Conditions)
	action, _ := json.Marshal(r.Action)
	return scanRule(st.pool.QueryRow(ctx, `
		INSERT INTO automation_rules (organization_id, name, scope_type, scope_ids, conditions, lookback_days, action,
		    check_interval_minutes, cooldown_minutes, max_changes_per_run, enabled, dry_run, created_by, level)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING `+ruleCols,
		r.OrganizationID, r.Name, r.ScopeType, r.ScopeIDs, conds, r.LookbackDays, action, r.CheckIntervalMinutes,
		r.CooldownMinutes, r.MaxChangesPerRun, r.Enabled, r.DryRun, r.CreatedBy, r.Level))
}

func (st *store) updateRule(ctx context.Context, r Rule) (Rule, error) {
	conds, _ := json.Marshal(r.Conditions)
	action, _ := json.Marshal(r.Action)
	return scanRule(st.pool.QueryRow(ctx, `
		UPDATE automation_rules SET name = $3, scope_type = $4, scope_ids = $5, conditions = $6, lookback_days = $7,
		    action = $8, check_interval_minutes = $9, cooldown_minutes = $10, max_changes_per_run = $11, enabled = $12,
		    dry_run = $13, next_run_at = $14, level = $15, updated_at = now()
		WHERE organization_id = $1 AND id = $2 RETURNING `+ruleCols,
		r.OrganizationID, r.ID, r.Name, r.ScopeType, r.ScopeIDs, conds, r.LookbackDays, action, r.CheckIntervalMinutes,
		r.CooldownMinutes, r.MaxChangesPerRun, r.Enabled, r.DryRun, r.NextRunAt, r.Level))
}

func (st *store) deleteRule(ctx context.Context, orgID, id uuid.UUID) error {
	tag, err := st.pool.Exec(ctx, `DELETE FROM automation_rules WHERE organization_id = $1 AND id = $2`, orgID, id)
	if err == nil && tag.RowsAffected() == 0 {
		return errNotFound
	}
	return err
}

func (st *store) finishRuleRun(ctx context.Context, id uuid.UUID, at, next time.Time, matched, changes int) error {
	_, err := st.pool.Exec(ctx, `UPDATE automation_rules SET last_run_at = $2, next_run_at = $3, last_run_matched = $4,
		last_run_changes = $5 WHERE id = $1`, id, at, next, matched, changes)
	return err
}

// ruleStats counts each rule's non-skipped actions, overall and since since.
func (st *store) ruleStats(ctx context.Context, orgID uuid.UUID, since time.Time) (map[uuid.UUID][2]int, error) {
	rows, err := st.pool.Query(ctx, `SELECT source_id, count(*), count(*) FILTER (WHERE created_at >= $2) FROM actions
		WHERE organization_id = $1 AND source = 'rule' AND status <> 'skipped' GROUP BY source_id`, orgID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID][2]int{}
	for rows.Next() {
		var id uuid.UUID
		var total, recent int
		if err := rows.Scan(&id, &total, &recent); err != nil {
			return nil, err
		}
		out[id] = [2]int{total, recent}
	}
	return out, rows.Err()
}

// --- targets and metrics ---

const campaignTargetSQL = `SELECT c.id, 'campaign', c.name, a.id, a.name, a.provider::text, a.currency, a.timezone, c.status::text,
	c.daily_budget_micros, c.external_id
	FROM campaigns c JOIN ad_accounts a ON a.id = c.account_id`

const adGroupTargetSQL = `SELECT g.id, 'ad_group', g.name, a.id, a.name, a.provider::text, a.currency, a.timezone, g.status::text,
	g.daily_budget_micros, g.external_id
	FROM ad_groups g JOIN ad_accounts a ON a.id = g.account_id`

// Ads have no budget of their own.
const adTargetSQL = `SELECT d.id, 'ad', d.name, a.id, a.name, a.provider::text, a.currency, a.timezone, d.status::text,
	NULL::bigint, d.external_id
	FROM ads d JOIN ad_accounts a ON a.id = d.account_id`

func (st *store) queryTargets(ctx context.Context, sql string, args ...any) ([]Target, error) {
	rows, err := st.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Target{}
	for rows.Next() {
		var t Target
		if err := rows.Scan(&t.ID, &t.Level, &t.Name, &t.AccountID, &t.AccountName, &t.Provider, &t.Currency, &t.Timezone,
			&t.Status, &t.DailyBudgetMicros, &t.ExternalID); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// targets loads the entities of one level by ID, in name order.
func (st *store) targets(ctx context.Context, orgID uuid.UUID, level string, ids []uuid.UUID) ([]Target, error) {
	switch level {
	case LevelAdGroup:
		return st.queryTargets(ctx, adGroupTargetSQL+` WHERE g.organization_id = $1 AND g.id = ANY($2) ORDER BY g.name, g.id`, orgID, ids)
	case LevelAd:
		return st.queryTargets(ctx, adTargetSQL+` WHERE d.organization_id = $1 AND d.id = ANY($2) ORDER BY d.name, d.id`, orgID, ids)
	}
	return st.queryTargets(ctx, campaignTargetSQL+` WHERE c.organization_id = $1 AND c.id = ANY($2) ORDER BY c.name, c.id`, orgID, ids)
}

func (st *store) target(ctx context.Context, orgID uuid.UUID, level string, id uuid.UUID) (Target, error) {
	ts, err := st.targets(ctx, orgID, level, []uuid.UUID{id})
	if err != nil {
		return Target{}, err
	}
	if len(ts) == 0 {
		return Target{}, errNotFound
	}
	return ts[0], nil
}

// ruleTargets loads the entities of a rule's level in its scope (active or
// paused, on sync-enabled accounts). Ad sets and ads also need an active or
// paused campaign; the campaigns scope selects those under the campaigns.
func (st *store) ruleTargets(ctx context.Context, orgID uuid.UUID, level, scope string, ids []uuid.UUID) ([]Target, error) {
	var base, order, campaignCol string
	switch level {
	case LevelAdGroup:
		base = adGroupTargetSQL + ` JOIN campaigns c ON c.id = g.campaign_id
			WHERE g.organization_id = $1 AND a.sync_enabled AND g.status IN ('active', 'paused') AND c.status IN ('active', 'paused')`
		order, campaignCol = ` ORDER BY g.name, g.id`, "g.campaign_id"
	case LevelAd:
		base = adTargetSQL + ` JOIN campaigns c ON c.id = d.campaign_id
			WHERE d.organization_id = $1 AND a.sync_enabled AND d.status IN ('active', 'paused') AND c.status IN ('active', 'paused')`
		order, campaignCol = ` ORDER BY d.name, d.id`, "d.campaign_id"
	default:
		base = campaignTargetSQL + ` WHERE c.organization_id = $1 AND a.sync_enabled AND c.status IN ('active', 'paused')`
		order, campaignCol = ` ORDER BY c.name, c.id`, "c.id"
	}
	switch scope {
	case ScopeAccount:
		return st.queryTargets(ctx, base+` AND a.id = ANY($2)`+order, orgID, ids)
	case ScopeCampaigns:
		return st.queryTargets(ctx, base+` AND `+campaignCol+` = ANY($2)`+order, orgID, ids)
	}
	return st.queryTargets(ctx, base+order, orgID)
}

// windowSource is the report and external ID column holding a level's
// daily facts. Ad sets and ads read ad_daily (ad sets sum their ads).
func windowSource(level string) (report, col string) {
	switch level {
	case LevelAdGroup:
		return "ad_daily", "ad_group_external_id"
	case LevelAd:
		return "ad_daily", "ad_external_id"
	}
	return "campaign_daily", "campaign_external_id"
}

// windows sums a level's daily facts per external ID for one account over the
// inclusive account-local date range.
func (st *store) windows(ctx context.Context, orgID, accountID uuid.UUID, level, from, to string, externalIDs []string) (map[string]Window, error) {
	report, col := windowSource(level)
	rows, err := st.pool.Query(ctx, `
		SELECT `+col+`, sum(impressions)::bigint, sum(clicks)::bigint, sum(spend_micros)::bigint,
		       sum(conversions)::float8, sum(conversion_value_micros)::bigint, coalesce(sum(reach), 0)::bigint
		FROM metric_facts
		WHERE organization_id = $1 AND account_id = $2 AND report = $6
		  AND date BETWEEN $3::date AND $4::date AND `+col+` = ANY($5)
		GROUP BY `+col, orgID, accountID, from, to, externalIDs, report)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Window{}
	for rows.Next() {
		var id string
		var w Window
		var spend, value int64
		if err := rows.Scan(&id, &w.Impressions, &w.Clicks, &spend, &w.Conversions, &value, &w.Reach); err != nil {
			return nil, err
		}
		w.Spend, w.Revenue = microsToUnits(spend), microsToUnits(value)
		out[id] = w
	}
	return out, rows.Err()
}

// setLocalState mirrors a successful mutation into the local entity row so
// the next evaluation sees it before the next sync (the manage service does
// this itself; the ads.Client fallback does not).
func (st *store) setLocalState(ctx context.Context, level string, id uuid.UUID, status *string, budget *int64) error {
	table := "campaigns"
	switch level {
	case LevelAdGroup:
		table = "ad_groups"
	case LevelAd:
		table = "ads"
		budget = nil
	}
	if status != nil {
		if _, err := st.pool.Exec(ctx, `UPDATE `+table+` SET status = $2::ad_entity_status, updated_at = now() WHERE id = $1`, id, *status); err != nil {
			return err
		}
	}
	if budget != nil {
		if _, err := st.pool.Exec(ctx, `UPDATE `+table+` SET daily_budget_micros = $2, updated_at = now() WHERE id = $1`, id, *budget); err != nil {
			return err
		}
	}
	return nil
}

// --- actions ---

type newAction struct {
	OrganizationID uuid.UUID
	Source         string
	SourceID       *uuid.UUID
	SourceName     string
	ActorUserID    *uuid.UUID
	Target         Target
	ActionType     string
	Before, After  map[string]any
	Status         string
	Reason         string
	Error          string
	IdempotencyKey *string
	SlotStart      *time.Time
	ExecutedAt     *time.Time
	CreatedAt      *time.Time
}

// insertAction records an action. With an idempotency key already used, it
// inserts nothing and returns ok=false.
func (st *store) insertAction(ctx context.Context, a newAction) (id uuid.UUID, ok bool, err error) {
	before, _ := json.Marshal(nonNil(a.Before))
	after, _ := json.Marshal(nonNil(a.After))
	var provider *string
	if a.Target.Provider != "" {
		provider = &a.Target.Provider
	}
	var account *uuid.UUID
	if a.Target.AccountID != uuid.Nil {
		account = &a.Target.AccountID
	}
	err = st.pool.QueryRow(ctx, `
		INSERT INTO actions (organization_id, source, source_id, source_name, actor_user_id, provider, account_id, entity_type,
		    entity_id, entity_name, currency, action_type, before_state, after_state, status, reason, error, idempotency_key,
		    slot_start, executed_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6::ad_provider, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
		    coalesce($21, now()))
		ON CONFLICT (organization_id, idempotency_key) DO NOTHING
		RETURNING id`,
		a.OrganizationID, a.Source, a.SourceID, a.SourceName, a.ActorUserID, provider, account, a.Target.Level,
		a.Target.ID, a.Target.Name, a.Target.Currency, a.ActionType, before, after, a.Status, a.Reason, a.Error,
		a.IdempotencyKey, a.SlotStart, a.ExecutedAt, a.CreatedAt).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return id, err == nil, err
}

func nonNil(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}

const actionCols = `x.id, x.organization_id, x.source, x.source_id, x.source_name, x.actor_user_id, coalesce(u.name, u.email::text, ''),
	x.provider::text, x.account_id, x.entity_type, x.entity_id, x.entity_name, x.currency, x.action_type, x.before_state,
	x.after_state, x.status, x.reason, x.error, x.slot_start, x.reverted_by, x.created_at, x.updated_at, x.executed_at`

const actionFrom = ` FROM actions x LEFT JOIN users u ON u.id = x.actor_user_id`

func scanAction(row pgx.Row) (Action, error) {
	var a Action
	var before, after []byte
	err := row.Scan(&a.ID, &a.OrganizationID, &a.Source, &a.SourceID, &a.SourceName, &a.ActorUserID, &a.ActorName,
		&a.Provider, &a.AccountID, &a.EntityType, &a.EntityID, &a.EntityName, &a.Currency, &a.ActionType, &before, &after,
		&a.Status, &a.Reason, &a.Error, &a.SlotStart, &a.RevertedBy, &a.CreatedAt, &a.UpdatedAt, &a.ExecutedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, errNotFound
	}
	if err != nil {
		return a, err
	}
	_ = json.Unmarshal(before, &a.Before)
	_ = json.Unmarshal(after, &a.After)
	if a.Before == nil {
		a.Before = map[string]any{}
	}
	if a.After == nil {
		a.After = map[string]any{}
	}
	a.Revertible = revertible(a)
	return a, nil
}

func (st *store) getAction(ctx context.Context, orgID, id uuid.UUID) (Action, error) {
	return scanAction(st.pool.QueryRow(ctx, `SELECT `+actionCols+actionFrom+` WHERE x.organization_id = $1 AND x.id = $2`, orgID, id))
}

func (st *store) actionByID(ctx context.Context, id uuid.UUID) (Action, error) {
	return scanAction(st.pool.QueryRow(ctx, `SELECT `+actionCols+actionFrom+` WHERE x.id = $1`, id))
}

// ActionFilter narrows the actions list.
type ActionFilter struct {
	Source     string
	Status     string
	ActionType string
	SourceID   *uuid.UUID
	EntityID   *uuid.UUID
	Search     string
	Limit      int
	Offset     int
}

func (f ActionFilter) where(orgID uuid.UUID) (string, []any) {
	conds := []string{"x.organization_id = $1"}
	args := []any{orgID}
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if f.Source != "" {
		add("x.source = ?", f.Source)
	}
	if f.Status != "" {
		add("x.status = ?", f.Status)
	}
	if f.ActionType != "" {
		add("x.action_type = ?", f.ActionType)
	}
	if f.SourceID != nil {
		add("x.source_id = ?", *f.SourceID)
	}
	if f.EntityID != nil {
		add("x.entity_id = ?", *f.EntityID)
	}
	if f.Search != "" {
		add("(x.entity_name ILIKE ? OR x.source_name ILIKE ? OR u.name ILIKE ?)", "%"+escapeLike(f.Search)+"%")
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func (st *store) listActions(ctx context.Context, orgID uuid.UUID, f ActionFilter) ([]Action, int, map[string]int, error) {
	where, args := f.where(orgID)
	var total int
	counts := map[string]int{}
	rows, err := st.pool.Query(ctx, `SELECT x.status, count(*)`+actionFrom+where+` GROUP BY x.status`, args...)
	if err != nil {
		return nil, 0, nil, err
	}
	for rows.Next() {
		var s string
		var n int
		if err := rows.Scan(&s, &n); err != nil {
			rows.Close()
			return nil, 0, nil, err
		}
		counts[s] = n
		total += n
	}
	rows.Close()
	args = append(args, f.Limit, f.Offset)
	rows, err = st.pool.Query(ctx, `SELECT `+actionCols+actionFrom+where+
		fmt.Sprintf(` ORDER BY x.created_at DESC, x.id LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, nil, err
	}
	defer rows.Close()
	out := []Action{}
	for rows.Next() {
		a, err := scanAction(rows)
		if err != nil {
			return nil, 0, nil, err
		}
		out = append(out, a)
	}
	return out, total, counts, rows.Err()
}

// claimAction moves a pending action to running; ok=false when another
// worker already claimed it or it is no longer pending.
func (st *store) claimAction(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := st.pool.Exec(ctx, `UPDATE actions SET status = 'running', updated_at = now() WHERE id = $1 AND status = 'pending'`, id)
	return tag.RowsAffected() == 1, err
}

func (st *store) finishAction(ctx context.Context, id uuid.UUID, status, reason, errMsg string, after map[string]any) error {
	var afterJSON []byte
	if after != nil {
		afterJSON, _ = json.Marshal(after)
	}
	_, err := st.pool.Exec(ctx, `UPDATE actions SET status = $2, reason = CASE WHEN $3 = '' THEN reason ELSE $3 END, error = $4,
		after_state = coalesce($5, after_state), executed_at = now(), updated_at = now() WHERE id = $1`,
		id, status, reason, errMsg, afterJSON)
	return err
}

func (st *store) markReverted(ctx context.Context, id, by uuid.UUID) error {
	_, err := st.pool.Exec(ctx, `UPDATE actions SET reverted_by = $2, updated_at = now() WHERE id = $1`, id, by)
	return err
}

// recentAction reports whether an action matching the filter exists since since.
func (st *store) recentAction(ctx context.Context, orgID, entityID uuid.UUID, source string, sourceID *uuid.UUID, excludeSource *uuid.UUID, statuses []string, since time.Time) (bool, error) {
	var ok bool
	err := st.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM actions WHERE organization_id = $1 AND entity_id = $2
		AND source = $3 AND ($4::uuid IS NULL OR source_id = $4) AND ($5::uuid IS NULL OR source_id <> $5)
		AND status = ANY($6) AND created_at >= $7)`, orgID, entityID, source, sourceID, excludeSource, statuses, since).Scan(&ok)
	return ok, err
}

// --- manual changes from the audit log ---

type auditRow struct {
	ID         uuid.UUID
	ActorID    uuid.UUID
	Action     string
	EntityType string
	EntityID   string
	Metadata   []byte
	CreatedAt  time.Time
}

// unimportedAudit returns person-made entity updates (manage writes
// campaign.updated etc.; automation passes no actor) not yet in actions.
func (st *store) unimportedAudit(ctx context.Context, orgID uuid.UUID, limit int) ([]auditRow, error) {
	rows, err := st.pool.Query(ctx, `
		SELECT l.id, l.actor_user_id, l.action, l.entity_type, l.entity_id, l.metadata, l.created_at
		FROM audit_logs l
		WHERE l.organization_id = $1 AND l.actor_user_id IS NOT NULL
		  AND l.action IN ('campaign.updated', 'campaign.archived', 'ad_group.updated', 'ad_group.archived', 'ad.updated', 'ad.archived')
		  AND NOT EXISTS (SELECT 1 FROM actions x WHERE x.organization_id = l.organization_id AND x.idempotency_key = 'audit:' || l.id::text)
		ORDER BY l.created_at LIMIT $2`, orgID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []auditRow
	for rows.Next() {
		var r auditRow
		if err := rows.Scan(&r.ID, &r.ActorID, &r.Action, &r.EntityType, &r.EntityID, &r.Metadata, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (st *store) accountInfo(ctx context.Context, orgID, accountID uuid.UUID) (name, provider, currency, tz string, err error) {
	err = st.pool.QueryRow(ctx, `SELECT name, provider::text, currency, timezone FROM ad_accounts WHERE organization_id = $1 AND id = $2`,
		orgID, accountID).Scan(&name, &provider, &currency, &tz)
	return
}
