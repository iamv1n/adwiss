package meta

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
)

func decodeJSON(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal([]byte(s), &m))
	return m
}

func adFake(t *testing.T) (*fakeGraph, *Client) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/as1", serveJSON([]byte(`{"account_id":"1001"}`), 200))
	fg.on("POST", "/act_1001/adcreatives", serveJSON([]byte(`{"id":"cr9"}`), 200))
	fg.on("POST", "/act_1001/ads", serveJSON([]byte(`{"id":"ad9"}`), 200))
	fg.on("GET", "/777", serveJSON([]byte(`{"id":"777","status":{"video_status":"ready"},"picture":"https://thumb/777.jpg"}`), 200))
	return fg, c
}

func TestCreateCarouselAd(t *testing.T) {
	fg, c := adFake(t)
	_, err := c.CreateAd(context.Background(), "1001", ads.AdSpec{
		AdGroupID: "as1", Name: "Shoes", PageID: "555", InstagramUserID: "1789", URLTags: "utm_source=meta",
		Creative: &ads.CreativeSpec{Format: ads.FormatCarousel, Link: "https://shop.test", Message: "New in",
			CallToAction: "SHOP_NOW", DisplayLink: "shop.test",
			Cards: []ads.CarouselCard{
				{ImageHash: "h1", Headline: "Red", Link: "https://shop.test/red"},
				{VideoID: "777", Headline: "Blue"},
			}},
	})
	require.NoError(t, err)
	form := fg.lastPost(t, "/act_1001/adcreatives")
	require.Equal(t, "utm_source=meta", form.Get("url_tags"))
	story := decodeJSON(t, form.Get("object_story_spec"))
	require.Equal(t, "1789", story["instagram_user_id"])
	link := story["link_data"].(map[string]any)
	require.Equal(t, "shop.test", link["caption"])
	require.Equal(t, true, link["multi_share_optimized"])
	cards := link["child_attachments"].([]any)
	require.Len(t, cards, 2)
	require.Equal(t, "https://shop.test/red", cards[0].(map[string]any)["link"])
	blue := cards[1].(map[string]any)
	require.Equal(t, "777", blue["video_id"])
	require.Equal(t, "https://thumb/777.jpg", blue["picture"])
	require.Equal(t, "https://shop.test", blue["link"]) // falls back to the ad link

	_, err = c.CreateAd(context.Background(), "1001", ads.AdSpec{AdGroupID: "as1", Name: "x", PageID: "555",
		Creative: &ads.CreativeSpec{Format: ads.FormatCarousel, Link: "https://shop.test", Cards: []ads.CarouselCard{{ImageHash: "h1"}}}})
	require.ErrorContains(t, err, "2–10 cards")
}

func TestCreateVideoAd(t *testing.T) {
	fg, c := adFake(t)
	_, err := c.CreateAd(context.Background(), "1001", ads.AdSpec{AdGroupID: "as1", Name: "Promo", PageID: "555",
		Creative: &ads.CreativeSpec{Format: ads.FormatVideo, VideoID: "777", Link: "https://shop.test", Message: "Watch", Headline: "Sale"}})
	require.NoError(t, err)
	video := decodeJSON(t, fg.lastPost(t, "/act_1001/adcreatives").Get("object_story_spec"))["video_data"].(map[string]any)
	require.Equal(t, "777", video["video_id"])
	require.Equal(t, "https://thumb/777.jpg", video["image_url"])
	require.Equal(t, "Sale", video["title"])
	require.Equal(t, "LEARN_MORE", video["call_to_action"].(map[string]any)["type"])

	// A video still processing can't be used yet.
	fg.on("GET", "/888", serveJSON([]byte(`{"id":"888","status":{"video_status":"processing"}}`), 200))
	_, err = c.CreateAd(context.Background(), "1001", ads.AdSpec{AdGroupID: "as1", Name: "Promo", PageID: "555",
		Creative: &ads.CreativeSpec{Format: ads.FormatVideo, VideoID: "888", Link: "https://shop.test"}})
	require.ErrorContains(t, err, "still processing")
}

