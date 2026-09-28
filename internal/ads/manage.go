package ads

import (
	"context"
	"io"
	"time"
)

// Manager is the optional write surface of a provider client beyond the
// campaign status and budget calls on Client. Callers type-assert an
// ads.Client to Manager; providers that do not implement it only support
// what Client offers. Money is in micros of the account currency; adapters
// convert to provider units. IDs are provider (external) IDs.
type Manager interface {
	UpdateCampaign(ctx context.Context, accountID, campaignID string, p CampaignPatch) error
	UpdateAdGroup(ctx context.Context, accountID, adGroupID string, p AdGroupPatch) error
	UpdateAd(ctx context.Context, accountID, adID string, p AdPatch) error

	CreateCampaign(ctx context.Context, accountID string, s CampaignSpec) (string, error)
	CreateAdGroup(ctx context.Context, accountID string, s AdGroupSpec) (string, error)
	// CreateAd creates the ad creative (from Creative or ObjectStoryID) and
	// then the ad, returning the ad ID.
	CreateAd(ctx context.Context, accountID string, s AdSpec) (string, error)

	UploadImage(ctx context.Context, accountID, filename string, data []byte) (Image, error)
	// UploadVideo adds a video to the ad account; it is usable in an ad once
	// GetVideo reports it ready.
	UploadVideo(ctx context.Context, accountID, filename string, r io.Reader) (Video, error)
	GetVideo(ctx context.Context, accountID, videoID string) (Video, error)
	// ListPages returns the Pages the account can advertise as, each with its
	// linked Instagram account when there is one.
	ListPages(ctx context.Context, accountID string) ([]Page, error)
	// SearchTargeting finds targeting options by name: interests (interests,
	// behaviours, demographics), locations (regions, cities) or languages.
	SearchTargeting(ctx context.Context, accountID string, kind TargetingKind, query string) ([]TargetingOption, error)
	// ListAudiences returns the account's custom and lookalike audiences.
	ListAudiences(ctx context.Context, accountID string) ([]Audience, error)
	AccountLimits(ctx context.Context, accountID string) (AccountLimits, error)
	// SetAccountSpendCap sets the account-wide spend cap; nil removes it.
	SetAccountSpendCap(ctx context.Context, accountID string, spendCap *Micros) error

	GetCampaign(ctx context.Context, accountID, campaignID string) (Campaign, error)
	GetAdGroup(ctx context.Context, accountID, adGroupID string) (AdGroup, error)
	GetAd(ctx context.Context, accountID, adID string) (Ad, error)
	GetCreative(ctx context.Context, accountID, creativeID string) (Creative, error)
}

// CampaignPatch holds the fields to change; nil means unchanged.
type CampaignPatch struct {
	Status         *Status
	Name           *string
	DailyBudget    *Micros
	LifetimeBudget *Micros
	SpendCap       *Micros
	ClearSpendCap  bool
	EndTime        *time.Time
	ClearEndTime   bool
}

type AdGroupPatch struct {
	Status         *Status
	Name           *string
	DailyBudget    *Micros
	LifetimeBudget *Micros
	BidAmount      *Micros
	EndTime        *time.Time
	ClearEndTime   bool
}

type AdPatch struct {
	Status *Status
	Name   *string
}

type CampaignSpec struct {
	Name                string
	Objective           string
	Status              Status // active or paused
	DailyBudget         *Micros
	LifetimeBudget      *Micros
	EndTime             *time.Time
	BidStrategy         string
	SpecialAdCategories []string
}

type Targeting struct {
	Countries         []string
	Regions           []string  // provider region keys
	Cities            []CityGeo // provider city keys with a radius
	ExcludedCountries []string
	Locales           []int // provider language ids; empty = all
	AgeMin            int
	AgeMax            int
	Genders           []int // empty = all, 1 = men, 2 = women
	AdvantageAudience bool
	// Interests narrow the audience (any one matches); with Advantage+
	// audience on they are suggestions. Exclusions always apply.
	Interests         []TargetingOption
	ExcludedInterests []TargetingOption
	Audiences         []string // custom/lookalike audience ids to include
	ExcludedAudiences []string
	// Placements nil = automatic (Advantage+ placements).
	Placements *Placements
}

