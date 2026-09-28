package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"

	"github.com/iamv1n/adwise/internal/alerts"
	"github.com/iamv1n/adwise/internal/analytics"
	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/automation"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/recommendations"
)

// Tool is one capability the model can call. Tools only read: they call the
// same services as the REST API, scoped to the caller's membership, so the
// model can never see another org's data or reach past the caller's role.
type Tool struct {
	Name        string
	Description string
	Properties  map[string]any
	Required    []string
	Run         func(ctx context.Context, m organizations.Membership, in json.RawMessage) (any, error)
}

// Services are the read paths the tools use.
type Services struct {
	Analytics       *analytics.Service
	Automation      *automation.Service
	Alerts          *alerts.Service
	Recommendations *recommendations.Service
}

// maxResultBytes caps what one tool result adds to the conversation.
const maxResultBytes = 48_000

// scopeInput is the filter set shared by the analytics tools. Values are
// validated by the same params helpers as the REST query string.
type scopeInput struct {
	From       string `json:"from"`
	To         string `json:"to"`
	Compare    string `json:"compare"`
	AccountID  string `json:"account_id"`
	CampaignID string `json:"campaign_id"`
	Provider   string `json:"provider"`
	Currency   string `json:"currency"`
}

var scopeProps = map[string]any{
	"from":        map[string]any{"type": "string", "description": "Start date, YYYY-MM-DD, inclusive. Omit both from and to for the last 30 days."},
	"to":          map[string]any{"type": "string", "description": "End date, YYYY-MM-DD, inclusive."},
	"account_id":  map[string]any{"type": "string", "description": "Limit to one ad account (UUID)."},
	"campaign_id": map[string]any{"type": "string", "description": "Limit to one campaign (UUID)."},
	"provider":    map[string]any{"type": "string", "enum": []string{"meta", "google"}},
	"currency":    map[string]any{"type": "string", "description": "ISO currency code, when accounts use more than one."},
}

func withCompare(props map[string]any) map[string]any {
	out := map[string]any{"compare": map[string]any{
		"type": "string", "enum": []string{analytics.CompareNone, analytics.ComparePreviousPeriod, analytics.ComparePreviousYear},
		"description": "Also return the comparison period and deltas.",
	}}
	for k, v := range props {
		out[k] = v
	}
	return out
}

func merge(a, b map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range a {
		out[k] = v
	}
	for k, v := range b {
		out[k] = v
	}
	return out
}

func (in scopeInput) values() url.Values {
	q := url.Values{}
	set := func(k, v string) {
		if v != "" {
			q.Set(k, v)
		}
	}
	set("from", in.From)
	set("to", in.To)
	set("account_id", in.AccountID)
	set("campaign_id", in.CampaignID)
	set("provider", in.Provider)
	set("currency", in.Currency)
	return q
}

func (in scopeInput) scope(m organizations.Membership) (analytics.Scope, error) {
	q := in.values()
	sc := analytics.Scope{OrganizationID: m.OrganizationID}
	var err error
	if sc.Range, err = params.DateRangeOrDefault(q); err != nil {
		return sc, err
	}
	if sc.AccountID, err = params.UUID(q, "account_id"); err != nil {
		return sc, err
	}
	if sc.CampaignID, err = params.UUID(q, "campaign_id"); err != nil {
		return sc, err
	}
	if sc.Provider, err = params.Provider(q); err != nil {
		return sc, err
	}
	if sc.Currency, err = params.Currency(q); err != nil {
		return sc, err
	}
	sc.Compare = analytics.CompareNone
	if in.Compare != "" {
		q.Set("compare", in.Compare)
		if sc.Compare, err = params.OneOf(q, "compare", analytics.CompareNone, analytics.CompareNone, analytics.ComparePreviousPeriod, analytics.ComparePreviousYear); err != nil {
			return sc, err
		}
	}
	return sc, nil
}

func decode[T any](in json.RawMessage) (T, error) {
	var v T
	if len(in) == 0 {
		return v, nil
	}
	if err := json.Unmarshal(in, &v); err != nil {
		return v, fmt.Errorf("invalid input: %w", err)
	}
	return v, nil
}

func limit(n, def, max int) int {
	if n <= 0 {
		return def
	}
	return min(n, max)
}

