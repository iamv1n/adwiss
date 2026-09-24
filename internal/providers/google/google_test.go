package google

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

type recorded struct {
	path, login, devToken, query string
	body                         map[string]any
}

type fakeAds struct {
	mu       sync.Mutex
	requests []recorded
	handler  func(rec recorded) (int, []byte)
}

func newFake(t *testing.T, handler func(rec recorded) (int, []byte)) (*fakeAds, *Client, *[]time.Duration) {
	f := &fakeAds{handler: handler}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer tok", r.Header.Get("Authorization"))
		rec := recorded{path: r.Method + " " + r.URL.Path, login: r.Header.Get("login-customer-id"), devToken: r.Header.Get("developer-token")}
		if r.Body != nil {
			b, _ := io.ReadAll(r.Body)
			if len(b) > 0 {
				require.NoError(t, json.Unmarshal(b, &rec.body))
				if q, ok := rec.body["query"].(string); ok {
					rec.query = q
				}
			}
		}
		f.mu.Lock()
		f.requests = append(f.requests, rec)
		f.mu.Unlock()
		status, body := f.handler(rec)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	var slept []time.Duration
	c := New(Options{
		BaseURL: srv.URL, DeveloperToken: "dev-token",
		TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok"}),
		Sleep: func(_ context.Context, d time.Duration) error {
			slept = append(slept, d)
			return nil
		},
	})
	return f, c, &slept
}

func TestListAccountsHierarchy(t *testing.T) {
	f, c, _ := newFake(t, func(rec recorded) (int, []byte) {
		switch rec.path {
		case "GET /v25/customers:listAccessibleCustomers":
			return 200, fixture(t, "list_accessible_customers.json")
		case "POST /v25/customers/1112223333/googleAds:searchStream":
			return 200, fixture(t, "customer_client_manager.json")
		case "POST /v25/customers/4445556666/googleAds:searchStream":
			return 200, fixture(t, "customer_client_direct.json")
		}
		return 404, nil
	})
	accts, err := c.ListAccounts(context.Background())
	require.NoError(t, err)

	byID := map[string]ads.Account{}
	for _, a := range accts {
		byID[a.ExternalID] = a
	}
	require.Len(t, accts, 3, "manager skipped, duplicate client deduped")
	require.NotContains(t, byID, "1112223333")
	require.Equal(t, "EUR", byID["7778889999"].Currency)
	require.Equal(t, "Europe/Berlin", byID["7778889999"].Timezone)
	require.Equal(t, "Client A", byID["7778889999"].Name)
	require.Equal(t, ads.StatusArchived, byID["1231231234"].Status)
	require.Contains(t, string(byID["7778889999"].Raw), `"login_customer_id":"1112223333"`)

	require.Equal(t, map[string]string{
		"7778889999": "1112223333",
		"4445556666": "4445556666", // directly accessible: no manager needed
		"1231231234": "1112223333",
	}, c.LoginCustomerIDs())

	for _, r := range f.requests {
		require.Equal(t, "dev-token", r.devToken)
		if strings.Contains(r.path, "1112223333/googleAds") {
			require.Equal(t, "1112223333", r.login)
			require.Contains(t, r.query, "FROM customer_client")
		}
	}
}

func TestListAccountsSkipsBrokenRoot(t *testing.T) {
	_, c, _ := newFake(t, func(rec recorded) (int, []byte) {
		switch rec.path {
		case "GET /v25/customers:listAccessibleCustomers":
			return 200, fixture(t, "list_accessible_customers.json")
		case "POST /v25/customers/1112223333/googleAds:searchStream":
			return 403, fixture(t, "error_permission.json")
		case "POST /v25/customers/4445556666/googleAds:searchStream":
			return 200, fixture(t, "customer_client_direct.json")
		}
		return 404, nil
	})
	accts, err := c.ListAccounts(context.Background())
	require.NoError(t, err)
	require.Len(t, accts, 1)
}

