package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/iamv1n/adwise/internal/ads"
)

// targetingSpec builds an ad set's targeting.
func targetingSpec(t ads.Targeting) (map[string]any, error) {
	if len(t.Countries)+len(t.Regions)+len(t.Cities) == 0 {
		return nil, invalid("targeting needs at least one country, region or city")
	}
	ageMin, ageMax := t.AgeMin, t.AgeMax
	if ageMin == 0 {
		ageMin = 18
	}
	if ageMax == 0 {
		ageMax = 65
	}
	if ageMin < 13 || ageMax > 65 || ageMin > ageMax {
		return nil, invalid("targeting ages must be within 13–65 with age_min ≤ age_max")
	}

	geo := map[string]any{}
	if len(t.Countries) > 0 {
		geo["countries"] = t.Countries
	}
	if len(t.Regions) > 0 {
		regions := make([]map[string]any, len(t.Regions))
		for i, k := range t.Regions {
			regions[i] = map[string]any{"key": k}
		}
		geo["regions"] = regions
	}
	if len(t.Cities) > 0 {
		cities := make([]map[string]any, len(t.Cities))
		for i, c := range t.Cities {
			m := map[string]any{"key": c.Key}
			if c.RadiusKm > 0 {
				m["radius"], m["distance_unit"] = c.RadiusKm, "kilometer"
			}
			cities[i] = m
		}
		geo["cities"] = cities
	}
	spec := map[string]any{"geo_locations": geo}
	if len(t.ExcludedCountries) > 0 {
		spec["excluded_geo_locations"] = map[string]any{"countries": t.ExcludedCountries}
	}
	if len(t.Locales) > 0 {
		spec["locales"] = t.Locales
	}
	if len(t.Genders) > 0 {
		spec["genders"] = t.Genders
	}
	if t.AdvantageAudience {
		if ageMin > 25 {
			return nil, invalid("with Advantage+ audience, age_min must be 25 or lower")
		}
		spec["age_min"], spec["age_max"] = ageMin, 65
		if ageMax < 65 {
			spec["age_range"] = []int{ageMin, ageMax} // a suggestion, not a hard limit
		}
		spec["targeting_automation"] = map[string]any{"advantage_audience": 1}
	} else {
		spec["age_min"], spec["age_max"] = ageMin, ageMax
		spec["targeting_automation"] = map[string]any{"advantage_audience": 0}
	}

	// Interests of any category in one flexible_spec entry match on any of them.
	if len(t.Interests) > 0 {
		spec["flexible_spec"] = []any{byType(t.Interests)}
	}
	if len(t.ExcludedInterests) > 0 {
		spec["exclusions"] = byType(t.ExcludedInterests)
	}
	if len(t.Audiences) > 0 {
		spec["custom_audiences"] = idList(t.Audiences)
	}
	if len(t.ExcludedAudiences) > 0 {
		spec["excluded_custom_audiences"] = idList(t.ExcludedAudiences)
	}

	if p := t.Placements; p != nil {
		if len(p.Platforms) == 0 {
			return nil, invalid("manual placements need at least one platform")
		}
		spec["publisher_platforms"] = p.Platforms
		for key, v := range map[string][]string{
			"facebook_positions":         p.FacebookPositions,
			"instagram_positions":        p.InstagramPositions,
			"messenger_positions":        p.MessengerPositions,
			"audience_network_positions": p.AudienceNetworkPositions,
		} {
			if len(v) > 0 {
				spec[key] = v
			}
		}
	}
	return spec, nil
}

// byType groups options by category: {"interests": [...], "behaviors": [...]}.
func byType(opts []ads.TargetingOption) map[string]any {
	out := map[string][]map[string]string{}
	for _, o := range opts {
		typ := o.Type
		if typ == "" {
			typ = "interests"
		}
		out[typ] = append(out[typ], map[string]string{"id": o.ID, "name": o.Name})
	}
	m := make(map[string]any, len(out))
	for k, v := range out {
		m[k] = v
	}
	return m
}

func idList(ids []string) []map[string]string {
	out := make([]map[string]string, len(ids))
	for i, id := range ids {
		out[i] = map[string]string{"id": id}
	}
	return out
}

