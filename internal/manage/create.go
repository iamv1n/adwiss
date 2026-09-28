package manage

import (
	"context"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/store"
)

var (
	Objectives = []string{"OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
		"OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES"}
	CallsToAction = []string{"LEARN_MORE", "SHOP_NOW", "SIGN_UP", "CONTACT_US", "DOWNLOAD",
		"GET_OFFER", "BOOK_TRAVEL", "SUBSCRIBE"}
	// Objectives whose ad sets need a promoted_object (pixel, app or Page).
	promotedObjectObjectives = []string{"OUTCOME_SALES", "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION"}

	enumRe    = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,63}$`)
	countryRe = regexp.MustCompile(`^[A-Z]{2}$`)
	metaIDRe  = regexp.MustCompile(`^[0-9]{1,32}(_[0-9]{1,32})?$`)
	poKeyRe   = regexp.MustCompile(`^[a-z_]{1,40}$`)
	// Targeting keys and ids from Meta's search endpoints.
	targetIDRe = regexp.MustCompile(`^[A-Za-z0-9_:.-]{1,64}$`)

	BidStrategies = []string{"LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"}
	Attributions  = []string{"7d_click_1d_view", "7d_click", "1d_click", "1d_click_1d_view"}
	// Placements Meta accepts, by platform.
	PlacementPositions = map[string][]string{
		"facebook":         {"feed", "profile_feed", "marketplace", "video_feeds", "right_hand_column", "story", "facebook_reels", "facebook_reels_overlay", "search", "instream_video", "notification"},
		"instagram":        {"stream", "profile_feed", "explore", "explore_home", "story", "reels", "profile_reels", "ig_search"},
		"messenger":        {"messenger_home", "sponsored_messages", "story"},
		"audience_network": {"classic", "rewarded_video"},
	}
	// Categories of detailed targeting that can be sent back.
	interestTypes = []string{"interests", "behaviors", "work_employers", "work_positions", "education_schools",
		"education_majors", "life_events", "family_statuses", "industries", "income", "user_adclusters", "relationship_statuses"}
	// Objectives that allow flexible ads.
	flexibleObjectives = []string{"OUTCOME_SALES", "OUTCOME_APP_PROMOTION"}
)

func createStatus(s *string) (ads.Status, error) {
	if s == nil {
		return ads.StatusPaused, nil
	}
	st, err := parseStatus("status", s, false)
	if err != nil {
		return "", err
	}
	return *st, nil
}

func ptrMoney(field string, v *float64) (*ads.Micros, error) {
	if v == nil {
		return nil, nil
	}
	m, err := money(field, *v)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func requireName(n string) (string, error) {
	p, err := parseName(&n)
	if err != nil {
		return "", err
	}
	return *p, nil
}

func enum(field, v string, allowed []string) error {
	if !enumRe.MatchString(v) || (allowed != nil && !slices.Contains(allowed, v)) {
		if allowed != nil {
			return Invalid(field, "must be one of "+strings.Join(allowed, ", "))
		}
		return Invalid(field, "must be an uppercase identifier")
	}
	return nil
}

// --- campaigns ---

type CreateCampaignRequest struct {
	AccountID           uuid.UUID  `json:"account_id"`
	Name                string     `json:"name"`
	Objective           string     `json:"objective"`
	Status              *string    `json:"status"`
	DailyBudget         *float64   `json:"daily_budget"`
	LifetimeBudget      *float64   `json:"lifetime_budget"`
	EndTime             *time.Time `json:"end_time"`
	BidStrategy         string     `json:"bid_strategy"`
	SpecialAdCategories []string   `json:"special_ad_categories"`
}

func (r CreateCampaignRequest) spec() (ads.CampaignSpec, error) {
	var s ads.CampaignSpec
	var err error
	if r.AccountID == uuid.Nil {
		return s, Invalid("account_id", "required")
	}
	if s.Name, err = requireName(r.Name); err != nil {
		return s, err
	}
	if err := enum("objective", r.Objective, Objectives); err != nil {
		return s, err
	}
	s.Objective = r.Objective
	if s.Status, err = createStatus(r.Status); err != nil {
		return s, err
	}
	if s.DailyBudget, err = ptrMoney("daily_budget", r.DailyBudget); err != nil {
		return s, err
	}
	if s.LifetimeBudget, err = ptrMoney("lifetime_budget", r.LifetimeBudget); err != nil {
		return s, err
	}
	if s.DailyBudget != nil && s.LifetimeBudget != nil {
		return s, Invalid("lifetime_budget", "set either daily_budget or lifetime_budget, not both")
	}
	if s.LifetimeBudget != nil && r.EndTime == nil {
		return s, Invalid("end_time", "required with lifetime_budget")
	}
	if r.EndTime != nil && !r.EndTime.After(time.Now()) {
		return s, Invalid("end_time", "must be in the future")
	}
	s.EndTime = r.EndTime
	if r.BidStrategy != "" {
		if err := enum("bid_strategy", r.BidStrategy, []string{"LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"}); err != nil {
			return s, err
		}
		s.BidStrategy = r.BidStrategy
	}
	s.SpecialAdCategories = []string{}
	for _, c := range r.SpecialAdCategories {
		if c == "NONE" {
			continue
		}
		if err := enum("special_ad_categories", c, nil); err != nil {
			return s, err
		}
		s.SpecialAdCategories = append(s.SpecialAdCategories, c)
	}
	return s, nil
}

// CreateCampaign creates a Meta campaign in an ad account.
func (s *Service) CreateCampaign(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, r CreateCampaignRequest) (entities.Campaign, error) {
	spec, err := r.spec()
	if err != nil {
		return entities.Campaign{}, err
	}
	t, err := s.connect(ctx, orgID, r.AccountID)
	if err != nil {
		return entities.Campaign{}, err
	}
	m, err := t.manager()
	if err != nil {
		return entities.Campaign{}, err
	}
	ext, err := m.CreateCampaign(ctx, t.account.ExternalID, spec)
	if err != nil {
		return entities.Campaign{}, s.providerError(ctx, t, err)
	}
	s.afterCreate(ctx, "campaign", func() error { return s.refreshCampaign(ctx, orgID, t, ext) }, func() error {
		return s.store.UpsertCampaigns(ctx, orgID, []ads.Campaign{{
			Provider: t.provider(), AccountExternalID: t.account.ExternalID, ExternalID: ext, Name: spec.Name,
			Status: spec.Status, Objective: spec.Objective, DailyBudget: spec.DailyBudget, LifetimeBudget: spec.LifetimeBudget,
		}})
	})
	id, err := s.idByExternal(ctx, "campaigns", t.account.ID, ext)
	if err != nil {
		return entities.Campaign{}, err
	}
	after, err := s.CampaignView(ctx, orgID, id)
	if err != nil {
		return entities.Campaign{}, err
	}
	err = s.record(ctx, orgID, actorID, "campaign.created", "campaign", id.String(), map[string]any{
		"provider": t.provider(), "external_id": ext, "request": r, "before": nil, "after": after,
	})
	return after, err
}

// afterCreate re-reads a new entity; if that fails it stores what was sent
// so the entity can be returned, and the next sync fills in the rest.
func (s *Service) afterCreate(ctx context.Context, what string, refresh, fallback func() error) {
	if err := refresh(); err != nil {
		s.logger.WarnContext(ctx, "manage: refresh after create failed; storing request values", "entity", what, "err", err)
		if err := fallback(); err != nil {
			s.logger.ErrorContext(ctx, "manage: store created entity", "entity", what, "err", err)
		}
	}
}

// --- ad groups ---

type TargetingRequest struct {
	Countries         []string              `json:"countries"`
	Regions           []string              `json:"regions"`
	Cities            []CityRequest         `json:"cities"`
	ExcludedCountries []string              `json:"excluded_countries"`
	Locales           []int                 `json:"locales"`
	AgeMin            *int                  `json:"age_min"`
	AgeMax            *int                  `json:"age_max"`
	Genders           []int                 `json:"genders"`
	AdvantageAudience *bool                 `json:"advantage_audience"`
	Interests         []ads.TargetingOption `json:"interests"`
	ExcludedInterests []ads.TargetingOption `json:"excluded_interests"`
	Audiences         []string              `json:"audiences"`
	ExcludedAudiences []string              `json:"excluded_audiences"`
	Placements        *PlacementsRequest    `json:"placements"` // null = automatic
}

type CityRequest struct {
	Key      string `json:"key"`
	RadiusKm int    `json:"radius_km"`
}

type PlacementsRequest struct {
	Platforms                []string `json:"platforms"`
	FacebookPositions        []string `json:"facebook_positions"`
	InstagramPositions       []string `json:"instagram_positions"`
	MessengerPositions       []string `json:"messenger_positions"`
	AudienceNetworkPositions []string `json:"audience_network_positions"`
}

type CreateAdGroupRequest struct {
	CampaignID       uuid.UUID         `json:"campaign_id"`
	Name             string            `json:"name"`
	Status           *string           `json:"status"`
	DailyBudget      *float64          `json:"daily_budget"`
	LifetimeBudget   *float64          `json:"lifetime_budget"`
	StartTime        *time.Time        `json:"start_time"`
	EndTime          *time.Time        `json:"end_time"`
	OptimizationGoal string            `json:"optimization_goal"`
	BillingEvent     string            `json:"billing_event"`
	BidAmount        *float64          `json:"bid_amount"`
	DestinationType  string            `json:"destination_type"`
	BidStrategy      string            `json:"bid_strategy"`
	ROASFloor        *float64          `json:"roas_floor"`
	Attribution      string            `json:"attribution"`
	Targeting        TargetingRequest  `json:"targeting"`
	PromotedObject   map[string]string `json:"promoted_object"`
}

func (r CreateAdGroupRequest) spec(objective string) (ads.AdGroupSpec, error) {
	var s ads.AdGroupSpec
	var err error
	if s.Name, err = requireName(r.Name); err != nil {
		return s, err
	}
	if s.Status, err = createStatus(r.Status); err != nil {
		return s, err
	}
	if s.DailyBudget, err = ptrMoney("daily_budget", r.DailyBudget); err != nil {
		return s, err
	}
	if s.LifetimeBudget, err = ptrMoney("lifetime_budget", r.LifetimeBudget); err != nil {
		return s, err
	}
	if s.DailyBudget != nil && s.LifetimeBudget != nil {
		return s, Invalid("lifetime_budget", "set either daily_budget or lifetime_budget, not both")
	}
	if s.LifetimeBudget != nil && r.EndTime == nil {
		return s, Invalid("end_time", "required with lifetime_budget")
	}
	if r.StartTime != nil && r.EndTime != nil && !r.EndTime.After(*r.StartTime) {
		return s, Invalid("end_time", "must be after start_time")
	}
	if r.EndTime != nil && !r.EndTime.After(time.Now()) {
		return s, Invalid("end_time", "must be in the future")
	}
	s.StartTime, s.EndTime = r.StartTime, r.EndTime
	if r.OptimizationGoal == "" {
		return s, Invalid("optimization_goal", "required")
	}
	if err := enum("optimization_goal", r.OptimizationGoal, nil); err != nil {
		return s, err
	}
	s.OptimizationGoal = r.OptimizationGoal
	s.BillingEvent = "IMPRESSIONS"
	if r.BillingEvent != "" {
		if err := enum("billing_event", r.BillingEvent, nil); err != nil {
			return s, err
		}
		s.BillingEvent = r.BillingEvent
	}
	if s.BidAmount, err = ptrMoney("bid_amount", r.BidAmount); err != nil {
		return s, err
	}
	if r.DestinationType != "" {
		if err := enum("destination_type", r.DestinationType, nil); err != nil {
			return s, err
		}
		s.DestinationType = r.DestinationType
	}

	if r.BidStrategy != "" {
		if err := enum("bid_strategy", r.BidStrategy, BidStrategies); err != nil {
			return s, err
		}
		s.BidStrategy = r.BidStrategy
	}
	switch s.BidStrategy {
	case "LOWEST_COST_WITH_BID_CAP", "COST_CAP":
		if s.BidAmount == nil {
			return s, Invalid("bid_amount", "required for "+s.BidStrategy)
		}
	case "LOWEST_COST_WITH_MIN_ROAS":
		if r.ROASFloor == nil {
			return s, Invalid("roas_floor", "required for LOWEST_COST_WITH_MIN_ROAS")
		}
	}
	if r.ROASFloor != nil {
		if *r.ROASFloor <= 0 || *r.ROASFloor > 1000 {
			return s, Invalid("roas_floor", "must be between 0.01 and 1000")
		}
		s.ROASFloor = r.ROASFloor
	}
	if r.Attribution != "" {
		if !slices.Contains(Attributions, r.Attribution) {
			return s, Invalid("attribution", "must be one of "+strings.Join(Attributions, ", "))
		}
		s.Attribution = r.Attribution
	}
	if s.Targeting, err = r.Targeting.spec(); err != nil {
		return s, err
	}

	for k, v := range r.PromotedObject {
		if !poKeyRe.MatchString(k) || len(v) > 500 {
			return s, Invalid("promoted_object", "invalid key or value")
		}
	}
	if len(r.PromotedObject) > 0 {
		s.PromotedObject = r.PromotedObject
	} else if slices.Contains(promotedObjectObjectives, objective) {
		return s, Invalid("promoted_object", "required for "+objective+" campaigns (e.g. pixel_id and custom_event_type, page_id, or application_id and object_store_url)")
	}
	return s, nil
}

func countries(field string, in []string) ([]string, error) {
	var out []string
	for _, c := range in {
		c = strings.ToUpper(strings.TrimSpace(c))
		if !countryRe.MatchString(c) {
			return nil, Invalid(field, "must be ISO 3166-1 alpha-2 codes")
		}
		out = append(out, c)
	}
	return out, nil
}

func targetIDs(field string, in []string, max int) ([]string, error) {
	if len(in) > max {
		return nil, Invalid(field, "too many (max "+strconv.Itoa(max)+")")
	}
	for _, id := range in {
		if !targetIDRe.MatchString(id) {
			return nil, Invalid(field, "invalid id")
		}
	}
	return in, nil
}

func interests(field string, in []ads.TargetingOption) ([]ads.TargetingOption, error) {
	if len(in) > 100 {
		return nil, Invalid(field, "too many (max 100)")
	}
	out := make([]ads.TargetingOption, 0, len(in))
	for _, o := range in {
		if !targetIDRe.MatchString(o.ID) || len(o.Name) > 200 {
			return nil, Invalid(field, "invalid id or name")
		}
		if o.Type == "" {
			o.Type = "interests"
		}
		if !slices.Contains(interestTypes, o.Type) {
			return nil, Invalid(field, "unsupported type "+o.Type)
		}
		out = append(out, ads.TargetingOption{ID: o.ID, Name: o.Name, Type: o.Type})
	}
	return out, nil
}

func (tg TargetingRequest) spec() (ads.Targeting, error) {
	var t ads.Targeting
	var err error
	if len(tg.Countries) > 50 {
		return t, Invalid("targeting.countries", "at most 50 countries")
	}
	if t.Countries, err = countries("targeting.countries", tg.Countries); err != nil {
		return t, err
	}
	if t.ExcludedCountries, err = countries("targeting.excluded_countries", tg.ExcludedCountries); err != nil {
		return t, err
	}
	if t.Regions, err = targetIDs("targeting.regions", tg.Regions, 200); err != nil {
		return t, err
	}
	if len(tg.Cities) > 250 {
		return t, Invalid("targeting.cities", "at most 250 cities")
	}
	for _, c := range tg.Cities {
		if !targetIDRe.MatchString(c.Key) {
			return t, Invalid("targeting.cities", "invalid city key")
		}
		if c.RadiusKm != 0 && (c.RadiusKm < 17 || c.RadiusKm > 80) {
			return t, Invalid("targeting.cities", "radius must be 17–80 km (or 0 for the city only)")
		}
		t.Cities = append(t.Cities, ads.CityGeo{Key: c.Key, RadiusKm: c.RadiusKm})
	}
	if len(t.Countries)+len(t.Regions)+len(t.Cities) == 0 {
		return t, Invalid("targeting.countries", "choose at least one country, region or city")
	}
	if len(tg.Locales) > 50 {
		return t, Invalid("targeting.locales", "at most 50 languages")
	}
	for _, l := range tg.Locales {
		if l <= 0 {
			return t, Invalid("targeting.locales", "invalid language")
		}
	}
	t.Locales = tg.Locales

	t.AgeMin, t.AgeMax = 18, 65
	if tg.AgeMin != nil {
		t.AgeMin = *tg.AgeMin
	}
	if tg.AgeMax != nil {
		t.AgeMax = *tg.AgeMax
	}
	if t.AgeMin < 18 || t.AgeMax > 65 || t.AgeMin > t.AgeMax {
		return t, Invalid("targeting.age_min", "ages must be between 18 and 65 with age_min ≤ age_max")
	}
	for _, g := range tg.Genders {
		if g != 1 && g != 2 {
			return t, Invalid("targeting.genders", "must contain only 1 (men) or 2 (women)")
		}
	}
	if len(tg.Genders) == 1 {
		t.Genders = tg.Genders
	}
	t.AdvantageAudience = tg.AdvantageAudience == nil || *tg.AdvantageAudience
	if t.AdvantageAudience && t.AgeMin > 25 {
		return t, Invalid("targeting.age_min", "must be 25 or lower with Advantage+ audience")
	}

	if t.Interests, err = interests("targeting.interests", tg.Interests); err != nil {
		return t, err
	}
	if t.ExcludedInterests, err = interests("targeting.excluded_interests", tg.ExcludedInterests); err != nil {
		return t, err
	}
	if t.Audiences, err = targetIDs("targeting.audiences", tg.Audiences, 50); err != nil {
		return t, err
	}
	if t.ExcludedAudiences, err = targetIDs("targeting.excluded_audiences", tg.ExcludedAudiences, 50); err != nil {
		return t, err
	}

	if p := tg.Placements; p != nil {
		if len(p.Platforms) == 0 {
			return t, Invalid("targeting.placements.platforms", "choose at least one platform, or use automatic placements")
		}
		pl := &ads.Placements{}
		for _, plat := range p.Platforms {
			if _, ok := PlacementPositions[plat]; !ok {
				return t, Invalid("targeting.placements.platforms", "unknown platform "+plat)
			}
			pl.Platforms = append(pl.Platforms, plat)
		}
		check := func(platform string, positions []string) ([]string, error) {
			if len(positions) == 0 {
				return nil, nil
			}
			field := "targeting.placements." + platform + "_positions"
			if !slices.Contains(pl.Platforms, platform) {
				return nil, Invalid(field, "set, but "+platform+" is not a chosen platform")
			}
			for _, pos := range positions {
				if !slices.Contains(PlacementPositions[platform], pos) {
					return nil, Invalid(field, "unknown position "+pos)
				}
			}
			return positions, nil
		}
		if pl.FacebookPositions, err = check("facebook", p.FacebookPositions); err != nil {
			return t, err
		}
		if pl.InstagramPositions, err = check("instagram", p.InstagramPositions); err != nil {
			return t, err
		}
		if pl.MessengerPositions, err = check("messenger", p.MessengerPositions); err != nil {
			return t, err
		}
		if pl.AudienceNetworkPositions, err = check("audience_network", p.AudienceNetworkPositions); err != nil {
			return t, err
		}
		t.Placements = pl
	}
	return t, nil
}

// CreateAdGroup creates a Meta ad set in a campaign.
func (s *Service) CreateAdGroup(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, r CreateAdGroupRequest) (entities.AdGroup, error) {
	if r.CampaignID == uuid.Nil {
		return entities.AdGroup{}, Invalid("campaign_id", "required")
	}
	camp, err := s.db.GetCampaign(ctx, store.GetCampaignParams{OrganizationID: orgID, ID: r.CampaignID})
	if database.IsNotFound(err) {
		return entities.AdGroup{}, httpx.ErrNotFound
	}
	if err != nil {
		return entities.AdGroup{}, err
	}
	spec, err := r.spec(camp.Campaign.Objective)
	if err != nil {
		return entities.AdGroup{}, err
	}
	spec.CampaignID = camp.Campaign.ExternalID
	t, err := s.connect(ctx, orgID, camp.Campaign.AccountID)
	if err != nil {
		return entities.AdGroup{}, err
	}
	m, err := t.manager()
	if err != nil {
		return entities.AdGroup{}, err
	}
	ext, err := m.CreateAdGroup(ctx, t.account.ExternalID, spec)
	if err != nil {
		return entities.AdGroup{}, s.providerError(ctx, t, err)
	}
	s.afterCreate(ctx, "ad_group", func() error { return s.refreshAdGroup(ctx, orgID, t, ext) }, func() error {
		return s.store.UpsertAdGroups(ctx, orgID, []ads.AdGroup{{
			Provider: t.provider(), AccountExternalID: t.account.ExternalID, CampaignExternalID: spec.CampaignID,
			ExternalID: ext, Name: spec.Name, Status: spec.Status, DailyBudget: spec.DailyBudget,
		}})
	})
	id, err := s.idByExternal(ctx, "ad_groups", t.account.ID, ext)
	if err != nil {
		return entities.AdGroup{}, err
	}
	after, err := s.AdGroupView(ctx, orgID, id)
	if err != nil {
		return entities.AdGroup{}, err
	}
	err = s.record(ctx, orgID, actorID, "ad_group.created", "ad_group", id.String(), map[string]any{
		"provider": t.provider(), "external_id": ext, "request": r, "before": nil, "after": after,
	})
	return after, err
}

// --- ads ---

type CreativeRequest struct {
	Format       string        `json:"format"` // image (default) | video | carousel | flexible
	ImageHash    string        `json:"image_hash"`
	VideoID      string        `json:"video_id"`
	Link         string        `json:"link"`
	DisplayLink  string        `json:"display_link"`
	Message      string        `json:"message"`
	Headline     string        `json:"headline"`
	Description  string        `json:"description"`
	CallToAction string        `json:"call_to_action"`
	Cards        []CardRequest `json:"cards"`
	ImageHashes  []string      `json:"image_hashes"`
	VideoIDs     []string      `json:"video_ids"`
	Messages     []string      `json:"messages"`
	Headlines    []string      `json:"headlines"`
	Descriptions []string      `json:"descriptions"`
}

type CardRequest struct {
	ImageHash   string `json:"image_hash"`
	VideoID     string `json:"video_id"`
	Link        string `json:"link"`
	Headline    string `json:"headline"`
	Description string `json:"description"`
}

type CreateAdRequest struct {
	AdGroupID       uuid.UUID        `json:"ad_group_id"`
	Name            string           `json:"name"`
	Status          *string          `json:"status"`
	PageID          string           `json:"page_id"`
	InstagramUserID string           `json:"instagram_user_id"`
	URLTags         string           `json:"url_tags"`
	Creative        *CreativeRequest `json:"creative"`
	ObjectStoryID   string           `json:"object_story_id"`
}

func httpURL(field, v string) error {
	u, err := url.Parse(v)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return Invalid(field, "must be an http(s) URL")
	}
	return nil
}

func imageHash(field, h string) error {
	if h == "" || len(h) > 100 {
		return Invalid(field, "required")
	}
	return nil
}

func videoID(field, id string) error {
	if !metaIDRe.MatchString(id) || strings.Contains(id, "_") {
		return Invalid(field, "must be a video id")
	}
	return nil
}

func texts(field string, list []string, maxLen int) error {
	if len(list) > 5 {
		return Invalid(field, "at most 5")
	}
	for _, t := range list {
		if len(t) > maxLen {
			return Invalid(field, "text too long")
		}
	}
	return nil
}

func (c CreativeRequest) spec() (*ads.CreativeSpec, error) {
	if err := httpURL("creative.link", c.Link); err != nil {
		return nil, err
	}
	if len(c.Message) > 5000 || len(c.Headline) > 255 || len(c.Description) > 255 || len(c.DisplayLink) > 100 {
		return nil, Invalid("creative", "text too long")
	}
	if c.CallToAction != "" {
		if err := enum("creative.call_to_action", c.CallToAction, CallsToAction); err != nil {
			return nil, err
		}
	}
	out := &ads.CreativeSpec{Format: c.Format, Link: c.Link, DisplayLink: c.DisplayLink, Message: c.Message,
		Headline: c.Headline, Description: c.Description, CallToAction: c.CallToAction}
	switch c.Format {
	case "", ads.FormatImage:
		out.Format = ads.FormatImage
		if err := imageHash("creative.image_hash", c.ImageHash); err != nil {
			return nil, err
		}
		out.ImageHash = c.ImageHash
	case ads.FormatVideo:
		if err := videoID("creative.video_id", c.VideoID); err != nil {
			return nil, err
		}
		if c.ImageHash != "" {
			if err := imageHash("creative.image_hash", c.ImageHash); err != nil {
				return nil, err
			}
		}
		out.VideoID, out.ImageHash = c.VideoID, c.ImageHash
	case ads.FormatCarousel:
		if len(c.Cards) < 2 || len(c.Cards) > 10 {
			return nil, Invalid("creative.cards", "a carousel needs 2–10 cards")
		}
		for i, card := range c.Cards {
			field := "creative.cards[" + strconv.Itoa(i) + "]"
			switch {
			case card.VideoID != "":
				if err := videoID(field+".video_id", card.VideoID); err != nil {
					return nil, err
				}
			case card.ImageHash != "":
				if err := imageHash(field+".image_hash", card.ImageHash); err != nil {
					return nil, err
				}
			default:
				return nil, Invalid(field, "needs an image or a video")
			}
			if card.Link != "" {
				if err := httpURL(field+".link", card.Link); err != nil {
					return nil, err
				}
			}
			if len(card.Headline) > 255 || len(card.Description) > 255 {
				return nil, Invalid(field, "text too long")
			}
			out.Cards = append(out.Cards, ads.CarouselCard{ImageHash: card.ImageHash, VideoID: card.VideoID,
				Link: card.Link, Headline: card.Headline, Description: card.Description})
		}
	case ads.FormatFlexible:
		if n := len(c.ImageHashes) + len(c.VideoIDs); n == 0 || n > 10 {
			return nil, Invalid("creative.image_hashes", "a flexible ad takes 1–10 images and videos")
		}
		for _, h := range c.ImageHashes {
			if err := imageHash("creative.image_hashes", h); err != nil {
				return nil, err
			}
		}
		for _, id := range c.VideoIDs {
			if err := videoID("creative.video_ids", id); err != nil {
				return nil, err
			}
		}
		if err := texts("creative.messages", c.Messages, 5000); err != nil {
			return nil, err
		}
		if err := texts("creative.headlines", c.Headlines, 255); err != nil {
			return nil, err
		}
		if err := texts("creative.descriptions", c.Descriptions, 255); err != nil {
			return nil, err
		}
		out.ImageHashes, out.VideoIDs = c.ImageHashes, c.VideoIDs
		out.Messages, out.Headlines, out.Descriptions = c.Messages, c.Headlines, c.Descriptions
	default:
		return nil, Invalid("creative.format", "must be one of image, video, carousel, flexible")
	}
	return out, nil
}

func (r CreateAdRequest) spec() (ads.AdSpec, error) {
	var s ads.AdSpec
	var err error
	if s.Name, err = requireName(r.Name); err != nil {
		return s, err
	}
	if s.Status, err = createStatus(r.Status); err != nil {
		return s, err
	}
	switch {
	case r.Creative != nil && r.ObjectStoryID != "":
		return s, Invalid("object_story_id", "send either creative or object_story_id, not both")
	case r.ObjectStoryID != "":
		if !metaIDRe.MatchString(r.ObjectStoryID) || !strings.Contains(r.ObjectStoryID, "_") {
			return s, Invalid("object_story_id", "must be <pageid>_<postid>")
		}
		s.ObjectStoryID = r.ObjectStoryID
	case r.Creative != nil:
		if r.PageID == "" || !metaIDRe.MatchString(r.PageID) {
			return s, Invalid("page_id", "required")
		}
		s.PageID = r.PageID
		if s.Creative, err = r.Creative.spec(); err != nil {
			return s, err
		}
	default:
		return s, Invalid("creative", "send creative or object_story_id")
	}
	if r.InstagramUserID != "" {
		if !metaIDRe.MatchString(r.InstagramUserID) {
			return s, Invalid("instagram_user_id", "must be an Instagram account id")
		}
		s.InstagramUserID = r.InstagramUserID
	}
	if r.URLTags != "" {
		tags := strings.TrimPrefix(r.URLTags, "?")
		if _, err := url.ParseQuery(tags); err != nil || len(tags) > 1000 {
			return s, Invalid("url_tags", "must be a query string like utm_source=meta&utm_medium=paid")
		}
		s.URLTags = tags
	}
	return s, nil
}

// CreateAd creates a Meta ad creative and ad in an ad set.
func (s *Service) CreateAd(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, r CreateAdRequest) (entities.Ad, error) {
	if r.AdGroupID == uuid.Nil {
		return entities.Ad{}, Invalid("ad_group_id", "required")
	}
	spec, err := r.spec()
	if err != nil {
		return entities.Ad{}, err
	}
	group, err := s.AdGroupView(ctx, orgID, r.AdGroupID)
	if err != nil {
		return entities.Ad{}, err
	}
	camp, err := s.db.GetCampaign(ctx, store.GetCampaignParams{OrganizationID: orgID, ID: group.CampaignID})
	if err != nil {
		return entities.Ad{}, err
	}
	if spec.Creative != nil && spec.Creative.Format == ads.FormatFlexible && !slices.Contains(flexibleObjectives, camp.Campaign.Objective) {
		return entities.Ad{}, Invalid("creative.format", "Meta only allows flexible ads in Sales and App promotion campaigns")
	}
	spec.AdGroupID = group.ExternalID
	t, err := s.connect(ctx, orgID, group.AccountID)
	if err != nil {
		return entities.Ad{}, err
	}
	m, err := t.manager()
	if err != nil {
		return entities.Ad{}, err
	}
	ext, err := m.CreateAd(ctx, t.account.ExternalID, spec)
	if err != nil {
		return entities.Ad{}, s.providerError(ctx, t, err)
	}
	s.afterCreate(ctx, "ad", func() error { return s.refreshAd(ctx, orgID, t, ext) }, func() error {
		return s.store.UpsertAds(ctx, orgID, []ads.Ad{{
			Provider: t.provider(), AccountExternalID: t.account.ExternalID, CampaignExternalID: camp.Campaign.ExternalID,
			AdGroupExternalID: group.ExternalID, ExternalID: ext, Name: spec.Name, Status: spec.Status,
		}})
	})
	id, err := s.idByExternal(ctx, "ads", t.account.ID, ext)
	if err != nil {
		return entities.Ad{}, err
	}
	after, err := s.AdView(ctx, orgID, id)
	if err != nil {
		return entities.Ad{}, err
	}
	err = s.record(ctx, orgID, actorID, "ad.created", "ad", id.String(), map[string]any{
		"provider": t.provider(), "external_id": ext, "request": r, "before": nil, "after": after,
	})
	return after, err
}
