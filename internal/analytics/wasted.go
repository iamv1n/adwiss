package analytics

import (
	"cmp"
	"context"
	"slices"
	"strings"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/reports"
	"github.com/iamv1n/adwise/internal/store"
)

// WastedLevels are the accepted ?level= values.
var WastedLevels = []string{"campaign", "ad_group", "ad"}

// WastedCriteria select wasted spend. An entity is flagged when
// spend > MinSpend and (conversions <= MaxConversions or ROAS < ROASBelow).
type WastedCriteria struct {
	Level          string  `json:"level"`
	MinSpend       float64 `json:"min_spend"`       // account currency units
	MaxConversions float64 `json:"max_conversions"` // default 0: no conversions at all
	ROASBelow      float64 `json:"roas_below"`      // default 1.0; 0 disables the ROAS test
}

type WastedQuery struct {
	Scope
	Criteria WastedCriteria
	Page     params.Page
}

// Reasons attached to a flagged row.
const (
	ReasonNoConversions  = "no_conversions"
	ReasonLowConversions = "low_conversions"
	ReasonLowROAS        = "low_roas"
)

type WastedRow struct {
	Level        string         `json:"level"`
	ID           uuid.UUID      `json:"id"`
	ExternalID   string         `json:"external_id"`
	Name         string         `json:"name"`
	Status       string         `json:"status"`
	Provider     ads.Provider   `json:"provider"`
	AccountID    uuid.UUID      `json:"account_id"`
	AccountName  string         `json:"account_name"`
	CampaignID   uuid.UUID      `json:"campaign_id"`
	CampaignName string         `json:"campaign_name"`
	Currency     string         `json:"currency"`
	Metrics      metrics.Values `json:"metrics"`
	// WastedSpend is the whole spend when conversions <= max_conversions,
	// otherwise the spend above what roas_below would justify:
	// spend − conversion_value / roas_below.
	WastedSpend float64  `json:"wasted_spend"`
	Reasons     []string `json:"reasons"`
}

type WastedSpend struct {
	Range    RangeInfo      `json:"range"`
	Criteria WastedCriteria `json:"criteria"`
	// Summary covers the flagged rows only.
	Summary
	// WastedSpendTotal is null when currencies are mixed; see WastedByCurrency.
	WastedSpendTotal *float64           `json:"wasted_spend_total"`
	WastedByCurrency map[string]float64 `json:"wasted_by_currency"`
	// ShareOfSpend is wasted spend / all spend at this level in scope.
	ShareOfSpend *float64       `json:"share_of_spend"`
	Rows         []WastedRow    `json:"rows"`
	Page         map[string]any `json:"page"`
}

type wastedEntity struct {
	row WastedRow
}

// WastedSpend ranks campaigns, ad groups or ads by wasted spend.
func (s *Service) WastedSpend(ctx context.Context, q WastedQuery) (WastedSpend, error) {
	res, err := s.resolve(ctx, q.Scope)
	if err != nil {
		return WastedSpend{}, err
	}
	c := q.Criteria
	out := WastedSpend{Range: rangeInfo(q.Range), Criteria: c, WastedByCurrency: map[string]float64{}, Rows: []WastedRow{}}

	report, field := reports.CampaignDaily, metrics.FieldCampaign
	if c.Level != "campaign" {
		report, field = reports.AdDaily, metrics.FieldAdGroup
		if c.Level == "ad" {
			field = metrics.FieldAd
		}
	}
	aggRows, err := s.aggregate(ctx, res, report, q.Range, metrics.FieldAccount, field, metrics.FieldCurrency)
	if err != nil {
		return WastedSpend{}, err
	}
	type key struct {
		account uuid.UUID
		ext     string
	}
	sums := map[key]metrics.Measures{}
	spendByCurrency := map[string]int64{}
	for _, r := range aggRows {
		ext := r.CampaignID
		switch field {
		case metrics.FieldAdGroup:
			ext = r.AdGroupID
		case metrics.FieldAd:
			ext = r.AdID
		}
		k := key{r.AccountID, ext}
		sums[k] = sums[k].Add(r.Measures)
		spendByCurrency[r.Currency] += r.SpendMicros
	}

	ents, err := s.wastedEntities(ctx, q, res)
	if err != nil {
		return WastedSpend{}, err
	}
	flagged := newAccum()
	wastedMicros := map[string]float64{}
	var rows []WastedRow
	minSpendMicros := int64(c.MinSpend * 1e6)
	for _, e := range ents {
		m := sums[key{e.row.AccountID, e.row.ExternalID}]
		if m.SpendMicros <= 0 || m.SpendMicros <= minSpendMicros {
			continue
		}
		spend, value := float64(m.SpendMicros), float64(m.ConversionValueMicros)
		var reasons []string
		var wasted float64
		switch {
		case m.Conversions <= c.MaxConversions && m.Conversions == 0:
			reasons, wasted = append(reasons, ReasonNoConversions), spend
		case m.Conversions <= c.MaxConversions:
			reasons, wasted = append(reasons, ReasonLowConversions), spend
		}
		if c.ROASBelow > 0 && value/spend < c.ROASBelow {
			reasons = append(reasons, ReasonLowROAS)
			wasted = max(wasted, spend-value/c.ROASBelow)
		}
		if len(reasons) == 0 {
			continue
		}
		r := e.row
		r.Metrics = metrics.Compute(m, r.Currency)
		r.WastedSpend = metrics.MicrosToUnits(int64(wasted))
		r.Reasons = reasons
		flagged.add(r.Provider, r.Currency, m)
		wastedMicros[r.Currency] += wasted
		rows = append(rows, r)
	}
	slices.SortFunc(rows, func(a, b WastedRow) int {
		return cmp.Or(cmp.Compare(b.WastedSpend, a.WastedSpend), cmp.Compare(deref(b.Metrics.Spend), deref(a.Metrics.Spend)),
			strings.Compare(a.Name, b.Name))
	})

	out.Summary = summarize(res, currencyInfo(res.fallback, flagged.all), flagged, nil)
	for cur, w := range wastedMicros {
		out.WastedByCurrency[cur] = metrics.MicrosToUnits(int64(w))
	}
	if out.Currency != nil {
		w := out.WastedByCurrency[*out.Currency]
		out.WastedSpendTotal = &w
		if total := spendByCurrency[*out.Currency]; total > 0 {
			out.ShareOfSpend = ptr(roundTo(wastedMicros[*out.Currency]/float64(total), 6))
		}
	}
	out.Page = params.PageJSON(q.Page, int64(len(rows)))
	if q.Page.Offset < len(rows) {
		out.Rows = rows[q.Page.Offset:min(q.Page.Offset+q.Page.Limit, len(rows))]
	}
	return out, nil
}

