// Command seed loads idempotent demo data: a demo user and organization, one
// fake integration per provider, 4 ad accounts, 16 campaigns with ad groups,
// ads and creatives, and 90 days of hourly and daily metric facts.
//
// Re-running is safe: every write is an upsert and the generator is
// deterministic per (campaign, date), so a second run changes nothing.
//
// Login: demo@adwise.dev / demopassword1
// Admin console (/admin): admin@adwise.com / AdminPass#1
package main

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"math/rand/v2"
	"os"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/reports"
)

const (
	demoEmail    = "demo@adwise.dev"
	demoPassword = "demopassword1"
	// Development-only platform admin for the /admin console.
	adminEmail    = "admin@adwise.com"
	adminPassword = "AdminPass#1"
	days          = 90
	tzName        = "Asia/Kolkata"
	currency      = "INR"
)

func main() {
	if err := run(); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	ctx := context.Background()
	start := time.Now()
	db, err := database.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	orgID, integrations, err := seedTenant(ctx, db)
	if err != nil {
		return err
	}
	st := entities.NewStore(db)

	accounts := demoAccounts()
	for provider, accts := range accounts {
		if err := st.UpsertAccounts(ctx, orgID, integrations[provider], accts); err != nil {
			return fmt.Errorf("accounts: %w", err)
		}
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE ad_accounts SET sync_enabled = true WHERE organization_id = $1 AND NOT sync_enabled`, orgID); err != nil {
		return err
	}

	camps := demoCampaigns(accounts)
	tree := buildTree(camps)
	if err := st.UpsertCampaigns(ctx, orgID, tree.campaigns); err != nil {
		return fmt.Errorf("campaigns: %w", err)
	}
	if err := st.UpsertAdGroups(ctx, orgID, tree.adGroups); err != nil {
		return fmt.Errorf("ad groups: %w", err)
	}
	if err := st.UpsertAds(ctx, orgID, tree.ads); err != nil {
		return fmt.Errorf("ads: %w", err)
	}
	if err := st.UpsertCreatives(ctx, orgID, tree.creatives); err != nil {
		return fmt.Errorf("creatives: %w", err)
	}

	loc, err := time.LoadLocation(tzName)
	if err != nil {
		return err
	}
	localNow := time.Now().In(loc)
	y, m, d := localNow.Date()
	end := time.Date(y, m, d, 0, 0, 0, 0, time.UTC).AddDate(0, 0, -1) // yesterday, account-local
	facts := generateFacts(camps, end, localNow.Hour())
	if err := st.UpsertMetricFacts(ctx, orgID, facts); err != nil {
		return fmt.Errorf("facts: %w", err)
	}

	now := time.Now()
	for _, accts := range accounts {
		for _, a := range accts {
			for _, scope := range []string{"entities", "metrics:" + reports.CampaignDaily, "metrics:" + reports.CampaignHourly} {
				if err := st.MarkSynced(ctx, orgID, a.Provider, a.ExternalID, scope, now); err != nil {
					return err
				}
			}
		}
	}

	slog.Info("seed complete",
		"organization_id", orgID, "login", demoEmail+" / "+demoPassword, "admin_login", adminEmail+" / "+adminPassword,
		"campaigns", len(tree.campaigns), "ad_groups", len(tree.adGroups), "ads", len(tree.ads),
		"facts", len(facts), "from", end.AddDate(0, 0, -(days-1)).Format(time.DateOnly), "to", end.Format(time.DateOnly),
		"duration", time.Since(start).Round(time.Millisecond))
	return nil
}

func seedTenant(ctx context.Context, db *database.DB) (uuid.UUID, map[ads.Provider]uuid.UUID, error) {
	hash, err := auth.HashPassword(demoPassword)
	if err != nil {
		return uuid.Nil, nil, err
	}
	var userID, orgID uuid.UUID
	if err := db.Pool.QueryRow(ctx, `
INSERT INTO users (email, name, password_hash) VALUES ($1, 'Demo User', $2)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()
RETURNING id`, demoEmail, hash).Scan(&userID); err != nil {
		return uuid.Nil, nil, fmt.Errorf("user: %w", err)
	}
	adminHash, err := auth.HashPassword(adminPassword)
	if err != nil {
		return uuid.Nil, nil, err
	}
	if _, err := db.Pool.Exec(ctx, `
INSERT INTO users (email, name, password_hash, is_platform_admin) VALUES ($1, 'Platform Admin', $2, true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_platform_admin = true, updated_at = now()`,
		adminEmail, adminHash); err != nil {
		return uuid.Nil, nil, fmt.Errorf("admin user: %w", err)
	}
	if err := db.Pool.QueryRow(ctx, `
INSERT INTO organizations (name, slug) VALUES ('Demo Co', 'demo-co')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
RETURNING id`).Scan(&orgID); err != nil {
		return uuid.Nil, nil, fmt.Errorf("organization: %w", err)
	}
	if _, err := db.Pool.Exec(ctx, `
INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'owner')
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner'`, orgID, userID); err != nil {
		return uuid.Nil, nil, fmt.Errorf("membership: %w", err)
	}
	integrations := map[ads.Provider]uuid.UUID{}
	for _, p := range []ads.Provider{ads.ProviderMeta, ads.ProviderGoogle} {
		var id uuid.UUID
		// FAKE CREDENTIALS: these bytes are placeholders, not encrypted tokens.
		// The demo integrations cannot call provider APIs; a real connection
		// stores AES-256-GCM ciphertext written by the integrations package.
		if err := db.Pool.QueryRow(ctx, `
INSERT INTO integrations (organization_id, provider, status, external_user_id, display_name,
                          access_token_encrypted, refresh_token_encrypted, created_by)
VALUES ($1, $2::ad_provider, 'active', $3, $4, $5, $6, $7)
ON CONFLICT (organization_id, provider, external_user_id) DO UPDATE SET status = 'active', updated_at = now()
RETURNING id`, orgID, string(p), "demo-"+string(p)+"-user", "Demo "+string(p)+" connection",
			[]byte("fake-seed-access-token-not-encrypted"), []byte("fake-seed-refresh-token-not-encrypted"), userID,
		).Scan(&id); err != nil {
			return uuid.Nil, nil, fmt.Errorf("integration %s: %w", p, err)
		}
		integrations[p] = id
	}
	return orgID, integrations, nil
}

