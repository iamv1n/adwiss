package meta

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

// Every test here runs against the httptest fake Graph API; nothing reaches Meta.

func micros(units float64) *ads.Micros { return ptr(providers.FloatToMicros(units)) }

// lastPost returns the form of the last POST to path.
func (fg *fakeGraph) lastPost(t *testing.T, path string) url.Values {
	t.Helper()
	fg.mu.Lock()
	defer fg.mu.Unlock()
	for i := len(fg.requests) - 1; i >= 0; i-- {
		r := fg.requests[i]
		if r.Method == http.MethodPost && r.URL.Path == "/"+DefaultAPIVersion+path {
			return fg.forms[i]
		}
	}
	t.Fatalf("no POST to %s", path)
	return nil
}

func (fg *fakeGraph) posts() int {
	fg.mu.Lock()
	defer fg.mu.Unlock()
	n := 0
	for _, r := range fg.requests {
		if r.Method == http.MethodPost {
			n++
		}
	}
	return n
}

var okJSON = []byte(`{"success":true}`)

func TestUpdateCampaign(t *testing.T) {
	end := time.Date(2026, 10, 31, 23, 59, 0, 0, time.FixedZone("IST", 5*3600+1800))
	tests := []struct {
		name     string
		currency string
		current  string // GET /{campaign} response
		patch    ads.CampaignPatch
		want     map[string]string
		wantErr  error
	}{
		{
			name: "daily budget INR x100", currency: "INR",
			current: `{"account_id":"1001","daily_budget":"50000"}`,
			patch:   ads.CampaignPatch{DailyBudget: micros(750)},
			want:    map[string]string{"daily_budget": "75000"},
		},
		{
			name: "daily budget rounds to minor unit", currency: "USD",
			current: `{"account_id":"1001","daily_budget":"1000"}`,
			patch:   ads.CampaignPatch{DailyBudget: micros(12.345)},
			want:    map[string]string{"daily_budget": "1235"},
		},
		{
			name: "daily budget JPY x1", currency: "JPY",
			current: `{"account_id":"1001","daily_budget":"3000"}`,
			patch:   ads.CampaignPatch{DailyBudget: micros(5000)},
			want:    map[string]string{"daily_budget": "5000"},
		},
		{
			name: "lifetime budget, spend cap, status, name, end time", currency: "INR",
			current: `{"account_id":"1001","lifetime_budget":"1000000"}`,
			patch: ads.CampaignPatch{
				LifetimeBudget: micros(20000), SpendCap: micros(25000),
				Status: ptr(ads.StatusPaused), Name: ptr("Renamed"), EndTime: &end,
			},
			want: map[string]string{
				"lifetime_budget": "2000000", "spend_cap": "2500000", "status": "PAUSED",
				"name": "Renamed", "stop_time": "2026-10-31T23:59:00+05:30",
			},
		},
		{
			name: "clear spend cap and end time, archive", currency: "INR",
			current: `{"account_id":"1001"}`,
			patch:   ads.CampaignPatch{ClearSpendCap: true, ClearEndTime: true, Status: ptr(ads.StatusArchived)},
			want:    map[string]string{"spend_cap": NoSpendCap, "stop_time": "0", "status": "ARCHIVED"},
		},
		{
			name: "daily budget on ad set budget campaign", currency: "INR",
			current: `{"account_id":"1001"}`,
			patch:   ads.CampaignPatch{DailyBudget: micros(100)},
			wantErr: providers.ErrUnsupported,
		},
		{
			name: "daily budget on lifetime campaign", currency: "INR",
			current: `{"account_id":"1001","lifetime_budget":"100000"}`,
			patch:   ads.CampaignPatch{DailyBudget: micros(100)},
			wantErr: providers.ErrUnsupported,
		},
		{
			name: "budget rounds to zero", currency: "INR",
			current: `{"account_id":"1001","daily_budget":"100000"}`,
			patch:   ads.CampaignPatch{DailyBudget: ptr(ads.Micros(1000))},
			wantErr: providers.ErrInvalidRequest,
		},
		{
			name: "campaign in another account", currency: "INR",
			current: `{"account_id":"999"}`,
			patch:   ads.CampaignPatch{Name: ptr("x")},
			wantErr: providers.ErrNotFound,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fg, c, _ := newFakeGraph(t)
			fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"`+tt.currency+`"}`), 200))
			fg.on("GET", "/c1", serveJSON([]byte(tt.current), 200))
			fg.on("POST", "/c1", serveJSON(okJSON, 200))
			err := c.UpdateCampaign(context.Background(), "act_1001", "c1", tt.patch)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				require.Zero(t, fg.posts(), "nothing may be written")
				return
			}
			require.NoError(t, err)
			form := fg.lastPost(t, "/c1")
			for k, v := range tt.want {
				require.Equal(t, v, form.Get(k), k)
			}
			require.Len(t, form, len(tt.want))
		})
	}
}

func TestUpdateProviderErrors(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		body    string
		kind    error
		message string
	}{
		{"invalid parameter with user message", 400,
			`{"error":{"message":"Invalid parameter","type":"OAuthException","code":100,"error_subcode":1885272,"error_user_title":"Budget too low","error_user_msg":"Your budget must be at least ₹89.00."}}`,
			providers.ErrInvalidRequest, "Your budget must be at least ₹89.00."},
		{"expired token", 400, string(fixture(t, "error_token_expired.json")), providers.ErrUnauthorized, "Session has expired"},
		{"permission", 403, `{"error":{"message":"(#200) Requires ads_management permission","code":200}}`, providers.ErrPermissionDenied, "ads_management"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fg, c, _ := newFakeGraph(t)
			fg.on("GET", "/s1", serveJSON([]byte(`{"account_id":"1001"}`), 200))
			fg.on("POST", "/s1", serveJSON([]byte(tt.body), tt.status))
			err := c.UpdateAd(context.Background(), "1001", "s1", ads.AdPatch{Status: ptr(ads.StatusActive)})
			require.ErrorIs(t, err, tt.kind)
			var pe *providers.Error
			require.True(t, errors.As(err, &pe))
			require.Equal(t, tt.status, pe.HTTPStatus)
			require.Contains(t, pe.Message, tt.message)
		})
	}
}

func TestUpdateAdGroup(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"USD"}`), 200))
	fg.on("GET", "/as1", serveJSON([]byte(`{"account_id":"1001","daily_budget":"2000"}`), 200))
	fg.on("POST", "/as1", serveJSON(okJSON, 200))
	err := c.UpdateAdGroup(context.Background(), "1001", "as1", ads.AdGroupPatch{
		DailyBudget: micros(30), BidAmount: micros(12.5), ClearEndTime: true, Status: ptr(ads.StatusActive),
	})
	require.NoError(t, err)
	form := fg.lastPost(t, "/as1")
	require.Equal(t, "3000", form.Get("daily_budget"))
	require.Equal(t, "1250", form.Get("bid_amount"))
	require.Equal(t, "0", form.Get("end_time"))
	require.Equal(t, "ACTIVE", form.Get("status"))

	// Ad set under a campaign budget has no budget of its own.
	fg2, c2, _ := newFakeGraph(t)
	fg2.on("GET", "/as2", serveJSON([]byte(`{"account_id":"1001"}`), 200))
	err = c2.UpdateAdGroup(context.Background(), "1001", "as2", ads.AdGroupPatch{DailyBudget: micros(30)})
	require.ErrorIs(t, err, providers.ErrUnsupported)
}

