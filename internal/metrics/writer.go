package metrics

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/reports"
)

// FactBatchSize is the number of facts written per transaction.
const FactBatchSize = 5000

// ErrInvalidFact wraps validation failures of incoming facts. Nothing is
// written when validation fails.
var ErrInvalidFact = errors.New("invalid metric fact")

// PostgresWriter upserts facts into metric_facts. Safe for concurrent use.
type PostgresWriter struct {
	pool *pgxpool.Pool

	mu         sync.Mutex
	partitions map[string]bool // "YYYY-MM" months known to have a partition
}

func NewPostgresWriter(pool *pgxpool.Pool) *PostgresWriter {
	return &PostgresWriter{pool: pool, partitions: map[string]bool{}}
}

var _ Writer = (*PostgresWriter)(nil)

type accountKey struct {
	provider   ads.Provider
	externalID string
}

type accountInfo struct {
	id       uuid.UUID
	currency string
}

type factKey struct {
	account uuid.UUID
	report  string
	date    string
	hour    int16 // -1 for daily
	dims    [10]string
}

type stagedFact struct {
	fact    *ads.MetricFact
	account accountInfo
	date    time.Time
}

// UpsertMetricFacts validates facts, resolves their accounts within orgID and
// upserts them in batches of FactBatchSize, one transaction per batch. It is
// idempotent: writing the same facts again leaves the table unchanged, and a
// fact with the same key but new measures replaces the old values (providers
// restate recent days as conversions are attributed).
//
// Validation runs before anything is written: every fact must name a
// registered report, match that report's grain (hour set iff hourly), set no
// dimension the report is not keyed by, and belong to a known ad account of
// the organization. Duplicate keys within the call are collapsed, last wins.
func (w *PostgresWriter) UpsertMetricFacts(ctx context.Context, orgID uuid.UUID, facts []ads.MetricFact) error {
	if len(facts) == 0 {
		return nil
	}
	accounts, err := w.resolveAccounts(ctx, orgID, facts)
	if err != nil {
		return err
	}

	staged := make([]stagedFact, 0, len(facts))
	index := make(map[factKey]int, len(facts))
	months := map[string]time.Time{}
	for i := range facts {
		f := &facts[i]
		d, err := validateFact(f)
		if err != nil {
			return fmt.Errorf("%w: fact %d (%s %s %s): %v", ErrInvalidFact, i, f.Report, f.AccountExternalID, f.Date, err)
		}
		acct := accounts[accountKey{f.Provider, f.AccountExternalID}]
		k := keyOf(acct.id, f)
		if j, dup := index[k]; dup {
			staged[j] = stagedFact{fact: f, account: acct, date: d}
			continue
		}
		index[k] = len(staged)
		staged = append(staged, stagedFact{fact: f, account: acct, date: d})
		months[d.Format("2006-01")] = d
	}

	if err := w.ensurePartitions(ctx, months); err != nil {
		return err
	}
	for start := 0; start < len(staged); start += FactBatchSize {
		end := min(start+FactBatchSize, len(staged))
		if err := w.writeBatch(ctx, orgID, staged[start:end]); err != nil {
			return err
		}
	}
	return nil
}