func demoAccounts() map[ads.Provider][]ads.Account {
	mk := func(p ads.Provider, id, name string) ads.Account {
		return ads.Account{Provider: p, ExternalID: id, Name: name, Currency: currency, Timezone: tzName,
			Status: ads.StatusActive, Raw: []byte(`{"seed":true}`)}
	}
	return map[ads.Provider][]ads.Account{
		ads.ProviderMeta: {
			mk(ads.ProviderMeta, "act_1000000001", "Demo Co – Meta India"),
			mk(ads.ProviderMeta, "act_1000000002", "Demo Co – Meta Performance"),
		},
		ads.ProviderGoogle: {
			mk(ads.ProviderGoogle, "1234567890", "Demo Co – Google Search"),
			mk(ads.ProviderGoogle, "2345678901", "Demo Co – Google Shopping & Video"),
		},
	}
}

// profile drives the synthetic performance of one campaign.
type profile struct {
	ads.Campaign
	budget float64 // INR per day
	cpm    float64 // INR per 1000 impressions
	ctr    float64
	cvr    float64 // conversions per click
	aov    float64 // INR per conversion
	kind   string  // normal | wasteful | drop
	search bool    // Google search campaign (keyword facts)
}

func demoCampaigns(accounts map[ads.Provider][]ads.Account) []profile {
	type spec struct {
		name, objective string
		budget, cpm     float64
		ctr, cvr, aov   float64
		kind            string
		search          bool
	}
	meta := []spec{
		{"Prospecting – Broad Audiences", "OUTCOME_SALES", 18000, 140, 0.012, 0.022, 1900, "normal", false},
		{"Retargeting – Cart Abandoners", "OUTCOME_SALES", 8000, 260, 0.021, 0.060, 2300, "normal", false},
		{"Lookalike 1% – Purchasers", "OUTCOME_SALES", 14000, 165, 0.014, 0.028, 2000, "normal", false},
		{"Advantage+ Shopping – Catalog", "OUTCOME_SALES", 22000, 150, 0.016, 0.035, 2100, "drop", false},
		{"Brand Awareness – Reels", "OUTCOME_AWARENESS", 12000, 90, 0.006, 0.003, 1200, "wasteful", false},
		{"Festive Sale – Carousel", "OUTCOME_SALES", 10000, 170, 0.015, 0.030, 2500, "normal", false},
		{"Interest Stack – Fitness", "OUTCOME_TRAFFIC", 9000, 120, 0.009, 0.004, 1100, "wasteful", false},
		{"Video Views – Product Demo", "OUTCOME_ENGAGEMENT", 6000, 70, 0.007, 0.010, 1500, "normal", false},
	}
	google := []spec{
		{"Search – Brand Terms", "SEARCH", 7000, 900, 0.090, 0.085, 2400, "normal", true},
		{"Search – Generic Running Shoes", "SEARCH", 16000, 700, 0.045, 0.030, 2200, "normal", true},
		{"Search – Competitor Terms", "SEARCH", 11000, 850, 0.030, 0.005, 1800, "wasteful", true},
		{"Performance Max – All Products", "PERFORMANCE_MAX", 20000, 220, 0.013, 0.032, 2100, "normal", false},
		{"Shopping – Bestsellers", "SHOPPING", 15000, 260, 0.018, 0.030, 2300, "drop", false},
		{"Display – Remarketing", "DISPLAY", 6000, 80, 0.006, 0.020, 1900, "normal", false},
		{"YouTube – Awareness", "VIDEO", 10000, 60, 0.003, 0.002, 1500, "wasteful", false},
		{"Search – DSA Catch-all", "SEARCH", 5000, 600, 0.040, 0.025, 2000, "normal", true},
	}
	var out []profile
	add := func(p ads.Provider, specs []spec, prefix string) {
		for i, s := range specs {
			acct := accounts[p][i/4]
			budget := int64(s.budget * 1e6)
			status := ads.StatusActive
			if s.kind == "wasteful" && i == 6 { // Interest Stack (Meta), YouTube (Google)
				status = ads.StatusPaused // paused recently; still has history
			}
			out = append(out, profile{
				Campaign: ads.Campaign{
					Provider: p, AccountExternalID: acct.ExternalID, ExternalID: fmt.Sprintf("%s%02d", prefix, i+1),
					Name: s.name, Status: status, Objective: s.objective, DailyBudget: &budget, Raw: []byte(`{"seed":true}`),
				},
				budget: s.budget, cpm: s.cpm, ctr: s.ctr, cvr: s.cvr, aov: s.aov, kind: s.kind, search: s.search,
			})
		}
	}
	add(ads.ProviderMeta, meta, "2385000000")
	add(ads.ProviderGoogle, google, "1900000")
	return out
}

