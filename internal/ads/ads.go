// Package ads defines Adwise's canonical advertising model (plan §7) and the
// contracts between provider adapters and the rest of the system.
//
// Provider adapters (internal/providers/meta, internal/providers/google)
// translate provider APIs into these types. Storage (internal/entities,
// internal/metrics) persists them. Neither side imports the other.
package ads

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Provider string

const (
	ProviderMeta   Provider = "meta"
	ProviderGoogle Provider = "google"
)

type EntityType string

const (
	EntityAccount  EntityType = "account"
	EntityCampaign EntityType = "campaign"
	EntityAdGroup  EntityType = "ad_group" // Meta ad set, Google ad group
	EntityAd       EntityType = "ad"
	EntityCreative EntityType = "creative"
)

// Status is the normalized delivery status of an entity.
type Status string

const (
	StatusActive   Status = "active"
	StatusPaused   Status = "paused"
	StatusArchived Status = "archived"
	StatusDeleted  Status = "deleted"
	StatusUnknown  Status = "unknown"
)

// Money is stored in micros (1 unit = 1_000_000) of the account currency,
// which matches Google Ads and avoids float rounding. Meta amounts in minor
// units or decimal strings are converted by the Meta adapter.
type Micros = int64

// Entity types. ExternalID is the provider's ID; Raw keeps the provider
// payload for fields the canonical model does not cover (plan §19).

type Account struct {
	Provider   Provider        `json:"provider"`
	ExternalID string          `json:"external_id"`
	Name       string          `json:"name"`
	Currency   string          `json:"currency"` // ISO 4217
	Timezone   string          `json:"timezone"` // IANA, e.g. Asia/Kolkata
	Status     Status          `json:"status"`
	Raw        json.RawMessage `json:"raw,omitempty"`
}

type Campaign struct {
	Provider          Provider        `json:"provider"`
	AccountExternalID string          `json:"account_external_id"`
	ExternalID        string          `json:"external_id"`
	Name              string          `json:"name"`
	Status            Status          `json:"status"`
	Objective         string          `json:"objective,omitempty"`
	DailyBudget       *Micros         `json:"daily_budget,omitempty"`
	LifetimeBudget    *Micros         `json:"lifetime_budget,omitempty"`
	Raw               json.RawMessage `json:"raw,omitempty"`
}

type AdGroup struct {
	Provider           Provider        `json:"provider"`
	AccountExternalID  string          `json:"account_external_id"`
	CampaignExternalID string          `json:"campaign_external_id"`
	ExternalID         string          `json:"external_id"`
	Name               string          `json:"name"`
	Status             Status          `json:"status"`
	DailyBudget        *Micros         `json:"daily_budget,omitempty"` // Meta ad-set budgets
	Raw                json.RawMessage `json:"raw,omitempty"`
}

type Ad struct {
	Provider           Provider        `json:"provider"`
	AccountExternalID  string          `json:"account_external_id"`
	CampaignExternalID string          `json:"campaign_external_id"`
	AdGroupExternalID  string          `json:"ad_group_external_id"`
	ExternalID         string          `json:"external_id"`
	Name               string          `json:"name"`
	Status             Status          `json:"status"`
	CreativeExternalID string          `json:"creative_external_id,omitempty"`
	Raw                json.RawMessage `json:"raw,omitempty"`
}

type Creative struct {
	Provider          Provider        `json:"provider"`
	AccountExternalID string          `json:"account_external_id"`
	ExternalID        string          `json:"external_id"`
	Name              string          `json:"name"`
	Type              string          `json:"type,omitempty"` // image, video, carousel, text, ...
	ThumbnailURL      string          `json:"thumbnail_url,omitempty"`
	Raw               json.RawMessage `json:"raw,omitempty"`
}

// Reporting (plan §9, §20).

type Grain string

const (
	GrainDay  Grain = "day"
	GrainHour Grain = "hour"
)

type Dimension string

const (
	DimCampaign          Dimension = "campaign"
	DimAdGroup           Dimension = "ad_group"
	DimAd                Dimension = "ad"
	DimCreative          Dimension = "creative"
	DimCountry           Dimension = "country"
	DimDevice            Dimension = "device"
	DimPlacement         Dimension = "placement"
	DimPublisherPlatform Dimension = "publisher_platform"
	DimKeyword           Dimension = "keyword"
	DimSearchTerm        Dimension = "search_term"
)