// NewTools returns the analyst's read-only tool set.
func NewTools(s Services) []Tool {
	return []Tool{
		{
			Name: "get_overview",
			Description: "Account-level totals (spend, impressions, clicks, conversions, conversion value, CTR, CPC, CPM, CPA, ROAS) " +
				"for a date range, with a daily series. Start here for questions about overall performance.",
			Properties: withCompare(scopeProps),
			Run: func(ctx context.Context, m organizations.Membership, raw json.RawMessage) (any, error) {
				in, err := decode[scopeInput](raw)
				if err != nil {
					return nil, err
				}
				sc, err := in.scope(m)
				if err != nil {
					return nil, err
				}
				return s.Analytics.Overview(ctx, sc)
			},
		},
		{
			Name: "list_campaigns",
			Description: "Campaigns with their metrics for a date range, sorted and filtered. Metrics are in each campaign's account currency. " +
				"Use to find top or worst performers, e.g. sort by spend desc, or by roas asc.",
			Properties: withCompare(merge(scopeProps, map[string]any{
				"sort":   map[string]any{"type": "string", "enum": analytics.CampaignSorts},
				"order":  map[string]any{"type": "string", "enum": []string{"asc", "desc"}},
				"status": map[string]any{"type": "string", "enum": []string{"active", "paused", "archived"}},
				"search": map[string]any{"type": "string", "description": "Match on campaign name."},
				"limit":  map[string]any{"type": "integer", "description": "Rows to return, 1-50 (default 20)."},
			})),
			Run: func(ctx context.Context, m organizations.Membership, raw json.RawMessage) (any, error) {
				in, err := decode[struct {
					scopeInput
					Sort   string `json:"sort"`
					Order  string `json:"order"`
					Status string `json:"status"`
					Search string `json:"search"`
					Limit  int    `json:"limit"`
				}](raw)
				if err != nil {
					return nil, err
				}
				sc, err := in.scope(m)
				if err != nil {
					return nil, err
				}
				q := analytics.CampaignQuery{Scope: sc, Status: in.Status, Search: in.Search, Sort: in.Sort, Order: in.Order,
					Page: params.Page{Limit: limit(in.Limit, 20, 50)}}
				if q.Sort == "" {
					q.Sort = "spend"
				}
				if q.Order == "" {
					q.Order = "desc"
				}
				return s.Analytics.Campaigns(ctx, q)
			},
		},
		{
			Name:        "get_breakdown",
			Description: "Totals split by country, device, placement or publisher_platform for a date range.",
			Properties: merge(scopeProps, map[string]any{
				"dimension": map[string]any{"type": "string", "enum": analytics.BreakdownDimensions},
			}),
			Required: []string{"dimension"},
			Run: func(ctx context.Context, m organizations.Membership, raw json.RawMessage) (any, error) {
				in, err := decode[struct {
					scopeInput
					Dimension string `json:"dimension"`
				}](raw)
				if err != nil {
					return nil, err
				}
				sc, err := in.scope(m)
				if err != nil {
					return nil, err
				}
				return s.Analytics.Breakdowns(ctx, sc, in.Dimension)
			},
		},
		{
			Name: "get_dayparting_heatmap",
			Description: "Weekday x hour grid (account local time) of one metric, for finding the best and worst hours to run ads. " +
				"Cells with little spend are unreliable; say so when you rely on them.",
			Properties: merge(scopeProps, map[string]any{
				"metric": map[string]any{"type": "string", "enum": analytics.DaypartingMetrics},
			}),
			Run: func(ctx context.Context, m organizations.Membership, raw json.RawMessage) (any, error) {
				in, err := decode[struct {
					scopeInput
					Metric string `json:"metric"`
				}](raw)
				if err != nil {
					return nil, err
				}
				sc, err := in.scope(m)
				if err != nil {
					return nil, err
				}
				if in.Metric == "" {
					in.Metric = "roas"
				}
				return s.Analytics.Dayparting(ctx, sc, in.Metric)
			},
		},
		{
			Name: "find_wasted_spend",
			Description: "Campaigns, ad sets or ads that spent money with no or few conversions, or below a ROAS floor. " +
				"Use for questions about waste, what to pause, or what isn't working.",
			Properties: merge(scopeProps, map[string]any{
				"level":           map[string]any{"type": "string", "enum": []string{"campaign", "ad_group", "ad"}},
				"min_spend":       map[string]any{"type": "number", "description": "Only flag entities that spent more than this, in account currency."},
				"max_conversions": map[string]any{"type": "number", "description": "Flag at or below this many conversions (default 0)."},
				"roas_below":      map[string]any{"type": "number", "description": "Also flag ROAS below this (default 1.0; 0 disables)."},
				"limit":           map[string]any{"type": "integer", "description": "Rows to return, 1-50 (default 20)."},
			}),
			Run: func(ctx context.Context, m organizations.Membership, raw json.RawMessage) (any, error) {
				in, err := decode[struct {
					scopeInput
					analytics.WastedCriteria
					RoasBelow *float64 `json:"roas_below"`
					Limit     int      `json:"limit"`
				}](raw)
				if err != nil {
					return nil, err
				}
				sc, err := in.scope(m)
				if err != nil {
					return nil, err
				}
				c := in.WastedCriteria
				if c.Level == "" {
					c.Level = "campaign"
				}
				c.ROASBelow = 1.0
				if in.RoasBelow != nil {
					c.ROASBelow = *in.RoasBelow
				}
				return s.Analytics.WastedSpend(ctx, analytics.WastedQuery{Scope: sc, Criteria: c, Page: params.Page{Limit: limit(in.Limit, 20, 50)}})
			},
		},
		{
			Name:        "list_automations",
			Description: "The org's automation rules and dayparting schedules, with whether each is enabled or in dry run.",
			Run: func(ctx context.Context, m organizations.Membership, _ json.RawMessage) (any, error) {
				rules, err := s.Automation.ListRules(ctx, m.OrganizationID)
				if err != nil {
					return nil, err
				}
				schedules, err := s.Automation.ListSchedules(ctx, m.OrganizationID)
				if err != nil {
					return nil, err
				}
				return map[string]any{"rules": rules, "schedules": schedules}, nil
			},
		},
		{
			Name: "list_recent_actions",
			Description: "Recent changes made to ad accounts (pauses, budget changes), manual or by rules, schedules and recommendations, newest first. " +
				"Use to explain why performance changed.",
			Properties: map[string]any{
				"source": map[string]any{"type": "string", "description": "manual, schedule, rule or revert."},
				"limit":  map[string]any{"type": "integer", "description": "Rows to return, 1-50 (default 20)."},
			},
			Run: func(ctx context.Context, m organizations.Membership, raw json.RawMessage) (any, error) {
				in, err := decode[struct {
					Source string `json:"source"`
					Limit  int    `json:"limit"`
				}](raw)
				if err != nil {
					return nil, err
				}
				rows, total, _, err := s.Automation.ListActions(ctx, m.OrganizationID, automation.ActionFilter{Source: in.Source, Limit: limit(in.Limit, 20, 50)})
				if err != nil {
					return nil, err
				}
				return map[string]any{"actions": rows, "total": total}, nil
			},
		},
		{
			Name:        "list_alerts",
			Description: "Open alerts Adwise detected, such as spend spikes, conversion or ROAS drops, and campaigns that stopped delivering.",
			Run: func(ctx context.Context, m organizations.Membership, _ json.RawMessage) (any, error) {
				rows, total, err := s.Alerts.List(ctx, m, alerts.ListFilter{Status: "open", Limit: 30})
				if err != nil {
					return nil, err
				}
				return map[string]any{"alerts": rows, "total": total}, nil
			},
		},
		{
			Name: "list_recommendations",
			Description: "Adwise's open recommendations (suggested pauses, budget changes, fatigued creatives) and the org's target CPA and ROAS. " +
				"The user accepts or dismisses them in the Adwise inbox.",
			Run: func(ctx context.Context, m organizations.Membership, _ json.RawMessage) (any, error) {
				recs, err := s.Recommendations.List(ctx, m.OrganizationID, "open")
				if err != nil {
					return nil, err
				}
				if len(recs) > 30 {
					recs = recs[:30]
				}
				targets, err := s.Recommendations.GetTargets(ctx, m.OrganizationID)
				if err != nil {
					return nil, err
				}
				return map[string]any{"recommendations": recs, "targets": targets}, nil
			},
		},
	}
}

// encodeResult renders a tool result for the model, trimmed to maxResultBytes.
func encodeResult(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "error: could not encode result: " + err.Error()
	}
	if len(b) > maxResultBytes {
		return string(b[:maxResultBytes]) + "\n[truncated at " + strconv.Itoa(maxResultBytes) + " bytes; narrow the query or lower the limit]"
	}
	return string(b)
}
