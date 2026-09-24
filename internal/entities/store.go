package entities

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/platform/database"
)

// EntityBatchSize is the number of entities written per transaction.
const EntityBatchSize = 1000

// ErrInvalidEntity wraps validation failures. Nothing is written when an
// input fails validation.
var ErrInvalidEntity = errors.New("invalid entity")

// UnresolvedError reports entities that were skipped because their parent
// (account, campaign or ad group) does not exist for the organization. All
// other entities in the call were written. Sync jobs should upsert parents
// first (accounts → campaigns → ad groups → ads; creatives need only the
// account) and may treat this error as a warning.
type UnresolvedError struct {
	Entity   ads.EntityType
	Parent   ads.EntityType
	Count    int
	Examples []string // up to 5 "account/external_id" of skipped entities
}

func (e *UnresolvedError) Error() string {
	return fmt.Sprintf("skipped %d %s(s) whose %s was not found (e.g. %s)",
		e.Count, e.Entity, e.Parent, strings.Join(e.Examples, ", "))
}

// Store implements ads.Store on PostgreSQL. Entities are upserted with
// UNNEST-based multi-row statements and facts through metrics.PostgresWriter
// (COPY into a staging table + INSERT … ON CONFLICT). Every write is an
// idempotent upsert, one transaction per batch.
type Store struct {
	pool  *pgxpool.Pool
	facts *metrics.PostgresWriter
}

// NewStore returns the ads.Store used by sync jobs.
func NewStore(db *database.DB) *Store {
	return &Store{pool: db.Pool, facts: metrics.NewPostgresWriter(db.Pool)}
}

var _ ads.Store = (*Store)(nil)

var currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)

func normStatus(s ads.Status) string {
	switch s {
	case ads.StatusActive, ads.StatusPaused, ads.StatusArchived, ads.StatusDeleted:
		return string(s)
	default:
		return string(ads.StatusUnknown)
	}
}

func rawJSON(raw json.RawMessage) (string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "{}", nil
	}
	if !json.Valid(raw) {
		return "", errors.New("raw is not valid JSON")
	}
	return string(raw), nil
}

func validProvider(p ads.Provider) bool { return p == ads.ProviderMeta || p == ads.ProviderGoogle }

func batches(n, size int, fn func(lo, hi int) error) error {
	for lo := 0; lo < n; lo += size {
		if err := fn(lo, min(lo+size, n)); err != nil {
			return err
		}
	}
	return nil
}

// UpsertAccounts inserts or updates ad accounts discovered through an
// integration. sync_enabled is never changed here: new accounts start with
// syncing off until an admin enables them.
func (s *Store) UpsertAccounts(ctx context.Context, orgID, integrationID uuid.UUID, accounts []ads.Account) error {
	if len(accounts) == 0 {
		return nil
	}
	var integrationProvider string
	err := s.pool.QueryRow(ctx, `SELECT provider::text FROM integrations WHERE id = $1 AND organization_id = $2`,
		integrationID, orgID).Scan(&integrationProvider)
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("%w: integration %s not found in organization", ErrInvalidEntity, integrationID)
	}
	if err != nil {
		return err
	}

	type row struct{ provider, extID, name, currency, tz, status, raw string }
	rows := dedupe(accounts, func(a ads.Account) string { return string(a.Provider) + "\x00" + a.ExternalID })
	in := make([]row, len(rows))
	for i, a := range rows {
		if string(a.Provider) != integrationProvider {
			return fmt.Errorf("%w: account %s is %q but integration is %q", ErrInvalidEntity, a.ExternalID, a.Provider, integrationProvider)
		}
		if a.ExternalID == "" {
			return fmt.Errorf("%w: account external_id is required", ErrInvalidEntity)
		}
		cur := strings.ToUpper(strings.TrimSpace(a.Currency))
		if !currencyRe.MatchString(cur) {
			return fmt.Errorf("%w: account %s has invalid currency %q", ErrInvalidEntity, a.ExternalID, a.Currency)
		}
		if _, err := time.LoadLocation(a.Timezone); err != nil || a.Timezone == "" {
			return fmt.Errorf("%w: account %s has invalid timezone %q", ErrInvalidEntity, a.ExternalID, a.Timezone)
		}
		raw, err := rawJSON(a.Raw)
		if err != nil {
			return fmt.Errorf("%w: account %s: %v", ErrInvalidEntity, a.ExternalID, err)
		}
		in[i] = row{string(a.Provider), a.ExternalID, a.Name, cur, a.Timezone, normStatus(a.Status), raw}
	}

	return batches(len(in), EntityBatchSize, func(lo, hi int) error {
		cols := make([][]string, 7)
		for _, r := range in[lo:hi] {
			for j, v := range []string{r.provider, r.extID, r.name, r.currency, r.tz, r.status, r.raw} {
				cols[j] = append(cols[j], v)
			}
		}
		_, err := s.pool.Exec(ctx, `
INSERT INTO ad_accounts (organization_id, integration_id, provider, external_id, name, currency, timezone, status, raw)
SELECT $1, $2, i.provider::ad_provider, i.external_id, i.name, i.currency, i.timezone, i.status::ad_entity_status, i.raw::jsonb
FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
     AS i(provider, external_id, name, currency, timezone, status, raw)
ON CONFLICT (organization_id, provider, external_id) DO UPDATE SET
    integration_id = EXCLUDED.integration_id, name = EXCLUDED.name, currency = EXCLUDED.currency,
    timezone = EXCLUDED.timezone, status = EXCLUDED.status, raw = EXCLUDED.raw, updated_at = now()
WHERE (ad_accounts.integration_id, ad_accounts.name, ad_accounts.currency, ad_accounts.timezone, ad_accounts.status, ad_accounts.raw)
      IS DISTINCT FROM
      (EXCLUDED.integration_id, EXCLUDED.name, EXCLUDED.currency, EXCLUDED.timezone, EXCLUDED.status, EXCLUDED.raw)`,
			orgID, integrationID, cols[0], cols[1], cols[2], cols[3], cols[4], cols[5], cols[6])
		if err != nil {
			return fmt.Errorf("upsert ad accounts: %w", err)
		}
		return nil
	})
}

