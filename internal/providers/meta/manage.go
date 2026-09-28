package meta

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

// Write methods for campaign management (ads.Manager).
//
// References (checked 2026-09):
//   - Campaign create/update: https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/
//     special_ad_categories is required; only ACTIVE/PAUSED on create. Since
//     v24+ (enforced on v26.0), a campaign without a campaign budget must send
//     is_adset_budget_sharing_enabled (error 100/4834011 otherwise).
//     Campaign spend_cap is in minor units; 922337203685478 removes it.
//   - Ad set create: https://developers.facebook.com/docs/marketing-api/reference/ad-account/adsets/
//     lifetime_budget requires end_time; since v23.0 new ad sets must set
//     targeting.targeting_automation.advantage_audience explicitly. With
//     Advantage+ audience on, age_min must be 18–25 and age_max is fixed at 65
//     (a narrower range is sent as the age_range suggestion). Objectives such
//     as sales, leads and app promotion need a promoted_object.
//   - Ad account: POST spend_cap is in the currency's standard denomination
//     (23.50 = $23.50) and spend_cap_action=delete removes it; the spend_cap,
//     amount_spent and balance fields are read in minor units.
//   - Ad images: POST /act_{id}/adimages with base64 "bytes".
//
// Budgets and bids are sent in Meta minor units: micros converted with the
// account currency offset (×100 for most currencies, ×1 for zero-decimal
// ones such as JPY, KRW, IDR; see CurrencyOffset).

var _ ads.Manager = (*Client)(nil)

// NoSpendCap is the campaign spend_cap value Meta documents for "no cap".
const NoSpendCap = "922337203685478"

func invalid(format string, args ...any) error {
	return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrInvalidRequest, Message: fmt.Sprintf(format, args...)}
}

func notOwned(kind string) error {
	return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrNotFound, Message: kind + " does not belong to this ad account"}
}

func statusValue(s ads.Status, create bool) (string, error) {
	switch s {
	case ads.StatusActive:
		return "ACTIVE", nil
	case ads.StatusPaused, "":
		return "PAUSED", nil
	case ads.StatusArchived:
		if !create {
			return "ARCHIVED", nil
		}
	}
	return "", providers.Unsupported(ads.ProviderMeta, "cannot set status to %q", s)
}

func metaTime(t time.Time) string { return t.Format(time.RFC3339) }

// minorUnits converts micros to Meta minor units for the account currency.
func (c *Client) minorUnits(ctx context.Context, accountID, field string, m ads.Micros) (string, error) {
	cur, err := c.currency(ctx, accountID)
	if err != nil {
		return "", err
	}
	minor := providers.MicrosToMinor(m, CurrencyOffset(cur))
	if minor <= 0 {
		return "", invalid("%s must be positive in %s", field, cur)
	}
	return strconv.FormatInt(minor, 10), nil
}

// majorUnits formats micros as a decimal in the currency's standard
// denomination, rounded to the currency's minor unit.
func majorUnits(m ads.Micros, offset int64) string {
	minor := providers.MicrosToMinor(m, offset)
	if offset <= 1 {
		return strconv.FormatInt(minor, 10)
	}
	return fmt.Sprintf("%d.%02d", minor/offset, minor%offset)
}

func (c *Client) post(ctx context.Context, path string, params url.Values, what string) error {
	var res successResponse
	if err := c.call(ctx, http.MethodPost, path, params, &res); err != nil {
		return err
	}
	if !res.Success {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: what + " not acknowledged"}
	}
	return nil
}

type createResponse struct {
	ID string `json:"id"`
}

func (c *Client) create(ctx context.Context, path string, params url.Values, what string) (string, error) {
	var res createResponse
	if err := c.call(ctx, http.MethodPost, path, params, &res); err != nil {
		return "", err
	}
	if res.ID == "" {
		return "", &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: what + " creation returned no id"}
	}
	return res.ID, nil
}

type budgetInfo struct {
	AccountID      providers.FlexString `json:"account_id"`
	CampaignID     string               `json:"campaign_id"`
	DailyBudget    providers.FlexInt    `json:"daily_budget"`
	LifetimeBudget providers.FlexInt    `json:"lifetime_budget"`
	Campaign       *struct {
		DailyBudget    providers.FlexInt `json:"daily_budget"`
		LifetimeBudget providers.FlexInt `json:"lifetime_budget"`
	} `json:"campaign"`
}