type entityTree struct {
	campaigns []ads.Campaign
	adGroups  []ads.AdGroup
	ads       []ads.Ad
	creatives []ads.Creative
}

// Each campaign has 2 ad groups with 2 ads each; each ad has its own creative.
func adGroupID(c ads.Campaign, g int) string { return fmt.Sprintf("%s%d", c.ExternalID, g+1) }
func adID(c ads.Campaign, g, a int) string   { return fmt.Sprintf("%s%d%d", c.ExternalID, g+1, a+1) }
func creativeID(c ads.Campaign, g, a int) string {
	return fmt.Sprintf("cr%s%d%d", c.ExternalID, g+1, a+1)
}

var groupNames = []string{"Core audience", "Expansion"}
var adNames = []string{"Hero image", "UGC video"}

func buildTree(camps []profile) entityTree {
	var t entityTree
	for _, p := range camps {
		c := p.Campaign
		t.campaigns = append(t.campaigns, c)
		for g := range 2 {
			t.adGroups = append(t.adGroups, ads.AdGroup{
				Provider: c.Provider, AccountExternalID: c.AccountExternalID, CampaignExternalID: c.ExternalID,
				ExternalID: adGroupID(c, g), Name: c.Name + " – " + groupNames[g], Status: c.Status,
			})
			for a := range 2 {
				typ := "image"
				if a == 1 {
					typ = "video"
				}
				t.ads = append(t.ads, ads.Ad{
					Provider: c.Provider, AccountExternalID: c.AccountExternalID, CampaignExternalID: c.ExternalID,
					AdGroupExternalID: adGroupID(c, g), ExternalID: adID(c, g, a),
					Name: fmt.Sprintf("%s – %s %d", groupNames[g], adNames[a], a+1), Status: c.Status,
					CreativeExternalID: creativeID(c, g, a),
				})
				t.creatives = append(t.creatives, ads.Creative{
					Provider: c.Provider, AccountExternalID: c.AccountExternalID, ExternalID: creativeID(c, g, a),
					Name: fmt.Sprintf("%s – %s – %s", c.Name, groupNames[g], adNames[a]), Type: typ,
					ThumbnailURL: fmt.Sprintf("https://picsum.photos/seed/%s/320/320", creativeID(c, g, a)),
				})
			}
		}
	}
	return t
}

