package analytics

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/reports"
)

// MaxSeriesIDs bounds GET /analytics/series.
const MaxSeriesIDs = 200

// SeriesPoint is one day of an entity's measures; money in major units.
type SeriesPoint struct {
	Date            string  `json:"date"`
	Spend           float64 `json:"spend"`
	Impressions     int64   `json:"impressions"`
	Clicks          int64   `json:"clicks"`
	Conversions     float64 `json:"conversions"`
	ConversionValue float64 `json:"conversion_value"`
}

type SeriesResponse struct {
	CurrencyByID map[uuid.UUID]string        `json:"currency_by_id"`
	Series       map[uuid.UUID][]SeriesPoint `json:"series"`
}

type seriesLevel struct {
	table  string
	report string
	field  metrics.Field
}

// Ad groups use ad_daily summed per ad set, like the entity lists.
var seriesLevels = map[string]seriesLevel{
	"campaign": {"campaigns", reports.CampaignDaily, metrics.FieldCampaign},
	"ad_group": {"ad_groups", reports.AdDaily, metrics.FieldAdGroup},
	"ad":       {"ads", reports.AdDaily, metrics.FieldAd},
}

// Series returns zero-filled daily series for each entity. IDs that do not
// belong to the organization are omitted.
func (s *Service) Series(ctx context.Context, orgID uuid.UUID, level string, ids []uuid.UUID, r params.DateRange) (SeriesResponse, error) {
	out := SeriesResponse{CurrencyByID: map[uuid.UUID]string{}, Series: map[uuid.UUID][]SeriesPoint{}}
	lv, ok := seriesLevels[level]
	if !ok {
		return out, params.Invalid("level", "must be one of campaign, ad_group, ad")
	}
	if len(ids) == 0 {
		return out, nil
	}
	// lv.table comes from the fixed map above.
	rows, err := s.db.Pool.Query(ctx, `
		SELECT e.id, e.account_id, e.external_id, a.currency
		FROM `+lv.table+` e JOIN ad_accounts a ON a.id = e.account_id
		WHERE e.organization_id = $1 AND e.id = ANY($2)`, orgID, ids)
	if err != nil {
		return out, err
	}
	type ent struct {
		id       uuid.UUID
		account  uuid.UUID
		ext      string
		currency string
	}
	var ents []ent
	for rows.Next() {
		var e ent
		if err := rows.Scan(&e.id, &e.account, &e.ext, &e.currency); err != nil {
			rows.Close()
			return out, err
		}
		ents = append(ents, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	if len(ents) == 0 {
		return out, nil
	}

	f := metrics.Filter{OrganizationID: orgID, Report: lv.report, From: r.From, To: r.To}
	seenAcct := map[uuid.UUID]bool{}
	for _, e := range ents {
		if !seenAcct[e.account] {
			seenAcct[e.account] = true
			f.AccountIDs = append(f.AccountIDs, e.account)
		}
		switch lv.field {
		case metrics.FieldCampaign:
			f.CampaignExternalIDs = append(f.CampaignExternalIDs, e.ext)
		case metrics.FieldAdGroup:
			f.AdGroupExternalIDs = append(f.AdGroupExternalIDs, e.ext)
		case metrics.FieldAd:
			f.AdExternalIDs = append(f.AdExternalIDs, e.ext)
		}
	}
	facts, err := s.repo.Aggregate(ctx, metrics.AggregateQuery{Filter: f, GroupBy: []metrics.Field{metrics.FieldAccount, lv.field, metrics.FieldDate}})
	if err != nil {
		return out, err
	}
	type key struct {
		account uuid.UUID
		ext     string
		date    string
	}
	byKey := make(map[key]metrics.Measures, len(facts))
	for _, row := range facts {
		var ext string
		switch lv.field {
		case metrics.FieldCampaign:
			ext = row.CampaignID
		case metrics.FieldAdGroup:
			ext = row.AdGroupID
		case metrics.FieldAd:
			ext = row.AdID
		}
		byKey[key{row.AccountID, ext, row.Date.Format(time.DateOnly)}] = row.Measures
	}
	dates := r.Dates()
	for _, e := range ents {
		pts := make([]SeriesPoint, len(dates))
		for i, d := range dates {
			ds := d.Format(time.DateOnly)
			m := byKey[key{e.account, e.ext, ds}]
			pts[i] = SeriesPoint{
				Date: ds, Spend: metrics.MicrosToUnits(m.SpendMicros), Impressions: m.Impressions, Clicks: m.Clicks,
				Conversions: m.Conversions, ConversionValue: metrics.MicrosToUnits(m.ConversionValueMicros),
			}
		}
		out.Series[e.id] = pts
		out.CurrencyByID[e.id] = e.currency
	}
	return out, nil
}

func (h *Handlers) series(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	level, err := params.OneOf(q, "level", "campaign", "campaign", "ad_group", "ad")
	if err != nil {
		return err
	}
	rng, err := params.DateRangeOrDefault(q)
	if err != nil {
		return err
	}
	var ids []uuid.UUID
	seen := map[uuid.UUID]bool{}
	for _, part := range strings.Split(q.Get("ids"), ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := uuid.Parse(part)
		if err != nil {
			return params.Invalid("ids", "must be comma-separated UUIDs")
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return params.Invalid("ids", "required")
	}
	if len(ids) > MaxSeriesIDs {
		return params.Invalid("ids", "at most 200 ids")
	}
	out, err := h.svc.Series(r.Context(), organizations.MembershipFromContext(r.Context()).OrganizationID, level, ids, rng)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}