// UpsertCampaigns inserts or updates campaigns. Campaigns whose account is
// unknown are skipped and reported with *UnresolvedError.
func (s *Store) UpsertCampaigns(ctx context.Context, orgID uuid.UUID, campaigns []ads.Campaign) error {
	rows := dedupe(campaigns, func(c ads.Campaign) string {
		return string(c.Provider) + "\x00" + c.AccountExternalID + "\x00" + c.ExternalID
	})
	for _, c := range rows {
		if err := checkEntity(c.Provider, c.AccountExternalID, c.ExternalID, c.Raw); err != nil {
			return fmt.Errorf("%w: campaign %s: %v", ErrInvalidEntity, c.ExternalID, err)
		}
		if negative(c.DailyBudget) || negative(c.LifetimeBudget) {
			return fmt.Errorf("%w: campaign %s: budget must not be negative", ErrInvalidEntity, c.ExternalID)
		}
	}
	unresolved := &UnresolvedError{Entity: ads.EntityCampaign, Parent: ads.EntityAccount}
	err := batches(len(rows), EntityBatchSize, func(lo, hi int) error {
		batch := rows[lo:hi]
		return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
			accts, err := resolveAccounts(ctx, tx, orgID, batch, func(c ads.Campaign) (ads.Provider, string) { return c.Provider, c.AccountExternalID })
			if err != nil {
				return err
			}
			var (
				accountIDs                    []uuid.UUID
				provider, ext, name, status   []string
				objective, raw                []string
				dailyBudgets, lifetimeBudgets []*int64
			)
			for _, c := range batch {
				acct, ok := accts[acctKey{c.Provider, c.AccountExternalID}]
				if !ok {
					unresolved.add(c.AccountExternalID + "/" + c.ExternalID)
					continue
				}
				r, _ := rawJSON(c.Raw)
				accountIDs = append(accountIDs, acct)
				provider = append(provider, string(c.Provider))
				ext = append(ext, c.ExternalID)
				name = append(name, c.Name)
				status = append(status, normStatus(c.Status))
				objective = append(objective, c.Objective)
				dailyBudgets = append(dailyBudgets, c.DailyBudget)
				lifetimeBudgets = append(lifetimeBudgets, c.LifetimeBudget)
				raw = append(raw, r)
			}
			if len(accountIDs) == 0 {
				return nil
			}
			_, err = tx.Exec(ctx, `
INSERT INTO campaigns (organization_id, account_id, provider, external_id, name, status, objective,
                       daily_budget_micros, lifetime_budget_micros, raw)
SELECT $1, i.account_id, i.provider::ad_provider, i.external_id, i.name, i.status::ad_entity_status, i.objective,
       i.daily, i.lifetime, i.raw::jsonb
FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::bigint[], $9::bigint[], $10::text[])
     AS i(account_id, provider, external_id, name, status, objective, daily, lifetime, raw)
ON CONFLICT (account_id, external_id) DO UPDATE SET
    name = EXCLUDED.name, status = EXCLUDED.status, objective = EXCLUDED.objective,
    daily_budget_micros = EXCLUDED.daily_budget_micros, lifetime_budget_micros = EXCLUDED.lifetime_budget_micros,
    raw = EXCLUDED.raw, updated_at = now()
WHERE (campaigns.name, campaigns.status, campaigns.objective, campaigns.daily_budget_micros,
       campaigns.lifetime_budget_micros, campaigns.raw)
      IS DISTINCT FROM
      (EXCLUDED.name, EXCLUDED.status, EXCLUDED.objective, EXCLUDED.daily_budget_micros,
       EXCLUDED.lifetime_budget_micros, EXCLUDED.raw)`,
				orgID, accountIDs, provider, ext, name, status, objective, dailyBudgets, lifetimeBudgets, raw)
			if err != nil {
				return fmt.Errorf("upsert campaigns: %w", err)
			}
			return nil
		})
	})
	return unresolved.or(err)
}