// Account-local hour-of-day shape: weak overnight, strong 09–22, evening peak.
var hourSpend = [24]float64{0.25, 0.16, 0.11, 0.09, 0.09, 0.13, 0.25, 0.45, 0.7, 0.95, 1.05, 1.1,
	1.15, 1.1, 1.05, 1.05, 1.1, 1.2, 1.35, 1.5, 1.55, 1.45, 1.15, 0.6}

// Conversion-rate multiplier by hour: evenings convert best, nights worst.
var hourCVR = [24]float64{0.55, 0.45, 0.4, 0.4, 0.45, 0.5, 0.6, 0.75, 0.85, 0.95, 1.0, 1.0,
	1.0, 0.95, 0.95, 1.0, 1.05, 1.15, 1.3, 1.4, 1.45, 1.35, 1.1, 0.8}

// Day-of-week multipliers indexed by time.Weekday (Sunday = 0).
var dowSpend = [7]float64{1.12, 0.98, 0.97, 1.0, 1.02, 1.08, 1.18}
var dowCVR = [7]float64{1.15, 0.92, 0.95, 0.97, 1.0, 1.03, 1.2}

func poisson(r *rand.Rand, lambda float64) int64 {
	if lambda <= 0 {
		return 0
	}
	if lambda > 30 {
		return max(0, int64(math.Round(lambda+math.Sqrt(lambda)*r.NormFloat64())))
	}
	l, k, p := math.Exp(-lambda), int64(0), 1.0
	for {
		p *= r.Float64()
		if p <= l {
			return k
		}
		k++
	}
}

func jitter(r *rand.Rand, spread float64) float64 { return 1 + spread*(2*r.Float64()-1) }

type sums struct {
	impressions, clicks, spend, conversions, value int64
}

func (s *sums) add(o sums) {
	s.impressions += o.impressions
	s.clicks += o.clicks
	s.spend += o.spend
	s.conversions += o.conversions
	s.value += o.value
}

// todayPace scales today's spend per campaign (index order of demoCampaigns)
// so budget pacing shows over-, under- and on-track campaigns.
var todayPace = []float64{
	1.45, 0.5, 1.0, 1.0, 1.05, 1.1, 1.0, 0.9, // Meta
	1.0, 1.5, 0.95, 0.45, 1.0, 1.05, 1.0, 1.3, // Google
}

// generateFacts produces `days` full days ending at end plus today's
// completed hours (before nowHour, account-local). Breakdown reports are only
// produced for complete days, as providers finalize them daily.
func generateFacts(camps []profile, end time.Time, nowHour int) []ads.MetricFact {
	var facts []ads.MetricFact
	for ci, p := range camps {
		for di := range days + 1 {
			isToday := di == days
			date := end.AddDate(0, 0, -(days - 1 - di))
			ds := date.Format(time.DateOnly)
			daysAgo := days - 1 - di
			// Seeded by (campaign, date) so every run produces identical values.
			r := rand.New(rand.NewPCG(uint64(ci+1), uint64(date.Unix())))

			wd := date.Weekday()
			trend := 0.85 + 0.15*float64(di)/float64(days) // gentle growth
			cvrMult := 1.0
			if p.kind == "drop" && daysAgo < 10 {
				cvrMult = 0.3 // conversion tracking/creative fatigue: ROAS collapses
			}
			if p.Status == ads.StatusPaused && daysAgo < 7 {
				continue // paused a week ago
			}

			dailySpend := p.budget * dowSpend[wd] * trend * jitter(r, 0.12)
			if isToday {
				dailySpend *= todayPace[ci%len(todayPace)]
			}
			var total float64
			for _, w := range hourSpend {
				total += w
			}
			var day sums
			for h := range 24 {
				if isToday && h >= nowHour {
					break
				}
				spend := dailySpend * hourSpend[h] / total * jitter(r, 0.25)
				imps := int64(spend / p.cpm * 1000)
				if imps == 0 {
					continue
				}
				clicks := poisson(r, float64(imps)*p.ctr*jitter(r, 0.15))
				conv := poisson(r, float64(clicks)*p.cvr*hourCVR[h]*dowCVR[wd]*cvrMult)
				value := int64(float64(conv) * p.aov * jitter(r, 0.3) * 1e6)
				s := sums{imps, clicks, int64(spend * 1e6), conv, value}
				day.add(s)
				hour := int16(h)
				facts = append(facts, fact(p, reports.CampaignHourly, ds, &hour, s))
			}
			if day.impressions == 0 {
				continue
			}
			facts = append(facts, fact(p, reports.CampaignDaily, ds, nil, day))
			if !isToday {
				facts = append(facts, breakdowns(r, p, ds, day, daysAgo)...)
			}
		}
	}
	return facts
}

