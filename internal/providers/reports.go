package providers

import (
	"fmt"
	"slices"
	"time"

	"github.com/iamv1n/adwise/internal/ads"
)

// Standard report definitions (plan §20). Adapters translate these by Level,
// Dimensions and Grain, not by name, and list the names they can serve in
// Capabilities().Reports.
var Catalog = []ads.ReportDefinition{
	{Name: "campaign_daily", Level: ads.EntityCampaign, Dimensions: []ads.Dimension{ads.DimCampaign}, Grain: ads.GrainDay},
	{Name: "campaign_hourly", Level: ads.EntityCampaign, Dimensions: []ads.Dimension{ads.DimCampaign}, Grain: ads.GrainHour},
	{Name: "campaign_country_daily", Level: ads.EntityCampaign, Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimCountry}, Grain: ads.GrainDay},
	{Name: "campaign_device_daily", Level: ads.EntityCampaign, Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimDevice}, Grain: ads.GrainDay},
	{Name: "campaign_placement_daily", Level: ads.EntityCampaign, Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimPublisherPlatform, ads.DimPlacement}, Grain: ads.GrainDay},
	{Name: "campaign_publisher_platform_daily", Level: ads.EntityCampaign, Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimPublisherPlatform}, Grain: ads.GrainDay},
	{Name: "ad_group_daily", Level: ads.EntityAdGroup, Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimAdGroup}, Grain: ads.GrainDay},
	{Name: "ad_daily", Level: ads.EntityAd, Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimAdGroup, ads.DimAd}, Grain: ads.GrainDay},
	{Name: "keyword_daily", Level: ads.EntityAdGroup, Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimAdGroup, ads.DimKeyword}, Grain: ads.GrainDay},
	{Name: "search_term_daily", Level: ads.EntityAdGroup, Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimAdGroup, ads.DimSearchTerm}, Grain: ads.GrainDay},
}

// CatalogReport returns the catalog definition with the given name.
func CatalogReport(name string) (ads.ReportDefinition, bool) {
	i := slices.IndexFunc(Catalog, func(d ads.ReportDefinition) bool { return d.Name == name })
	if i < 0 {
		return ads.ReportDefinition{}, false
	}
	return Catalog[i], true
}

// SupportedReports lists catalog names for which supports returns true.
func SupportedReports(supports func(ads.ReportDefinition) bool) []string {
	var names []string
	for _, d := range Catalog {
		if supports(d) {
			names = append(names, d.Name)
		}
	}
	return names
}

// IsEntityDimension reports whether d identifies an entity (as opposed to a
// breakdown such as country or device).
func IsEntityDimension(d ads.Dimension) bool {
	switch d {
	case ads.DimCampaign, ads.DimAdGroup, ads.DimAd, ads.DimCreative:
		return true
	}
	return false
}

// Breakdowns returns the non-entity dimensions of def, sorted, without duplicates.
func Breakdowns(def ads.ReportDefinition) []ads.Dimension {
	var out []ads.Dimension
	for _, d := range def.Dimensions {
		if !IsEntityDimension(d) && !slices.Contains(out, d) {
			out = append(out, d)
		}
	}
	slices.Sort(out)
	return out
}

// ParseDateRange validates r and returns its bounds.
func ParseDateRange(r ads.DateRange) (start, end time.Time, err error) {
	if start, err = time.Parse(time.DateOnly, r.Start); err != nil {
		return start, end, fmt.Errorf("%w: invalid start date %q", ErrInvalidRequest, r.Start)
	}
	if end, err = time.Parse(time.DateOnly, r.End); err != nil {
		return start, end, fmt.Errorf("%w: invalid end date %q", ErrInvalidRequest, r.End)
	}
	if end.Before(start) {
		return start, end, fmt.Errorf("%w: end date %s is before start date %s", ErrInvalidRequest, r.End, r.Start)
	}
	return start, end, nil
}

// SplitDateRange cuts r into consecutive chunks of at most days days.
func SplitDateRange(r ads.DateRange, days int) ([]ads.DateRange, error) {
	start, end, err := ParseDateRange(r)
	if err != nil {
		return nil, err
	}
	if days < 1 {
		days = 1
	}
	var out []ads.DateRange
	for s := start; !s.After(end); s = s.AddDate(0, 0, days) {
		e := s.AddDate(0, 0, days-1)
		if e.After(end) {
			e = end
		}
		out = append(out, ads.DateRange{Start: s.Format(time.DateOnly), End: e.Format(time.DateOnly)})
	}
	return out, nil
}

// factKey identifies a fact row at its grain; rows with the same key are summed.
type factKey struct {
	account, date string
	hour          int16
	hasHour       bool
	campaign      string
	adGroup, ad   string
	creative      string
	country       string
	device        string
	placement     string
	publisher     string
	keyword       string
	searchTerm    string
}

// MergeFacts sums rows that share the same grain key, which happens when a
// provider segments data more finely than the report (for example Google's
// user_location_view splits by targeting_location). Reach is not additive,
// so it is dropped on merged rows. Order of first appearance is preserved.
func MergeFacts(facts []ads.MetricFact) []ads.MetricFact {
	idx := make(map[factKey]int, len(facts))
	out := facts[:0:0]
	for _, f := range facts {
		k := factKey{
			account: f.AccountExternalID, date: f.Date,
			campaign: f.CampaignExternalID, adGroup: f.AdGroupExternalID, ad: f.AdExternalID, creative: f.CreativeExternalID,
			country: f.Country, device: f.Device, placement: f.Placement, publisher: f.PublisherPlatform,
			keyword: f.Keyword, searchTerm: f.SearchTerm,
		}
		if f.Hour != nil {
			k.hour, k.hasHour = *f.Hour, true
		}
		if i, ok := idx[k]; ok {
			m := &out[i]
			m.Impressions += f.Impressions
			m.Clicks += f.Clicks
			m.Spend += f.Spend
			m.Conversions += f.Conversions
			m.ConversionValue += f.ConversionValue
			m.Reach = nil
			m.ProviderData = nil
			continue
		}
		idx[k] = len(out)
		out = append(out, f)
	}
	return out
}