// UpsertAdGroups inserts or updates ad groups (Meta ad sets). Ad groups whose
// campaign is unknown are skipped and reported with *UnresolvedError.
func (s *Store) UpsertAdGroups(ctx context.Context, orgID uuid.UUID, adGroups []ads.AdGroup) error {
	rows := dedupe(adGroups, func(g ads.AdGroup) string {
		return string(g.Provider) + "\x00" + g.AccountExternalID + "\x00" + g.ExternalID
	})
	for _, g := range rows {
		if err := checkEntity(g.Provider, g.AccountExternalID, g.ExternalID, g.Raw); err != nil {
			return fmt.Errorf("%w: ad group %s: %v", ErrInvalidEntity, g.ExternalID, err)
		}
		if negative(g.DailyBudget) {
			return fmt.Errorf("%w: ad group %s: budget must not be negative", ErrInvalidEntity, g.ExternalID)
		}
	}
	unresolved := &UnresolvedError{Entity: ads.EntityAdGroup, Parent: ads.EntityCampaign}
	err := batches(len(rows), EntityBatchSize, func(lo, hi int) error {
		batch := rows[lo:hi]
		return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
			accts, err := resolveAccounts(ctx, tx, orgID, batch, func(g ads.AdGroup) (ads.Provider, string) { return g.Provider, g.AccountExternalID })
			if err != nil {
				return err
			}
			campaignRefs := map[uuid.UUID][]string{}
			for _, g := range batch {
				if acct, ok := accts[acctKey{g.Provider, g.AccountExternalID}]; ok {
					campaignRefs[acct] = append(campaignRefs[acct], g.CampaignExternalID)
				}
			}
			camps, err := resolveChildren(ctx, tx, "campaigns", campaignRefs)
			if err != nil {
				return err
			}
			var (
				accountIDs, campaignIDs     []uuid.UUID
				provider, ext, name, status []string
				raw                         []string
				dailyBudgets                []*int64
			)
			for _, g := range batch {
				acct, ok := accts[acctKey{g.Provider, g.AccountExternalID}]
				camp, ok2 := camps[childKey{acct, g.CampaignExternalID}]
				if !ok || !ok2 {
					unresolved.add(g.AccountExternalID + "/" + g.ExternalID)
					continue
				}
				r, _ := rawJSON(g.Raw)
				accountIDs = append(accountIDs, acct)
				campaignIDs = append(campaignIDs, camp.id)
				provider = append(provider, string(g.Provider))
				ext = append(ext, g.ExternalID)
				name = append(name, g.Name)
				status = append(status, normStatus(g.Status))
				dailyBudgets = append(dailyBudgets, g.DailyBudget)
				raw = append(raw, r)
			}
			if len(accountIDs) == 0 {
				return nil
			}
			_, err = tx.Exec(ctx, `
INSERT INTO ad_groups (organization_id, account_id, campaign_id, provider, external_id, name, status, daily_budget_micros, raw)
SELECT $1, i.account_id, i.campaign_id, i.provider::ad_provider, i.external_id, i.name, i.status::ad_entity_status, i.daily, i.raw::jsonb
FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::text[], $7::text[], $8::bigint[], $9::text[])
     AS i(account_id, campaign_id, provider, external_id, name, status, daily, raw)
ON CONFLICT (account_id, external_id) DO UPDATE SET
    campaign_id = EXCLUDED.campaign_id, name = EXCLUDED.name, status = EXCLUDED.status,
    daily_budget_micros = EXCLUDED.daily_budget_micros, raw = EXCLUDED.raw, updated_at = now()
WHERE (ad_groups.campaign_id, ad_groups.name, ad_groups.status, ad_groups.daily_budget_micros, ad_groups.raw)
      IS DISTINCT FROM
      (EXCLUDED.campaign_id, EXCLUDED.name, EXCLUDED.status, EXCLUDED.daily_budget_micros, EXCLUDED.raw)`,
				orgID, accountIDs, campaignIDs, provider, ext, name, status, dailyBudgets, raw)
			if err != nil {
				return fmt.Errorf("upsert ad groups: %w", err)
			}
			return nil
		})
	})
	return unresolved.or(err)
}

