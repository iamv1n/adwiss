package alerts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// store holds the package's SQL. It uses pgx directly (not sqlc) so the alert
// tables stay self-contained; it only reads other packages' tables.
type store struct{ pool *pgxpool.Pool }

var errNotFound = errors.New("not found")

const alertCols = `a.id, a.organization_id, a.kind, a.severity, a.entity_type, a.entity_id, a.entity_name, a.title, a.body, a.data,
	a.dedupe_key, a.created_at, a.updated_at, a.resolved_at`

func scanAlert(row pgx.Row, withRead bool) (Alert, error) {
	var a Alert
	var data []byte
	dst := []any{&a.ID, &a.OrganizationID, &a.Kind, &a.Severity, &a.EntityType, &a.EntityID, &a.EntityName, &a.Title, &a.Body, &data,
		&a.DedupeKey, &a.CreatedAt, &a.UpdatedAt, &a.ResolvedAt}
	if withRead {
		dst = append(dst, &a.ReadAt)
	}
	if err := row.Scan(dst...); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return a, errNotFound
		}
		return a, err
	}
	if err := json.Unmarshal(data, &a.Data); err != nil {
		return a, fmt.Errorf("decode alert data: %w", err)
	}
	a.Link = LinkFor(a.Kind, a.EntityType, a.EntityID)
	return a, nil
}

// ListFilter narrows list queries.
type ListFilter struct {
	UnreadOnly bool
	Status     string // open | resolved | "" (all)
	Severity   string
	Kind       string
	Limit      int
}

