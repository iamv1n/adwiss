package leads

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

	"github.com/iamv1n/adwise/internal/ads"
)

// LeadObjectives are the campaign objectives whose ads can collect leads with
// Meta instant forms (current and legacy names).
var LeadObjectives = []string{"OUTCOME_LEADS", "LEAD_GENERATION"}

// importWindow is how far back the first import of an account reaches. Meta
// keeps leads for 90 days.
const importWindow = 90 * 24 * time.Hour

// importOverlap re-reads a little before the newest known lead, so leads that
// arrive late are not missed. The upsert makes re-reads harmless.
const importOverlap = time.Hour

var errNotFound = errors.New("not found")

// Store holds the package's SQL (pgx directly, like internal/automation). It
// also implements integrations.LeadSink for the sync worker.
type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// --- import (sync worker) ---

// SyncTargets returns the provider IDs of an account's ads that can collect
// leads (active or paused ads in lead campaigns) and the time to import from.
func (st *Store) SyncTargets(ctx context.Context, orgID uuid.UUID, provider ads.Provider, accountExternalID string) ([]string, time.Time, error) {
	var accountID uuid.UUID
	err := st.pool.QueryRow(ctx,
		`SELECT id FROM ad_accounts WHERE organization_id = $1 AND provider = $2 AND external_id = $3`,
		orgID, provider, accountExternalID).Scan(&accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, time.Time{}, nil
	}
	if err != nil {
		return nil, time.Time{}, err
	}
	rows, err := st.pool.Query(ctx, `
		SELECT a.external_id FROM ads a JOIN campaigns c ON c.id = a.campaign_id
		WHERE a.account_id = $1 AND a.status IN ('active', 'paused') AND c.objective = ANY($2)`,
		accountID, LeadObjectives)
	if err != nil {
		return nil, time.Time{}, err
	}
	adIDs, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, time.Time{}, err
	}
	var newest *time.Time
	if err := st.pool.QueryRow(ctx,
		`SELECT max(lead_created_at) FROM leads WHERE account_id = $1 AND source = 'meta_form'`, accountID).Scan(&newest); err != nil {
		return nil, time.Time{}, err
	}
	since := time.Now().Add(-importWindow)
	if newest != nil {
		since = newest.Add(-importOverlap)
	}
	return adIDs, since, nil
}

// UpsertImported stores provider leads for one account. New leads start as
// "new"; existing ones only get their submission refreshed. It returns the
// number of new leads.
func (st *Store) UpsertImported(ctx context.Context, orgID uuid.UUID, provider ads.Provider, accountExternalID string, in []ads.Lead) (int, error) {
	if len(in) == 0 {
		return 0, nil
	}
	var accountID uuid.UUID
	var currency string
	if err := st.pool.QueryRow(ctx,
		`SELECT id, currency FROM ad_accounts WHERE organization_id = $1 AND provider = $2 AND external_id = $3`,
		orgID, provider, accountExternalID).Scan(&accountID, &currency); err != nil {
		return 0, fmt.Errorf("resolve account %s: %w", accountExternalID, err)
	}

	// Resolve provider ad IDs to Adwise ad / ad group / campaign IDs.
	adExt := make([]string, 0, len(in))
	for _, l := range in {
		adExt = append(adExt, l.AdID)
	}
	type adRef struct{ ad, group, campaign uuid.UUID }
	refs := map[string]adRef{}
	rows, err := st.pool.Query(ctx,
		`SELECT external_id, id, ad_group_id, campaign_id FROM ads WHERE account_id = $1 AND external_id = ANY($2)`,
		accountID, adExt)
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var ext string
		var r adRef
		if err := rows.Scan(&ext, &r.ad, &r.group, &r.campaign); err != nil {
			rows.Close()
			return 0, err
		}
		refs[ext] = r
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	batch := &pgx.Batch{}
	for _, l := range in {
		im := toImported(l, accountID, currency)
		if r, ok := refs[l.AdID]; ok {
			im.adID, im.adGroupID, im.campaignID = &r.ad, &r.group, &r.campaign
		}
		batch.Queue(`
			INSERT INTO leads (organization_id, source, provider, external_id, account_id, campaign_id, ad_group_id, ad_id,
			                   form_id, is_organic, name, email, phone, fields, currency, lead_created_at)
			VALUES ($1, 'meta_form', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
			ON CONFLICT (organization_id, provider, external_id) DO UPDATE SET
			    campaign_id = COALESCE(EXCLUDED.campaign_id, leads.campaign_id),
			    ad_group_id = COALESCE(EXCLUDED.ad_group_id, leads.ad_group_id),
			    ad_id       = COALESCE(EXCLUDED.ad_id, leads.ad_id),
			    form_id = EXCLUDED.form_id, is_organic = EXCLUDED.is_organic,
			    name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, fields = EXCLUDED.fields,
			    updated_at = now()
			WHERE (leads.name, leads.email, leads.phone, leads.fields, leads.ad_id)
			      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.email, EXCLUDED.phone, EXCLUDED.fields, COALESCE(EXCLUDED.ad_id, leads.ad_id))
			RETURNING (xmax = 0)`,
			orgID, provider, im.externalID, im.accountID, im.campaignID, im.adGroupID, im.adID,
			im.formID, im.isOrganic, im.name, im.email, im.phone, im.fields, im.currency, im.createdAt)
	}
	res := st.pool.SendBatch(ctx, batch)
	defer res.Close()
	added := 0
	for range in {
		var inserted bool
		err := res.QueryRow().Scan(&inserted)
		if errors.Is(err, pgx.ErrNoRows) { // unchanged
			continue
		}
		if err != nil {
			return added, err
		}
		if inserted {
			added++
		}
	}
	return added, nil
}

