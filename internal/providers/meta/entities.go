package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

// Fields requested per object. Everything returned is also kept in Raw.
// https://developers.facebook.com/docs/marketing-api/reference/ad-account
// https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
// https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
// https://developers.facebook.com/docs/marketing-api/reference/adgroup
// https://developers.facebook.com/docs/marketing-api/reference/ad-creative
const (
	accountFields  = "id,account_id,name,currency,timezone_name,timezone_offset_hours_utc,account_status,disable_reason,business{id,name}"
	campaignFields = "id,account_id,name,status,effective_status,configured_status,objective,buying_type,bid_strategy,daily_budget,lifetime_budget,budget_remaining,spend_cap,special_ad_categories,start_time,stop_time,created_time,updated_time"
	adSetFields    = "id,account_id,campaign_id,name,status,effective_status,configured_status,daily_budget,lifetime_budget,budget_remaining,optimization_goal,billing_event,bid_strategy,bid_amount,start_time,end_time,created_time,updated_time"
	adFields       = "id,account_id,campaign_id,adset_id,name,status,effective_status,configured_status,creative{id},created_time,updated_time"
	creativeFields = "id,account_id,name,title,body,object_type,status,thumbnail_url,image_url,video_id,call_to_action_type,object_story_id,effective_object_story_id"
)

// Currencies whose Meta offset is 1 (amounts are in whole units). Every other
// currency uses offset 100. Source (table checked 2026-09):
// https://developers.facebook.com/docs/marketing-api/currencies
var offsetOneCurrencies = map[string]bool{
	"CLP": true, "COP": true, "HUF": true, "ISK": true, "IDR": true,
	"JPY": true, "KRW": true, "PYG": true, "TWD": true, "VND": true,
}

// CurrencyOffset returns how many Meta budget units make one currency unit.
func CurrencyOffset(currency string) int64 {
	if offsetOneCurrencies[strings.ToUpper(currency)] {
		return 1
	}
	return 100
}

type metaAccount struct {
	ID            string               `json:"id"`
	AccountID     providers.FlexString `json:"account_id"`
	Name          string               `json:"name"`
	Currency      string               `json:"currency"`
	TimezoneName  string               `json:"timezone_name"`
	AccountStatus int                  `json:"account_status"`
}

// accountStatus maps Meta's numeric account_status.
// https://developers.facebook.com/docs/marketing-api/reference/ad-account (account_status)
func accountStatus(s int) ads.Status {
	switch s {
	case 1, 9: // ACTIVE, IN_GRACE_PERIOD
		return ads.StatusActive
	case 2, 3, 7, 8, 100: // DISABLED, UNSETTLED, PENDING_RISK_REVIEW, PENDING_SETTLEMENT, PENDING_CLOSURE
		return ads.StatusPaused
	case 101: // CLOSED
		return ads.StatusArchived
	}
	return ads.StatusUnknown
}

// objectStatus maps the configured status of campaigns, ad sets and ads.
func objectStatus(s string) ads.Status {
	switch strings.ToUpper(s) {
	case "ACTIVE":
		return ads.StatusActive
	case "PAUSED":
		return ads.StatusPaused
	case "ARCHIVED":
		return ads.StatusArchived
	case "DELETED":
		return ads.StatusDeleted
	}
	return ads.StatusUnknown
}

// ListAccounts returns the ad accounts the token's user can access.
func (c *Client) ListAccounts(ctx context.Context) ([]ads.Account, error) {
	var out []ads.Account
	err := c.each(ctx, "me/adaccounts", url.Values{"fields": {accountFields}}, func(raw json.RawMessage) error {
		var a metaAccount
		if err := json.Unmarshal(raw, &a); err != nil {
			return fmt.Errorf("meta: decode ad account: %w", err)
		}
		id := string(a.AccountID)
		if id == "" {
			id = normalizeAccountID(a.ID)
		}
		c.rememberCurrency(id, a.Currency)
		out = append(out, ads.Account{
			Provider: ads.ProviderMeta, ExternalID: id, Name: a.Name,
			Currency: a.Currency, Timezone: a.TimezoneName,
			Status: accountStatus(a.AccountStatus), Raw: raw,
		})
		return nil
	})
	return out, err
}

func (c *Client) rememberCurrency(accountID, currency string) {
	if currency == "" {
		return
	}
	c.mu.Lock()
	c.currencies[normalizeAccountID(accountID)] = currency
	c.mu.Unlock()
}

// currency returns the account currency, fetching it once per account.
func (c *Client) currency(ctx context.Context, accountID string) (string, error) {
	id := normalizeAccountID(accountID)
	c.mu.Lock()
	cur, ok := c.currencies[id]
	c.mu.Unlock()
	if ok {
		return cur, nil
	}
	var a metaAccount
	if err := c.call(ctx, http.MethodGet, actPath(id), url.Values{"fields": {"currency"}}, &a); err != nil {
		return "", err
	}
	if a.Currency == "" {
		return "", fmt.Errorf("meta: account %s has no currency", id)
	}
	c.rememberCurrency(id, a.Currency)
	return a.Currency, nil
}