func TestEntities(t *testing.T) {
	f, c, _ := newFake(t, func(rec recorded) (int, []byte) {
		switch {
		case strings.Contains(rec.query, "FROM campaign"):
			return 200, fixture(t, "campaigns.json")
		case strings.Contains(rec.query, "FROM ad_group_ad"):
			return 200, fixture(t, "ads.json")
		case strings.Contains(rec.query, "FROM ad_group"):
			return 200, fixture(t, "ad_groups_ads.json")
		case strings.Contains(rec.query, "FROM asset"):
			return 200, fixture(t, "assets.json")
		}
		return 400, nil
	})
	c.logins["7778889999"] = "1112223333"
	ctx := context.Background()

	camps, err := c.ListCampaigns(ctx, "777-888-9999")
	require.NoError(t, err)
	require.Len(t, camps, 3)
	require.Equal(t, ads.StatusActive, camps[0].Status)
	require.Equal(t, "SEARCH", camps[0].Objective)
	require.Equal(t, ptr(ads.Micros(25_000_000)), camps[0].DailyBudget)
	require.Nil(t, camps[0].LifetimeBudget)
	require.Nil(t, camps[1].DailyBudget)
	require.Equal(t, ptr(ads.Micros(3_000_000_000)), camps[1].LifetimeBudget)
	require.Equal(t, ads.StatusDeleted, camps[2].Status)
	require.Equal(t, "7778889999", camps[0].AccountExternalID)
	require.Equal(t, "1112223333", f.requests[0].login, "manager used as login-customer-id")

	groups, err := c.ListAdGroups(ctx, "7778889999")
	require.NoError(t, err)
	require.Len(t, groups, 2, "rows from every stream batch")
	require.Equal(t, "111", groups[1].CampaignExternalID)
	require.Equal(t, ads.StatusPaused, groups[1].Status)

	adList, err := c.ListAds(ctx, "7778889999")
	require.NoError(t, err)
	require.Equal(t, "9001", adList[0].ExternalID)
	require.Equal(t, "5001", adList[0].AdGroupExternalID)
	require.Equal(t, "responsive search ad 9001", adList[0].Name)
	require.Equal(t, ads.StatusDeleted, adList[1].Status)

	cr, err := c.ListCreatives(ctx, "7778889999")
	require.NoError(t, err)
	require.Equal(t, []string{"image", "video", "text"}, []string{cr[0].Type, cr[1].Type, cr[2].Type})
	require.Equal(t, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", cr[1].ThumbnailURL)
	require.Equal(t, "Launch film", cr[1].Name)
	require.Equal(t, "Free shipping today", cr[2].Name)
}

func TestFetchReport(t *testing.T) {
	tests := []struct {
		report   string
		fixture  string
		wantFrom string
		wantSel  []string
		check    func(t *testing.T, f []ads.MetricFact)
	}{
		{
			"campaign_daily", "report_campaign_daily.json", "FROM campaign WHERE segments.date BETWEEN '2026-09-01' AND '2026-09-02'",
			[]string{"campaign.id", "metrics.cost_micros", "metrics.conversions_value"},
			func(t *testing.T, f []ads.MetricFact) {
				require.Len(t, f, 2)
				require.Equal(t, ads.MetricFact{
					Provider: ads.ProviderGoogle, Report: "campaign_daily", AccountExternalID: "7778889999",
					Date: "2026-09-01", CampaignExternalID: "111",
					Impressions: 1520, Clicks: 88, Spend: 43_210_000, Conversions: 3.5, ConversionValue: 210_750_000,
					ProviderData: f[0].ProviderData,
				}, f[0])
			},
		},
		{
			"campaign_hourly", "report_campaign_hourly.json", "FROM campaign ", []string{"segments.hour"},
			func(t *testing.T, f []ads.MetricFact) {
				require.Equal(t, int16(0), *f[0].Hour)
				require.Equal(t, int16(23), *f[1].Hour)
				require.Equal(t, ads.Micros(19_990_000), f[1].ConversionValue)
			},
		},
		{
			"campaign_country_daily", "report_country.json", "FROM user_location_view", []string{"user_location_view.country_criterion_id"},
			func(t *testing.T, f []ads.MetricFact) {
				require.Len(t, f, 2, "targeting_location rows merged")
				require.Equal(t, "DE", f[0].Country)
				require.Equal(t, int64(120), f[0].Impressions)
				require.Equal(t, ads.Micros(3_500_000), f[0].Spend)
				require.Equal(t, "US", f[1].Country)
			},
		},
		{
			"keyword_daily", "report_keyword.json", "FROM keyword_view", []string{"ad_group_criterion.keyword.text", "ad_group.id"},
			func(t *testing.T, f []ads.MetricFact) {
				require.Equal(t, "[acme shoes]", f[0].Keyword)
				require.Equal(t, `"acme shoes"`, f[1].Keyword)
				require.Equal(t, "5001", f[0].AdGroupExternalID)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.report, func(t *testing.T) {
			f, c, _ := newFake(t, func(recorded) (int, []byte) { return 200, fixture(t, tt.fixture) })
			def, ok := providers.CatalogReport(tt.report)
			require.True(t, ok)
			facts, err := c.FetchReport(context.Background(), def, "7778889999", ads.DateRange{Start: "2026-09-01", End: "2026-09-02"})
			require.NoError(t, err)
			q := f.requests[0].query
			require.Contains(t, q, tt.wantFrom)
			for _, s := range tt.wantSel {
				require.Contains(t, q, s)
			}
			tt.check(t, facts)
		})
	}
}

func TestCapabilities(t *testing.T) {
	c := New(Options{TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "x"})})
	caps := c.Capabilities()
	for _, r := range []string{"campaign_daily", "campaign_hourly", "campaign_country_daily", "campaign_device_daily", "ad_group_daily", "ad_daily", "keyword_daily", "search_term_daily", "campaign_publisher_platform_daily"} {
		require.Contains(t, caps.Reports, r)
	}
	require.NotContains(t, caps.Reports, "campaign_placement_daily")
	def, _ := providers.CatalogReport("campaign_placement_daily")
	_, err := c.FetchReport(context.Background(), def, "1", ads.DateRange{Start: "2026-01-01", End: "2026-01-01"})
	require.ErrorIs(t, err, providers.ErrUnsupported)
}