func TestCreateFlexibleAd(t *testing.T) {
	fg, c := adFake(t)
	_, err := c.CreateAd(context.Background(), "1001", ads.AdSpec{AdGroupID: "as1", Name: "Flex", PageID: "555",
		Creative: &ads.CreativeSpec{Format: ads.FormatFlexible, Link: "https://shop.test", CallToAction: "SHOP_NOW",
			ImageHashes: []string{"h1", "h2"}, VideoIDs: []string{"777"},
			Messages: []string{"A", "B"}, Headlines: []string{"H"}, Description: "D"}})
	require.NoError(t, err)
	require.Equal(t, 1, fg.posts(), "flexible ads skip /adcreatives")
	form := fg.lastPost(t, "/act_1001/ads")
	require.Equal(t, "as1", form.Get("adset_id"))
	require.Equal(t, "555", decodeJSON(t, form.Get("creative"))["object_story_spec"].(map[string]any)["page_id"])
	group := decodeJSON(t, form.Get("creative_asset_groups_spec"))["groups"].([]any)[0].(map[string]any)
	require.Len(t, group["images"], 2)
	require.Len(t, group["videos"], 1)
	texts := group["texts"].([]any)
	require.Len(t, texts, 4)
	require.Equal(t, map[string]any{"text": "D", "text_type": "description"}, texts[3])
	require.Equal(t, "https://shop.test", group["call_to_action"].(map[string]any)["value"].(map[string]any)["link"])
}

func TestTargetingSpecFull(t *testing.T) {
	spec, err := targetingSpec(ads.Targeting{
		Regions: []string{"1001"}, Cities: []ads.CityGeo{{Key: "2002", RadiusKm: 25}}, ExcludedCountries: []string{"PK"},
		Locales: []int{6}, AgeMin: 21, AgeMax: 45,
		Interests:         []ads.TargetingOption{{ID: "6003", Name: "Running", Type: "interests"}, {ID: "6004", Name: "Frequent travellers", Type: "behaviors"}},
		ExcludedInterests: []ads.TargetingOption{{ID: "6005", Name: "Golf", Type: "interests"}},
		Audiences:         []string{"ca1"}, ExcludedAudiences: []string{"ca2"},
		Placements:        &ads.Placements{Platforms: []string{"facebook", "instagram"}, InstagramPositions: []string{"stream", "reels"}},
	})
	require.NoError(t, err)
	b, _ := json.Marshal(spec)
	require.JSONEq(t, `{
		"geo_locations": {"regions":[{"key":"1001"}], "cities":[{"key":"2002","radius":25,"distance_unit":"kilometer"}]},
		"excluded_geo_locations": {"countries":["PK"]},
		"locales": [6], "age_min": 21, "age_max": 45,
		"targeting_automation": {"advantage_audience": 0},
		"flexible_spec": [{"interests":[{"id":"6003","name":"Running"}], "behaviors":[{"id":"6004","name":"Frequent travellers"}]}],
		"exclusions": {"interests":[{"id":"6005","name":"Golf"}]},
		"custom_audiences": [{"id":"ca1"}], "excluded_custom_audiences": [{"id":"ca2"}],
		"publisher_platforms": ["facebook","instagram"], "instagram_positions": ["stream","reels"]
	}`, string(b))

	_, err = targetingSpec(ads.Targeting{})
	require.ErrorContains(t, err, "at least one country")
}