func TestCreateCampaign(t *testing.T) {
	end := time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)
	tests := []struct {
		name    string
		spec    ads.CampaignSpec
		want    map[string]string
		absent  []string
		wantErr error
	}{
		{
			name: "ad set budgets", spec: ads.CampaignSpec{Name: "Traffic", Objective: "OUTCOME_TRAFFIC", BidStrategy: "LOWEST_COST_WITHOUT_CAP"},
			want: map[string]string{"name": "Traffic", "objective": "OUTCOME_TRAFFIC", "status": "PAUSED",
				"special_ad_categories": "[]", "is_adset_budget_sharing_enabled": "false"},
			absent: []string{"daily_budget", "bid_strategy"},
		},
		{
			name: "campaign daily budget", spec: ads.CampaignSpec{Name: "CBO", Objective: "OUTCOME_SALES", Status: ads.StatusActive,
				DailyBudget: micros(500), BidStrategy: "COST_CAP", SpecialAdCategories: []string{"HOUSING"}},
			want: map[string]string{"daily_budget": "50000", "status": "ACTIVE", "bid_strategy": "COST_CAP",
				"special_ad_categories": `["HOUSING"]`},
			absent: []string{"is_adset_budget_sharing_enabled"},
		},
		{
			name: "lifetime budget with end time", spec: ads.CampaignSpec{Name: "L", Objective: "OUTCOME_AWARENESS",
				LifetimeBudget: micros(10000), EndTime: &end},
			want: map[string]string{"lifetime_budget": "1000000", "stop_time": "2026-12-01T00:00:00Z"},
		},
		{
			name: "lifetime budget without end time", spec: ads.CampaignSpec{Name: "L", Objective: "OUTCOME_AWARENESS", LifetimeBudget: micros(10000)},
			wantErr: providers.ErrInvalidRequest,
		},
		{
			name: "cost cap needs campaign budget", spec: ads.CampaignSpec{Name: "L", Objective: "OUTCOME_TRAFFIC", BidStrategy: "COST_CAP"},
			wantErr: providers.ErrUnsupported,
		},
		{
			name: "cannot create archived", spec: ads.CampaignSpec{Name: "L", Objective: "OUTCOME_TRAFFIC", Status: ads.StatusArchived},
			wantErr: providers.ErrUnsupported,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fg, c, _ := newFakeGraph(t)
			fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"INR"}`), 200))
			fg.on("POST", "/act_1001/campaigns", serveJSON([]byte(`{"id":"120001"}`), 200))
			id, err := c.CreateCampaign(context.Background(), "1001", tt.spec)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				require.Zero(t, fg.posts())
				return
			}
			require.NoError(t, err)
			require.Equal(t, "120001", id)
			form := fg.lastPost(t, "/act_1001/campaigns")
			for k, v := range tt.want {
				require.Equal(t, v, form.Get(k), k)
			}
			for _, k := range tt.absent {
				require.NotContains(t, form, k)
			}
		})
	}
}

func TestCreateAdGroup(t *testing.T) {
	spec := func(mod func(*ads.AdGroupSpec)) ads.AdGroupSpec {
		s := ads.AdGroupSpec{CampaignID: "c1", Name: "India 18-45", OptimizationGoal: "LINK_CLICKS", BillingEvent: "IMPRESSIONS",
			DestinationType: "WEBSITE", DailyBudget: micros(300),
			Targeting: ads.Targeting{Countries: []string{"IN"}, AgeMin: 18, AgeMax: 45, AdvantageAudience: true}}
		if mod != nil {
			mod(&s)
		}
		return s
	}
	tests := []struct {
		name          string
		campaign      string
		spec          ads.AdGroupSpec
		want          map[string]string
		wantTargeting map[string]any
		wantErr       error
	}{
		{
			name: "own budget with advantage audience", campaign: `{"account_id":"1001"}`, spec: spec(nil),
			want: map[string]string{"campaign_id": "c1", "daily_budget": "30000", "status": "PAUSED",
				"bid_strategy": "LOWEST_COST_WITHOUT_CAP", "destination_type": "WEBSITE", "optimization_goal": "LINK_CLICKS"},
			wantTargeting: map[string]any{"geo_locations": map[string]any{"countries": []any{"IN"}},
				"age_min": 18.0, "age_max": 65.0, "age_range": []any{18.0, 45.0},
				"targeting_automation": map[string]any{"advantage_audience": 1.0}},
		},
		{
			name: "bid cap, no advantage audience, women", campaign: `{"account_id":"1001"}`,
			spec: spec(func(s *ads.AdGroupSpec) {
				s.BidAmount = micros(12.5)
				s.Targeting.AdvantageAudience = false
				s.Targeting.AgeMin = 30
				s.Targeting.Genders = []int{2}
				s.PromotedObject = map[string]string{"pixel_id": "777", "custom_event_type": "PURCHASE"}
			}),
			want: map[string]string{"bid_amount": "1250", "bid_strategy": "LOWEST_COST_WITH_BID_CAP",
				"promoted_object": `{"custom_event_type":"PURCHASE","pixel_id":"777"}`},
			wantTargeting: map[string]any{"geo_locations": map[string]any{"countries": []any{"IN"}},
				"age_min": 30.0, "age_max": 45.0, "genders": []any{2.0},
				"targeting_automation": map[string]any{"advantage_audience": 0.0}},
		},
		{
			name: "campaign budget: no ad set budget or bid strategy", campaign: `{"account_id":"1001","daily_budget":"50000"}`,
			spec: spec(func(s *ads.AdGroupSpec) { s.DailyBudget = nil }),
			want: map[string]string{"daily_budget": "", "bid_strategy": ""},
		},
		{
			name: "campaign budget and ad set budget", campaign: `{"account_id":"1001","daily_budget":"50000"}`, spec: spec(nil),
			wantErr: providers.ErrUnsupported,
		},
		{
			name: "no budget anywhere", campaign: `{"account_id":"1001"}`,
			spec:    spec(func(s *ads.AdGroupSpec) { s.DailyBudget = nil }),
			wantErr: providers.ErrInvalidRequest,
		},
		{
			name: "advantage audience age_min above 25", campaign: `{"account_id":"1001"}`,
			spec:    spec(func(s *ads.AdGroupSpec) { s.Targeting.AgeMin = 30 }),
			wantErr: providers.ErrInvalidRequest,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fg, c, _ := newFakeGraph(t)
			fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"INR"}`), 200))
			fg.on("GET", "/c1", serveJSON([]byte(tt.campaign), 200))
			fg.on("POST", "/act_1001/adsets", serveJSON([]byte(`{"id":"230001"}`), 200))
			id, err := c.CreateAdGroup(context.Background(), "1001", tt.spec)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				require.Zero(t, fg.posts())
				return
			}
			require.NoError(t, err)
			require.Equal(t, "230001", id)
			form := fg.lastPost(t, "/act_1001/adsets")
			for k, v := range tt.want {
				require.Equal(t, v, form.Get(k), k)
			}
			if tt.wantTargeting != nil {
				var got map[string]any
				require.NoError(t, json.Unmarshal([]byte(form.Get("targeting")), &got))
				require.Equal(t, tt.wantTargeting, got)
			}
		})
	}
}