func TestErrorMapping(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   error
		retry  time.Duration
		calls  int
	}{
		{"auth", 401, "error_auth.json", providers.ErrUnauthorized, 0, 1},
		{"permission", 403, "error_permission.json", providers.ErrPermissionDenied, 0, 1},
		{"quota retried inline then surfaced", 429, "error_quota.json", providers.ErrRateLimited, 17 * time.Second, 4},
		{"mid-stream internal error retried", 200, "error_stream_mid.json", providers.ErrTemporary, 0, 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, c, slept := newFake(t, func(recorded) (int, []byte) { return tt.status, fixture(t, tt.body) })
			_, err := c.ListCampaigns(context.Background(), "7778889999")
			require.ErrorIs(t, err, tt.want)
			d, _ := providers.RetryAfter(err)
			require.Equal(t, tt.retry, d)
			require.Len(t, f.requests, tt.calls)
			if tt.retry > 0 {
				require.Equal(t, tt.retry, (*slept)[0])
			}
			var pe *providers.Error
			require.ErrorAs(t, err, &pe)
			require.NotEmpty(t, pe.RequestID)
		})
	}
}

func TestLongQuotaNotRetriedInline(t *testing.T) {
	body := strings.Replace(string(fixture(t, "error_quota.json")), `"17s"`, `"3600s"`, 1)
	f, c, _ := newFake(t, func(recorded) (int, []byte) { return 429, []byte(body) })
	_, err := c.ListAdGroups(context.Background(), "7778889999")
	d, ok := providers.RetryAfter(err)
	require.True(t, ok)
	require.Equal(t, time.Hour, d)
	require.Len(t, f.requests, 1)
}