func toImported(l ads.Lead, accountID uuid.UUID, currency string) imported {
	f := l.Fields
	if f == nil {
		f = map[string]string{}
	}
	raw, _ := json.Marshal(f)
	return imported{
		externalID: l.ExternalID, accountID: accountID, formID: l.FormID, isOrganic: l.IsOrganic,
		name: leadName(f), email: first(f, "email", "work_email"), phone: first(f, "phone_number", "phone"),
		fields: raw, currency: currency, createdAt: l.CreatedAt,
	}
}

// leadName picks the person's name from standard Meta form fields.
func leadName(f map[string]string) string {
	if n := first(f, "full_name", "name"); n != "" {
		return n
	}
	return strings.TrimSpace(f["first_name"] + " " + f["last_name"])
}

func first(f map[string]string, keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(f[k]); v != "" {
			return v
		}
	}
	return ""
}

// --- reads ---

const leadSelect = `
	SELECT l.id, l.source, l.provider::text, l.external_id, l.account_id,
	       l.campaign_id, c.name, l.ad_group_id, g.name, l.ad_id, a.name,
	       l.form_id, l.is_organic, l.name, l.email, l.phone, l.fields, l.status, l.value::float8, l.currency, l.notes,
	       l.lead_created_at, l.status_changed_at, l.won_at, l.created_at, l.updated_at
	FROM leads l
	LEFT JOIN campaigns c ON c.id = l.campaign_id
	LEFT JOIN ad_groups g ON g.id = l.ad_group_id
	LEFT JOIN ads a ON a.id = l.ad_id`

func scanLead(row pgx.Row) (Lead, error) {
	var l Lead
	var fields []byte
	err := row.Scan(&l.ID, &l.Source, &l.Provider, &l.ExternalID, &l.AccountID,
		&l.CampaignID, &l.CampaignName, &l.AdGroupID, &l.AdGroupName, &l.AdID, &l.AdName,
		&l.FormID, &l.IsOrganic, &l.Name, &l.Email, &l.Phone, &fields, &l.Status, &l.Value, &l.Currency, &l.Notes,
		&l.LeadCreatedAt, &l.StatusChangedAt, &l.WonAt, &l.CreatedAt, &l.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return l, errNotFound
	}
	if err != nil {
		return l, err
	}
	l.Fields = map[string]string{}
	if len(fields) > 0 {
		if err := json.Unmarshal(fields, &l.Fields); err != nil {
			return l, fmt.Errorf("decode fields: %w", err)
		}
	}
	return l, nil
}