func TestCreateAd(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/as1", serveJSON([]byte(`{"account_id":"1001"}`), 200))
	fg.on("POST", "/act_1001/adcreatives", serveJSON([]byte(`{"id":"cr9"}`), 200))
	fg.on("POST", "/act_1001/ads", serveJSON([]byte(`{"id":"ad9"}`), 200))
	id, err := c.CreateAd(context.Background(), "1001", ads.AdSpec{
		AdGroupID: "as1", Name: "Owl 1", PageID: "555",
		Creative: &ads.CreativeSpec{ImageHash: "abc", Link: "https://adwise.app", Message: "Primary",
			Headline: "Stop wasting ad spend", CallToAction: "LEARN_MORE"},
	})
	require.NoError(t, err)
	require.Equal(t, "ad9", id)

	cr := fg.lastPost(t, "/act_1001/adcreatives")
	var story map[string]any
	require.NoError(t, json.Unmarshal([]byte(cr.Get("object_story_spec")), &story))
	require.Equal(t, map[string]any{
		"page_id": "555",
		"link_data": map[string]any{
			"image_hash": "abc", "link": "https://adwise.app", "message": "Primary", "name": "Stop wasting ad spend",
			"call_to_action": map[string]any{"type": "LEARN_MORE", "value": map[string]any{"link": "https://adwise.app"}},
		},
	}, story)

	ad := fg.lastPost(t, "/act_1001/ads")
	require.Equal(t, "as1", ad.Get("adset_id"))
	require.Equal(t, "PAUSED", ad.Get("status"))
	require.JSONEq(t, `{"creative_id":"cr9"}`, ad.Get("creative"))

	// Promoting an existing post.
	fg2, c2, _ := newFakeGraph(t)
	fg2.on("GET", "/as1", serveJSON([]byte(`{"account_id":"1001"}`), 200))
	fg2.on("POST", "/act_1001/adcreatives", serveJSON([]byte(`{"id":"cr10"}`), 200))
	fg2.on("POST", "/act_1001/ads", serveJSON([]byte(`{"id":"ad10"}`), 200))
	_, err = c2.CreateAd(context.Background(), "1001", ads.AdSpec{AdGroupID: "as1", Name: "Post", Status: ads.StatusActive, ObjectStoryID: "555_777"})
	require.NoError(t, err)
	require.Equal(t, "555_777", fg2.lastPost(t, "/act_1001/adcreatives").Get("object_story_id"))
	require.Equal(t, "ACTIVE", fg2.lastPost(t, "/act_1001/ads").Get("status"))
}

