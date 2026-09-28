package manage

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
)

func fieldOf(t *testing.T, err error) string {
	t.Helper()
	require.Error(t, err)
	return err.Error()
}

func TestCreativeFormatsValidation(t *testing.T) {
	base := func(c CreativeRequest) CreateAdRequest {
		c.Link = "https://shop.test"
		return CreateAdRequest{AdGroupID: uuid.New(), Name: "Ad", PageID: "555", Creative: &c}
	}
	ok := []CreativeRequest{
		{ImageHash: "h"},
		{Format: "video", VideoID: "777"},
		{Format: "carousel", Cards: []CardRequest{{ImageHash: "a"}, {VideoID: "7", Link: "https://x.test"}}},
		{Format: "flexible", ImageHashes: []string{"a", "b"}, VideoIDs: []string{"7"}, Messages: []string{"m1", "m2"}},
	}
	for _, c := range ok {
		s, err := base(c).spec()
		require.NoError(t, err, c.Format)
		require.NotEmpty(t, s.Creative.Format)
	}

	bad := map[string]CreativeRequest{
		"creative.image_hash":            {},
		"creative.video_id":              {Format: "video", VideoID: "abc"},
		"creative.cards":                 {Format: "carousel", Cards: []CardRequest{{ImageHash: "a"}}},
		"creative.cards[1]":              {Format: "carousel", Cards: []CardRequest{{ImageHash: "a"}, {}}},
		"creative.image_hashes":          {Format: "flexible"},
		"creative.messages":              {Format: "flexible", ImageHashes: []string{"a"}, Messages: []string{"1", "2", "3", "4", "5", "6"}},
		"creative.format":                {Format: "slideshow"},
	}
	for field, c := range bad {
		_, err := base(c).spec()
		require.Contains(t, fieldOf(t, err), field, field)
	}

	r := base(CreativeRequest{ImageHash: "h"})
	r.URLTags = "?utm_source=meta&utm_medium=paid"
	r.InstagramUserID = "1789"
	s, err := r.spec()
	require.NoError(t, err)
	require.Equal(t, "utm_source=meta&utm_medium=paid", s.URLTags)
	require.Equal(t, "1789", s.InstagramUserID)
	r.InstagramUserID = "me"
	_, err = r.spec()
	require.Contains(t, fieldOf(t, err), "instagram_user_id")
}

func TestTargetingRequestValidation(t *testing.T) {
	no := false
	tg, err := TargetingRequest{
		Regions: []string{"1001"}, Cities: []CityRequest{{Key: "2002", RadiusKm: 25}}, Locales: []int{6},
		AdvantageAudience: &no, AgeMin: ptr(30),
		Interests:  []ads.TargetingOption{{ID: "6003", Name: "Running"}, {ID: "6004", Name: "Travellers", Type: "behaviors"}},
		Audiences:  []string{"2385"},
		Placements: &PlacementsRequest{Platforms: []string{"instagram"}, InstagramPositions: []string{"reels", "story"}},
	}.spec()
	require.NoError(t, err)
	require.Equal(t, "interests", tg.Interests[0].Type)
	require.Equal(t, []string{"reels", "story"}, tg.Placements.InstagramPositions)

	bad := map[string]TargetingRequest{
		"choose at least one country":        {},
		"radius must be 17–80":               {Countries: []string{"IN"}, Cities: []CityRequest{{Key: "1", RadiusKm: 5}}},
		"unsupported type":                   {Countries: []string{"IN"}, Interests: []ads.TargetingOption{{ID: "1", Type: "secret"}}},
		"unknown platform":                   {Countries: []string{"IN"}, Placements: &PlacementsRequest{Platforms: []string{"tiktok"}}},
		"not a chosen platform":              {Countries: []string{"IN"}, Placements: &PlacementsRequest{Platforms: []string{"facebook"}, InstagramPositions: []string{"reels"}}},
		"unknown position":                   {Countries: []string{"IN"}, Placements: &PlacementsRequest{Platforms: []string{"facebook"}, FacebookPositions: []string{"billboard"}}},
		"use automatic placements":           {Countries: []string{"IN"}, Placements: &PlacementsRequest{}},
		"must be 25 or lower with Advantage": {Countries: []string{"IN"}, AgeMin: ptr(30)},
	}
	for want, r := range bad {
		_, err := r.spec()
		require.Contains(t, fieldOf(t, err), want, want)
	}
}

func TestAdGroupBidStrategyValidation(t *testing.T) {
	base := CreateAdGroupRequest{Name: "AS", OptimizationGoal: "OFFSITE_CONVERSIONS", DailyBudget: ptr(500.0),
		Targeting: TargetingRequest{Countries: []string{"IN"}}}

	r := base
	r.BidStrategy, r.BidAmount = "COST_CAP", ptr(120.0)
	r.Attribution = "1d_click"
	s, err := r.spec("OUTCOME_TRAFFIC")
	require.NoError(t, err)
	require.Equal(t, "COST_CAP", s.BidStrategy)
	require.Equal(t, "1d_click", s.Attribution)

	r = base
	r.BidStrategy = "COST_CAP"
	_, err = r.spec("OUTCOME_TRAFFIC")
	require.Contains(t, fieldOf(t, err), "bid_amount")

	r = base
	r.BidStrategy = "LOWEST_COST_WITH_MIN_ROAS"
	_, err = r.spec("OUTCOME_TRAFFIC")
	require.Contains(t, fieldOf(t, err), "roas_floor")

	r = base
	r.Attribution = "28d_click"
	_, err = r.spec("OUTCOME_TRAFFIC")
	require.Contains(t, fieldOf(t, err), "attribution")
}