// UpsertAds inserts or updates ads. The ad's campaign is taken from its ad
// group. Ads whose ad group is unknown are skipped and reported with
// *UnresolvedError. The creative is linked by external ID and may be synced
// later.
func (s *Store) UpsertAds(ctx context.Context, orgID uuid.UUID, in []ads.Ad) error {
	rows := dedupe(in, func(a ads.Ad) string {
		return string(a.Provider) + "\x00" + a.AccountExternalID + "\x00" + a.ExternalID
	})
	for _, a := range rows {
		if err := checkEntity(a.Provider, a.AccountExternalID, a.ExternalID, a.Raw); err != nil {
			return fmt.Errorf("%w: ad %s: %v", ErrInvalidEntity, a.ExternalID, err)
		}
	}
	unresolved := &UnresolvedError{Entity: ads.EntityAd, Parent: ads.EntityAdGroup}
	err := batches(len(rows), EntityBatchSize, func(lo, hi int) error {
		batch := rows[lo:hi]
		return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
			accts, err := resolveAccounts(ctx, tx, orgID, batch, func(a ads.Ad) (ads.Provider, string) { return a.Provider, a.AccountExternalID })
			if err != nil {
				return err
			}
			groupRefs := map[uuid.UUID][]string{}
			for _, a := range batch {
				if acct, ok := accts[acctKey{a.Provider, a.AccountExternalID}]; ok {
					groupRefs[acct] = append(groupRefs[acct], a.AdGroupExternalID)
				}
			}
			groups, err := resolveChildren(ctx, tx, "ad_groups", groupRefs)
			if err != nil {
				return err
			}
			var (
				accountIDs, campaignIDs, groupIDs []uuid.UUID
				provider, ext, name, status       []string
				creative, raw                     []string
			)
			for _, a := range batch {
				acct, ok := accts[acctKey{a.Provider, a.AccountExternalID}]
				g, ok2 := groups[childKey{acct, a.AdGroupExternalID}]
				if !ok || !ok2 {
					unresolved.add(a.AccountExternalID + "/" + a.ExternalID)
					continue
				}
				r, _ := rawJSON(a.Raw)
				accountIDs = append(accountIDs, acct)
				campaignIDs = append(campaignIDs, g.parent)
				groupIDs = append(groupIDs, g.id)
				provider = append(provider, string(a.Provider))
				ext = append(ext, a.ExternalID)
				name = append(name, a.Name)
				status = append(status, normStatus(a.Status))
				creative = append(creative, a.CreativeExternalID)
				raw = append(raw, r)
			}
			if len(accountIDs) == 0 {
				return nil
			}
			_, err = tx.Exec(ctx, `
INSERT INTO ads (organization_id, account_id, campaign_id, ad_group_id, provider, external_id, name, status,
                 creative_external_id, raw)
SELECT $1, i.account_id, i.campaign_id, i.ad_group_id, i.provider::ad_provider, i.external_id, i.name,
       i.status::ad_entity_status, i.creative, i.raw::jsonb
FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
     AS i(account_id, campaign_id, ad_group_id, provider, external_id, name, status, creative, raw)
ON CONFLICT (account_id, external_id) DO UPDATE SET
    campaign_id = EXCLUDED.campaign_id, ad_group_id = EXCLUDED.ad_group_id, name = EXCLUDED.name,
    status = EXCLUDED.status, creative_external_id = EXCLUDED.creative_external_id, raw = EXCLUDED.raw,
    updated_at = now()
WHERE (ads.campaign_id, ads.ad_group_id, ads.name, ads.status, ads.creative_external_id, ads.raw)
      IS DISTINCT FROM
      (EXCLUDED.campaign_id, EXCLUDED.ad_group_id, EXCLUDED.name, EXCLUDED.status, EXCLUDED.creative_external_id, EXCLUDED.raw)`,
				orgID, accountIDs, campaignIDs, groupIDs, provider, ext, name, status, creative, raw)
			if err != nil {
				return fmt.Errorf("upsert ads: %w", err)
			}
			return nil
		})
	})
	return unresolved.or(err)
}

