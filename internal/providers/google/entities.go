package google

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

// GAQL resources: https://developers.google.com/google-ads/api/fields/v25/overview
// Account hierarchy: https://developers.google.com/google-ads/api/docs/account-management/get-account-hierarchy

type id = providers.FlexString

func status(s string) ads.Status {
	switch s {
	case "ENABLED":
		return ads.StatusActive
	case "PAUSED":
		return ads.StatusPaused
	case "REMOVED":
		return ads.StatusDeleted
	}
	return ads.StatusUnknown
}

func customerStatus(s string) ads.Status {
	switch s {
	case "ENABLED":
		return ads.StatusActive
	case "SUSPENDED":
		return ads.StatusPaused
	case "CANCELED", "CLOSED":
		return ads.StatusArchived
	}
	return ads.StatusUnknown
}

const customerClientQuery = `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, ` +
	`customer_client.time_zone, customer_client.manager, customer_client.status, customer_client.level, ` +
	`customer_client.test_account, customer_client.client_customer FROM customer_client`

type customerClientRow struct {
	CustomerClient struct {
		ID              id     `json:"id"`
		DescriptiveName string `json:"descriptiveName"`
		CurrencyCode    string `json:"currencyCode"`
		TimeZone        string `json:"timeZone"`
		Manager         bool   `json:"manager"`
		Status          string `json:"status"`
		Level           id     `json:"level"`
	} `json:"customerClient"`
}

// ListAccounts discovers operating (non-manager) customers: every customer
// returned by listAccessibleCustomers, plus all clients below any accessible
// manager (customer_client lists every level of the hierarchy). A client
// reached through a manager is later queried with that manager as
// login-customer-id; see LoginCustomerIDs.
//
// Roots that fail (for example a cancelled account) are skipped and logged;
// the call only fails when nothing could be listed.
func (c *Client) ListAccounts(ctx context.Context) ([]ads.Account, error) {
	body, err := c.do(ctx, http.MethodGet, "customers:listAccessibleCustomers", "", nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		ResourceNames []string `json:"resourceNames"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("google ads: decode listAccessibleCustomers: %w", err)
	}

	roots := make([]string, 0, len(res.ResourceNames))
	direct := map[string]bool{}
	for _, rn := range res.ResourceNames {
		cid := normalizeCID(rn)
		roots = append(roots, cid)
		direct[cid] = true
	}

	var (
		out      []ads.Account
		seen     = map[string]bool{}
		firstErr error
		ok       int
	)
	for _, root := range roots {
		rows, err := c.searchStreamAs(ctx, root, root, customerClientQuery)
		if err != nil {
			if errors.Is(err, providers.ErrUnauthorized) || errors.Is(err, providers.ErrRateLimited) {
				return nil, err
			}
			c.opts.Logger.WarnContext(ctx, "google ads: skipping inaccessible customer", "customer_id", root, "err", err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		ok++
		for _, raw := range rows {
			var r customerClientRow
			if err := json.Unmarshal(raw, &r); err != nil {
				return nil, fmt.Errorf("google ads: decode customer_client: %w", err)
			}
			cc := r.CustomerClient
			cid := string(cc.ID)
			if cc.Manager || cid == "" || seen[cid] {
				continue
			}
			// Prefer direct access; otherwise go through the manager root.
			login := root
			if direct[cid] {
				login = cid
			}
			seen[cid] = true
			c.mu.Lock()
			c.logins[cid] = login
			c.mu.Unlock()
			rawAcct, _ := json.Marshal(map[string]any{"customer_client": raw, "login_customer_id": login})
			out = append(out, ads.Account{
				Provider: ads.ProviderGoogle, ExternalID: cid, Name: cc.DescriptiveName,
				Currency: cc.CurrencyCode, Timezone: cc.TimeZone, Status: customerStatus(cc.Status),
				Raw: rawAcct,
			})
		}
	}
	if ok == 0 && firstErr != nil {
		return nil, firstErr
	}
	return out, nil
}

type campaignRow struct {
	Campaign struct {
		ID                     id     `json:"id"`
		Name                   string `json:"name"`
		Status                 string `json:"status"`
		AdvertisingChannelType string `json:"advertisingChannelType"`
	} `json:"campaign"`
	CampaignBudget *struct {
		AmountMicros      *providers.FlexInt `json:"amountMicros"`
		TotalAmountMicros *providers.FlexInt `json:"totalAmountMicros"`
		Period            string             `json:"period"`
		ExplicitlyShared  bool               `json:"explicitlyShared"`
	} `json:"campaignBudget"`
}

const campaignQuery = `SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, ` +
	`campaign.advertising_channel_type, campaign.advertising_channel_sub_type, campaign.bidding_strategy_type, ` +
	`campaign.campaign_budget, campaign_budget.id, campaign_budget.amount_micros, campaign_budget.total_amount_micros, ` +
	`campaign_budget.period, campaign_budget.explicitly_shared, campaign_budget.delivery_method FROM campaign`

func (c *Client) ListCampaigns(ctx context.Context, accountID string) ([]ads.Campaign, error) {
	cid := normalizeCID(accountID)
	rows, err := c.searchStream(ctx, cid, campaignQuery)
	if err != nil {
		return nil, err
	}
	out := make([]ads.Campaign, 0, len(rows))
	for _, raw := range rows {
		var r campaignRow
		if err := json.Unmarshal(raw, &r); err != nil {
			return nil, fmt.Errorf("google ads: decode campaign: %w", err)
		}
		camp := ads.Campaign{
			Provider: ads.ProviderGoogle, AccountExternalID: cid, ExternalID: string(r.Campaign.ID),
			Name: r.Campaign.Name, Status: status(r.Campaign.Status), Objective: r.Campaign.AdvertisingChannelType,
			Raw: raw,
		}
		if b := r.CampaignBudget; b != nil {
			if b.TotalAmountMicros != nil && *b.TotalAmountMicros > 0 {
				v := ads.Micros(*b.TotalAmountMicros)
				camp.LifetimeBudget = &v
			} else if b.AmountMicros != nil && b.Period != "CUSTOM_PERIOD" {
				v := ads.Micros(*b.AmountMicros)
				camp.DailyBudget = &v
			}
		}
		out = append(out, camp)
	}
	return out, nil
}

type adGroupRow struct {
	Campaign struct {
		ID id `json:"id"`
	} `json:"campaign"`
	AdGroup struct {
		ID     id     `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	} `json:"adGroup"`
}