// wastedEntities lists every entity at the requested level within the scope.
func (s *Service) wastedEntities(ctx context.Context, q WastedQuery, res resolved) ([]wastedEntity, error) {
	if res.empty {
		return nil, nil
	}
	var provider *store.AdProvider
	if q.Provider != "" {
		p := store.AdProvider(q.Provider)
		provider = &p
	}
	var accountID *uuid.UUID
	if len(res.filter.AccountIDs) == 1 {
		accountID = &res.filter.AccountIDs[0]
	}
	const all = 1 << 30
	var out []wastedEntity
	keep := func(currency string) bool { return q.Currency == "" || currency == q.Currency }
	switch q.Criteria.Level {
	case "campaign":
		rows, err := s.db.ListCampaigns(ctx, store.ListCampaignsParams{OrganizationID: q.OrganizationID,
			AccountID: accountID, Provider: provider, CampaignID: q.CampaignID, RowLimit: all})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			if keep(r.Currency) {
				c := r.Campaign
				out = append(out, wastedEntity{row: WastedRow{Level: "campaign", ID: c.ID, ExternalID: c.ExternalID,
					Name: c.Name, Status: string(c.Status), Provider: ads.Provider(c.Provider), AccountID: c.AccountID,
					AccountName: r.AccountName, CampaignID: c.ID, CampaignName: c.Name, Currency: r.Currency}})
			}
		}
	case "ad_group":
		rows, err := s.db.ListAdGroups(ctx, store.ListAdGroupsParams{OrganizationID: q.OrganizationID,
			AccountID: accountID, Provider: provider, CampaignID: q.CampaignID, RowLimit: all})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			if keep(r.Currency) {
				g := r.AdGroup
				out = append(out, wastedEntity{row: WastedRow{Level: "ad_group", ID: g.ID, ExternalID: g.ExternalID,
					Name: g.Name, Status: string(g.Status), Provider: ads.Provider(g.Provider), AccountID: g.AccountID,
					AccountName: r.AccountName, CampaignID: g.CampaignID, CampaignName: r.CampaignName, Currency: r.Currency}})
			}
		}
	case "ad":
		rows, err := s.db.ListAds(ctx, store.ListAdsParams{OrganizationID: q.OrganizationID,
			AccountID: accountID, Provider: provider, CampaignID: q.CampaignID, RowLimit: all})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			if keep(r.Currency) {
				a := r.Ad
				out = append(out, wastedEntity{row: WastedRow{Level: "ad", ID: a.ID, ExternalID: a.ExternalID,
					Name: a.Name, Status: string(a.Status), Provider: ads.Provider(a.Provider), AccountID: a.AccountID,
					AccountName: r.AccountName, CampaignID: a.CampaignID, CampaignName: r.CampaignName, Currency: r.Currency}})
			}
		}
	}
	return out, nil
}