func (st *Store) get(ctx context.Context, orgID, id uuid.UUID) (Lead, error) {
	return scanLead(st.pool.QueryRow(ctx, leadSelect+` WHERE l.organization_id = $1 AND l.id = $2`, orgID, id))
}

// list returns one page, newest first, and the cursor for the next page.
func (st *Store) list(ctx context.Context, orgID uuid.UUID, f Filter) ([]Lead, string, error) {
	where := []string{"l.organization_id = $1"}
	args := []any{orgID}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if f.Status != "" {
		add("l.status = ?", f.Status)
	}
	if f.CampaignID != nil {
		add("l.campaign_id = ?", *f.CampaignID)
	}
	if f.From != nil {
		add("l.lead_created_at >= ?", *f.From)
	}
	if f.To != nil {
		add("l.lead_created_at < ?", *f.To)
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q) + "%"
		add("(l.name ILIKE ? OR l.email ILIKE ? OR l.phone ILIKE ? OR l.notes ILIKE ?)", like)
	}
	if f.Cursor != "" {
		ts, id, err := parseCursor(f.Cursor)
		if err != nil {
			return nil, "", err
		}
		args = append(args, ts, id)
		where = append(where, fmt.Sprintf("(l.lead_created_at, l.id) < ($%d, $%d)", len(args)-1, len(args)))
	}
	args = append(args, f.Limit+1)
	sql := leadSelect + " WHERE " + strings.Join(where, " AND ") +
		fmt.Sprintf(" ORDER BY l.lead_created_at DESC, l.id DESC LIMIT $%d", len(args))
	rows, err := st.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := []Lead{}
	for rows.Next() {
		l, err := scanLead(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, l)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	next := ""
	if len(out) > f.Limit {
		out = out[:f.Limit]
		last := out[len(out)-1]
		next = last.LeadCreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID.String()
	}
	return out, next, nil
}

var errBadCursor = errors.New("invalid cursor")

func parseCursor(c string) (time.Time, uuid.UUID, error) {
	ts, id, ok := strings.Cut(c, "|")
	if !ok {
		return time.Time{}, uuid.Nil, errBadCursor
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return time.Time{}, uuid.Nil, errBadCursor
	}
	u, err := uuid.Parse(id)
	if err != nil {
		return time.Time{}, uuid.Nil, errBadCursor
	}
	return t, u, nil
}

// summary aggregates leads per campaign over [from, to) and joins each
// campaign's spend. Lead campaigns with spend but no leads are included, so
// campaigns that spend without producing leads show up.
func (st *Store) summary(ctx context.Context, orgID uuid.UUID, from, to time.Time) ([]SummaryRow, error) {
	rows, err := st.pool.Query(ctx, `
		WITH l AS (
		    SELECT campaign_id, count(*) AS leads,
		           count(*) FILTER (WHERE status = 'new')       AS s_new,
		           count(*) FILTER (WHERE status = 'contacted') AS s_contacted,
		           count(*) FILTER (WHERE status = 'qualified') AS s_qualified,
		           count(*) FILTER (WHERE status = 'won')       AS s_won,
		           count(*) FILTER (WHERE status = 'lost')      AS s_lost,
		           coalesce(sum(value) FILTER (WHERE status = 'won'), 0)::float8 AS won_value,
		           max(currency) AS currency
		    FROM leads
		    WHERE organization_id = $1 AND lead_created_at >= $2 AND lead_created_at < $3
		    GROUP BY campaign_id
		), s AS (
		    SELECT c.id AS campaign_id, sum(m.spend_micros)::float8 / 1e6 AS spend, max(m.currency) AS currency
		    FROM metric_facts m
		    JOIN campaigns c ON c.organization_id = m.organization_id AND c.account_id = m.account_id
		                    AND c.external_id = m.campaign_external_id
		    WHERE m.organization_id = $1 AND m.report = 'campaign_daily'
		      AND m.date >= $2::date AND m.date < $3::date
		      AND (c.objective = ANY($4) OR c.id IN (SELECT campaign_id FROM l WHERE campaign_id IS NOT NULL))
		    GROUP BY c.id
		)
		SELECT coalesce(l.campaign_id, s.campaign_id), c.name,
		       coalesce(nullif(l.currency, ''), s.currency, ''),
		       coalesce(l.leads, 0), coalesce(l.s_new, 0), coalesce(l.s_contacted, 0), coalesce(l.s_qualified, 0),
		       coalesce(l.s_won, 0), coalesce(l.s_lost, 0), coalesce(l.won_value, 0), s.spend
		FROM l FULL JOIN s ON s.campaign_id = l.campaign_id
		LEFT JOIN campaigns c ON c.id = coalesce(l.campaign_id, s.campaign_id)
		ORDER BY coalesce(l.leads, 0) DESC, s.spend DESC NULLS LAST`,
		orgID, from, to, LeadObjectives)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SummaryRow{}
	for rows.Next() {
		var r SummaryRow
		var nNew, nContacted, nQualified, nWon, nLost int
		if err := rows.Scan(&r.CampaignID, &r.CampaignName, &r.Currency, &r.Leads,
			&nNew, &nContacted, &nQualified, &nWon, &nLost, &r.WonValue, &r.Spend); err != nil {
			return nil, err
		}
		r.Won = nWon
		r.ByStatus = map[string]int{StatusNew: nNew, StatusContacted: nContacted, StatusQualified: nQualified, StatusWon: nWon, StatusLost: nLost}
		r.derive()
		out = append(out, r)
	}
	return out, rows.Err()
}