func (c *Client) budgetInfo(ctx context.Context, accountID, id, fields, kind string) (budgetInfo, error) {
	var info budgetInfo
	if err := c.call(ctx, http.MethodGet, id, url.Values{"fields": {fields}}, &info); err != nil {
		return info, err
	}
	if string(info.AccountID) != normalizeAccountID(accountID) {
		return info, notOwned(kind)
	}
	return info, nil
}

// budgetParams validates a budget change against the object's current budget
// type and adds it to v.
func (c *Client) budgetParams(ctx context.Context, accountID, kind string, v url.Values, daily, lifetime *ads.Micros, curDaily, curLifetime int64) error {
	if daily == nil && lifetime == nil {
		return nil
	}
	if daily != nil && lifetime != nil {
		return invalid("set either daily_budget or lifetime_budget, not both")
	}
	if curDaily <= 0 && curLifetime <= 0 {
		if kind == "campaign" {
			return providers.Unsupported(ads.ProviderMeta, "this campaign's budget is set on its ad sets")
		}
		return providers.Unsupported(ads.ProviderMeta, "this ad set uses its campaign's budget")
	}
	if daily != nil {
		if curDaily <= 0 {
			return providers.Unsupported(ads.ProviderMeta, "this %s uses a lifetime budget", kind)
		}
		s, err := c.minorUnits(ctx, accountID, "daily_budget", *daily)
		if err != nil {
			return err
		}
		v.Set("daily_budget", s)
	}
	if lifetime != nil {
		if curLifetime <= 0 {
			return providers.Unsupported(ads.ProviderMeta, "this %s uses a daily budget", kind)
		}
		s, err := c.minorUnits(ctx, accountID, "lifetime_budget", *lifetime)
		if err != nil {
			return err
		}
		v.Set("lifetime_budget", s)
	}
	return nil
}

func commonParams(v url.Values, status *ads.Status, name *string) error {
	if status != nil {
		s, err := statusValue(*status, false)
		if err != nil {
			return err
		}
		v.Set("status", s)
	}
	if name != nil {
		if *name == "" {
			return invalid("name must not be empty")
		}
		v.Set("name", *name)
	}
	return nil
}

// UpdateCampaign changes status, name, budget, spend cap and end time.
func (c *Client) UpdateCampaign(ctx context.Context, accountID, campaignID string, p ads.CampaignPatch) error {
	info, err := c.budgetInfo(ctx, accountID, campaignID, "account_id,daily_budget,lifetime_budget", "campaign")
	if err != nil {
		return err
	}
	v := url.Values{}
	if err := commonParams(v, p.Status, p.Name); err != nil {
		return err
	}
	if err := c.budgetParams(ctx, accountID, "campaign", v, p.DailyBudget, p.LifetimeBudget, int64(info.DailyBudget), int64(info.LifetimeBudget)); err != nil {
		return err
	}
	switch {
	case p.ClearSpendCap:
		v.Set("spend_cap", NoSpendCap)
	case p.SpendCap != nil:
		s, err := c.minorUnits(ctx, accountID, "spend_cap", *p.SpendCap)
		if err != nil {
			return err
		}
		v.Set("spend_cap", s)
	}
	switch {
	case p.ClearEndTime:
		v.Set("stop_time", "0")
	case p.EndTime != nil:
		v.Set("stop_time", metaTime(*p.EndTime))
	}
	if len(v) == 0 {
		return nil
	}
	return c.post(ctx, campaignID, v, "campaign update")
}

// UpdateAdGroup changes an ad set's status, name, budget, bid and end time.
func (c *Client) UpdateAdGroup(ctx context.Context, accountID, adSetID string, p ads.AdGroupPatch) error {
	info, err := c.budgetInfo(ctx, accountID, adSetID, "account_id,daily_budget,lifetime_budget", "ad set")
	if err != nil {
		return err
	}
	v := url.Values{}
	if err := commonParams(v, p.Status, p.Name); err != nil {
		return err
	}
	if err := c.budgetParams(ctx, accountID, "ad set", v, p.DailyBudget, p.LifetimeBudget, int64(info.DailyBudget), int64(info.LifetimeBudget)); err != nil {
		return err
	}
	if p.BidAmount != nil {
		s, err := c.minorUnits(ctx, accountID, "bid_amount", *p.BidAmount)
		if err != nil {
			return err
		}
		v.Set("bid_amount", s)
	}
	switch {
	case p.ClearEndTime:
		if info.LifetimeBudget > 0 {
			return providers.Unsupported(ads.ProviderMeta, "an ad set with a lifetime budget needs an end time")
		}
		v.Set("end_time", "0")
	case p.EndTime != nil:
		v.Set("end_time", metaTime(*p.EndTime))
	}
	if len(v) == 0 {
		return nil
	}
	return c.post(ctx, adSetID, v, "ad set update")
}