const adGroupQuery = `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id FROM ad_group`

func (c *Client) ListAdGroups(ctx context.Context, accountID string) ([]ads.AdGroup, error) {
	cid := normalizeCID(accountID)
	rows, err := c.searchStream(ctx, cid, adGroupQuery)
	if err != nil {
		return nil, err
	}
	out := make([]ads.AdGroup, 0, len(rows))
	for _, raw := range rows {
		var r adGroupRow
		if err := json.Unmarshal(raw, &r); err != nil {
			return nil, fmt.Errorf("google ads: decode ad_group: %w", err)
		}
		out = append(out, ads.AdGroup{
			Provider: ads.ProviderGoogle, AccountExternalID: cid, CampaignExternalID: string(r.Campaign.ID),
			ExternalID: string(r.AdGroup.ID), Name: r.AdGroup.Name, Status: status(r.AdGroup.Status), Raw: raw,
		})
	}
	return out, nil
}

type adRow struct {
	Campaign struct {
		ID id `json:"id"`
	} `json:"campaign"`
	AdGroup struct {
		ID id `json:"id"`
	} `json:"adGroup"`
	AdGroupAd struct {
		Status string `json:"status"`
		Ad     struct {
			ID   id     `json:"id"`
			Name string `json:"name"`
			Type string `json:"type"`
		} `json:"ad"`
	} `json:"adGroupAd"`
}

const adQuery = `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ` +
	`ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ad_group.id, campaign.id FROM ad_group_ad`

