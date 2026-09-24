package google

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"golang.org/x/text/language"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

// Report resources used:
//   campaign, ad_group, ad_group_ad, customer   entity-level metrics
//   user_location_view                          country (user's physical location)
//   keyword_view                                keyword metrics
//   search_term_view                            search terms
// https://developers.google.com/google-ads/api/fields/v25/overview

type reportPlan struct {
	resource string
	selects  []string
}

func planReport(def ads.ReportDefinition) (reportPlan, error) {
	unsupported := func(format string, args ...any) (reportPlan, error) {
		return reportPlan{}, providers.Unsupported(ads.ProviderGoogle, format, args...)
	}
	var p reportPlan
	depth := 0
	switch def.Level {
	case ads.EntityAccount:
		p.resource = "customer"
	case ads.EntityCampaign:
		p.resource, depth = "campaign", 1
	case ads.EntityAdGroup:
		p.resource, depth = "ad_group", 2
	case ads.EntityAd:
		p.resource, depth = "ad_group_ad", 3
	default:
		return unsupported("report level %q", def.Level)
	}
	for _, d := range def.Dimensions {
		need := map[ads.Dimension]int{ads.DimCampaign: 1, ads.DimAdGroup: 2, ads.DimAd: 3}[d]
		if d == ads.DimCreative {
			return unsupported("creative dimension in reports")
		}
		if need > depth {
			return unsupported("dimension %q below report level %q", d, def.Level)
		}
	}

	bds := providers.Breakdowns(def)
	var segs []string
	switch def.Grain {
	case ads.GrainDay:
		segs = []string{"segments.date"}
	case ads.GrainHour:
		if len(bds) > 0 {
			return unsupported("hourly grain with breakdowns %v", bds)
		}
		segs = []string{"segments.date", "segments.hour"}
	default:
		return unsupported("grain %q", def.Grain)
	}

	switch {
	case len(bds) == 0:
	case slices.Equal(bds, []ads.Dimension{ads.DimDevice}):
		segs = append(segs, "segments.device")
	case slices.Equal(bds, []ads.Dimension{ads.DimPublisherPlatform}):
		segs = append(segs, "segments.ad_network_type")
	case slices.Equal(bds, []ads.Dimension{ads.DimCountry}):
		if depth > 2 {
			return unsupported("country breakdown at ad level")
		}
		p.resource = "user_location_view"
		segs = append(segs, "user_location_view.country_criterion_id")
	case slices.Equal(bds, []ads.Dimension{ads.DimKeyword}):
		if depth != 2 {
			return unsupported("keyword breakdown requires ad group level")
		}
		p.resource = "keyword_view"
		segs = append(segs, "ad_group_criterion.criterion_id", "ad_group_criterion.keyword.text", "ad_group_criterion.keyword.match_type")
	case slices.Equal(bds, []ads.Dimension{ads.DimSearchTerm}):
		if depth != 2 {
			return unsupported("search term breakdown requires ad group level")
		}
		p.resource = "search_term_view"
		segs = append(segs, "search_term_view.search_term")
	default:
		return unsupported("breakdown combination %v", bds)
	}

	p.selects = append(p.selects, "customer.id")
	if depth >= 1 {
		p.selects = append(p.selects, "campaign.id")
	}
	if depth >= 2 {
		p.selects = append(p.selects, "ad_group.id")
	}
	if depth >= 3 {
		p.selects = append(p.selects, "ad_group_ad.ad.id")
	}
	p.selects = append(p.selects, segs...)
	p.selects = append(p.selects,
		"metrics.impressions", "metrics.clicks", "metrics.cost_micros",
		"metrics.conversions", "metrics.conversions_value")
	return p, nil
}

func (p reportPlan) query(r ads.DateRange) string {
	return fmt.Sprintf("SELECT %s FROM %s WHERE segments.date BETWEEN '%s' AND '%s'",
		strings.Join(p.selects, ", "), p.resource, r.Start, r.End)
}

