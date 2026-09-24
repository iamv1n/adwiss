package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

// Insights reference:
// https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/
// Breakdowns (incl. hourly_stats_aggregated_by_advertiser_time_zone):
// https://developers.facebook.com/docs/marketing-api/insights/breakdowns
// Async jobs: https://developers.facebook.com/docs/marketing-api/insights/best-practices

const hourlyBreakdown = "hourly_stats_aggregated_by_advertiser_time_zone"

type insightsPlan struct {
	level      string   // account, campaign, adset, ad
	breakdowns []string // Meta breakdown names
	hourly     bool
}

// planReport translates a report definition into insights parameters, or
// returns ErrUnsupported.
func planReport(def ads.ReportDefinition) (insightsPlan, error) {
	var p insightsPlan
	depth := 0
	switch def.Level {
	case ads.EntityAccount:
		p.level = "account"
	case ads.EntityCampaign:
		p.level, depth = "campaign", 1
	case ads.EntityAdGroup:
		p.level, depth = "adset", 2
	case ads.EntityAd:
		p.level, depth = "ad", 3
	default:
		return p, providers.Unsupported(ads.ProviderMeta, "report level %q", def.Level)
	}
	for _, d := range def.Dimensions {
		need := map[ads.Dimension]int{ads.DimCampaign: 1, ads.DimAdGroup: 2, ads.DimAd: 3}[d]
		if d == ads.DimCreative {
			return p, providers.Unsupported(ads.ProviderMeta, "creative dimension in insights")
		}
		if need > depth {
			return p, providers.Unsupported(ads.ProviderMeta, "dimension %q below report level %q", d, def.Level)
		}
	}

	bds := providers.Breakdowns(def)
	switch def.Grain {
	case ads.GrainDay:
	case ads.GrainHour:
		// Hourly stats are only combined with no other breakdown here; Meta
		// allows few combinations and returns reach as 0 for hourly rows.
		if len(bds) > 0 {
			return p, providers.Unsupported(ads.ProviderMeta, "hourly grain with breakdowns %v", bds)
		}
		p.hourly = true
		p.breakdowns = []string{hourlyBreakdown}
		return p, nil
	default:
		return p, providers.Unsupported(ads.ProviderMeta, "grain %q", def.Grain)
	}

	switch {
	case len(bds) == 0:
	case slices.Equal(bds, []ads.Dimension{ads.DimCountry}):
		p.breakdowns = []string{"country"}
	case slices.Equal(bds, []ads.Dimension{ads.DimDevice}):
		p.breakdowns = []string{"device_platform"}
	case slices.Equal(bds, []ads.Dimension{ads.DimPublisherPlatform}):
		p.breakdowns = []string{"publisher_platform"}
	case slices.Equal(bds, []ads.Dimension{ads.DimPlacement}),
		slices.Equal(bds, []ads.Dimension{ads.DimPlacement, ads.DimPublisherPlatform}):
		// platform_position is only valid together with publisher_platform.
		p.breakdowns = []string{"publisher_platform", "platform_position"}
	default:
		return p, providers.Unsupported(ads.ProviderMeta, "breakdown combination %v", bds)
	}
	return p, nil
}

func (p insightsPlan) fields() string {
	f := []string{"account_id", "account_currency", "date_start", "date_stop", "impressions", "clicks", "inline_link_clicks", "spend", "actions", "action_values"}
	if !p.hourly {
		f = append(f, "reach") // unique metrics are not available with hourly breakdowns
	}
	switch p.level {
	case "ad":
		f = append(f, "ad_id", "ad_name")
		fallthrough
	case "adset":
		f = append(f, "adset_id", "adset_name")
		fallthrough
	case "campaign":
		f = append(f, "campaign_id", "campaign_name")
	}
	return strings.Join(f, ",")
}

func (p insightsPlan) params(r ads.DateRange) url.Values {
	tr, _ := json.Marshal(map[string]string{"since": r.Start, "until": r.End})
	v := url.Values{
		"level":          {p.level},
		"fields":         {p.fields()},
		"time_range":     {string(tr)},
		"time_increment": {"1"},
		// Match the attribution settings configured in Ads Manager.
		"use_account_attribution_setting": {"true"},
	}
	if len(p.breakdowns) > 0 {
		v.Set("breakdowns", strings.Join(p.breakdowns, ","))
	}
	return v
}

// FetchReport returns insights rows for def over r (inclusive, in the ad
// account's timezone, which is how Meta interprets time_range).
//
// Ranges longer than AsyncThresholdDays use async report jobs: synchronous
// insights calls on large ranges or many breakdown rows time out or fail
// with "please reduce the amount of data" (code 100 / subcode 1487534).
func (c *Client) FetchReport(ctx context.Context, def ads.ReportDefinition, accountID string, r ads.DateRange) ([]ads.MetricFact, error) {
	plan, err := planReport(def)
	if err != nil {
		return nil, err
	}
	start, end, err := providers.ParseDateRange(r)
	if err != nil {
		return nil, err
	}
	days := int(end.Sub(start).Hours()/24) + 1
	acct := normalizeAccountID(accountID)
	params := plan.params(r)

	var rows []ads.MetricFact
	collect := func(raw json.RawMessage) error {
		f, err := c.translateRow(def, plan, acct, raw)
		if err != nil {
			return err
		}
		rows = append(rows, f)
		return nil
	}

	if c.opts.AsyncThresholdDays > 0 && days > c.opts.AsyncThresholdDays {
		err = c.runAsync(ctx, acct, params, collect)
	} else {
		err = c.each(ctx, actPath(acct)+"/insights", params, collect)
	}
	if err != nil {
		return nil, err
	}
	return providers.MergeFacts(rows), nil
}