// UpdateAd changes an ad's status and name.
func (c *Client) UpdateAd(ctx context.Context, accountID, adID string, p ads.AdPatch) error {
	if _, err := c.budgetInfo(ctx, accountID, adID, "account_id", "ad"); err != nil {
		return err
	}
	v := url.Values{}
	if err := commonParams(v, p.Status, p.Name); err != nil {
		return err
	}
	if len(v) == 0 {
		return nil
	}
	return c.post(ctx, adID, v, "ad update")
}

func jsonParam(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// CreateCampaign creates a campaign. A budget makes it an Advantage campaign
// budget campaign; without one each ad set carries its own budget.
func (c *Client) CreateCampaign(ctx context.Context, accountID string, s ads.CampaignSpec) (string, error) {
	if s.Name == "" || s.Objective == "" {
		return "", invalid("name and objective are required")
	}
	status, err := statusValue(s.Status, true)
	if err != nil {
		return "", err
	}
	cats := s.SpecialAdCategories
	if cats == nil {
		cats = []string{}
	}
	v := url.Values{
		"name": {s.Name}, "objective": {s.Objective}, "status": {status},
		"special_ad_categories": {jsonParam(cats)},
	}
	if s.DailyBudget != nil && s.LifetimeBudget != nil {
		return "", invalid("set either daily_budget or lifetime_budget, not both")
	}
	hasBudget := s.DailyBudget != nil || s.LifetimeBudget != nil
	if s.DailyBudget != nil {
		if v["daily_budget"], err = c.minorList(ctx, accountID, "daily_budget", *s.DailyBudget); err != nil {
			return "", err
		}
	}
	if s.LifetimeBudget != nil {
		if s.EndTime == nil {
			return "", invalid("lifetime_budget requires end_time")
		}
		if v["lifetime_budget"], err = c.minorList(ctx, accountID, "lifetime_budget", *s.LifetimeBudget); err != nil {
			return "", err
		}
	}
	if s.EndTime != nil {
		v.Set("stop_time", metaTime(*s.EndTime))
	}
	if hasBudget {
		if s.BidStrategy != "" {
			v.Set("bid_strategy", s.BidStrategy)
		}
	} else {
		// Required by Meta when the budget lives on the ad sets.
		v.Set("is_adset_budget_sharing_enabled", "false")
		if s.BidStrategy != "" && s.BidStrategy != "LOWEST_COST_WITHOUT_CAP" {
			return "", providers.Unsupported(ads.ProviderMeta, "bid_strategy %s needs a campaign budget; without one, set bid_amount on each ad set", s.BidStrategy)
		}
	}
	return c.create(ctx, actPath(accountID)+"/campaigns", v, "campaign")
}

func (c *Client) minorList(ctx context.Context, accountID, field string, m ads.Micros) ([]string, error) {
	s, err := c.minorUnits(ctx, accountID, field, m)
	if err != nil {
		return nil, err
	}
	return []string{s}, nil
}

// CreateAdGroup creates an ad set. A budget is required exactly when the
// campaign has none.
func (c *Client) CreateAdGroup(ctx context.Context, accountID string, s ads.AdGroupSpec) (string, error) {
	if s.Name == "" || s.OptimizationGoal == "" || s.BillingEvent == "" {
		return "", invalid("name, optimization_goal and billing_event are required")
	}
	status, err := statusValue(s.Status, true)
	if err != nil {
		return "", err
	}
	targeting, err := targetingSpec(s.Targeting)
	if err != nil {
		return "", err
	}
	camp, err := c.budgetInfo(ctx, accountID, s.CampaignID, "account_id,daily_budget,lifetime_budget", "campaign")
	if err != nil {
		return "", err
	}
	campaignBudget := camp.DailyBudget > 0 || camp.LifetimeBudget > 0
	if s.DailyBudget != nil && s.LifetimeBudget != nil {
		return "", invalid("set either daily_budget or lifetime_budget, not both")
	}
	hasBudget := s.DailyBudget != nil || s.LifetimeBudget != nil
	switch {
	case campaignBudget && hasBudget:
		return "", providers.Unsupported(ads.ProviderMeta, "the campaign has a campaign budget; ad sets cannot carry their own")
	case !campaignBudget && !hasBudget:
		return "", invalid("the campaign has no budget, so the ad set needs daily_budget or lifetime_budget")
	}
	v := url.Values{
		"name": {s.Name}, "campaign_id": {s.CampaignID}, "status": {status},
		"optimization_goal": {s.OptimizationGoal}, "billing_event": {s.BillingEvent},
		"targeting": {jsonParam(targeting)},
	}
	if s.DailyBudget != nil {
		if v["daily_budget"], err = c.minorList(ctx, accountID, "daily_budget", *s.DailyBudget); err != nil {
			return "", err
		}
	}
	if s.LifetimeBudget != nil {
		if s.EndTime == nil {
			return "", invalid("lifetime_budget requires end_time")
		}
		if v["lifetime_budget"], err = c.minorList(ctx, accountID, "lifetime_budget", *s.LifetimeBudget); err != nil {
			return "", err
		}
	}
	if s.StartTime != nil {
		v.Set("start_time", metaTime(*s.StartTime))
	}
	if s.EndTime != nil {
		v.Set("end_time", metaTime(*s.EndTime))
	}
	if s.BidAmount != nil {
		if v["bid_amount"], err = c.minorList(ctx, accountID, "bid_amount", *s.BidAmount); err != nil {
			return "", err
		}
	}
	if !campaignBudget {
		// Ad set budgets carry their own bid strategy.
		strategy := s.BidStrategy
		if strategy == "" {
			strategy = "LOWEST_COST_WITHOUT_CAP"
			if s.BidAmount != nil {
				strategy = "LOWEST_COST_WITH_BID_CAP"
			}
		}
		v.Set("bid_strategy", strategy)
		switch strategy {
		case "LOWEST_COST_WITH_BID_CAP", "COST_CAP":
			if s.BidAmount == nil {
				return "", invalid("%s needs bid_amount", strategy)
			}
		case "LOWEST_COST_WITH_MIN_ROAS":
			if s.ROASFloor == nil {
				return "", invalid("LOWEST_COST_WITH_MIN_ROAS needs a minimum ROAS")
			}
		}
	}
	if s.ROASFloor != nil {
		// Meta takes the floor in units of 0.0001 (2.5 ROAS = 25000).
		v.Set("bid_constraints", jsonParam(map[string]int64{"roas_average_floor": int64(*s.ROASFloor*10000 + 0.5)}))
	}
	if s.Attribution != "" {
		spec, err := attributionSpec(s.Attribution)
		if err != nil {
			return "", err
		}
		v.Set("attribution_spec", jsonParam(spec))
	}
	if s.DestinationType != "" {
		v.Set("destination_type", s.DestinationType)
	}
	if len(s.PromotedObject) > 0 {
		v.Set("promoted_object", jsonParam(s.PromotedObject))
	}
	return c.create(ctx, actPath(accountID)+"/adsets", v, "ad set")
}

// CreateAd creates an ad. Image, video and carousel ads (or a promoted Page
// post) get an ad creative first; flexible ads send their assets on the ad.
func (c *Client) CreateAd(ctx context.Context, accountID string, s ads.AdSpec) (string, error) {
	if s.Name == "" {
		return "", invalid("name is required")
	}
	status, err := statusValue(s.Status, true)
	if err != nil {
		return "", err
	}
	if _, err := c.budgetInfo(ctx, accountID, s.AdGroupID, "account_id", "ad set"); err != nil {
		return "", err
	}
	var cv url.Values
	switch {
	case s.ObjectStoryID != "":
		cv = url.Values{"name": {s.Name + " creative"}, "object_story_id": {s.ObjectStoryID}}
		if s.URLTags != "" {
			cv.Set("url_tags", s.URLTags)
		}
	case s.Creative != nil && s.Creative.Format == ads.FormatFlexible:
		v, err := flexibleParams(s, status)
		if err != nil {
			return "", err
		}
		return c.create(ctx, actPath(accountID)+"/ads", v, "ad")
	case s.Creative != nil:
		if cv, err = c.creativeParams(ctx, accountID, s); err != nil {
			return "", err
		}
	default:
		return "", invalid("either creative or object_story_id is required")
	}
	creativeID, err := c.create(ctx, actPath(accountID)+"/adcreatives", cv, "ad creative")
	if err != nil {
		return "", err
	}
	return c.create(ctx, actPath(accountID)+"/ads", url.Values{
		"name": {s.Name}, "adset_id": {s.AdGroupID}, "status": {status},
		"creative": {jsonParam(map[string]string{"creative_id": creativeID})},
	}, "ad")
}

// UploadImage adds an image to the ad account's image library.
func (c *Client) UploadImage(ctx context.Context, accountID, filename string, data []byte) (ads.Image, error) {
	if len(data) == 0 {
		return ads.Image{}, invalid("image is empty")
	}
	v := url.Values{"bytes": {base64.StdEncoding.EncodeToString(data)}}
	if filename != "" {
		v.Set("name", filename)
	}
	var res struct {
		Images map[string]struct {
			Hash string `json:"hash"`
			URL  string `json:"url"`
		} `json:"images"`
	}
	if err := c.call(ctx, http.MethodPost, actPath(accountID)+"/adimages", v, &res); err != nil {
		return ads.Image{}, err
	}
	for _, img := range res.Images {
		if img.Hash != "" {
			return ads.Image{Hash: img.Hash, URL: img.URL}, nil
		}
	}
	return ads.Image{}, &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: "image upload returned no hash"}
}