// --- writes ---

type createParams struct {
	orgID      uuid.UUID
	actorID    uuid.UUID
	accountID  *uuid.UUID
	campaignID *uuid.UUID
	name       string
	email      string
	phone      string
	status     string
	value      *float64
	currency   string
	notes      string
	createdAt  time.Time
}

func (st *Store) create(ctx context.Context, p createParams) (uuid.UUID, error) {
	var id uuid.UUID
	err := st.pool.QueryRow(ctx, `
		INSERT INTO leads (organization_id, source, account_id, campaign_id, name, email, phone, status, value, currency,
		                   notes, lead_created_at, status_changed_at, won_at, created_by)
		VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
		        CASE WHEN $7 <> 'new' THEN now() END, CASE WHEN $7 = 'won' THEN now() END, $12)
		RETURNING id`,
		p.orgID, p.accountID, p.campaignID, p.name, p.email, p.phone, p.status, p.value, p.currency, p.notes,
		p.createdAt, p.actorID).Scan(&id)
	return id, err
}

// campaignAccount returns a campaign's account and currency, scoped to the org.
func (st *Store) campaignAccount(ctx context.Context, orgID, campaignID uuid.UUID) (uuid.UUID, string, error) {
	var acct uuid.UUID
	var cur string
	err := st.pool.QueryRow(ctx, `
		SELECT c.account_id, a.currency FROM campaigns c JOIN ad_accounts a ON a.id = c.account_id
		WHERE c.organization_id = $1 AND c.id = $2`, orgID, campaignID).Scan(&acct, &cur)
	if errors.Is(err, pgx.ErrNoRows) {
		return acct, cur, errNotFound
	}
	return acct, cur, err
}

type updateParams struct {
	status     *string
	value      *float64
	clearValue bool
	notes      *string
	name       *string
	email      *string
	phone      *string
}

func (st *Store) update(ctx context.Context, orgID, id uuid.UUID, p updateParams) error {
	tag, err := st.pool.Exec(ctx, `
		UPDATE leads SET
		    status            = coalesce($3, status),
		    status_changed_at = CASE WHEN $3::text IS NOT NULL AND $3 <> status THEN now() ELSE status_changed_at END,
		    won_at            = CASE WHEN $3::text IS NULL THEN won_at
		                             WHEN $3 = 'won' THEN coalesce(won_at, now()) ELSE NULL END,
		    value             = CASE WHEN $5 THEN NULL ELSE coalesce($4, value) END,
		    notes             = coalesce($6, notes),
		    name              = coalesce($7, name),
		    email             = coalesce($8, email),
		    phone             = coalesce($9, phone),
		    updated_at        = now()
		WHERE organization_id = $1 AND id = $2`,
		orgID, id, p.status, p.value, p.clearValue, p.notes, p.name, p.email, p.phone)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	return nil
}