// ListAds lists ads. Google ads are built from several assets rather than
// one creative, so CreativeExternalID is left empty; assets come from
// ListCreatives.
func (c *Client) ListAds(ctx context.Context, accountID string) ([]ads.Ad, error) {
	cid := normalizeCID(accountID)
	rows, err := c.searchStream(ctx, cid, adQuery)
	if err != nil {
		return nil, err
	}
	out := make([]ads.Ad, 0, len(rows))
	for _, raw := range rows {
		var r adRow
		if err := json.Unmarshal(raw, &r); err != nil {
			return nil, fmt.Errorf("google ads: decode ad_group_ad: %w", err)
		}
		name := r.AdGroupAd.Ad.Name
		if name == "" {
			name = strings.ToLower(strings.ReplaceAll(r.AdGroupAd.Ad.Type, "_", " ")) + " " + string(r.AdGroupAd.Ad.ID)
		}
		out = append(out, ads.Ad{
			Provider: ads.ProviderGoogle, AccountExternalID: cid, CampaignExternalID: string(r.Campaign.ID),
			AdGroupExternalID: string(r.AdGroup.ID), ExternalID: string(r.AdGroupAd.Ad.ID), Name: name,
			Status: status(r.AdGroupAd.Status), Raw: raw,
		})
	}
	return out, nil
}

type assetRow struct {
	Asset struct {
		ID         id     `json:"id"`
		Name       string `json:"name"`
		Type       string `json:"type"`
		ImageAsset *struct {
			FullSize struct {
				URL string `json:"url"`
			} `json:"fullSize"`
		} `json:"imageAsset"`
		YoutubeVideoAsset *struct {
			YoutubeVideoID    string `json:"youtubeVideoId"`
			YoutubeVideoTitle string `json:"youtubeVideoTitle"`
		} `json:"youtubeVideoAsset"`
		TextAsset *struct {
			Text string `json:"text"`
		} `json:"textAsset"`
	} `json:"asset"`
}

const assetQuery = `SELECT asset.id, asset.name, asset.type, asset.image_asset.full_size.url, ` +
	`asset.youtube_video_asset.youtube_video_id, asset.youtube_video_asset.youtube_video_title, asset.text_asset.text ` +
	`FROM asset WHERE asset.type IN ('IMAGE', 'YOUTUBE_VIDEO', 'TEXT', 'MEDIA_BUNDLE')`

// ListCreatives lists image, video, text and HTML5 assets (plan §7: Google
// creatives are assets).
func (c *Client) ListCreatives(ctx context.Context, accountID string) ([]ads.Creative, error) {
	cid := normalizeCID(accountID)
	rows, err := c.searchStream(ctx, cid, assetQuery)
	if err != nil {
		return nil, err
	}
	out := make([]ads.Creative, 0, len(rows))
	for _, raw := range rows {
		var r assetRow
		if err := json.Unmarshal(raw, &r); err != nil {
			return nil, fmt.Errorf("google ads: decode asset: %w", err)
		}
		a := r.Asset
		cr := ads.Creative{
			Provider: ads.ProviderGoogle, AccountExternalID: cid, ExternalID: string(a.ID), Name: a.Name, Raw: raw,
		}
		switch a.Type {
		case "IMAGE":
			cr.Type = "image"
			if a.ImageAsset != nil {
				cr.ThumbnailURL = a.ImageAsset.FullSize.URL
			}
		case "YOUTUBE_VIDEO":
			cr.Type = "video"
			if v := a.YoutubeVideoAsset; v != nil && v.YoutubeVideoID != "" {
				cr.ThumbnailURL = "https://i.ytimg.com/vi/" + v.YoutubeVideoID + "/hqdefault.jpg"
				if cr.Name == "" {
					cr.Name = v.YoutubeVideoTitle
				}
			}
		case "TEXT":
			cr.Type = "text"
			if cr.Name == "" && a.TextAsset != nil {
				cr.Name = a.TextAsset.Text
			}
		case "MEDIA_BUNDLE":
			cr.Type = "html5"
		default:
			cr.Type = strings.ToLower(a.Type)
		}
		out = append(out, cr)
	}
	return out, nil
}

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