func TestSetCampaignStatus(t *testing.T) {
	f, c, _ := newFake(t, func(rec recorded) (int, []byte) {
		return 200, []byte(`{"results":[{"resourceName":"customers/7778889999/campaigns/111"}]}`)
	})
	require.NoError(t, c.SetCampaignStatus(context.Background(), "7778889999", "111", ads.StatusPaused))
	r := f.requests[0]
	require.Equal(t, "POST /v25/customers/7778889999/campaigns:mutate", r.path)
	op := r.body["operations"].([]any)[0].(map[string]any)
	require.Equal(t, "status", op["updateMask"])
	require.Equal(t, map[string]any{"resourceName": "customers/7778889999/campaigns/111", "status": "PAUSED"}, op["update"])
	require.Equal(t, false, r.body["partialFailure"])

	require.ErrorIs(t, c.SetCampaignStatus(context.Background(), "7778889999", "111", ads.StatusArchived), providers.ErrUnsupported)
	require.ErrorIs(t, c.SetCampaignStatus(context.Background(), "7778889999", "1/../x", ads.StatusPaused), providers.ErrInvalidRequest)
	require.ErrorIs(t, c.SetCampaignStatus(context.Background(), "abc", "111", ads.StatusPaused), providers.ErrInvalidRequest)
}

func TestUpdateCampaignBudget(t *testing.T) {
	lookup := func(budget string) string {
		return `[{"results":[{"campaign":{"id":"111"},"campaignBudget":` + budget + `}]}]`
	}
	tests := []struct {
		name   string
		budget string
		mutate string
		err    error
	}{
		{"daily", `{"resourceName":"customers/7778889999/campaignBudgets/901","period":"DAILY","explicitlyShared":false,"amountMicros":"25000000"}`, `{"results":[{"resourceName":"customers/7778889999/campaignBudgets/901"}]}`, nil},
		{"shared", `{"resourceName":"customers/7778889999/campaignBudgets/905","period":"DAILY","explicitlyShared":true,"referenceCount":"3"}`, "", providers.ErrUnsupported},
		{"custom period", `{"resourceName":"customers/7778889999/campaignBudgets/902","period":"CUSTOM_PERIOD","totalAmountMicros":"3000000000"}`, "", providers.ErrUnsupported},
		{"partial failure", `{"resourceName":"customers/7778889999/campaignBudgets/901","period":"DAILY"}`, string(fixture(t, "mutate_partial_failure.json")), providers.ErrInvalidRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, c, _ := newFake(t, func(rec recorded) (int, []byte) {
				if strings.HasSuffix(rec.path, "googleAds:searchStream") {
					return 200, []byte(lookup(tt.budget))
				}
				return 200, []byte(tt.mutate)
			})
			err := c.UpdateCampaignBudget(context.Background(), "7778889999", "111", 30_000_000)
			if tt.err != nil {
				require.ErrorIs(t, err, tt.err)
				if tt.mutate == "" {
					require.Len(t, f.requests, 1, "no mutate for unsupported budgets")
				}
				return
			}
			require.NoError(t, err)
			op := f.requests[1].body["operations"].([]any)[0].(map[string]any)
			require.Equal(t, "POST /v25/customers/7778889999/campaignBudgets:mutate", f.requests[1].path)
			require.Equal(t, "amountMicros", op["updateMask"])
			require.Equal(t, "30000000", op["update"].(map[string]any)["amountMicros"])
		})
	}
}

func TestCountryFromCriterion(t *testing.T) {
	require.Equal(t, "US", countryFromCriterion("2840"))
	require.Equal(t, "IN", countryFromCriterion("2356"))
	require.Equal(t, "GB", countryFromCriterion("2826"))
	require.Equal(t, "geo:1023191", countryFromCriterion("1023191"))
	require.Equal(t, "geo:2999", countryFromCriterion("2999"))
}

func ptr[T any](v T) *T { return &v }