// budget converts a Meta budget (minor units per the currency offset, as a
// numeric string) to micros. Empty or zero means "not set at this level".
func budget(v providers.FlexInt, offset int64) *ads.Micros {
	if v <= 0 {
		return nil
	}
	m := providers.MinorToMicros(int64(v), offset)
	return &m
}

type metaCampaign struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Status         string            `json:"status"`
	Objective      string            `json:"objective"`
	DailyBudget    providers.FlexInt `json:"daily_budget"`
	LifetimeBudget providers.FlexInt `json:"lifetime_budget"`
}

func (c *Client) ListCampaigns(ctx context.Context, accountID string) ([]ads.Campaign, error) {
	cur, err := c.currency(ctx, accountID)
	if err != nil {
		return nil, err
	}
	offset := CurrencyOffset(cur)
	acct := normalizeAccountID(accountID)
	var out []ads.Campaign
	err = c.each(ctx, actPath(acct)+"/campaigns", url.Values{"fields": {campaignFields}}, func(raw json.RawMessage) error {
		var m metaCampaign
		if err := json.Unmarshal(raw, &m); err != nil {
			return fmt.Errorf("meta: decode campaign: %w", err)
		}
		out = append(out, ads.Campaign{
			Provider: ads.ProviderMeta, AccountExternalID: acct, ExternalID: m.ID, Name: m.Name,
			Status: objectStatus(m.Status), Objective: m.Objective,
			DailyBudget: budget(m.DailyBudget, offset), LifetimeBudget: budget(m.LifetimeBudget, offset),
			Raw: raw,
		})
		return nil
	})
	return out, err
}

type metaAdSet struct {
	ID          string            `json:"id"`
	CampaignID  string            `json:"campaign_id"`
	Name        string            `json:"name"`
	Status      string            `json:"status"`
	DailyBudget providers.FlexInt `json:"daily_budget"`
}

func (c *Client) ListAdGroups(ctx context.Context, accountID string) ([]ads.AdGroup, error) {
	cur, err := c.currency(ctx, accountID)
	if err != nil {
		return nil, err
	}
	offset := CurrencyOffset(cur)
	acct := normalizeAccountID(accountID)
	var out []ads.AdGroup
	err = c.each(ctx, actPath(acct)+"/adsets", url.Values{"fields": {adSetFields}}, func(raw json.RawMessage) error {
		var m metaAdSet
		if err := json.Unmarshal(raw, &m); err != nil {
			return fmt.Errorf("meta: decode ad set: %w", err)
		}
		out = append(out, ads.AdGroup{
			Provider: ads.ProviderMeta, AccountExternalID: acct, CampaignExternalID: m.CampaignID,
			ExternalID: m.ID, Name: m.Name, Status: objectStatus(m.Status),
			DailyBudget: budget(m.DailyBudget, offset), Raw: raw,
		})
		return nil
	})
	return out, err
}