// attributionSpec maps an attribution setting to Meta's attribution_spec.
func attributionSpec(setting string) ([]map[string]any, error) {
	click := func(d int) map[string]any { return map[string]any{"event_type": "CLICK_THROUGH", "window_days": d} }
	view := map[string]any{"event_type": "VIEW_THROUGH", "window_days": 1}
	switch setting {
	case "7d_click_1d_view":
		return []map[string]any{click(7), view}, nil
	case "7d_click":
		return []map[string]any{click(7)}, nil
	case "1d_click":
		return []map[string]any{click(1)}, nil
	case "1d_click_1d_view":
		return []map[string]any{click(1), view}, nil
	}
	return nil, invalid("unknown attribution setting %q", setting)
}

// SearchTargeting finds interests, locations or languages by name.
func (c *Client) SearchTargeting(ctx context.Context, accountID string, kind ads.TargetingKind, query string) ([]ads.TargetingOption, error) {
	out := []ads.TargetingOption{}
	switch kind {
	case ads.TargetingInterests:
		var res struct {
			Data []struct {
				ID    string   `json:"id"`
				Name  string   `json:"name"`
				Type  string   `json:"type"`
				Path  []string `json:"path"`
				Lower int64    `json:"audience_size_lower_bound"`
			} `json:"data"`
		}
		if err := c.call(ctx, "GET", actPath(accountID)+"/targetingsearch", url.Values{"q": {query}, "limit": {"25"}}, &res); err != nil {
			return nil, err
		}
		for _, d := range res.Data {
			desc := ""
			if len(d.Path) > 1 {
				desc = strings.Join(d.Path[:len(d.Path)-1], " › ")
			}
			out = append(out, ads.TargetingOption{ID: d.ID, Name: d.Name, Type: d.Type, Description: desc, AudienceSize: d.Lower})
		}
	case ads.TargetingLocations:
		var res struct {
			Data []struct {
				Key         string `json:"key"`
				Name        string `json:"name"`
				Type        string `json:"type"`
				Region      string `json:"region"`
				CountryName string `json:"country_name"`
			} `json:"data"`
		}
		params := url.Values{"type": {"adgeolocation"}, "q": {query}, "location_types": {`["region","city"]`}, "limit": {"25"}}
		if err := c.call(ctx, "GET", "search", params, &res); err != nil {
			return nil, err
		}
		for _, d := range res.Data {
			desc := d.CountryName
			if d.Type == "city" && d.Region != "" {
				desc = d.Region + ", " + d.CountryName
			}
			out = append(out, ads.TargetingOption{ID: d.Key, Name: d.Name, Type: d.Type, Description: desc})
		}
	case ads.TargetingLanguages:
		var res struct {
			Data []struct {
				Key  json.Number `json:"key"`
				Name string      `json:"name"`
			} `json:"data"`
		}
		if err := c.call(ctx, "GET", "search", url.Values{"type": {"adlocale"}, "q": {query}, "limit": {"25"}}, &res); err != nil {
			return nil, err
		}
		for _, d := range res.Data {
			out = append(out, ads.TargetingOption{ID: d.Key.String(), Name: d.Name, Type: "locale"})
		}
	default:
		return nil, invalid("unknown targeting search %q", kind)
	}
	return out, nil
}

// ListAudiences returns the account's custom and lookalike audiences.
func (c *Client) ListAudiences(ctx context.Context, accountID string) ([]ads.Audience, error) {
	out := []ads.Audience{}
	err := c.each(ctx, actPath(accountID)+"/customaudiences", url.Values{"fields": {"id,name,subtype,approximate_count_lower_bound"}, "limit": {"200"}},
		func(raw json.RawMessage) error {
			var a struct {
				ID      string `json:"id"`
				Name    string `json:"name"`
				Subtype string `json:"subtype"`
				Count   int64  `json:"approximate_count_lower_bound"`
			}
			if err := json.Unmarshal(raw, &a); err != nil {
				return fmt.Errorf("meta: decode audience: %w", err)
			}
			out = append(out, ads.Audience{ID: a.ID, Name: a.Name, Subtype: a.Subtype, ApproxCount: a.Count})
			return nil
		})
	return out, err
}