type CityGeo struct {
	Key      string
	RadiusKm int // 0 = the city only
}

// Placements lists where ads may show. Positions left empty on a chosen
// platform mean all of that platform's positions.
type Placements struct {
	Platforms                []string // facebook, instagram, messenger, audience_network
	FacebookPositions        []string
	InstagramPositions       []string
	MessengerPositions       []string
	AudienceNetworkPositions []string
}

type TargetingKind string

const (
	TargetingInterests TargetingKind = "interests"
	TargetingLocations TargetingKind = "locations"
	TargetingLanguages TargetingKind = "languages"
)

// TargetingOption is one search result. Type is the provider's category
// ("interests", "behaviors", "region", "city", ...) and says how the option
// is sent back when targeting.
type TargetingOption struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	Description  string `json:"description,omitempty"` // e.g. "Karnataka, India" for a city
	AudienceSize int64  `json:"audience_size,omitempty"`
}

type Audience struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Subtype     string `json:"subtype"` // CUSTOM, LOOKALIKE, WEBSITE, ENGAGEMENT, ...
	ApproxCount int64  `json:"approx_count,omitempty"`
}

type Video struct {
	ID           string `json:"id"`
	Status       string `json:"status"` // processing | ready | error
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
}

type AdGroupSpec struct {
	CampaignID       string
	Name             string
	Status           Status
	DailyBudget      *Micros
	LifetimeBudget   *Micros
	StartTime        *time.Time
	EndTime          *time.Time
	OptimizationGoal string
	BillingEvent     string
	BidAmount        *Micros
	DestinationType  string
	// BidStrategy applies when the ad set carries the budget; with a campaign
	// budget the campaign's strategy rules and only the caps below are sent.
	BidStrategy string   // LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS
	ROASFloor   *float64 // minimum ROAS for LOWEST_COST_WITH_MIN_ROAS, e.g. 2.5
	// Attribution is one of 7d_click_1d_view (default), 7d_click, 1d_click,
	// 1d_click_1d_view; empty leaves the provider default.
	Attribution string
	Targeting   Targeting
	// PromotedObject is passed through (page_id, pixel_id, custom_event_type,
	// application_id, object_store_url, ...).
	PromotedObject map[string]string
}

// Creative formats.
const (
	FormatImage    = "image"    // one image
	FormatVideo    = "video"    // one video
	FormatCarousel = "carousel" // 2–10 cards, each with its own image or video and link
	FormatFlexible = "flexible" // several images/videos and texts; the provider picks per person
)

type CreativeSpec struct {
	Format       string // "" = image
	ImageHash    string // image; video thumbnail (optional)
	VideoID      string // video
	Link         string
	DisplayLink  string // shown instead of the URL's domain
	Message      string
	Headline     string
	Description  string
	CallToAction string

	Cards []CarouselCard // carousel

	// Flexible: up to 10 media and up to 5 of each text; the first entries
	// fall back to Message/Headline/Description when empty.
	ImageHashes  []string
	VideoIDs     []string
	Messages     []string
	Headlines    []string
	Descriptions []string
}

type CarouselCard struct {
	ImageHash   string
	VideoID     string
	Link        string // defaults to the creative's Link
	Headline    string
	Description string
}

type AdSpec struct {
	AdGroupID       string
	Name            string
	Status          Status
	PageID          string
	InstagramUserID string // show on Instagram as this account (default: as the Page)
	URLTags         string // query string added to every link, e.g. utm_source=meta&utm_medium=paid
	Creative        *CreativeSpec
	ObjectStoryID   string
}

type Image struct {
	Hash string `json:"hash"`
	URL  string `json:"url"`
}

type Page struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	PictureURL string `json:"picture_url"`
	// Instagram account linked to the Page, if any.
	InstagramUserID   string `json:"instagram_user_id,omitempty"`
	InstagramUsername string `json:"instagram_username,omitempty"`
}

type AccountLimits struct {
	SpendCap    *Micros // nil = no cap
	AmountSpent Micros
	Balance     Micros
	Currency    string
}