type metaPage struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Picture struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	} `json:"picture"`
	Instagram struct {
		ID       string `json:"id"`
		Username string `json:"username"`
	} `json:"instagram_business_account"`
}

// ListPages returns the Pages the ad account can promote, falling back to
// the Pages the connected user manages.
func (c *Client) ListPages(ctx context.Context, accountID string) ([]ads.Page, error) {
	out := []ads.Page{}
	collect := func(raw json.RawMessage) error {
		var p metaPage
		if err := json.Unmarshal(raw, &p); err != nil {
			return fmt.Errorf("meta: decode page: %w", err)
		}
		out = append(out, ads.Page{ID: p.ID, Name: p.Name, PictureURL: p.Picture.Data.URL,
			InstagramUserID: p.Instagram.ID, InstagramUsername: p.Instagram.Username})
		return nil
	}
	fields := url.Values{"fields": {"id,name,picture{url},instagram_business_account{id,username}"}}
	if err := c.each(ctx, actPath(accountID)+"/promote_pages", fields, collect); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		if err := c.each(ctx, "me/accounts", fields, collect); err != nil {
			return nil, err
		}
	}
	return out, nil
}

type metaLimits struct {
	Currency    string            `json:"currency"`
	SpendCap    providers.FlexInt `json:"spend_cap"`
	AmountSpent providers.FlexInt `json:"amount_spent"`
	Balance     providers.FlexInt `json:"balance"`
}