func fact(p profile, report, date string, hour *int16, s sums) ads.MetricFact {
	return ads.MetricFact{
		Provider: p.Provider, Report: report, AccountExternalID: p.AccountExternalID, Date: date, Hour: hour,
		CampaignExternalID: p.ExternalID,
		Impressions:        s.impressions, Clicks: s.clicks, Spend: s.spend,
		Conversions: float64(s.conversions), ConversionValue: s.value,
	}
}

// split divides total into len(w) integers proportional to w that sum to total
// exactly (largest remainder).
func split(total int64, w []float64) []int64 {
	var sum float64
	for _, x := range w {
		sum += x
	}
	out := make([]int64, len(w))
	if total == 0 || sum == 0 {
		return out
	}
	rem := make([]float64, len(w))
	var assigned int64
	for i, x := range w {
		exact := float64(total) * x / sum
		out[i] = int64(exact)
		rem[i] = exact - float64(out[i])
		assigned += out[i]
	}
	for assigned < total {
		best := 0
		for i := range rem {
			if rem[i] > rem[best] {
				best = i
			}
		}
		out[best]++
		rem[best] = -1
		assigned++
	}
	return out
}

type segment struct {
	a, b       string  // dimension values (b used for placement)
	share      float64 // share of impressions/spend
	ctr, cvr   float64 // relative performance
	aovFactor  float64
	onlySearch bool
}

// splitDay distributes a day's sums over segments; every measure sums exactly
// to the campaign's daily totals.
func splitDay(r *rand.Rand, day sums, segs []segment) []sums {
	n := len(segs)
	ws, wc, wv, wa := make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n)
	for i, s := range segs {
		ws[i] = s.share * jitter(r, 0.1)
		wc[i] = ws[i] * s.ctr
		wv[i] = wc[i] * s.cvr
		wa[i] = wv[i] * s.aovFactor
	}
	imps, spend := split(day.impressions, ws), split(day.spend, ws)
	clicks, conv, value := split(day.clicks, wc), split(day.conversions, wv), split(day.value, wa)
	out := make([]sums, n)
	for i := range out {
		out[i] = sums{imps[i], clicks[i], spend[i], conv[i], value[i]}
	}
	return out
}

var countries = []segment{
	{a: "IN", share: 0.78, ctr: 1, cvr: 1, aovFactor: 1},
	{a: "AE", share: 0.07, ctr: 1.1, cvr: 1.2, aovFactor: 1.6},
	{a: "US", share: 0.07, ctr: 0.9, cvr: 0.7, aovFactor: 2.0},
	{a: "GB", share: 0.04, ctr: 0.9, cvr: 0.8, aovFactor: 1.8},
	{a: "SG", share: 0.04, ctr: 1.0, cvr: 1.0, aovFactor: 1.5},
}

var devices = []segment{
	{a: "mobile", share: 0.72, ctr: 1.1, cvr: 0.85, aovFactor: 0.9},
	{a: "desktop", share: 0.22, ctr: 0.8, cvr: 1.6, aovFactor: 1.3},
	{a: "tablet", share: 0.06, ctr: 0.9, cvr: 1.0, aovFactor: 1.0},
}

var metaPlacements = []segment{
	{a: "facebook", b: "feed", share: 0.30, ctr: 1, cvr: 1.1, aovFactor: 1},
	{a: "instagram", b: "feed", share: 0.26, ctr: 1.1, cvr: 1.1, aovFactor: 1},
	{a: "instagram", b: "reels", share: 0.20, ctr: 1.2, cvr: 0.8, aovFactor: 0.9},
	{a: "instagram", b: "stories", share: 0.12, ctr: 0.9, cvr: 0.9, aovFactor: 1},
	{a: "audience_network", b: "classic", share: 0.07, ctr: 0.6, cvr: 0.3, aovFactor: 0.8},
	{a: "messenger", b: "inbox", share: 0.05, ctr: 0.7, cvr: 0.6, aovFactor: 1},
}

var googleSearchPlacements = []segment{
	{a: "google_search", b: "search", share: 0.85, ctr: 1, cvr: 1, aovFactor: 1},
	{a: "search_partners", b: "search", share: 0.15, ctr: 0.7, cvr: 0.6, aovFactor: 1},
}

