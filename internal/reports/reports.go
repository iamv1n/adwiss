// Package reports is the registry of explicit, provider-independent report
// definitions (plan §9, §20). Provider adapters translate each definition into
// a provider query (or declare it unsupported via ads.Capabilities); the
// metrics store validates incoming facts against the definition they claim.
//
// Every analytics query reads exactly one report, so measures are never
// double counted across reports of different grain.
package reports

import (
	"slices"

	"github.com/iamv1n/adwise/internal/ads"
)

const (
	CampaignDaily          = "campaign_daily"
	CampaignHourly         = "campaign_hourly"
	CampaignCountryDaily   = "campaign_country_daily"
	CampaignDeviceDaily    = "campaign_device_daily"
	CampaignPlacementDaily = "campaign_placement_daily"
	AdDaily                = "ad_daily"
	CreativeDaily          = "creative_daily"
	KeywordDaily           = "keyword_daily"
	SearchTermDaily        = "search_term_daily"
)

var all = []ads.ReportDefinition{
	{Name: CampaignDaily, Level: ads.EntityCampaign, Grain: ads.GrainDay,
		Dimensions: []ads.Dimension{ads.DimCampaign}},
	{Name: CampaignHourly, Level: ads.EntityCampaign, Grain: ads.GrainHour,
		Dimensions: []ads.Dimension{ads.DimCampaign}},
	{Name: CampaignCountryDaily, Level: ads.EntityCampaign, Grain: ads.GrainDay,
		Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimCountry}},
	{Name: CampaignDeviceDaily, Level: ads.EntityCampaign, Grain: ads.GrainDay,
		Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimDevice}},
	// Placement is reported together with the publisher platform (Meta:
	// facebook/instagram/audience_network/messenger; Google: search/display/
	// youtube network), so the publisher_platform breakdown reads this report.
	{Name: CampaignPlacementDaily, Level: ads.EntityCampaign, Grain: ads.GrainDay,
		Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimPublisherPlatform, ads.DimPlacement}},
	{Name: AdDaily, Level: ads.EntityAd, Grain: ads.GrainDay,
		Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimAdGroup, ads.DimAd}},
	{Name: CreativeDaily, Level: ads.EntityCreative, Grain: ads.GrainDay,
		Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimCreative}},
	{Name: KeywordDaily, Level: ads.EntityAdGroup, Grain: ads.GrainDay,
		Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimAdGroup, ads.DimKeyword}},
	{Name: SearchTermDaily, Level: ads.EntityAdGroup, Grain: ads.GrainDay,
		Dimensions: []ads.Dimension{ads.DimCampaign, ads.DimAdGroup, ads.DimSearchTerm}},
}

var byName = func() map[string]ads.ReportDefinition {
	m := make(map[string]ads.ReportDefinition, len(all))
	for _, d := range all {
		m[d.Name] = d
	}
	return m
}()

// All returns every registered report definition, in a stable order.
// The returned slice is a copy.
func All() []ads.ReportDefinition {
	out := make([]ads.ReportDefinition, len(all))
	for i, d := range all {
		d.Dimensions = slices.Clone(d.Dimensions)
		out[i] = d
	}
	return out
}

// Get looks up a report definition by name.
func Get(name string) (ads.ReportDefinition, bool) {
	d, ok := byName[name]
	if ok {
		d.Dimensions = slices.Clone(d.Dimensions)
	}
	return d, ok
}

// Names returns the names of all registered reports.
func Names() []string {
	out := make([]string, len(all))
	for i, d := range all {
		out[i] = d.Name
	}
	return out
}

// HasDimension reports whether def is keyed by dim.
func HasDimension(def ads.ReportDefinition, dim ads.Dimension) bool {
	return slices.Contains(def.Dimensions, dim)
}