func campaignResource(cid, campaignID string) string {
	return "customers/" + cid + "/campaigns/" + campaignID
}

// SetCampaignStatus sets campaign.status to ENABLED or PAUSED.
func (c *Client) SetCampaignStatus(ctx context.Context, accountID, campaignID string, s ads.Status) error {
	var gs string
	switch s {
	case ads.StatusActive:
		gs = "ENABLED"
	case ads.StatusPaused:
		gs = "PAUSED"
	default:
		return providers.Unsupported(ads.ProviderGoogle, "cannot set campaign status to %q", s)
	}
	if !isNumeric(campaignID) {
		return &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrInvalidRequest, Message: "invalid campaign id"}
	}
	cid := normalizeCID(accountID)
	return c.mutate(ctx, cid, "campaigns", map[string]any{
		"updateMask": "status",
		"update":     map[string]any{"resourceName": campaignResource(cid, campaignID), "status": gs},
	})
}

type budgetLookupRow struct {
	CampaignBudget struct {
		ResourceName      string             `json:"resourceName"`
		Period            string             `json:"period"`
		ExplicitlyShared  bool               `json:"explicitlyShared"`
		AmountMicros      *providers.FlexInt `json:"amountMicros"`
		TotalAmountMicros *providers.FlexInt `json:"totalAmountMicros"`
		ReferenceCount    providers.FlexInt  `json:"referenceCount"`
	} `json:"campaignBudget"`
}

// UpdateCampaignBudget sets the daily amount of the campaign's budget.
//
// Budgets are separate campaign_budget resources. A shared budget
// (explicitly_shared = true) funds several campaigns, so changing it would
// change all of them; that case returns ErrUnsupported rather than silently
// affecting other campaigns. Custom-period (total) budgets are also rejected.
// The amount must be a multiple of the currency's minimum unit (for example
// 10,000 micros for USD); the API rejects other values.
func (c *Client) UpdateCampaignBudget(ctx context.Context, accountID, campaignID string, dailyBudget ads.Micros) error {
	if dailyBudget <= 0 {
		return &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrInvalidRequest, Message: "daily budget must be positive"}
	}
	if !isNumeric(campaignID) {
		return &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrInvalidRequest, Message: "invalid campaign id"}
	}
	cid := normalizeCID(accountID)
	rows, err := c.searchStream(ctx, cid, `SELECT campaign.id, campaign_budget.resource_name, campaign_budget.period, `+
		`campaign_budget.explicitly_shared, campaign_budget.amount_micros, campaign_budget.total_amount_micros, `+
		`campaign_budget.reference_count FROM campaign WHERE campaign.id = `+campaignID)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return &providers.Error{Provider: ads.ProviderGoogle, Kind: providers.ErrNotFound, Message: "campaign not found"}
	}
	var r budgetLookupRow
	if err := json.Unmarshal(rows[0], &r); err != nil {
		return fmt.Errorf("google ads: decode campaign budget: %w", err)
	}
	b := r.CampaignBudget
	switch {
	case b.ResourceName == "":
		return providers.Unsupported(ads.ProviderGoogle, "campaign %s has no campaign budget", campaignID)
	case b.ExplicitlyShared:
		return providers.Unsupported(ads.ProviderGoogle,
			"campaign %s uses a shared budget used by %d campaigns; changing it would affect all of them", campaignID, b.ReferenceCount)
	case b.Period == "CUSTOM_PERIOD" || (b.TotalAmountMicros != nil && *b.TotalAmountMicros > 0):
		return providers.Unsupported(ads.ProviderGoogle, "campaign %s uses a total (custom period) budget", campaignID)
	}
	return c.mutate(ctx, cid, "campaignBudgets", map[string]any{
		"updateMask": "amountMicros",
		"update":     map[string]any{"resourceName": b.ResourceName, "amountMicros": fmt.Sprint(dailyBudget)},
	})
}

func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
