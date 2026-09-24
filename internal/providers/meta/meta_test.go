package meta

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	require.NoError(t, err)
	return b
}

type fakeGraph struct {
	t        *testing.T
	mu       sync.Mutex
	requests []*http.Request
	forms    []map[string][]string
	handlers map[string]func(w http.ResponseWriter, r *http.Request)
}

func newFakeGraph(t *testing.T) (*fakeGraph, *Client, *[]time.Duration) {
	fg := &fakeGraph{t: t, handlers: map[string]func(http.ResponseWriter, *http.Request){}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		fg.mu.Lock()
		fg.requests = append(fg.requests, r)
		fg.forms = append(fg.forms, r.Form)
		fg.mu.Unlock()
		require.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
		key := r.Method + " " + r.URL.Path
		h, ok := fg.handlers[key]
		if !ok {
			t.Errorf("unexpected request %s", key)
			http.NotFound(w, r)
			return
		}
		h(w, r)
	}))
	t.Cleanup(srv.Close)
	var slept []time.Duration
	c := New(Options{
		BaseURL:     srv.URL,
		TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "test-token"}),
		Sleep: func(_ context.Context, d time.Duration) error {
			slept = append(slept, d)
			return nil
		},
	})
	return fg, c, &slept
}

func (fg *fakeGraph) on(method, path string, h func(w http.ResponseWriter, r *http.Request)) {
	fg.handlers[method+" /"+DefaultAPIVersion+path] = h
}

func serveJSON(body []byte, status int, headers ...string) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, _ *http.Request) {
		for i := 0; i+1 < len(headers); i += 2 {
			w.Header().Set(headers[i], headers[i+1])
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}
}

func TestListAccountsPaging(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/me/adaccounts", func(w http.ResponseWriter, r *http.Request) {
		require.Contains(t, r.URL.Query().Get("fields"), "timezone_name")
		if r.URL.Query().Get("after") == "QVFIUmN" {
			serveJSON(fixture(t, "adaccounts_page2.json"), 200)(w, r)
			return
		}
		require.Empty(t, r.URL.Query().Get("after"))
		serveJSON(fixture(t, "adaccounts_page1.json"), 200)(w, r)
	})

	accts, err := c.ListAccounts(context.Background())
	require.NoError(t, err)
	require.Len(t, accts, 3)
	require.Equal(t, ads.Account{
		Provider: ads.ProviderMeta, ExternalID: "1001", Name: "Acme US", Currency: "USD",
		Timezone: "America/Los_Angeles", Status: ads.StatusActive, Raw: accts[0].Raw,
	}, accts[0])
	require.Contains(t, string(accts[0].Raw), `"business"`)
	require.Equal(t, ads.StatusArchived, accts[1].Status)
	require.Equal(t, ads.StatusPaused, accts[2].Status)
	require.Len(t, fg.requests, 2)
}

func TestListCampaignsCurrencyOffset(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/act_1002", serveJSON([]byte(`{"id":"act_1002","currency":"JPY"}`), 200))
	fg.on("GET", "/act_1002/campaigns", serveJSON(fixture(t, "campaigns_jpy.json"), 200))

	camps, err := c.ListCampaigns(context.Background(), "act_1002")
	require.NoError(t, err)
	require.Len(t, camps, 3)

	tests := []struct {
		status   ads.Status
		daily    *ads.Micros
		lifetime *ads.Micros
	}{
		{ads.StatusActive, ptr(ads.Micros(5_000_000_000)), nil}, // ¥5000, offset 1
		{ads.StatusPaused, nil, nil},
		{ads.StatusArchived, nil, ptr(ads.Micros(120_000_000_000))},
	}
	for i, tt := range tests {
		require.Equal(t, "1002", camps[i].AccountExternalID)
		require.Equal(t, tt.status, camps[i].Status, i)
		require.Equal(t, tt.daily, camps[i].DailyBudget, i)
		require.Equal(t, tt.lifetime, camps[i].LifetimeBudget, i)
	}
	require.Equal(t, "OUTCOME_SALES", camps[0].Objective)
	require.Contains(t, string(camps[0].Raw), "budget_remaining")
}