// AccountLimits reads the account spend cap, amount spent and balance.
func (c *Client) AccountLimits(ctx context.Context, accountID string) (ads.AccountLimits, error) {
	var m metaLimits
	if err := c.call(ctx, http.MethodGet, actPath(accountID), url.Values{"fields": {"currency,spend_cap,amount_spent,balance"}}, &m); err != nil {
		return ads.AccountLimits{}, err
	}
	c.rememberCurrency(accountID, m.Currency)
	off := CurrencyOffset(m.Currency)
	out := ads.AccountLimits{
		Currency:    m.Currency,
		AmountSpent: providers.MinorToMicros(int64(m.AmountSpent), off),
		Balance:     providers.MinorToMicros(int64(m.Balance), off),
		SpendCap:    budget(m.SpendCap, off),
	}
	return out, nil
}

// SetAccountSpendCap sets (or with nil, removes) the account spend cap. Meta
// takes this value in standard units, unlike every other budget field.
func (c *Client) SetAccountSpendCap(ctx context.Context, accountID string, spendCap *ads.Micros) error {
	v := url.Values{}
	if spendCap == nil {
		v.Set("spend_cap_action", "delete")
	} else {
		cur, err := c.currency(ctx, accountID)
		if err != nil {
			return err
		}
		off := CurrencyOffset(cur)
		if providers.MicrosToMinor(*spendCap, off) <= 0 {
			return invalid("spend_cap must be positive")
		}
		v.Set("spend_cap", majorUnits(*spendCap, off))
	}
	return c.post(ctx, actPath(accountID), v, "spend cap update")
}