// ReportDefinition is an explicit, provider-independent report (plan §20).
// Each adapter translates it into a valid provider query, or reports it as
// unsupported via Capabilities.
type ReportDefinition struct {
	Name       string      `json:"name"` // e.g. campaign_daily, campaign_hourly
	Level      EntityType  `json:"level"`
	Dimensions []Dimension `json:"dimensions"`
	Grain      Grain       `json:"grain"`
}

// DateRange is inclusive and expressed in the ad account's timezone.
type DateRange struct {
	Start string `json:"start"` // YYYY-MM-DD
	End   string `json:"end"`   // YYYY-MM-DD
}

// MetricFact is one row of additive measures at a report's grain (plan §19).
// Dimensions that do not apply to the report are left empty. Derived metrics
// (CTR, CPC, ROAS, ...) are never stored.
type MetricFact struct {
	Provider          Provider `json:"provider"`
	Report            string   `json:"report"`
	AccountExternalID string   `json:"account_external_id"`

	Date string `json:"date"`           // YYYY-MM-DD in account timezone
	Hour *int16 `json:"hour,omitempty"` // 0–23 in account timezone; nil for daily grain

	CampaignExternalID string `json:"campaign_external_id,omitempty"`
	AdGroupExternalID  string `json:"ad_group_external_id,omitempty"`
	AdExternalID       string `json:"ad_external_id,omitempty"`
	CreativeExternalID string `json:"creative_external_id,omitempty"`

	Country           string `json:"country,omitempty"`
	Device            string `json:"device,omitempty"`
	Placement         string `json:"placement,omitempty"`
	PublisherPlatform string `json:"publisher_platform,omitempty"`
	Keyword           string `json:"keyword,omitempty"`
	SearchTerm        string `json:"search_term,omitempty"`

	Impressions     int64   `json:"impressions"`
	Reach           *int64  `json:"reach,omitempty"` // not additive across rows
	Clicks          int64   `json:"clicks"`
	Spend           Micros  `json:"spend"`
	Conversions     float64 `json:"conversions"` // fractional under data-driven attribution
	ConversionValue Micros  `json:"conversion_value"`

	ProviderData json.RawMessage `json:"provider_data,omitempty"`
}

// Capabilities describe what a provider supports, checked before any mutation
// or report request (plan §13, §36).
type Capabilities struct {
	Reports              []string `json:"reports"` // ReportDefinition names supported
	PauseCampaign        bool     `json:"pause_campaign"`
	ActivateCampaign     bool     `json:"activate_campaign"`
	UpdateCampaignBudget bool     `json:"update_campaign_budget"`
}

// Client is an authenticated connection to one provider for one integration
// (plan §21). Implementations must be safe for concurrent use and must
// respect provider rate limits.
type Client interface {
	Provider() Provider
	Capabilities() Capabilities

	ListAccounts(ctx context.Context) ([]Account, error)
	ListCampaigns(ctx context.Context, accountID string) ([]Campaign, error)
	ListAdGroups(ctx context.Context, accountID string) ([]AdGroup, error)
	ListAds(ctx context.Context, accountID string) ([]Ad, error)
	ListCreatives(ctx context.Context, accountID string) ([]Creative, error)

	FetchReport(ctx context.Context, def ReportDefinition, accountID string, r DateRange) ([]MetricFact, error)

	SetCampaignStatus(ctx context.Context, accountID, campaignID string, status Status) error
	UpdateCampaignBudget(ctx context.Context, accountID, campaignID string, dailyBudget Micros) error
}

// Store persists synchronized data. It is implemented by the storage layer and
// called by sync jobs. All writes are idempotent upserts keyed on
// (organization, provider, external IDs[, report, date, hour, dimensions]).
type Store interface {
	UpsertAccounts(ctx context.Context, orgID, integrationID uuid.UUID, accounts []Account) error
	UpsertCampaigns(ctx context.Context, orgID uuid.UUID, campaigns []Campaign) error
	UpsertAdGroups(ctx context.Context, orgID uuid.UUID, adGroups []AdGroup) error
	UpsertAds(ctx context.Context, orgID uuid.UUID, ads []Ad) error
	UpsertCreatives(ctx context.Context, orgID uuid.UUID, creatives []Creative) error
	UpsertMetricFacts(ctx context.Context, orgID uuid.UUID, facts []MetricFact) error

	// MarkSynced records data freshness (plan §34, data_freshness_lag).
	MarkSynced(ctx context.Context, orgID uuid.UUID, provider Provider, accountExternalID, scope string, at time.Time) error
}