type metricRow struct {
	Customer struct {
		ID id `json:"id"`
	} `json:"customer"`
	Campaign struct {
		ID id `json:"id"`
	} `json:"campaign"`
	AdGroup struct {
		ID id `json:"id"`
	} `json:"adGroup"`
	AdGroupAd struct {
		Ad struct {
			ID id `json:"id"`
		} `json:"ad"`
	} `json:"adGroupAd"`
	AdGroupCriterion struct {
		CriterionID id `json:"criterionId"`
		Keyword     struct {
			Text      string `json:"text"`
			MatchType string `json:"matchType"`
		} `json:"keyword"`
	} `json:"adGroupCriterion"`
	SearchTermView struct {
		SearchTerm string `json:"searchTerm"`
	} `json:"searchTermView"`
	UserLocationView struct {
		CountryCriterionID id `json:"countryCriterionId"`
	} `json:"userLocationView"`
	Segments struct {
		Date          string             `json:"date"`
		Hour          *providers.FlexInt `json:"hour"`
		Device        string             `json:"device"`
		AdNetworkType string             `json:"adNetworkType"`
	} `json:"segments"`
	Metrics struct {
		Impressions      providers.FlexInt   `json:"impressions"`
		Clicks           providers.FlexInt   `json:"clicks"`
		CostMicros       providers.FlexInt   `json:"costMicros"`
		Conversions      providers.FlexFloat `json:"conversions"`
		ConversionsValue providers.FlexFloat `json:"conversionsValue"`
	} `json:"metrics"`
}

// FetchReport runs the GAQL query for def. Dates are interpreted by Google in
// the customer's timezone. metrics.cost_micros is already micros;
// metrics.conversions_value is a double in currency units and is converted.
func (c *Client) FetchReport(ctx context.Context, def ads.ReportDefinition, accountID string, r ads.DateRange) ([]ads.MetricFact, error) {
	plan, err := planReport(def)
	if err != nil {
		return nil, err
	}
	if _, _, err := providers.ParseDateRange(r); err != nil {
		return nil, err
	}
	cid := normalizeCID(accountID)
	rows, err := c.searchStream(ctx, cid, plan.query(r))
	if err != nil {
		return nil, err
	}
	facts := make([]ads.MetricFact, 0, len(rows))
	for _, raw := range rows {
		var m metricRow
		if err := json.Unmarshal(raw, &m); err != nil {
			return nil, fmt.Errorf("google ads: decode report row: %w", err)
		}
		f := ads.MetricFact{
			Provider: ads.ProviderGoogle, Report: def.Name, AccountExternalID: cid,
			Date:               m.Segments.Date,
			CampaignExternalID: string(m.Campaign.ID), AdGroupExternalID: string(m.AdGroup.ID),
			AdExternalID:      string(m.AdGroupAd.Ad.ID),
			Device:            lowerEnum(m.Segments.Device),
			PublisherPlatform: lowerEnum(m.Segments.AdNetworkType),
			SearchTerm:        m.SearchTermView.SearchTerm,
			Keyword:           keywordText(m.AdGroupCriterion.Keyword.Text, m.AdGroupCriterion.Keyword.MatchType),
			Impressions:       int64(m.Metrics.Impressions),
			Clicks:            int64(m.Metrics.Clicks),
			Spend:             ads.Micros(m.Metrics.CostMicros),
			Conversions:       float64(m.Metrics.Conversions),
			ConversionValue:   providers.FloatToMicros(float64(m.Metrics.ConversionsValue)),
			ProviderData:      raw,
		}
		if m.UserLocationView.CountryCriterionID != "" {
			f.Country = countryFromCriterion(string(m.UserLocationView.CountryCriterionID))
		}
		if m.Segments.Hour != nil {
			h := int16(*m.Segments.Hour)
			f.Hour = &h
		}
		facts = append(facts, f)
	}
	// user_location_view splits rows by targeting_location; merge to the report grain.
	return providers.MergeFacts(facts), nil
}

func lowerEnum(s string) string {
	if s == "" || s == "UNSPECIFIED" {
		return ""
	}
	return strings.ToLower(s)
}

// keywordText renders a keyword in Google's notation: broad as-is,
// "phrase" in quotes, [exact] in brackets.
func keywordText(text, match string) string {
	switch match {
	case "":
		return text
	case "PHRASE":
		return `"` + text + `"`
	case "EXACT":
		return "[" + text + "]"
	}
	return text
}

// countryFromCriterion maps a country geo target constant ID to ISO 3166-1
// alpha-2. Google's country criterion IDs are 2000 + the ISO 3166-1 numeric
// code (2840 = US, 2356 = IN). Unknown IDs are kept as "geo:<id>" so rows are
// not merged into the wrong country.
// https://developers.google.com/google-ads/api/data/geotargets
func countryFromCriterion(criterionID string) string {
	n, err := strconv.Atoi(criterionID)
	if err == nil && n > 2000 && n < 3000 {
		if r, err := language.ParseRegion(fmt.Sprintf("%03d", n-2000)); err == nil && r.IsCountry() {
			return r.String()
		}
	}
	return "geo:" + criterionID
}