func validateFact(f *ads.MetricFact) (time.Time, error) {
	def, ok := reports.Get(f.Report)
	if !ok {
		return time.Time{}, fmt.Errorf("unknown report %q", f.Report)
	}
	d, err := time.Parse("2006-01-02", f.Date)
	if err != nil {
		return time.Time{}, fmt.Errorf("date must be YYYY-MM-DD")
	}
	switch def.Grain {
	case ads.GrainHour:
		if f.Hour == nil || *f.Hour < 0 || *f.Hour > 23 {
			return time.Time{}, fmt.Errorf("hourly report requires hour 0–23")
		}
	default:
		if f.Hour != nil {
			return time.Time{}, fmt.Errorf("daily report must not set hour")
		}
	}
	for _, dv := range []struct {
		dim ads.Dimension
		val string
	}{
		{ads.DimCampaign, f.CampaignExternalID},
		{ads.DimAdGroup, f.AdGroupExternalID},
		{ads.DimAd, f.AdExternalID},
		{ads.DimCreative, f.CreativeExternalID},
		{ads.DimCountry, f.Country},
		{ads.DimDevice, f.Device},
		{ads.DimPlacement, f.Placement},
		{ads.DimPublisherPlatform, f.PublisherPlatform},
		{ads.DimKeyword, f.Keyword},
		{ads.DimSearchTerm, f.SearchTerm},
	} {
		if dv.val != "" && !reports.HasDimension(def, dv.dim) {
			return time.Time{}, fmt.Errorf("report %s is not keyed by %s", def.Name, dv.dim)
		}
	}
	if f.Impressions < 0 || f.Clicks < 0 || f.Spend < 0 || f.Conversions < 0 || f.ConversionValue < 0 {
		return time.Time{}, fmt.Errorf("measures must not be negative")
	}
	if len(f.ProviderData) > 0 && !json.Valid(f.ProviderData) {
		return time.Time{}, fmt.Errorf("provider_data is not valid JSON")
	}
	return d, nil
}

func keyOf(account uuid.UUID, f *ads.MetricFact) factKey {
	h := int16(-1)
	if f.Hour != nil {
		h = *f.Hour
	}
	return factKey{account: account, report: f.Report, date: f.Date, hour: h, dims: [10]string{
		f.CampaignExternalID, f.AdGroupExternalID, f.AdExternalID, f.CreativeExternalID,
		f.Country, f.Device, f.Placement, f.PublisherPlatform, f.Keyword, f.SearchTerm,
	}}
}