type metaAd struct {
	ID         string `json:"id"`
	CampaignID string `json:"campaign_id"`
	AdSetID    string `json:"adset_id"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	Creative   struct {
		ID string `json:"id"`
	} `json:"creative"`
}

func (c *Client) ListAds(ctx context.Context, accountID string) ([]ads.Ad, error) {
	acct := normalizeAccountID(accountID)
	var out []ads.Ad
	err := c.each(ctx, actPath(acct)+"/ads", url.Values{"fields": {adFields}}, func(raw json.RawMessage) error {
		var m metaAd
		if err := json.Unmarshal(raw, &m); err != nil {
			return fmt.Errorf("meta: decode ad: %w", err)
		}
		out = append(out, ads.Ad{
			Provider: ads.ProviderMeta, AccountExternalID: acct, CampaignExternalID: m.CampaignID,
			AdGroupExternalID: m.AdSetID, ExternalID: m.ID, Name: m.Name, Status: objectStatus(m.Status),
			CreativeExternalID: m.Creative.ID, Raw: raw,
		})
		return nil
	})
	return out, err
}

type metaCreative struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ObjectType   string `json:"object_type"`
	ThumbnailURL string `json:"thumbnail_url"`
	ImageURL     string `json:"image_url"`
	VideoID      string `json:"video_id"`
}

// creativeType normalizes object_type (PHOTO, VIDEO, SHARE, STATUS, ...).
func creativeType(m metaCreative) string {
	switch {
	case m.VideoID != "" || strings.EqualFold(m.ObjectType, "VIDEO"):
		return "video"
	case strings.EqualFold(m.ObjectType, "PHOTO"):
		return "image"
	case m.ObjectType == "":
		return ""
	}
	return strings.ToLower(m.ObjectType)
}

func (c *Client) ListCreatives(ctx context.Context, accountID string) ([]ads.Creative, error) {
	acct := normalizeAccountID(accountID)
	var out []ads.Creative
	err := c.each(ctx, actPath(acct)+"/adcreatives", url.Values{"fields": {creativeFields}}, func(raw json.RawMessage) error {
		var m metaCreative
		if err := json.Unmarshal(raw, &m); err != nil {
			return fmt.Errorf("meta: decode creative: %w", err)
		}
		thumb := m.ThumbnailURL
		if thumb == "" {
			thumb = m.ImageURL
		}
		out = append(out, ads.Creative{
			Provider: ads.ProviderMeta, AccountExternalID: acct, ExternalID: m.ID, Name: m.Name,
			Type: creativeType(m), ThumbnailURL: thumb, Raw: raw,
		})
		return nil
	})
	return out, err
}

// Capabilities reports what this adapter supports. Reports are derived from
// the same planner FetchReport uses, so the list cannot drift.
func (c *Client) Capabilities() ads.Capabilities {
	return ads.Capabilities{
		Reports: providers.SupportedReports(func(d ads.ReportDefinition) bool {
			_, err := planReport(d)
			return err == nil
		}),
		PauseCampaign:        true,
		ActivateCampaign:     true,
		UpdateCampaignBudget: true,
	}
}

type successResponse struct {
	Success bool `json:"success"`
}

// SetCampaignStatus sets a campaign's configured status to ACTIVE or PAUSED.
func (c *Client) SetCampaignStatus(ctx context.Context, accountID, campaignID string, status ads.Status) error {
	var s string
	switch status {
	case ads.StatusActive:
		s = "ACTIVE"
	case ads.StatusPaused:
		s = "PAUSED"
	default:
		return providers.Unsupported(ads.ProviderMeta, "cannot set campaign status to %q", status)
	}
	if err := c.checkCampaignAccount(ctx, accountID, campaignID); err != nil {
		return err
	}
	var res successResponse
	if err := c.call(ctx, http.MethodPost, campaignID, url.Values{"status": {s}}, &res); err != nil {
		return err
	}
	if !res.Success {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: "status update not acknowledged"}
	}
	return nil
}

type campaignBudgetInfo struct {
	AccountID      providers.FlexString `json:"account_id"`
	DailyBudget    providers.FlexInt    `json:"daily_budget"`
	LifetimeBudget providers.FlexInt    `json:"lifetime_budget"`
}

func (c *Client) checkCampaignAccount(ctx context.Context, accountID, campaignID string) error {
	var info campaignBudgetInfo
	if err := c.call(ctx, http.MethodGet, campaignID, url.Values{"fields": {"account_id"}}, &info); err != nil {
		return err
	}
	if string(info.AccountID) != normalizeAccountID(accountID) {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrNotFound, Message: "campaign does not belong to this ad account"}
	}
	return nil
}

// UpdateCampaignBudget sets a campaign's daily_budget. It only applies to
// campaigns with a campaign-level daily budget (Advantage campaign budget);
// campaigns budgeted at the ad set level or with a lifetime budget return
// ErrUnsupported instead of silently changing budget type.
func (c *Client) UpdateCampaignBudget(ctx context.Context, accountID, campaignID string, dailyBudget ads.Micros) error {
	if dailyBudget <= 0 {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrInvalidRequest, Message: "daily budget must be positive"}
	}
	var info campaignBudgetInfo
	if err := c.call(ctx, http.MethodGet, campaignID, url.Values{"fields": {"account_id,daily_budget,lifetime_budget"}}, &info); err != nil {
		return err
	}
	if string(info.AccountID) != normalizeAccountID(accountID) {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrNotFound, Message: "campaign does not belong to this ad account"}
	}
	if info.LifetimeBudget > 0 {
		return providers.Unsupported(ads.ProviderMeta, "campaign %s uses a lifetime budget", campaignID)
	}
	if info.DailyBudget <= 0 {
		return providers.Unsupported(ads.ProviderMeta, "campaign %s is budgeted at the ad set level", campaignID)
	}
	cur, err := c.currency(ctx, accountID)
	if err != nil {
		return err
	}
	minor := providers.MicrosToMinor(dailyBudget, CurrencyOffset(cur))
	if minor <= 0 {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrInvalidRequest, Message: "daily budget rounds to zero in the account currency"}
	}
	var res successResponse
	if err := c.call(ctx, http.MethodPost, campaignID, url.Values{"daily_budget": {fmt.Sprint(minor)}}, &res); err != nil {
		return err
	}
	if !res.Success {
		return &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: "budget update not acknowledged"}
	}
	return nil
}