// UpsertCreatives inserts or updates creatives. Creatives whose account is
// unknown are skipped and reported with *UnresolvedError.
func (s *Store) UpsertCreatives(ctx context.Context, orgID uuid.UUID, creatives []ads.Creative) error {
	rows := dedupe(creatives, func(c ads.Creative) string {
		return string(c.Provider) + "\x00" + c.AccountExternalID + "\x00" + c.ExternalID
	})
	for _, c := range rows {
		if err := checkEntity(c.Provider, c.AccountExternalID, c.ExternalID, c.Raw); err != nil {
			return fmt.Errorf("%w: creative %s: %v", ErrInvalidEntity, c.ExternalID, err)
		}
	}
	unresolved := &UnresolvedError{Entity: ads.EntityCreative, Parent: ads.EntityAccount}
	err := batches(len(rows), EntityBatchSize, func(lo, hi int) error {
		batch := rows[lo:hi]
		return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
			accts, err := resolveAccounts(ctx, tx, orgID, batch, func(c ads.Creative) (ads.Provider, string) { return c.Provider, c.AccountExternalID })
			if err != nil {
				return err
			}
			var (
				accountIDs                      []uuid.UUID
				provider, ext, name, typ, thumb []string
				raw                             []string
			)
			for _, c := range batch {
				acct, ok := accts[acctKey{c.Provider, c.AccountExternalID}]
				if !ok {
					unresolved.add(c.AccountExternalID + "/" + c.ExternalID)
					continue
				}
				r, _ := rawJSON(c.Raw)
				accountIDs = append(accountIDs, acct)
				provider = append(provider, string(c.Provider))
				ext = append(ext, c.ExternalID)
				name = append(name, c.Name)
				typ = append(typ, c.Type)
				thumb = append(thumb, c.ThumbnailURL)
				raw = append(raw, r)
			}
			if len(accountIDs) == 0 {
				return nil
			}
			_, err = tx.Exec(ctx, `
INSERT INTO creatives (organization_id, account_id, provider, external_id, name, type, thumbnail_url, raw)
SELECT $1, i.account_id, i.provider::ad_provider, i.external_id, i.name, i.type, i.thumb, i.raw::jsonb
FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
     AS i(account_id, provider, external_id, name, type, thumb, raw)
ON CONFLICT (account_id, external_id) DO UPDATE SET
    name = EXCLUDED.name, type = EXCLUDED.type, thumbnail_url = EXCLUDED.thumbnail_url,
    raw = EXCLUDED.raw, updated_at = now()
WHERE (creatives.name, creatives.type, creatives.thumbnail_url, creatives.raw)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.type, EXCLUDED.thumbnail_url, EXCLUDED.raw)`,
				orgID, accountIDs, provider, ext, name, typ, thumb, raw)
			if err != nil {
				return fmt.Errorf("upsert creatives: %w", err)
			}
			return nil
		})
	})
	return unresolved.or(err)
}

// UpsertMetricFacts delegates to metrics.PostgresWriter; see its
// documentation for validation rules.
func (s *Store) UpsertMetricFacts(ctx context.Context, orgID uuid.UUID, facts []ads.MetricFact) error {
	return s.facts.UpsertMetricFacts(ctx, orgID, facts)
}

// MarkSynced records that scope (e.g. "entities", "metrics:campaign_hourly")
// completed for an account at `at`. The timestamp never moves backwards.
func (s *Store) MarkSynced(ctx context.Context, orgID uuid.UUID, provider ads.Provider, accountExternalID, scope string, at time.Time) error {
	if scope == "" {
		return fmt.Errorf("%w: scope is required", ErrInvalidEntity)
	}
	tag, err := s.pool.Exec(ctx, `
INSERT INTO ad_account_sync_state (account_id, scope, organization_id, provider, last_synced_at)
SELECT id, $4, organization_id, provider, $5
FROM ad_accounts
WHERE organization_id = $1 AND provider = $2::ad_provider AND external_id = $3
ON CONFLICT (account_id, scope) DO UPDATE SET
    last_synced_at = GREATEST(ad_account_sync_state.last_synced_at, EXCLUDED.last_synced_at),
    updated_at = now()`,
		orgID, string(provider), accountExternalID, scope, at)
	if err != nil {
		return fmt.Errorf("mark synced: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: unknown %s ad account %q", ErrInvalidEntity, provider, accountExternalID)
	}
	return nil
}

