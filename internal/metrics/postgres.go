package metrics

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iamv1n/adwise/internal/ads"
)

// PostgresRepository implements Repository over the metric_facts table.
type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

var _ Repository = (*PostgresRepository)(nil)

// fieldExpr maps group-by fields to SQL expressions. Only these fixed
// expressions are ever interpolated into queries.
var fieldExpr = map[Field]string{
	FieldDate:              "date",
	FieldHour:              "coalesce(hour, 0)::int",
	FieldWeekday:           "extract(isodow FROM date)::int",
	FieldCurrency:          "currency",
	FieldAccount:           "account_id",
	FieldProvider:          "provider::text",
	FieldCampaign:          "campaign_external_id",
	FieldAdGroup:           "ad_group_external_id",
	FieldAd:                "ad_external_id",
	FieldCreative:          "creative_external_id",
	FieldCountry:           "country",
	FieldDevice:            "device",
	FieldPlacement:         "placement",
	FieldPublisherPlatform: "publisher_platform",
	FieldKeyword:           "keyword",
	FieldSearchTerm:        "search_term",
}

// BuildAggregateSQL renders the SQL and arguments for q. Exposed for EXPLAIN
// tooling and tests.
func BuildAggregateSQL(q AggregateQuery) (string, []any, error) {
	f := q.Filter
	if f.Report == "" {
		return "", nil, fmt.Errorf("metrics: report is required")
	}
	if f.From.IsZero() || f.To.IsZero() {
		return "", nil, fmt.Errorf("metrics: date range is required")
	}

	var sb strings.Builder
	args := []any{f.OrganizationID, f.Report, f.From.Format("2006-01-02"), f.To.Format("2006-01-02")}
	arg := func(v any) string {
		args = append(args, v)
		return "$" + strconv.Itoa(len(args))
	}

	sb.WriteString("SELECT ")
	for _, g := range q.GroupBy {
		expr, ok := fieldExpr[g]
		if !ok {
			return "", nil, fmt.Errorf("metrics: unknown group-by field %q", g)
		}
		sb.WriteString(expr)
		sb.WriteString(", ")
	}
	sb.WriteString(`coalesce(sum(impressions), 0)::bigint, coalesce(sum(clicks), 0)::bigint,
       coalesce(sum(spend_micros), 0)::bigint, coalesce(sum(conversions), 0)::float8,
       coalesce(sum(conversion_value_micros), 0)::bigint
FROM metric_facts
WHERE organization_id = $1 AND report = $2 AND date >= $3::date AND date <= $4::date`)

	if len(f.AccountIDs) > 0 {
		sb.WriteString(" AND account_id = ANY(" + arg(f.AccountIDs) + "::uuid[])")
	}
	if f.Provider != "" {
		sb.WriteString(" AND provider = " + arg(string(f.Provider)) + "::ad_provider")
	}
	if f.Currency != "" {
		sb.WriteString(" AND currency = " + arg(f.Currency))
	}
	for _, in := range []struct {
		col string
		ids []string
	}{
		{"campaign_external_id", f.CampaignExternalIDs},
		{"ad_group_external_id", f.AdGroupExternalIDs},
		{"ad_external_id", f.AdExternalIDs},
		{"creative_external_id", f.CreativeExternalIDs},
	} {
		if len(in.ids) > 0 {
			sb.WriteString(" AND " + in.col + " = ANY(" + arg(in.ids) + "::text[])")
		}
	}

	if n := len(q.GroupBy); n > 0 {
		pos := make([]string, n)
		for i := range pos {
			pos[i] = strconv.Itoa(i + 1)
		}
		list := strings.Join(pos, ", ")
		sb.WriteString("\nGROUP BY " + list + "\nORDER BY " + list)
	}
	return sb.String(), args, nil
}

func (r *PostgresRepository) Aggregate(ctx context.Context, q AggregateQuery) ([]Row, error) {
	sql, args, err := BuildAggregateSQL(q)
	if err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("aggregate metric facts: %w", err)
	}
	defer rows.Close()

	var out []Row
	for rows.Next() {
		var row Row
		dest := make([]any, 0, len(q.GroupBy)+5)
		var provider string
		for _, g := range q.GroupBy {
			dest = append(dest, keyDest(&row.Key, g, &provider))
		}
		dest = append(dest, &row.Impressions, &row.Clicks, &row.SpendMicros, &row.Conversions, &row.ConversionValueMicros)
		if err := rows.Scan(dest...); err != nil {
			return nil, fmt.Errorf("scan metric aggregate: %w", err)
		}
		row.Provider = ads.Provider(provider)
		out = append(out, row)
	}
	return out, rows.Err()
}

func keyDest(k *Key, f Field, provider *string) any {
	switch f {
	case FieldDate:
		return &k.Date
	case FieldHour:
		return &k.Hour
	case FieldWeekday:
		return &k.Weekday
	case FieldCurrency:
		return &k.Currency
	case FieldAccount:
		return &k.AccountID
	case FieldProvider:
		return provider
	case FieldCampaign:
		return &k.CampaignID
	case FieldAdGroup:
		return &k.AdGroupID
	case FieldAd:
		return &k.AdID
	case FieldCreative:
		return &k.CreativeID
	case FieldCountry:
		return &k.Country
	case FieldDevice:
		return &k.Device
	case FieldPlacement:
		return &k.Placement
	case FieldPublisherPlatform:
		return &k.PublisherPlatform
	case FieldKeyword:
		return &k.Keyword
	case FieldSearchTerm:
		return &k.SearchTerm
	}
	return nil
}

// Explain runs EXPLAIN (ANALYZE, BUFFERS) for q and returns the plan text.
func (r *PostgresRepository) Explain(ctx context.Context, q AggregateQuery) (string, error) {
	sql, args, err := BuildAggregateSQL(q)
	if err != nil {
		return "", err
	}
	rows, err := r.pool.Query(ctx, "EXPLAIN (ANALYZE, BUFFERS) "+sql, args...)
	if err != nil {
		return "", err
	}
	lines, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return "", err
	}
	return strings.Join(lines, "\n"), nil
}