func (w *PostgresWriter) resolveAccounts(ctx context.Context, orgID uuid.UUID, facts []ads.MetricFact) (map[accountKey]accountInfo, error) {
	wanted := map[ads.Provider][]string{}
	seen := map[accountKey]bool{}
	for _, f := range facts {
		k := accountKey{f.Provider, f.AccountExternalID}
		if !seen[k] {
			seen[k] = true
			wanted[f.Provider] = append(wanted[f.Provider], f.AccountExternalID)
		}
	}
	out := make(map[accountKey]accountInfo, len(seen))
	for provider, ids := range wanted {
		rows, err := w.pool.Query(ctx, `
SELECT external_id, id, currency FROM ad_accounts
WHERE organization_id = $1 AND provider = $2::ad_provider AND external_id = ANY($3::text[])`,
			orgID, string(provider), ids)
		if err != nil {
			return nil, fmt.Errorf("resolve ad accounts: %w", err)
		}
		for rows.Next() {
			var ext string
			var info accountInfo
			if err := rows.Scan(&ext, &info.id, &info.currency); err != nil {
				rows.Close()
				return nil, err
			}
			out[accountKey{provider, ext}] = info
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	for k := range seen {
		if _, ok := out[k]; !ok {
			return nil, fmt.Errorf("%w: unknown %s ad account %q (upsert accounts first)", ErrInvalidFact, k.provider, k.externalID)
		}
	}
	return out, nil
}

func (w *PostgresWriter) ensurePartitions(ctx context.Context, months map[string]time.Time) error {
	for m, d := range months {
		w.mu.Lock()
		known := w.partitions[m]
		w.mu.Unlock()
		if known {
			continue
		}
		// Runs in its own short transaction so the advisory lock taken by the
		// function is not held for the duration of a batch.
		if _, err := w.pool.Exec(ctx, `SELECT metric_facts_ensure_partition($1::date)`, d.Format("2006-01-02")); err != nil {
			return fmt.Errorf("ensure metric_facts partition for %s: %w", m, err)
		}
		w.mu.Lock()
		w.partitions[m] = true
		w.mu.Unlock()
	}
	return nil
}

var stageColumns = []string{
	"organization_id", "account_id", "provider", "report", "date", "hour",
	"campaign_external_id", "ad_group_external_id", "ad_external_id", "creative_external_id",
	"country", "device", "placement", "publisher_platform", "keyword", "search_term",
	"currency", "impressions", "reach", "clicks", "spend_micros", "conversions", "conversion_value_micros",
	"provider_data",
}

const createStage = `
CREATE TEMP TABLE metric_facts_stage (
    organization_id uuid, account_id uuid, provider text, report text, date date, hour smallint,
    campaign_external_id text, ad_group_external_id text, ad_external_id text, creative_external_id text,
    country text, device text, placement text, publisher_platform text, keyword text, search_term text,
    currency text, impressions bigint, reach bigint, clicks bigint, spend_micros bigint,
    conversions float8, conversion_value_micros bigint, provider_data text
) ON COMMIT DROP`

// The WHERE clause skips rows whose values did not change, so re-syncing
// identical data creates no dead tuples and keeps updated_at meaningful.
const upsertFromStage = `
INSERT INTO metric_facts (
    organization_id, account_id, provider, report, date, hour,
    campaign_external_id, ad_group_external_id, ad_external_id, creative_external_id,
    country, device, placement, publisher_platform, keyword, search_term,
    currency, impressions, reach, clicks, spend_micros, conversions, conversion_value_micros, provider_data)
SELECT organization_id, account_id, provider::ad_provider, report, date, hour,
    campaign_external_id, ad_group_external_id, ad_external_id, creative_external_id,
    country, device, placement, publisher_platform, keyword, search_term,
    currency, impressions, reach, clicks, spend_micros, conversions, conversion_value_micros, provider_data::jsonb
FROM metric_facts_stage
ON CONFLICT (account_id, report, date, dims_hash) DO UPDATE SET
    currency = EXCLUDED.currency,
    impressions = EXCLUDED.impressions,
    reach = EXCLUDED.reach,
    clicks = EXCLUDED.clicks,
    spend_micros = EXCLUDED.spend_micros,
    conversions = EXCLUDED.conversions,
    conversion_value_micros = EXCLUDED.conversion_value_micros,
    provider_data = EXCLUDED.provider_data,
    updated_at = now()
WHERE (metric_facts.currency, metric_facts.impressions, metric_facts.reach, metric_facts.clicks,
       metric_facts.spend_micros, metric_facts.conversions, metric_facts.conversion_value_micros,
       metric_facts.provider_data)
      IS DISTINCT FROM
      (EXCLUDED.currency, EXCLUDED.impressions, EXCLUDED.reach, EXCLUDED.clicks,
       EXCLUDED.spend_micros, EXCLUDED.conversions, EXCLUDED.conversion_value_micros,
       EXCLUDED.provider_data)`

func (w *PostgresWriter) writeBatch(ctx context.Context, orgID uuid.UUID, batch []stagedFact) error {
	return pgx.BeginFunc(ctx, w.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, createStage); err != nil {
			return fmt.Errorf("create fact stage: %w", err)
		}
		_, err := tx.CopyFrom(ctx, pgx.Identifier{"metric_facts_stage"}, stageColumns,
			pgx.CopyFromSlice(len(batch), func(i int) ([]any, error) {
				s := batch[i]
				f := s.fact
				var providerData *string
				if len(f.ProviderData) > 0 {
					v := string(f.ProviderData)
					providerData = &v
				}
				return []any{
					orgID, s.account.id, string(f.Provider), f.Report, s.date, f.Hour,
					f.CampaignExternalID, f.AdGroupExternalID, f.AdExternalID, f.CreativeExternalID,
					f.Country, f.Device, f.Placement, f.PublisherPlatform, f.Keyword, f.SearchTerm,
					s.account.currency, f.Impressions, f.Reach, f.Clicks, f.Spend, f.Conversions, f.ConversionValue,
					providerData,
				}, nil
			}))
		if err != nil {
			return fmt.Errorf("copy facts: %w", err)
		}
		if _, err := tx.Exec(ctx, upsertFromStage); err != nil {
			return fmt.Errorf("upsert facts: %w", err)
		}
		return nil
	})
}
