package manage

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/providers"
)

func TestCampaignPatchDecoding(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		check   func(t *testing.T, p ads.CampaignPatch)
		wantErr string
	}{
		{"budget and null lifetime", `{"daily_budget": 750, "lifetime_budget": null}`, func(t *testing.T, p ads.CampaignPatch) {
			require.Equal(t, ads.Micros(750_000_000), *p.DailyBudget)
			require.Nil(t, p.LifetimeBudget)
			require.False(t, p.ClearSpendCap)
		}, ""},
		{"null clears spend cap and end time", `{"spend_cap": null, "end_time": null}`, func(t *testing.T, p ads.CampaignPatch) {
			require.True(t, p.ClearSpendCap)
			require.True(t, p.ClearEndTime)
			require.Nil(t, p.SpendCap)
		}, ""},
		{"absent leaves unchanged", `{"status": "paused"}`, func(t *testing.T, p ads.CampaignPatch) {
			require.Equal(t, ads.StatusPaused, *p.Status)
			require.False(t, p.ClearSpendCap)
			require.False(t, p.ClearEndTime)
			require.Nil(t, p.EndTime)
		}, ""},
		{"end time", `{"end_time": "2026-10-31T23:59:00+05:30", "spend_cap": 20000.5}`, func(t *testing.T, p ads.CampaignPatch) {
			require.Equal(t, "2026-10-31T18:29:00Z", p.EndTime.UTC().Format("2006-01-02T15:04:05Z07:00"))
			require.Equal(t, ads.Micros(20_000_500_000), *p.SpendCap)
		}, ""},
		{"both budgets", `{"daily_budget": 1, "lifetime_budget": 2}`, nil, "lifetime_budget"},
		{"negative budget", `{"daily_budget": -5}`, nil, "daily_budget"},
		{"bad status", `{"status": "deleted"}`, nil, "status"},
		{"empty name", `{"name": "  "}`, nil, "name"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req CampaignPatch
			require.NoError(t, json.Unmarshal([]byte(tt.body), &req))
			p, err := req.toAds()
			if tt.wantErr != "" {
				var he *httpx.Error
				require.True(t, errors.As(err, &he))
				require.Equal(t, http.StatusUnprocessableEntity, he.Status)
				require.Contains(t, he.Fields, tt.wantErr)
				return
			}
			require.NoError(t, err)
			tt.check(t, p)
		})
	}
}

func TestCreateAdGroupValidation(t *testing.T) {
	base := func() CreateAdGroupRequest {
		return CreateAdGroupRequest{Name: "India", OptimizationGoal: "LINK_CLICKS", DailyBudget: ptr(300.0),
			Targeting: TargetingRequest{Countries: []string{"in"}, AgeMin: ptr(18), AgeMax: ptr(45), Genders: []int{}}}
	}
	s, err := base().spec("OUTCOME_TRAFFIC")
	require.NoError(t, err)
	require.Equal(t, []string{"IN"}, s.Targeting.Countries)
	require.True(t, s.Targeting.AdvantageAudience, "advantage audience defaults on")
	require.Equal(t, "IMPRESSIONS", s.BillingEvent)
	require.Equal(t, ads.StatusPaused, s.Status)
	require.Nil(t, s.Targeting.Genders)

	_, err = base().spec("OUTCOME_SALES")
	require.ErrorContains(t, err, "promoted_object")

	r := base()
	r.Targeting.Countries = nil
	_, err = r.spec("OUTCOME_TRAFFIC")
	require.ErrorContains(t, err, "countries")

	r = base()
	r.LifetimeBudget, r.DailyBudget = ptr(1000.0), nil
	_, err = r.spec("OUTCOME_TRAFFIC")
	require.ErrorContains(t, err, "end_time")
}

func TestCreateAdValidation(t *testing.T) {
	ok := CreateAdRequest{Name: "Owl", PageID: "123", Creative: &CreativeRequest{ImageHash: "abc", Link: "https://adwise.app", CallToAction: "LEARN_MORE"}}
	_, err := ok.spec()
	require.NoError(t, err)

	bad := ok
	bad.Creative = &CreativeRequest{ImageHash: "abc", Link: "javascript:alert(1)"}
	_, err = bad.spec()
	require.ErrorContains(t, err, "link")

	both := ok
	both.ObjectStoryID = "1_2"
	_, err = both.spec()
	require.ErrorContains(t, err, "object_story_id")

	post := CreateAdRequest{Name: "Post", ObjectStoryID: "123_456"}
	_, err = post.spec()
	require.NoError(t, err)
}

func TestProviderErrorMapping(t *testing.T) {
	s := &Service{}
	tests := []struct {
		err    error
		status int
		code   string
	}{
		{providers.Unsupported(ads.ProviderMeta, "this campaign's budget is set on its ad sets"), 422, "unsupported"},
		{&providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrInvalidRequest, Message: "lifetime_budget requires end_time"}, 422, "validation_failed"},
		{&providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrInvalidRequest, HTTPStatus: 400, Message: "Invalid parameter Your budget is too low"}, 502, "provider_error"},
		{&providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrNotFound, Message: "campaign does not belong to this ad account"}, 404, "not_found"},
	}
	for _, tt := range tests {
		err := s.providerError(context.Background(), target{}, tt.err)
		var he *httpx.Error
		require.True(t, errors.As(err, &he), tt.err)
		require.Equal(t, tt.status, he.Status)
		require.Equal(t, tt.code, he.Code)
		var pe *providers.Error
		errors.As(tt.err, &pe)
		require.Equal(t, pe.Message, he.Message)
	}
}

func ptr[T any](v T) *T { return &v }