func TestUploadImage(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("POST", "/act_1001/adimages", serveJSON([]byte(`{"images":{"bytes":{"hash":"h123","url":"https://scontent/x.png"}}}`), 200))
	img, err := c.UploadImage(context.Background(), "1001", "owl.png", []byte("\x89PNG..."))
	require.NoError(t, err)
	require.Equal(t, ads.Image{Hash: "h123", URL: "https://scontent/x.png"}, img)
	form := fg.lastPost(t, "/act_1001/adimages")
	require.Equal(t, base64.StdEncoding.EncodeToString([]byte("\x89PNG...")), form.Get("bytes"))
}

func TestListPagesFallback(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/act_1001/promote_pages", serveJSON([]byte(`{"data":[]}`), 200))
	fg.on("GET", "/me/accounts", serveJSON([]byte(`{"data":[{"id":"555","name":"Adwise","picture":{"data":{"url":"https://p/1.jpg"}}}]}`), 200))
	pages, err := c.ListPages(context.Background(), "1001")
	require.NoError(t, err)
	require.Equal(t, []ads.Page{{ID: "555", Name: "Adwise", PictureURL: "https://p/1.jpg"}}, pages)
}

func TestAccountLimits(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"INR","spend_cap":"5000000","amount_spent":"123450","balance":"0"}`), 200))
	fg.on("POST", "/act_1001", serveJSON(okJSON, 200))
	l, err := c.AccountLimits(context.Background(), "1001")
	require.NoError(t, err)
	require.Equal(t, ads.AccountLimits{SpendCap: micros(50000), AmountSpent: providers.FloatToMicros(1234.5), Currency: "INR"}, l)

	// Writes use standard units, not minor units.
	require.NoError(t, c.SetAccountSpendCap(context.Background(), "1001", micros(60000.5)))
	require.Equal(t, "60000.50", fg.lastPost(t, "/act_1001").Get("spend_cap"))
	require.NoError(t, c.SetAccountSpendCap(context.Background(), "1001", nil))
	form := fg.lastPost(t, "/act_1001")
	require.Equal(t, "delete", form.Get("spend_cap_action"))
	require.NotContains(t, form, "spend_cap")

	fgJ, cJ, _ := newFakeGraph(t)
	fgJ.on("GET", "/act_2002", serveJSON([]byte(`{"currency":"JPY","spend_cap":"0","amount_spent":"500","balance":"0"}`), 200))
	fgJ.on("POST", "/act_2002", serveJSON(okJSON, 200))
	lj, err := cJ.AccountLimits(context.Background(), "2002")
	require.NoError(t, err)
	require.Nil(t, lj.SpendCap)
	require.Equal(t, providers.FloatToMicros(500), lj.AmountSpent)
	require.NoError(t, cJ.SetAccountSpendCap(context.Background(), "2002", micros(90000)))
	require.Equal(t, "90000", fgJ.lastPost(t, "/act_2002").Get("spend_cap"))
}

func TestGetEntities(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"INR"}`), 200))
	fg.on("GET", "/c1", serveJSON([]byte(`{"id":"c1","account_id":"1001","name":"C","status":"PAUSED","objective":"OUTCOME_TRAFFIC","daily_budget":"75000"}`), 200))
	fg.on("GET", "/c2", serveJSON([]byte(`{"id":"c2","account_id":"42","name":"Other"}`), 200))
	fg.on("GET", "/ad1", serveJSON([]byte(`{"id":"ad1","account_id":"1001","campaign_id":"c1","adset_id":"as1","name":"A","status":"ACTIVE","creative":{"id":"cr1"}}`), 200))

	camp, err := c.GetCampaign(context.Background(), "act_1001", "c1")
	require.NoError(t, err)
	require.Equal(t, "1001", camp.AccountExternalID)
	require.Equal(t, ads.StatusPaused, camp.Status)
	require.Equal(t, micros(750), camp.DailyBudget)
	require.Contains(t, string(camp.Raw), "OUTCOME_TRAFFIC")

	_, err = c.GetCampaign(context.Background(), "1001", "c2")
	require.ErrorIs(t, err, providers.ErrNotFound)

	ad, err := c.GetAd(context.Background(), "1001", "ad1")
	require.NoError(t, err)
	require.Equal(t, "as1", ad.AdGroupExternalID)
	require.Equal(t, "cr1", ad.CreativeExternalID)
	require.Equal(t, ads.StatusActive, ad.Status)
}

func TestMajorUnits(t *testing.T) {
	require.Equal(t, "23.50", majorUnits(providers.FloatToMicros(23.5), 100))
	require.Equal(t, "0.05", majorUnits(providers.FloatToMicros(0.05), 100))
	require.Equal(t, "1500", majorUnits(providers.FloatToMicros(1500), 1))
}