type ownedObject struct {
	AccountID providers.FlexString `json:"account_id"`
}

func (c *Client) getOwned(ctx context.Context, accountID, id, fields, kind string, out any) (json.RawMessage, error) {
	var raw json.RawMessage
	if err := c.call(ctx, http.MethodGet, id, url.Values{"fields": {fields}}, &raw); err != nil {
		return nil, err
	}
	var o ownedObject
	if err := json.Unmarshal(raw, &o); err != nil {
		return nil, fmt.Errorf("meta: decode %s: %w", kind, err)
	}
	if string(o.AccountID) != normalizeAccountID(accountID) {
		return nil, notOwned(kind)
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return nil, fmt.Errorf("meta: decode %s: %w", kind, err)
	}
	return raw, nil
}

func (c *Client) GetCampaign(ctx context.Context, accountID, campaignID string) (ads.Campaign, error) {
	cur, err := c.currency(ctx, accountID)
	if err != nil {
		return ads.Campaign{}, err
	}
	off := CurrencyOffset(cur)
	var m metaCampaign
	raw, err := c.getOwned(ctx, accountID, campaignID, campaignFields, "campaign", &m)
	if err != nil {
		return ads.Campaign{}, err
	}
	return ads.Campaign{
		Provider: ads.ProviderMeta, AccountExternalID: normalizeAccountID(accountID), ExternalID: m.ID, Name: m.Name,
		Status: objectStatus(m.Status), Objective: m.Objective,
		DailyBudget: budget(m.DailyBudget, off), LifetimeBudget: budget(m.LifetimeBudget, off), Raw: raw,
	}, nil
}

func (c *Client) GetAdGroup(ctx context.Context, accountID, adSetID string) (ads.AdGroup, error) {
	cur, err := c.currency(ctx, accountID)
	if err != nil {
		return ads.AdGroup{}, err
	}
	var m metaAdSet
	raw, err := c.getOwned(ctx, accountID, adSetID, adSetFields, "ad set", &m)
	if err != nil {
		return ads.AdGroup{}, err
	}
	return ads.AdGroup{
		Provider: ads.ProviderMeta, AccountExternalID: normalizeAccountID(accountID), CampaignExternalID: m.CampaignID,
		ExternalID: m.ID, Name: m.Name, Status: objectStatus(m.Status),
		DailyBudget: budget(m.DailyBudget, CurrencyOffset(cur)), Raw: raw,
	}, nil
}

func (c *Client) GetAd(ctx context.Context, accountID, adID string) (ads.Ad, error) {
	var m metaAd
	raw, err := c.getOwned(ctx, accountID, adID, adFields, "ad", &m)
	if err != nil {
		return ads.Ad{}, err
	}
	return ads.Ad{
		Provider: ads.ProviderMeta, AccountExternalID: normalizeAccountID(accountID), CampaignExternalID: m.CampaignID,
		AdGroupExternalID: m.AdSetID, ExternalID: m.ID, Name: m.Name, Status: objectStatus(m.Status),
		CreativeExternalID: m.Creative.ID, Raw: raw,
	}, nil
}

func (c *Client) GetCreative(ctx context.Context, accountID, creativeID string) (ads.Creative, error) {
	var m metaCreative
	raw, err := c.getOwned(ctx, accountID, creativeID, creativeFields, "creative", &m)
	if err != nil {
		return ads.Creative{}, err
	}
	thumb := m.ThumbnailURL
	if thumb == "" {
		thumb = m.ImageURL
	}
	return ads.Creative{
		Provider: ads.ProviderMeta, AccountExternalID: normalizeAccountID(accountID), ExternalID: m.ID, Name: m.Name,
		Type: creativeType(m), ThumbnailURL: thumb, Raw: raw,
	}, nil
}