func TestCreateAdGroupBidStrategyAndAttribution(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/c1", serveJSON([]byte(`{"account_id":"1001"}`), 200))
	fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"INR"}`), 200))
	fg.on("POST", "/act_1001/adsets", serveJSON([]byte(`{"id":"as5"}`), 200))
	roas := 2.5
	_, err := c.CreateAdGroup(context.Background(), "1001", ads.AdGroupSpec{
		CampaignID: "c1", Name: "ROAS", OptimizationGoal: "OFFSITE_CONVERSIONS", BillingEvent: "IMPRESSIONS",
		DailyBudget: micros(1000), BidStrategy: "LOWEST_COST_WITH_MIN_ROAS", ROASFloor: &roas, Attribution: "7d_click",
		Targeting: ads.Targeting{Countries: []string{"IN"}},
	})
	require.NoError(t, err)
	form := fg.lastPost(t, "/act_1001/adsets")
	require.Equal(t, "LOWEST_COST_WITH_MIN_ROAS", form.Get("bid_strategy"))
	require.JSONEq(t, `{"roas_average_floor":25000}`, form.Get("bid_constraints"))
	require.JSONEq(t, `[{"event_type":"CLICK_THROUGH","window_days":7}]`, form.Get("attribution_spec"))

	_, err = c.CreateAdGroup(context.Background(), "1001", ads.AdGroupSpec{
		CampaignID: "c1", Name: "Cap", OptimizationGoal: "OFFSITE_CONVERSIONS", BillingEvent: "IMPRESSIONS",
		DailyBudget: micros(1000), BidStrategy: "COST_CAP", Targeting: ads.Targeting{Countries: []string{"IN"}},
	})
	require.ErrorContains(t, err, "COST_CAP needs bid_amount")
}

func TestSearchTargetingAndAudiences(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/act_1001/targetingsearch", serveJSON([]byte(`{"data":[{"id":"6003","name":"Running","type":"interests","path":["Interests","Fitness and wellness","Running"],"audience_size_lower_bound":1000}]}`), 200))
	fg.on("GET", "/search", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("type") == "adlocale" {
			_, _ = io.WriteString(w, `{"data":[{"key":6,"name":"English (US)"}]}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":[{"key":"2002","name":"Bengaluru","type":"city","region":"Karnataka","country_name":"India"}]}`)
	})
	fg.on("GET", "/act_1001/customaudiences", serveJSON([]byte(`{"data":[{"id":"ca1","name":"Buyers 1%","subtype":"LOOKALIKE","approximate_count_lower_bound":900000}]}`), 200))

	got, err := c.SearchTargeting(context.Background(), "1001", ads.TargetingInterests, "run")
	require.NoError(t, err)
	require.Equal(t, []ads.TargetingOption{{ID: "6003", Name: "Running", Type: "interests", Description: "Interests › Fitness and wellness", AudienceSize: 1000}}, got)
	got, err = c.SearchTargeting(context.Background(), "1001", ads.TargetingLocations, "benga")
	require.NoError(t, err)
	require.Equal(t, "Karnataka, India", got[0].Description)
	got, err = c.SearchTargeting(context.Background(), "1001", ads.TargetingLanguages, "eng")
	require.NoError(t, err)
	require.Equal(t, "6", got[0].ID)

	aud, err := c.ListAudiences(context.Background(), "1001")
	require.NoError(t, err)
	require.Equal(t, []ads.Audience{{ID: "ca1", Name: "Buyers 1%", Subtype: "LOOKALIKE", ApproxCount: 900000}}, aud)
}

func TestUploadVideoMultipart(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	var got string
	fg.on("POST", "/act_1001/advideos", func(w http.ResponseWriter, r *http.Request) {
		f, _, err := r.FormFile("source")
		require.NoError(t, err)
		b, _ := io.ReadAll(f)
		got = string(b)
		_, _ = io.WriteString(w, `{"id":"999"}`)
	})
	v, err := c.UploadVideo(context.Background(), "1001", "promo.mp4", strings.NewReader("MP4DATA"))
	require.NoError(t, err)
	require.Equal(t, ads.Video{ID: "999", Status: "processing"}, v)
	require.Equal(t, "MP4DATA", got)
}