var googleOtherPlacements = []segment{
	{a: "google_display", b: "display", share: 0.45, ctr: 0.7, cvr: 0.8, aovFactor: 1},
	{a: "youtube", b: "video", share: 0.35, ctr: 0.8, cvr: 0.7, aovFactor: 1},
	{a: "google_search", b: "search", share: 0.20, ctr: 2.0, cvr: 1.5, aovFactor: 1},
}

var keywords = [][]string{
	{"[running shoes]", "\"running shoes online\"", "+buy +running +shoes"},
	{"[sports shoes men]", "\"best running shoes\"", "+trail +running +shoes"},
}

func breakdowns(r *rand.Rand, p profile, date string, day sums, daysAgo int) []ads.MetricFact {
	var out []ads.MetricFact
	emit := func(report string, segs []segment, set func(f *ads.MetricFact, s segment)) {
		for i, s := range splitDay(r, day, segs) {
			if s.impressions == 0 && s.spend == 0 {
				continue
			}
			f := fact(p, report, date, nil, s)
			set(&f, segs[i])
			out = append(out, f)
		}
	}
	emit(reports.CampaignCountryDaily, countries, func(f *ads.MetricFact, s segment) { f.Country = s.a })
	emit(reports.CampaignDeviceDaily, devices, func(f *ads.MetricFact, s segment) { f.Device = s.a })
	placements := metaPlacements
	if p.Provider == ads.ProviderGoogle {
		placements = googleOtherPlacements
		if p.search {
			placements = googleSearchPlacements
		}
	}
	emit(reports.CampaignPlacementDaily, placements, func(f *ads.MetricFact, s segment) {
		f.PublisherPlatform, f.Placement = s.a, s.b
	})

	// Ads (and their 1:1 creatives): 2 ad groups × 2 ads; video ads convert better.
	var adSegs []segment
	for g := range 2 {
		for a := range 2 {
			adSegs = append(adSegs, segment{a: adGroupID(p.Campaign, g), b: adID(p.Campaign, g, a),
				share: []float64{0.62, 0.38}[g] * []float64{0.55, 0.45}[a], ctr: []float64{1, 1.2}[a],
				cvr: [][]float64{{1, 1.25}, {0.08, 1.2}}[g][a], aovFactor: 1})
		}
	}
	perAd := splitDay(r, day, adSegs)
	// Creative fatigue (internal/recommendations): in "drop" campaigns the
	// first ad's CTR sags over the last 10 days while it is shown to the same
	// people more often; its lost clicks go to its sibling so ad totals still
	// add up to the campaign.
	fatigue := 0.0
	if p.kind == "drop" && daysAgo < 10 {
		fatigue = float64(10-daysAgo) / 10
		moved := int64(float64(perAd[0].clicks) * 0.45 * fatigue)
		perAd[0].clicks -= moved
		perAd[1].clicks += moved
	}
	for i, s := range perAd {
		if s.impressions == 0 && s.spend == 0 {
			continue
		}
		g, a := i/2, i%2
		f := fact(p, reports.AdDaily, date, nil, s)
		f.AdGroupExternalID, f.AdExternalID = adSegs[i].a, adSegs[i].b
		if p.Provider == ads.ProviderMeta {
			// Daily reach (Meta reports it; Google does not): ~1.3 impressions
			// per person per day, rising to ~3.9 for the fatiguing ad.
			freq := 1.25 + 0.1*float64(a)
			if i == 0 {
				freq += 2.6 * fatigue
			}
			reach := int64(float64(s.impressions) / freq)
			f.Reach = &reach
		}
		out = append(out, f)
		c := fact(p, reports.CreativeDaily, date, nil, s)
		c.CreativeExternalID = creativeID(p.Campaign, g, a)
		out = append(out, c)
	}

	if p.search {
		for g := range 2 {
			var segs []segment
			for k, kw := range keywords[g] {
				segs = append(segs, segment{a: kw, share: []float64{0.5, 0.3, 0.2}[k],
					ctr: []float64{1.3, 1, 0.8}[k], cvr: []float64{1.2, 1, 0.7}[k], aovFactor: 1})
			}
			var groupSums sums
			groupSums.add(perAd[g*2])
			groupSums.add(perAd[g*2+1])
			for i, s := range splitDay(r, groupSums, segs) {
				if s.impressions == 0 && s.spend == 0 {
					continue
				}
				f := fact(p, reports.KeywordDaily, date, nil, s)
				f.AdGroupExternalID, f.Keyword = adGroupID(p.Campaign, g), segs[i].a
				out = append(out, f)
			}
		}
	}
	return out
}