func TestListAdSetsAdsCreatives(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"USD"}`), 200))
	fg.on("GET", "/act_1001/adsets", serveJSON(fixture(t, "adsets.json"), 200))
	fg.on("GET", "/act_1001/ads", serveJSON(fixture(t, "ads.json"), 200))
	fg.on("GET", "/act_1001/adcreatives", serveJSON(fixture(t, "adcreatives.json"), 200))
	ctx := context.Background()

	sets, err := c.ListAdGroups(ctx, "1001")
	require.NoError(t, err)
	require.Len(t, sets, 2)
	require.Equal(t, ptr(ads.Micros(25_500_000)), sets[0].DailyBudget)
	require.Equal(t, "2385000000", sets[0].CampaignExternalID)
	require.Equal(t, ads.StatusActive, sets[0].Status) // configured status, not effective
	require.Equal(t, ads.StatusDeleted, sets[1].Status)

	adsList, err := c.ListAds(ctx, "1001")
	require.NoError(t, err)
	require.Len(t, adsList, 2)
	require.Equal(t, "990001", adsList[0].CreativeExternalID)
	require.Equal(t, "238500000001", adsList[0].AdGroupExternalID)
	require.Equal(t, ads.StatusPaused, adsList[1].Status)

	creatives, err := c.ListCreatives(ctx, "1001")
	require.NoError(t, err)
	require.Equal(t, []string{"video", "image", "share"}, []string{creatives[0].Type, creatives[1].Type, creatives[2].Type})
	require.Equal(t, "https://scontent.example/b.jpg", creatives[1].ThumbnailURL)
}

func TestFetchReportTranslation(t *testing.T) {
	tests := []struct {
		name       string
		report     string
		fixture    string
		breakdowns string
		check      func(t *testing.T, facts []ads.MetricFact)
	}{
		{
			name: "daily", report: "campaign_daily", fixture: "insights_campaign_daily.json",
			check: func(t *testing.T, facts []ads.MetricFact) {
				require.Len(t, facts, 2)
				f := facts[0]
				require.Equal(t, "campaign_daily", f.Report)
				require.Equal(t, "1001", f.AccountExternalID)
				require.Equal(t, "2026-09-01", f.Date)
				require.Nil(t, f.Hour)
				require.Equal(t, "2385000000", f.CampaignExternalID)
				require.Equal(t, int64(12045), f.Impressions)
				require.Equal(t, int64(310), f.Clicks)
				require.Equal(t, ads.Micros(123_450_000), f.Spend)
				require.Equal(t, ptr(int64(9800)), f.Reach)
				require.Equal(t, 7.0, f.Conversions) // only "purchase", not the pixel duplicate
				require.Equal(t, ads.Micros(456_700_000), f.ConversionValue)
				require.Contains(t, string(f.ProviderData), "lead")
				require.Equal(t, int64(0), facts[1].Impressions)
			},
		},
		{
			name: "hourly", report: "campaign_hourly", fixture: "insights_campaign_hourly.json",
			breakdowns: hourlyBreakdown,
			check: func(t *testing.T, facts []ads.MetricFact) {
				require.Len(t, facts, 2)
				require.Equal(t, int16(0), *facts[0].Hour)
				require.Equal(t, int16(13), *facts[1].Hour)
				require.Equal(t, ads.Micros(4_100_000), facts[0].Spend)
				require.Equal(t, ads.Micros(11_999_999), facts[1].Spend)
				require.Equal(t, ads.Micros(30_000_000), facts[0].ConversionValue)
				require.Nil(t, facts[0].Reach)
			},
		},
		{
			name: "placement", report: "campaign_placement_daily", fixture: "insights_campaign_placement.json",
			breakdowns: "publisher_platform,platform_position",
			check: func(t *testing.T, facts []ads.MetricFact) {
				require.Len(t, facts, 2)
				require.Equal(t, "facebook", facts[0].PublisherPlatform)
				require.Equal(t, "feed", facts[0].Placement)
				require.Equal(t, "instagram_stories", facts[1].Placement)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fg, c, _ := newFakeGraph(t)
			fg.on("GET", "/act_1001/insights", func(w http.ResponseWriter, r *http.Request) {
				q := r.URL.Query()
				require.Equal(t, "1", q.Get("time_increment"))
				require.Equal(t, `{"since":"2026-09-01","until":"2026-09-02"}`, q.Get("time_range"))
				require.Equal(t, tt.breakdowns, q.Get("breakdowns"))
				require.Equal(t, "campaign", q.Get("level"))
				serveJSON(fixture(t, tt.fixture), 200)(w, r)
			})
			def, ok := providers.CatalogReport(tt.report)
			require.True(t, ok)
			facts, err := c.FetchReport(context.Background(), def, "1001", ads.DateRange{Start: "2026-09-01", End: "2026-09-02"})
			require.NoError(t, err)
			tt.check(t, facts)
		})
	}
}

func TestConfigurableConversionAction(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	c.convAction = "lead"
	fg.on("GET", "/act_1001/insights", serveJSON(fixture(t, "insights_campaign_daily.json"), 200))
	def, _ := providers.CatalogReport("campaign_daily")
	facts, err := c.FetchReport(context.Background(), def, "1001", ads.DateRange{Start: "2026-09-01", End: "2026-09-02"})
	require.NoError(t, err)
	require.Equal(t, 3.0, facts[0].Conversions)
	require.Equal(t, ads.Micros(0), facts[0].ConversionValue)
}

func TestFetchReportAsync(t *testing.T) {
	fg, c, slept := newFakeGraph(t)
	polls := 0
	fg.on("POST", "/act_1001/insights", func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "campaign", r.PostForm.Get("level"))
		serveJSON([]byte(`{"report_run_id":"6200"}`), 200)(w, r)
	})
	fg.on("GET", "/6200", func(w http.ResponseWriter, r *http.Request) {
		polls++
		status := `{"id":"6200","async_status":"Job Running","async_percent_completion":40}`
		if polls >= 2 {
			status = `{"id":"6200","async_status":"Job Completed","async_percent_completion":100}`
		}
		serveJSON([]byte(status), 200)(w, r)
	})
	fg.on("GET", "/6200/insights", serveJSON(fixture(t, "insights_campaign_daily.json"), 200))

	def, _ := providers.CatalogReport("campaign_daily")
	facts, err := c.FetchReport(context.Background(), def, "1001", ads.DateRange{Start: "2026-06-01", End: "2026-08-31"})
	require.NoError(t, err)
	require.Len(t, facts, 2)
	require.Equal(t, 2, polls)
	require.Contains(t, *slept, 5*time.Second)
}

func TestFetchReportAsyncFailure(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("POST", "/act_1001/insights", serveJSON([]byte(`{"report_run_id":"6201"}`), 200))
	fg.on("GET", "/6201", serveJSON([]byte(`{"async_status":"Job Failed"}`), 200))
	def, _ := providers.CatalogReport("campaign_daily")
	_, err := c.FetchReport(context.Background(), def, "1001", ads.DateRange{Start: "2026-01-01", End: "2026-03-31"})
	require.ErrorIs(t, err, providers.ErrTemporary)
}

func TestUnsupportedReports(t *testing.T) {
	c := New(Options{TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "x"})})
	caps := c.Capabilities()
	require.Contains(t, caps.Reports, "campaign_hourly")
	require.Contains(t, caps.Reports, "campaign_country_daily")
	require.Contains(t, caps.Reports, "ad_daily")
	require.NotContains(t, caps.Reports, "keyword_daily")
	require.NotContains(t, caps.Reports, "search_term_daily")
	require.True(t, caps.PauseCampaign && caps.ActivateCampaign && caps.UpdateCampaignBudget)

	def, _ := providers.CatalogReport("keyword_daily")
	_, err := c.FetchReport(context.Background(), def, "1", ads.DateRange{Start: "2026-01-01", End: "2026-01-01"})
	require.ErrorIs(t, err, providers.ErrUnsupported)
}

func TestErrorMapping(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		body    []byte
		headers []string
		want    error
		retry   time.Duration
	}{
		{"expired token", 400, fixture(t, "error_token_expired.json"), nil, providers.ErrUnauthorized, 0},
		{"not found", 400, fixture(t, "error_not_found.json"), nil, providers.ErrNotFound, 0},
		{"permission", 403, []byte(`{"error":{"message":"(#200) Permissions error","code":200}}`), nil, providers.ErrPermissionDenied, 0},
		{"invalid", 400, []byte(`{"error":{"message":"Invalid parameter","code":100}}`), nil, providers.ErrInvalidRequest, 0},
		{
			"rate limited with BUC header", 400, fixture(t, "error_rate_limited.json"),
			[]string{"X-Business-Use-Case-Usage", `{"1001":[{"type":"ads_management","call_count":100,"total_cputime":20,"total_time":30,"estimated_time_to_regain_access":5}]}`},
			providers.ErrRateLimited, 5 * time.Minute,
		},
		{
			"rate limited with account header", 400, fixture(t, "error_rate_limited.json"),
			[]string{"X-Ad-Account-Usage", `{"acc_id_util_pct":100,"reset_time_duration":120,"ads_api_access_tier":"standard_access"}`},
			providers.ErrRateLimited, 2 * time.Minute,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fg, c, _ := newFakeGraph(t)
			fg.on("GET", "/act_1001/ads", serveJSON(tt.body, tt.status, tt.headers...))
			_, err := c.ListAds(context.Background(), "1001")
			require.ErrorIs(t, err, tt.want)
			d, _ := providers.RetryAfter(err)
			require.Equal(t, tt.retry, d)
			require.Len(t, fg.requests, 1, "long waits are not retried inline")
		})
	}
}

func TestRateLimitShortWaitRetriedInline(t *testing.T) {
	fg, c, slept := newFakeGraph(t)
	calls := 0
	fg.on("GET", "/act_1001/ads", func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			serveJSON(fixture(t, "error_rate_limited.json"), 400,
				"X-Ad-Account-Usage", `{"acc_id_util_pct":100,"reset_time_duration":10}`)(w, r)
			return
		}
		serveJSON(fixture(t, "ads.json"), 200)(w, r)
	})
	got, err := c.ListAds(context.Background(), "1001")
	require.NoError(t, err)
	require.Len(t, got, 2)
	require.Equal(t, []time.Duration{10 * time.Second}, *slept)
}

func TestTransientRetriedAndSoftThrottle(t *testing.T) {
	fg, c, slept := newFakeGraph(t)
	calls := 0
	fg.on("GET", "/act_1001/ads", func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			serveJSON([]byte(`{"error":{"message":"An unexpected error has occurred.","code":2,"is_transient":true}}`), 500)(w, r)
			return
		}
		serveJSON(fixture(t, "ads.json"), 200, "X-App-Usage", `{"call_count":96,"total_cputime":10,"total_time":10}`)(w, r)
	})
	_, err := c.ListAds(context.Background(), "1001")
	require.NoError(t, err)
	require.Equal(t, 2, calls)
	require.Len(t, *slept, 2) // backoff, then soft throttle at 96%
	require.Equal(t, 5*time.Second, (*slept)[1])
	require.Equal(t, 96.0, c.LastUsage().MaxPercent)
}

func TestSetCampaignStatus(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/2385000000", serveJSON([]byte(`{"id":"2385000000","account_id":"1001"}`), 200))
	fg.on("POST", "/2385000000", func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "PAUSED", r.PostForm.Get("status"))
		serveJSON([]byte(`{"success":true}`), 200)(w, r)
	})
	require.NoError(t, c.SetCampaignStatus(context.Background(), "1001", "2385000000", ads.StatusPaused))

	err := c.SetCampaignStatus(context.Background(), "1001", "2385000000", ads.StatusDeleted)
	require.ErrorIs(t, err, providers.ErrUnsupported)

	err = c.SetCampaignStatus(context.Background(), "9999", "2385000000", ads.StatusActive)
	require.ErrorIs(t, err, providers.ErrNotFound)
}

func TestUpdateCampaignBudget(t *testing.T) {
	tests := []struct {
		name     string
		campaign string
		currency string
		micros   ads.Micros
		want     string
		err      error
	}{
		{"usd cbo", `{"account_id":"1001","daily_budget":"5000"}`, "USD", 75_505_000, "7551", nil},
		{"jpy cbo", `{"account_id":"1001","daily_budget":"5000"}`, "JPY", 8_000_000_000, "8000", nil},
		{"abo", `{"account_id":"1001"}`, "USD", 10_000_000, "", providers.ErrUnsupported},
		{"lifetime", `{"account_id":"1001","lifetime_budget":"100000"}`, "USD", 10_000_000, "", providers.ErrUnsupported},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fg, c, _ := newFakeGraph(t)
			fg.on("GET", "/77", serveJSON([]byte(tt.campaign), 200))
			fg.on("GET", "/act_1001", serveJSON([]byte(`{"currency":"`+tt.currency+`"}`), 200))
			var posted string
			fg.on("POST", "/77", func(w http.ResponseWriter, r *http.Request) {
				posted = r.PostForm.Get("daily_budget")
				serveJSON([]byte(`{"success":true}`), 200)(w, r)
			})
			err := c.UpdateCampaignBudget(context.Background(), "1001", "77", tt.micros)
			if tt.err != nil {
				require.ErrorIs(t, err, tt.err)
				require.Empty(t, posted)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, posted)
		})
	}
}

func TestAppSecretProof(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	c.opts.AppSecret = "shh"
	fg.on("GET", "/act_1001/ads", func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, appSecretProof("test-token", "shh"), r.URL.Query().Get("appsecret_proof"))
		serveJSON(fixture(t, "ads.json"), 200)(w, r)
	})
	_, err := c.ListAds(context.Background(), "1001")
	require.NoError(t, err)
}

func TestOAuthClient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "GET /v26.0/oauth/access_token":
			require.Equal(t, "fb_exchange_token", r.URL.Query().Get("grant_type"))
			require.Equal(t, "short", r.URL.Query().Get("fb_exchange_token"))
			_, _ = w.Write([]byte(`{"access_token":"long","token_type":"bearer","expires_in":5183944}`))
		case "GET /v26.0/me":
			_, _ = w.Write([]byte(`{"id":"10158","name":"Jane Doe"}`))
		case "DELETE /v26.0/me/permissions":
			_, _ = w.Write([]byte(`{"success":true}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	o := OAuthClient{BaseURL: srv.URL, AppID: "app", AppSecret: "secret"}
	ctx := context.Background()

	tok, err := o.ExchangeLongLived(ctx, "short")
	require.NoError(t, err)
	require.Equal(t, "long", tok.AccessToken)
	require.WithinDuration(t, time.Now().Add(60*24*time.Hour), tok.Expiry, 24*time.Hour)

	me, err := o.Me(ctx, "long")
	require.NoError(t, err)
	require.Equal(t, Identity{ID: "10158", Name: "Jane Doe"}, me)
	require.NoError(t, o.Revoke(ctx, "long"))
}

func TestCurrencyOffset(t *testing.T) {
	require.Equal(t, int64(1), CurrencyOffset("JPY"))
	require.Equal(t, int64(1), CurrencyOffset("krw"))
	require.Equal(t, int64(100), CurrencyOffset("USD"))
	require.Equal(t, int64(100), CurrencyOffset("BHD")) // ISO has 3 decimals; Meta uses 100
}

func ptr[T any](v T) *T { return &v }