// --- helpers ---

func checkEntity(p ads.Provider, accountExtID, extID string, raw json.RawMessage) error {
	if !validProvider(p) {
		return fmt.Errorf("unknown provider %q", p)
	}
	if accountExtID == "" || extID == "" {
		return errors.New("account_external_id and external_id are required")
	}
	_, err := rawJSON(raw)
	return err
}

func negative(v *int64) bool { return v != nil && *v < 0 }

// dedupe keeps the last occurrence of each key, preserving first-seen order.
func dedupe[T any](in []T, key func(T) string) []T {
	idx := make(map[string]int, len(in))
	out := make([]T, 0, len(in))
	for _, v := range in {
		k := key(v)
		if i, ok := idx[k]; ok {
			out[i] = v
			continue
		}
		idx[k] = len(out)
		out = append(out, v)
	}
	return out
}

func (e *UnresolvedError) add(example string) {
	e.Count++
	if len(e.Examples) < 5 {
		e.Examples = append(e.Examples, example)
	}
}

func (e *UnresolvedError) or(err error) error {
	if err != nil {
		return err
	}
	if e.Count > 0 {
		return e
	}
	return nil
}

type acctKey struct {
	provider ads.Provider
	extID    string
}

func resolveAccounts[T any](ctx context.Context, tx pgx.Tx, orgID uuid.UUID, items []T, ref func(T) (ads.Provider, string)) (map[acctKey]uuid.UUID, error) {
	var providers, ids []string
	seen := map[acctKey]bool{}
	for _, it := range items {
		p, id := ref(it)
		k := acctKey{p, id}
		if !seen[k] {
			seen[k] = true
			providers = append(providers, string(p))
			ids = append(ids, id)
		}
	}
	rows, err := tx.Query(ctx, `
SELECT a.provider::text, a.external_id, a.id
FROM ad_accounts a
JOIN unnest($2::text[], $3::text[]) AS i(provider, external_id)
  ON a.provider = i.provider::ad_provider AND a.external_id = i.external_id
WHERE a.organization_id = $1`, orgID, providers, ids)
	if err != nil {
		return nil, fmt.Errorf("resolve accounts: %w", err)
	}
	defer rows.Close()
	out := map[acctKey]uuid.UUID{}
	for rows.Next() {
		var p, ext string
		var id uuid.UUID
		if err := rows.Scan(&p, &ext, &id); err != nil {
			return nil, err
		}
		out[acctKey{ads.Provider(p), ext}] = id
	}
	return out, rows.Err()
}

type childKey struct {
	account uuid.UUID
	extID   string
}

type childRef struct {
	id     uuid.UUID
	parent uuid.UUID // campaign_id for ad groups; zero for campaigns
}

// resolveChildren maps (account_id, external_id) to IDs in table, which is
// "campaigns" or "ad_groups" (fixed strings, never user input).
func resolveChildren(ctx context.Context, tx pgx.Tx, table string, refs map[uuid.UUID][]string) (map[childKey]childRef, error) {
	var accounts []uuid.UUID
	var ids []string
	for acct, exts := range refs {
		for _, e := range exts {
			accounts = append(accounts, acct)
			ids = append(ids, e)
		}
	}
	parentCol := "NULL::uuid"
	if table == "ad_groups" {
		parentCol = "t.campaign_id"
	}
	out := map[childKey]childRef{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := tx.Query(ctx, `
SELECT DISTINCT t.account_id, t.external_id, t.id, `+parentCol+`
FROM `+table+` t
JOIN unnest($1::uuid[], $2::text[]) AS i(account_id, external_id)
  ON t.account_id = i.account_id AND t.external_id = i.external_id`, accounts, ids)
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", table, err)
	}
	defer rows.Close()
	for rows.Next() {
		var k childKey
		var r childRef
		var parent *uuid.UUID
		if err := rows.Scan(&k.account, &k.extID, &r.id, &parent); err != nil {
			return nil, err
		}
		if parent != nil {
			r.parent = *parent
		}
		out[k] = r
	}
	return out, rows.Err()
}