// list returns alerts for a user, unread first, newest first.
func (st *store) list(ctx context.Context, orgID, userID uuid.UUID, f ListFilter) ([]Alert, error) {
	q := `SELECT ` + alertCols + `, r.read_at FROM alerts a
		LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = $2
		WHERE a.organization_id = $1
		  AND ($3::bool = false OR r.read_at IS NULL)
		  AND ($4 = '' OR ($4 = 'open' AND a.resolved_at IS NULL) OR ($4 = 'resolved' AND a.resolved_at IS NOT NULL))
		  AND ($5 = '' OR a.severity = $5)
		  AND ($6 = '' OR a.kind = $6)
		ORDER BY (r.read_at IS NULL) DESC, a.created_at DESC
		LIMIT $7`
	rows, err := st.pool.Query(ctx, q, orgID, userID, f.UnreadOnly, f.Status, f.Severity, f.Kind, f.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Alert{}
	for rows.Next() {
		a, err := scanAlert(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// unreadWindow bounds the unread badge so an old backlog does not linger.
const unreadWindow = 30 * 24 * time.Hour

func (st *store) unreadCount(ctx context.Context, orgID, userID uuid.UUID) (int, error) {
	var n int
	err := st.pool.QueryRow(ctx, `SELECT count(*) FROM alerts a
		WHERE a.organization_id = $1 AND a.created_at > now() - make_interval(secs => $3)
		  AND NOT EXISTS (SELECT 1 FROM alert_reads r WHERE r.alert_id = a.id AND r.user_id = $2)`,
		orgID, userID, unreadWindow.Seconds()).Scan(&n)
	return n, err
}

func (st *store) markRead(ctx context.Context, orgID, userID, id uuid.UUID) error {
	tag, err := st.pool.Exec(ctx, `INSERT INTO alert_reads (alert_id, user_id)
		SELECT id, $2 FROM alerts WHERE organization_id = $1 AND id = $3
		ON CONFLICT DO NOTHING`, orgID, userID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		// Already read, or not in this organization.
		var exists bool
		if err := st.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM alerts WHERE organization_id = $1 AND id = $2)`, orgID, id).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return errNotFound
		}
	}
	return nil
}

func (st *store) markAllRead(ctx context.Context, orgID, userID uuid.UUID) (int64, error) {
	tag, err := st.pool.Exec(ctx, `INSERT INTO alert_reads (alert_id, user_id)
		SELECT a.id, $2 FROM alerts a WHERE a.organization_id = $1
		ON CONFLICT DO NOTHING`, orgID, userID)
	return tag.RowsAffected(), err
}

// --- preferences ---

func (st *store) preferences(ctx context.Context, orgID, userID uuid.UUID) (Preferences, bool, error) {
	var p Preferences
	err := st.pool.QueryRow(ctx, `SELECT email_level, email_muted_kinds FROM alert_preferences WHERE organization_id = $1 AND user_id = $2`,
		orgID, userID).Scan(&p.EmailLevel, &p.EmailMutedKinds)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, false, nil
	}
	return p, err == nil, err
}

func (st *store) savePreferences(ctx context.Context, orgID, userID uuid.UUID, p Preferences) error {
	_, err := st.pool.Exec(ctx, `INSERT INTO alert_preferences (organization_id, user_id, email_level, email_muted_kinds)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (organization_id, user_id) DO UPDATE SET email_level = EXCLUDED.email_level,
			email_muted_kinds = EXCLUDED.email_muted_kinds, updated_at = now()`,
		orgID, userID, p.EmailLevel, p.EmailMutedKinds)
	return err
}

// recipients returns every member with their effective preferences.
func (st *store) recipients(ctx context.Context, orgID uuid.UUID) ([]Recipient, error) {
	rows, err := st.pool.Query(ctx, `SELECT u.email::text, u.name, ou.role::text, p.email_level, p.email_muted_kinds
		FROM organization_users ou
		JOIN users u ON u.id = ou.user_id
		LEFT JOIN alert_preferences p ON p.organization_id = ou.organization_id AND p.user_id = ou.user_id
		WHERE ou.organization_id = $1
		ORDER BY u.email`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Recipient{}
	for rows.Next() {
		var r Recipient
		var level *string
		var muted []string
		if err := rows.Scan(&r.Email, &r.Name, &r.Role, &level, &muted); err != nil {
			return nil, err
		}
		r.Prefs = DefaultPreferences(r.Role)
		if level != nil {
			r.Prefs = Preferences{EmailLevel: *level, EmailMutedKinds: muted}
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// --- detection ---

type orgRow struct {
	ID   uuid.UUID
	Name string
}

func (st *store) organizations(ctx context.Context) ([]orgRow, error) {
	rows, err := st.pool.Query(ctx, `SELECT id, name FROM organizations ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[orgRow])
}

func (st *store) orgName(ctx context.Context, orgID uuid.UUID) (string, error) {
	var name string
	err := st.pool.QueryRow(ctx, `SELECT name FROM organizations WHERE id = $1`, orgID).Scan(&name)
	return name, err
}

// campaignSeries loads SeriesDays of campaign_daily totals for every campaign
// in the organization's sync-enabled accounts, with "yesterday" computed in
// each account's timezone.
func (st *store) campaignSeries(ctx context.Context, orgID uuid.UUID) ([]CampaignSeries, error) {
	rows, err := st.pool.Query(ctx, `
		WITH acc AS (
			SELECT a.id, a.currency, a.timezone,
			       (now() AT TIME ZONE a.timezone)::date - 1 AS yday,
			       s.last_synced_at
			FROM ad_accounts a
			LEFT JOIN ad_account_sync_state s ON s.account_id = a.id AND s.scope = 'metrics:campaign_daily'
			WHERE a.organization_id = $1 AND a.sync_enabled
		)
		SELECT c.id, c.name, c.status::text, acc.currency, acc.yday,
		       coalesce(acc.last_synced_at >= ((acc.yday + 1)::timestamp AT TIME ZONE acc.timezone), false) AS fresh,
		       f.date, coalesce(sum(f.spend_micros), 0), coalesce(sum(f.impressions), 0),
		       coalesce(sum(f.conversions), 0), coalesce(sum(f.conversion_value_micros), 0)
		FROM acc
		JOIN campaigns c ON c.account_id = acc.id AND c.organization_id = $1
		LEFT JOIN metric_facts f ON f.organization_id = $1 AND f.account_id = acc.id AND f.report = 'campaign_daily'
		     AND f.campaign_external_id = c.external_id
		     AND f.date BETWEEN acc.yday - $2::int + 1 AND acc.yday
		     AND f.date >= current_date - ($2::int + 2) AND f.date <= current_date + 1
		WHERE c.status <> 'deleted'
		GROUP BY c.id, c.name, c.status, acc.currency, acc.yday, fresh, f.date
		ORDER BY c.id`, orgID, SeriesDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CampaignSeries{}
	idx := map[uuid.UUID]int{}
	for rows.Next() {
		var s CampaignSeries
		var date *time.Time
		var spend, value int64
		var impr int64
		var conv float64
		if err := rows.Scan(&s.CampaignID, &s.Name, &s.Status, &s.Currency, &s.Yesterday, &s.Fresh, &date, &spend, &impr, &conv, &value); err != nil {
			return nil, err
		}
		i, ok := idx[s.CampaignID]
		if !ok {
			i = len(out)
			idx[s.CampaignID] = i
			out = append(out, s)
		}
		if date == nil {
			continue
		}
		d := int(s.Yesterday.Sub(*date).Hours() / 24)
		if d < 0 || d >= SeriesDays {
			continue
		}
		out[i].Days[d] = Day{Spend: float64(spend) / 1e6, Impressions: impr, Conversions: conv, Value: float64(value) / 1e6}
	}
	return out, rows.Err()
}

func (st *store) integrations(ctx context.Context, orgID uuid.UUID) ([]IntegrationState, error) {
	rows, err := st.pool.Query(ctx, `SELECT id, provider::text, display_name, status::text, coalesce(last_error, '')
		FROM integrations WHERE organization_id = $1`, orgID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[IntegrationState])
}

// failedActionWindow is how far back failed actions are grouped. Alerts are
// deduped per source per day, so overlapping runs only update counts.
const failedActionWindow = 26 * time.Hour

func (st *store) failedActions(ctx context.Context, orgID uuid.UUID) ([]FailedGroup, error) {
	rows, err := st.pool.Query(ctx, `
		SELECT source, source_id, max(source_name), (created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int,
		       (array_agg(error ORDER BY created_at DESC))[1],
		       (array_agg(DISTINCT entity_name) FILTER (WHERE entity_name <> ''))[1:3],
		       max(created_at)
		FROM actions
		WHERE organization_id = $1 AND status = 'failed' AND created_at > now() - make_interval(secs => $2)
		GROUP BY source, source_id, day
		ORDER BY day, source`, orgID, failedActionWindow.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FailedGroup{}
	for rows.Next() {
		var g FailedGroup
		if err := rows.Scan(&g.Source, &g.SourceID, &g.SourceName, &g.Day, &g.Count, &g.LastError, &g.Entities, &g.LastAt); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// openKeys returns the dedupe keys of open alerts of a kind.
func (st *store) openKeys(ctx context.Context, orgID uuid.UUID, kind string) ([]string, error) {
	rows, err := st.pool.Query(ctx, `SELECT dedupe_key FROM alerts WHERE organization_id = $1 AND kind = $2 AND resolved_at IS NULL`, orgID, kind)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// upsert inserts d, or refreshes the open alert with the same dedupe key
// (without changing read state). It reports whether a new alert was created.
func (st *store) upsert(ctx context.Context, orgID uuid.UUID, d Detected) (bool, error) {
	data, err := json.Marshal(d.Data)
	if err != nil {
		return false, err
	}
	var inserted bool
	err = st.pool.QueryRow(ctx, `INSERT INTO alerts (organization_id, kind, severity, entity_type, entity_id, entity_name, title, body, data, dedupe_key)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5, NULLIF($6, ''), $7, $8, $9, $10)
		ON CONFLICT (organization_id, dedupe_key) WHERE resolved_at IS NULL DO UPDATE SET
			severity = EXCLUDED.severity, entity_name = EXCLUDED.entity_name, title = EXCLUDED.title,
			body = EXCLUDED.body, data = EXCLUDED.data, updated_at = now()
		RETURNING (xmax = 0)`,
		orgID, d.Kind, d.Severity, d.EntityType, d.EntityID, d.EntityName, d.Title, d.Body, data, d.DedupeKey).Scan(&inserted)
	return inserted, err
}

func (st *store) resolve(ctx context.Context, orgID uuid.UUID, keys []string) (int64, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	tag, err := st.pool.Exec(ctx, `UPDATE alerts SET resolved_at = now(), updated_at = now()
		WHERE organization_id = $1 AND dedupe_key = ANY($2) AND resolved_at IS NULL`, orgID, keys)
	return tag.RowsAffected(), err
}

// pendingEmail returns recent open alerts whose email delivery has not been
// processed yet (so a crash between detection and delivery is retried).
func (st *store) pendingEmail(ctx context.Context, orgID uuid.UUID) ([]Alert, error) {
	rows, err := st.pool.Query(ctx, `SELECT `+alertCols+` FROM alerts a
		WHERE a.organization_id = $1 AND a.emailed_at IS NULL AND a.resolved_at IS NULL AND a.created_at > now() - interval '1 day'
		ORDER BY a.created_at`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Alert{}
	for rows.Next() {
		a, err := scanAlert(rows, false)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (st *store) markEmailed(ctx context.Context, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := st.pool.Exec(ctx, `UPDATE alerts SET emailed_at = now() WHERE id = ANY($1)`, ids)
	return err
}