type asyncJob struct {
	ReportRunID            string `json:"report_run_id"`
	ID                     string `json:"id"`
	AsyncStatus            string `json:"async_status"`
	AsyncPercentCompletion int    `json:"async_percent_completion"`
}

func (c *Client) runAsync(ctx context.Context, acct string, params url.Values, fn func(json.RawMessage) error) error {
	var job asyncJob
	if err := c.call(ctx, http.MethodPost, actPath(acct)+"/insights", params, &job); err != nil {
		return err
	}
	if job.ReportRunID == "" {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: "async insights job returned no report_run_id"}
	}
	deadline := time.Now().Add(c.opts.MaxAsyncWait)
	for {
		var st asyncJob
		if err := c.call(ctx, http.MethodGet, job.ReportRunID, url.Values{"fields": {"id,async_status,async_percent_completion"}}, &st); err != nil {
			return err
		}
		switch st.AsyncStatus {
		case "Job Completed":
			return c.each(ctx, job.ReportRunID+"/insights", nil, fn)
		case "Job Failed", "Job Skipped":
			return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Code: "async_job",
				Message: fmt.Sprintf("async insights job %s: %s", job.ReportRunID, st.AsyncStatus)}
		}
		if time.Now().After(deadline) {
			return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Code: "async_job",
				Message: fmt.Sprintf("async insights job %s did not finish in %s (%d%%)", job.ReportRunID, c.opts.MaxAsyncWait, st.AsyncPercentCompletion)}
		}
		if err := c.opts.Sleep(ctx, c.opts.PollInterval); err != nil {
			return err
		}
	}
}

type actionStat struct {
	ActionType string          `json:"action_type"`
	Value      json.RawMessage `json:"value"`
}

func (a actionStat) value() string {
	s := strings.Trim(string(a.Value), `"`)
	return s
}

type insightRow struct {
	AccountID         providers.FlexString `json:"account_id"`
	CampaignID        string               `json:"campaign_id"`
	AdSetID           string               `json:"adset_id"`
	AdID              string               `json:"ad_id"`
	DateStart         string               `json:"date_start"`
	Impressions       providers.FlexInt    `json:"impressions"`
	Clicks            providers.FlexInt    `json:"clicks"`
	Spend             string               `json:"spend"`
	Reach             *providers.FlexInt   `json:"reach"`
	Actions           []actionStat         `json:"actions"`
	ActionValues      []actionStat         `json:"action_values"`
	Country           string               `json:"country"`
	DevicePlatform    string               `json:"device_platform"`
	PublisherPlatform string               `json:"publisher_platform"`
	PlatformPosition  string               `json:"platform_position"`
	Hourly            string               `json:"hourly_stats_aggregated_by_advertiser_time_zone"`
}

func (c *Client) translateRow(def ads.ReportDefinition, plan insightsPlan, acct string, raw json.RawMessage) (ads.MetricFact, error) {
	var row insightRow
	if err := json.Unmarshal(raw, &row); err != nil {
		return ads.MetricFact{}, fmt.Errorf("meta: decode insights row: %w", err)
	}
	spend, err := providers.DecimalToMicros(row.Spend)
	if err != nil {
		return ads.MetricFact{}, fmt.Errorf("meta: spend: %w", err)
	}
	f := ads.MetricFact{
		Provider: ads.ProviderMeta, Report: def.Name, AccountExternalID: acct,
		Date:               row.DateStart,
		CampaignExternalID: row.CampaignID, AdGroupExternalID: row.AdSetID, AdExternalID: row.AdID,
		Country: row.Country, Device: row.DevicePlatform,
		PublisherPlatform: row.PublisherPlatform, Placement: row.PlatformPosition,
		Impressions: int64(row.Impressions), Clicks: int64(row.Clicks), Spend: spend,
		ProviderData: raw,
	}
	if row.AccountID != "" {
		f.AccountExternalID = string(row.AccountID)
	}
	if row.Reach != nil && !plan.hourly {
		r := int64(*row.Reach)
		f.Reach = &r
	}
	if plan.hourly {
		h, err := parseHour(row.Hourly)
		if err != nil {
			return ads.MetricFact{}, err
		}
		f.Hour = &h
	}
	for _, a := range row.Actions {
		if a.ActionType == c.convAction {
			v, err := strconv.ParseFloat(a.value(), 64)
			if err != nil {
				return ads.MetricFact{}, fmt.Errorf("meta: action %s value %q: %w", a.ActionType, a.value(), err)
			}
			f.Conversions += v
		}
	}
	for _, a := range row.ActionValues {
		if a.ActionType == c.convAction {
			v, err := providers.DecimalToMicros(a.value())
			if err != nil {
				return ads.MetricFact{}, fmt.Errorf("meta: action value %s: %w", a.ActionType, err)
			}
			f.ConversionValue += v
		}
	}
	return f, nil
}

// parseHour reads "13:00:00 - 13:59:59".
func parseHour(s string) (int16, error) {
	if len(s) < 2 {
		return 0, fmt.Errorf("meta: invalid hourly bucket %q", s)
	}
	h, err := strconv.Atoi(s[:2])
	if err != nil || h < 0 || h > 23 {
		return 0, fmt.Errorf("meta: invalid hourly bucket %q", s)
	}
	return int16(h), nil
}
