// Package analytics serves the dashboard analytics endpoints (plan §8–10,
// §26): overview, campaign performance, hourly, dayparting and breakdowns.
//
// All reads go through metrics.Repository (facts only); entity metadata comes
// from Postgres and is joined in Go, so the fact store can be swapped for
// ClickHouse (plan §32).
//
// Currency: money is never summed across currencies. If the facts in scope
// span several currencies, responses set currency=null, mixed_currency=true
// and every money-based field to null; counts and count ratios (CTR, CVR)
// are still returned. Pass ?currency= or narrow by account to get money.
//
// Time: dates and hours are account-local (the timezone of each ad account).
// When accounts in different timezones are combined, hour H means "H o'clock
// in each account's own timezone", which is the clock dayparting schedules
// execute in. Responses list the timezones involved.
package analytics

import (
	"cmp"
	"context"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/reports"
	"github.com/iamv1n/adwise/internal/store"
)

type Service struct {
	db   *database.DB
	repo metrics.Repository
	now  func() time.Time
}

func NewService(db *database.DB, repo metrics.Repository) *Service {
	return &Service{db: db, repo: repo, now: time.Now}
}

// Scope holds the filters common to every analytics endpoint.
type Scope struct {
	OrganizationID uuid.UUID
	Range          params.DateRange
	Compare        string
	AccountID      *uuid.UUID
	Provider       ads.Provider
	Currency       string
	CampaignID     *uuid.UUID
}

type resolved struct {
	filter    metrics.Filter // Report, From and To are set per query
	accounts  []store.AdAccount
	fallback  string // the single currency of the scoped accounts, if any
	timezones []string
	empty     bool // filters cannot match anything
}

func (s *Service) resolve(ctx context.Context, sc Scope) (resolved, error) {
	var provider *store.AdProvider
	if sc.Provider != "" {
		p := store.AdProvider(sc.Provider)
		provider = &p
	}
	rows, err := s.db.ListAdAccounts(ctx, store.ListAdAccountsParams{OrganizationID: sc.OrganizationID, Provider: provider})
	if err != nil {
		return resolved{}, err
	}
	res := resolved{filter: metrics.Filter{
		OrganizationID: sc.OrganizationID, Provider: sc.Provider, Currency: sc.Currency,
	}}

	restrictTo := uuid.Nil
	if sc.CampaignID != nil {
		c, err := s.db.GetCampaign(ctx, store.GetCampaignParams{OrganizationID: sc.OrganizationID, ID: *sc.CampaignID})
		if database.IsNotFound(err) {
			return resolved{}, params.Invalid("campaign_id", "campaign not found")
		}
		if err != nil {
			return resolved{}, err
		}
		restrictTo = c.Campaign.AccountID
		res.filter.CampaignExternalIDs = []string{c.Campaign.ExternalID}
		if sc.AccountID != nil && *sc.AccountID != restrictTo {
			res.empty = true
		}
	}
	if sc.AccountID != nil {
		found := false
		for _, r := range rows {
			if r.AdAccount.ID == *sc.AccountID {
				found = true
			}
		}
		if !found {
			// Either unknown or excluded by the provider filter.
			if _, err := s.db.GetAdAccount(ctx, store.GetAdAccountParams{OrganizationID: sc.OrganizationID, ID: *sc.AccountID}); database.IsNotFound(err) {
				return resolved{}, params.Invalid("account_id", "account not found")
			}
			res.empty = true
		}
		if restrictTo == uuid.Nil {
			restrictTo = *sc.AccountID
		}
	}
	if restrictTo != uuid.Nil {
		res.filter.AccountIDs = []uuid.UUID{restrictTo}
	}

	currencies, tzs := map[string]bool{}, map[string]bool{}
	for _, r := range rows {
		a := r.AdAccount
		if restrictTo != uuid.Nil && a.ID != restrictTo {
			continue
		}
		if sc.Currency != "" && a.Currency != sc.Currency {
			continue
		}
		res.accounts = append(res.accounts, a)
		currencies[a.Currency] = true
		tzs[a.Timezone] = true
	}
	if len(currencies) == 1 {
		for c := range currencies {
			res.fallback = c
		}
	} else if len(currencies) == 0 && sc.Currency != "" {
		res.fallback = sc.Currency
	}
	res.timezones = sortedKeys(tzs)
	return res, nil
}

func (r resolved) with(report string, dr params.DateRange) metrics.Filter {
	f := r.filter
	f.Report, f.From, f.To = report, dr.From, dr.To
	return f
}

func (s *Service) aggregate(ctx context.Context, res resolved, report string, dr params.DateRange, groupBy ...metrics.Field) ([]metrics.Row, error) {
	if res.empty {
		return nil, nil
	}
	return s.repo.Aggregate(ctx, metrics.AggregateQuery{Filter: res.with(report, dr), GroupBy: groupBy})
}

// CurrencyInfo describes the currency of every money field in a response.
type CurrencyInfo struct {
	Currency      *string  `json:"currency"`
	Currencies    []string `json:"currencies"`
	MixedCurrency bool     `json:"mixed_currency"`
}

func currencyInfo(fallback string, totals ...metrics.Totals) CurrencyInfo {
	set := map[string]bool{}
	for _, t := range totals {
		for c := range t {
			set[c] = true
		}
	}
	ci := CurrencyInfo{Currencies: sortedKeys(set)}
	switch len(ci.Currencies) {
	case 0:
		if fallback != "" {
			ci.Currency = &fallback
			ci.Currencies = []string{fallback}
		}
	case 1:
		c := ci.Currencies[0]
		ci.Currency = &c
	default:
		ci.MixedCurrency = true
	}
	return ci
}

// values computes Values for t in the response currency (counts only when mixed).
func (ci CurrencyInfo) values(t metrics.Totals) metrics.Values {
	if ci.Currency == nil {
		return metrics.ComputeMixed(t.Sum())
	}
	return metrics.Compute(t[*ci.Currency], *ci.Currency)
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}

// --- overview ---

type RangeInfo struct {
	From string `json:"from"`
	To   string `json:"to"`
	Days int    `json:"days"`
}

func rangeInfo(r params.DateRange) RangeInfo {
	return RangeInfo{From: r.From.Format(time.DateOnly), To: r.To.Format(time.DateOnly), Days: r.Days()}
}

type ComparisonInfo struct {
	Type string `json:"type"`
	RangeInfo
}

type Point struct {
	Date string `json:"date"`
	metrics.Values
}

type Overview struct {
	Range      RangeInfo       `json:"range"`
	Comparison *ComparisonInfo `json:"comparison"`
	Summary
	Previous           *metrics.Values `json:"previous"`
	Deltas             Deltas          `json:"deltas"`
	Timeseries         []Point         `json:"timeseries"`
	PreviousTimeseries []Point         `json:"previous_timeseries"`
}

func (s *Service) Overview(ctx context.Context, sc Scope) (Overview, error) {
	res, err := s.resolve(ctx, sc)
	if err != nil {
		return Overview{}, err
	}
	cur, curByDate, err := s.dailyTotals(ctx, res, sc.Range)
	if err != nil {
		return Overview{}, err
	}
	out := Overview{Range: rangeInfo(sc.Range)}
	prevRange, hasPrev := ComparisonRange(sc.Range, sc.Compare)
	var prev *accum
	var prevByDate map[time.Time]metrics.Totals
	ci := currencyInfo(res.fallback, cur.all)
	if hasPrev {
		if prev, prevByDate, err = s.dailyTotals(ctx, res, prevRange); err != nil {
			return Overview{}, err
		}
		out.Comparison = &ComparisonInfo{Type: sc.Compare, RangeInfo: rangeInfo(prevRange)}
		ci = currencyInfo(res.fallback, cur.all, prev.all)
	}
	out.Summary = summarize(res, ci, cur, prev)
	out.Timeseries = s.series(out.CurrencyInfo, sc.Range, curByDate)
	if hasPrev {
		p := out.CurrencyInfo.values(prev.all)
		out.Previous = &p
		out.Deltas = ComputeDeltas(out.Totals, p)
		out.PreviousTimeseries = s.series(out.CurrencyInfo, prevRange, prevByDate)
	}
	return out, nil
}

func (s *Service) dailyTotals(ctx context.Context, res resolved, dr params.DateRange) (*accum, map[time.Time]metrics.Totals, error) {
	rows, err := s.aggregate(ctx, res, reports.CampaignDaily, dr, metrics.FieldDate, metrics.FieldCurrency, metrics.FieldProvider)
	if err != nil {
		return nil, nil, err
	}
	total := newAccum()
	byDate := map[time.Time]metrics.Totals{}
	for _, r := range rows {
		total.add(r.Provider, r.Currency, r.Measures)
		d := r.Date.UTC()
		if byDate[d] == nil {
			byDate[d] = metrics.Totals{}
		}
		byDate[d].Add(r.Currency, r.Measures)
	}
	return total, byDate, nil
}

// series returns one point per date in dr, zero-filled.
func (s *Service) series(ci CurrencyInfo, dr params.DateRange, byDate map[time.Time]metrics.Totals) []Point {
	dates := dr.Dates()
	out := make([]Point, len(dates))
	for i, d := range dates {
		t := byDate[d]
		if t == nil {
			t = metrics.Totals{}
		}
		out[i] = Point{Date: d.Format(time.DateOnly), Values: ci.values(t)}
	}
	return out
}

// --- campaign performance ---

// CampaignSorts are the accepted ?sort= values for Campaigns.
var CampaignSorts = []string{"name", "status", "daily_budget", "impressions", "clicks", "spend", "conversions",
	"conversion_value", "ctr", "cpc", "cpm", "cpa", "cvr", "roas", "acos"}

type CampaignQuery struct {
	Scope
	Status string
	Search string
	Sort   string
	Order  string // asc | desc
	Page   params.Page
}

type CampaignRow struct {
	ID          uuid.UUID       `json:"id"`
	AccountID   uuid.UUID       `json:"account_id"`
	AccountName string          `json:"account_name"`
	Provider    ads.Provider    `json:"provider"`
	ExternalID  string          `json:"external_id"`
	Name        string          `json:"name"`
	Status      string          `json:"status"`
	Objective   string          `json:"objective"`
	Currency    string          `json:"currency"`
	DailyBudget *float64        `json:"daily_budget"`
	Pacing      *metrics.Pacing `json:"pacing"`
	Metrics     metrics.Values  `json:"metrics"`
	Previous    *metrics.Values `json:"previous,omitempty"`
	Deltas      Deltas          `json:"deltas,omitempty"`

	timezone     string
	budgetMicros *int64
}

type CampaignTable struct {
	Range      RangeInfo       `json:"range"`
	Comparison *ComparisonInfo `json:"comparison"`
	Sort       string          `json:"sort"`
	Order      string          `json:"order"`
	Summary
	Campaigns []CampaignRow  `json:"campaigns"`
	Page      map[string]any `json:"page"`
}

// Campaigns returns campaigns that had activity in the range (or in the
// comparison range) plus all active campaigns, with metrics, sorted and
// paginated. Metrics of each row are in that campaign's account currency;
// null values always sort last.
func (s *Service) Campaigns(ctx context.Context, q CampaignQuery) (CampaignTable, error) {
	res, err := s.resolve(ctx, q.Scope)
	if err != nil {
		return CampaignTable{}, err
	}
	out := CampaignTable{Range: rangeInfo(q.Range), Sort: q.Sort, Order: q.Order, Campaigns: []CampaignRow{}}
	cur, err := s.byCampaign(ctx, res, q.Range)
	if err != nil {
		return CampaignTable{}, err
	}
	prevRange, hasPrev := ComparisonRange(q.Range, q.Compare)
	var prev map[campaignKey]metrics.Measures
	if hasPrev {
		out.Comparison = &ComparisonInfo{Type: q.Compare, RangeInfo: rangeInfo(prevRange)}
		if prev, err = s.byCampaign(ctx, res, prevRange); err != nil {
			return CampaignTable{}, err
		}
	}

	var list []store.ListCampaignsRow
	if !res.empty {
		var provider *store.AdProvider
		if q.Provider != "" {
			p := store.AdProvider(q.Provider)
			provider = &p
		}
		var status *store.AdEntityStatus
		if q.Status != "" {
			st := store.AdEntityStatus(q.Status)
			status = &st
		}
		var search, exact *string
		if q.Search != "" {
			p := params.LikePattern(q.Search)
			search, exact = &p, &q.Search
		}
		var accountID *uuid.UUID
		if len(res.filter.AccountIDs) == 1 {
			accountID = &res.filter.AccountIDs[0]
		}
		list, err = s.db.ListCampaigns(ctx, store.ListCampaignsParams{
			OrganizationID: q.OrganizationID, AccountID: accountID, Provider: provider, Status: status,
			CampaignID: q.CampaignID, Search: search, SearchExact: exact, RowLimit: 1 << 30,
		})
		if err != nil {
			return CampaignTable{}, err
		}
	}

	totals := newAccum()
	var rows []CampaignRow
	for _, r := range list {
		c := r.Campaign
		if q.Currency != "" && r.Currency != q.Currency {
			continue
		}
		k := campaignKey{c.AccountID, c.ExternalID}
		m, pm := cur[k], prev[k]
		if m.IsZero() && pm.IsZero() && c.Status != store.AdEntityStatusActive {
			continue
		}
		totals.add(ads.Provider(c.Provider), r.Currency, m)
		row := CampaignRow{timezone: r.Timezone, budgetMicros: c.DailyBudgetMicros,
			ID: c.ID, AccountID: c.AccountID, AccountName: r.AccountName, Provider: ads.Provider(c.Provider),
			ExternalID: c.ExternalID, Name: c.Name, Status: string(c.Status), Objective: c.Objective,
			Currency: r.Currency, Metrics: metrics.Compute(m, r.Currency),
		}
		if c.DailyBudgetMicros != nil {
			v := metrics.MicrosToUnits(*c.DailyBudgetMicros)
			row.DailyBudget = &v
		}
		if hasPrev {
			p := metrics.Compute(pm, r.Currency)
			row.Previous = &p
			row.Deltas = ComputeDeltas(row.Metrics, p)
		}
		rows = append(rows, row)
	}
	sortCampaigns(rows, q.Sort, q.Order == "asc")

	out.Summary = summarize(res, currencyInfo(res.fallback, totals.all), totals, nil)
	out.Page = params.PageJSON(q.Page, int64(len(rows)))
	if q.Page.Offset < len(rows) {
		out.Campaigns = rows[q.Page.Offset:min(q.Page.Offset+q.Page.Limit, len(rows))]
	}
	in := make([]metrics.PacingInput, len(out.Campaigns))
	for i, c := range out.Campaigns {
		in[i] = metrics.PacingInput{AccountID: c.AccountID, Timezone: c.timezone,
			CampaignExternalID: c.ExternalID, DailyBudgetMicros: c.budgetMicros, Active: c.Status == string(ads.StatusActive)}
	}
	pacing, err := metrics.BudgetPacing(ctx, s.repo, q.OrganizationID, in, s.now())
	if err != nil {
		return CampaignTable{}, err
	}
	for i := range out.Campaigns {
		out.Campaigns[i].Pacing = &pacing[i]
	}
	return out, nil
}

type campaignKey struct {
	account uuid.UUID
	ext     string
}

func (s *Service) byCampaign(ctx context.Context, res resolved, dr params.DateRange) (map[campaignKey]metrics.Measures, error) {
	rows, err := s.aggregate(ctx, res, reports.CampaignDaily, dr, metrics.FieldAccount, metrics.FieldCampaign)
	if err != nil {
		return nil, err
	}
	out := make(map[campaignKey]metrics.Measures, len(rows))
	for _, r := range rows {
		out[campaignKey{r.AccountID, r.CampaignID}] = r.Measures
	}
	return out, nil
}

func sortCampaigns(rows []CampaignRow, key string, asc bool) {
	num := func(r CampaignRow) *float64 {
		v := r.Metrics
		f := func(x float64) *float64 { return &x }
		switch key {
		case "daily_budget":
			return r.DailyBudget
		case "impressions":
			return f(float64(v.Impressions))
		case "clicks":
			return f(float64(v.Clicks))
		case "spend":
			return v.Spend
		case "conversions":
			return f(v.Conversions)
		case "conversion_value":
			return v.ConversionValue
		case "ctr":
			return v.CTR
		case "cpc":
			return v.CPC
		case "cpm":
			return v.CPM
		case "cpa":
			return v.CPA
		case "cvr":
			return v.CVR
		case "roas":
			return v.ROAS
		case "acos":
			return v.ACOS
		}
		return nil
	}
	slices.SortStableFunc(rows, func(a, b CampaignRow) int {
		var c int
		switch key {
		case "name":
			c = strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
		case "status":
			c = strings.Compare(a.Status, b.Status)
		default:
			x, y := num(a), num(b)
			switch {
			case x == nil && y == nil:
				c = 0
			case x == nil:
				return 1 // nulls last in both directions
			case y == nil:
				return -1
			default:
				c = cmp.Compare(*x, *y)
			}
		}
		if !asc {
			c = -c
		}
		if c == 0 {
			c = cmp.Or(strings.Compare(a.Name, b.Name), strings.Compare(a.ID.String(), b.ID.String()))
		}
		return c
	})
}

// --- hourly ---

type HourRow struct {
	Hour int `json:"hour"`
	metrics.Values
}

type Hourly struct {
	Range RangeInfo `json:"range"`
	Summary
	TimeBasis string    `json:"time_basis"` // always "account_local"
	Timezones []string  `json:"timezones"`
	Hours     []HourRow `json:"hours"`
}

// Hourly returns 24 rows (hour of day 0–23, account-local) summed over the range.
func (s *Service) Hourly(ctx context.Context, sc Scope) (Hourly, error) {
	res, err := s.resolve(ctx, sc)
	if err != nil {
		return Hourly{}, err
	}
	rows, err := s.aggregate(ctx, res, reports.CampaignHourly, sc.Range, metrics.FieldHour, metrics.FieldCurrency, metrics.FieldProvider)
	if err != nil {
		return Hourly{}, err
	}
	var byHour [24]metrics.Totals
	all := newAccum()
	for i := range byHour {
		byHour[i] = metrics.Totals{}
	}
	for _, r := range rows {
		byHour[r.Hour].Add(r.Currency, r.Measures)
		all.add(r.Provider, r.Currency, r.Measures)
	}
	out := Hourly{Range: rangeInfo(sc.Range), Summary: summarize(res, currencyInfo(res.fallback, all.all), all, nil),
		TimeBasis: "account_local", Timezones: res.timezones, Hours: make([]HourRow, 24)}
	for h := range 24 {
		out.Hours[h] = HourRow{Hour: h, Values: out.CurrencyInfo.values(byHour[h])}
	}
	return out, nil
}

// --- dayparting ---

// DaypartingMetrics are the accepted ?metric= values.
var DaypartingMetrics = []string{"roas", "spend", "revenue", "cpa", "conversions", "ctr", "cpc"}

type Cell struct {
	Hour            int      `json:"hour"`
	Value           *float64 `json:"value"`
	Impressions     int64    `json:"impressions"`
	Clicks          int64    `json:"clicks"`
	Spend           *float64 `json:"spend"`
	Conversions     float64  `json:"conversions"`
	ConversionValue *float64 `json:"conversion_value"`
}

type DayRow struct {
	Weekday  int    `json:"weekday"` // ISO: 1 = Monday … 7 = Sunday
	Name     string `json:"name"`
	DayCount int    `json:"day_count"` // occurrences of this weekday in the range
	Cells    []Cell `json:"cells"`     // 24 cells, hour 0–23
}

type Dayparting struct {
	Range  RangeInfo `json:"range"`
	Metric string    `json:"metric"`
	// Aggregation is "ratio" for roas/cpa/ctr/cpc (computed from the cell's
	// sums) and "average_per_day" for spend/revenue/conversions (cell sum ÷
	// occurrences of that weekday in the range, so partial weeks do not bias
	// the heatmap).
	Aggregation string `json:"aggregation"`
	Summary
	TimeBasis      string   `json:"time_basis"`
	Timezones      []string `json:"timezones"`
	MixedTimezones bool     `json:"mixed_timezones"`
	WeeksCovered   int      `json:"weeks_covered"` // complete weeks in the range
	Min            *float64 `json:"min"`
	Max            *float64 `json:"max"`
	Days           []DayRow `json:"days"`
}

var weekdayNames = [...]string{"", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}

// Dayparting returns a 7×24 (Monday..Sunday × hour 0–23) matrix of metric,
// with hours and weekdays in each account's local time.
func (s *Service) Dayparting(ctx context.Context, sc Scope, metric string) (Dayparting, error) {
	res, err := s.resolve(ctx, sc)
	if err != nil {
		return Dayparting{}, err
	}
	rows, err := s.aggregate(ctx, res, reports.CampaignHourly, sc.Range, metrics.FieldWeekday, metrics.FieldHour, metrics.FieldCurrency, metrics.FieldProvider)
	if err != nil {
		return Dayparting{}, err
	}
	var grid [8][24]metrics.Totals
	all := newAccum()
	for _, r := range rows {
		if grid[r.Weekday][r.Hour] == nil {
			grid[r.Weekday][r.Hour] = metrics.Totals{}
		}
		grid[r.Weekday][r.Hour].Add(r.Currency, r.Measures)
		all.add(r.Provider, r.Currency, r.Measures)
	}
	counts := WeekdayCounts(sc.Range)
	out := Dayparting{
		Range: rangeInfo(sc.Range), Metric: metric, Aggregation: "ratio",
		Summary: summarize(res, currencyInfo(res.fallback, all.all), all, nil), TimeBasis: "account_local",
		Timezones: res.timezones, MixedTimezones: len(res.timezones) > 1,
		WeeksCovered: sc.Range.Days() / 7, Days: make([]DayRow, 7),
	}
	if metric == "spend" || metric == "revenue" || metric == "conversions" {
		out.Aggregation = "average_per_day"
	}
	for wd := 1; wd <= 7; wd++ {
		row := DayRow{Weekday: wd, Name: weekdayNames[wd], DayCount: counts[wd], Cells: make([]Cell, 24)}
		for h := range 24 {
			t := grid[wd][h]
			if t == nil {
				t = metrics.Totals{}
			}
			v := out.CurrencyInfo.values(t)
			cell := Cell{Hour: h, Impressions: v.Impressions, Clicks: v.Clicks, Spend: v.Spend,
				Conversions: v.Conversions, ConversionValue: v.ConversionValue}
			cell.Value = pickMetric(metric, v, counts[wd])
			if cell.Value != nil {
				if out.Min == nil || *cell.Value < *out.Min {
					out.Min = ptr(*cell.Value)
				}
				if out.Max == nil || *cell.Value > *out.Max {
					out.Max = ptr(*cell.Value)
				}
			}
			row.Cells[h] = cell
		}
		out.Days[wd-1] = row
	}
	return out, nil
}

// WeekdayCounts returns how many times each ISO weekday (index 1–7) occurs in r.
func WeekdayCounts(r params.DateRange) [8]int {
	var c [8]int
	for _, d := range r.Dates() {
		wd := int(d.Weekday())
		if wd == 0 {
			wd = 7
		}
		c[wd]++
	}
	return c
}

func pickMetric(metric string, v metrics.Values, occurrences int) *float64 {
	perDay := func(x *float64) *float64 {
		if x == nil || occurrences == 0 {
			return nil
		}
		return ptr(roundTo(*x/float64(occurrences), 6))
	}
	switch metric {
	case "roas":
		return v.ROAS
	case "cpa":
		return v.CPA
	case "ctr":
		return v.CTR
	case "cpc":
		return v.CPC
	case "spend":
		return perDay(v.Spend)
	case "revenue":
		return perDay(v.ConversionValue)
	case "conversions":
		return perDay(&v.Conversions)
	}
	return nil
}

// --- breakdowns ---

// BreakdownDimensions are the accepted ?dimension= values.
var BreakdownDimensions = []string{"country", "device", "placement", "publisher_platform"}

type BreakdownRow struct {
	Value             string   `json:"value"` // "unknown" when the provider reported none
	PublisherPlatform string   `json:"publisher_platform,omitempty"`
	Label             string   `json:"label"`
	SpendShare        *float64 `json:"spend_share"` // fraction of total spend; null when mixed currency or no spend
	metrics.Values
}

type Breakdown struct {
	Range     RangeInfo `json:"range"`
	Dimension string    `json:"dimension"`
	Report    string    `json:"report"`
	Summary
	Rows []BreakdownRow `json:"rows"`
}

// Breakdowns aggregates by country, device, placement (split by publisher
// platform, since e.g. "feed" exists on both Facebook and Instagram) or
// publisher platform. Rows are sorted by spend, or by impressions when
// currencies are mixed.
func (s *Service) Breakdowns(ctx context.Context, sc Scope, dimension string) (Breakdown, error) {
	res, err := s.resolve(ctx, sc)
	if err != nil {
		return Breakdown{}, err
	}
	var report string
	var fields []metrics.Field
	switch dimension {
	case "country":
		report, fields = reports.CampaignCountryDaily, []metrics.Field{metrics.FieldCountry}
	case "device":
		report, fields = reports.CampaignDeviceDaily, []metrics.Field{metrics.FieldDevice}
	case "placement":
		report, fields = reports.CampaignPlacementDaily, []metrics.Field{metrics.FieldPublisherPlatform, metrics.FieldPlacement}
	case "publisher_platform":
		report, fields = reports.CampaignPlacementDaily, []metrics.Field{metrics.FieldPublisherPlatform}
	default:
		return Breakdown{}, params.Invalid("dimension", "must be one of "+strings.Join(BreakdownDimensions, ", "))
	}
	rows, err := s.aggregate(ctx, res, report, sc.Range, append(fields, metrics.FieldCurrency, metrics.FieldProvider)...)
	if err != nil {
		return Breakdown{}, err
	}
	type key struct{ platform, value string }
	groups := map[key]metrics.Totals{}
	var order []key
	all := newAccum()
	for _, r := range rows {
		var k key
		switch dimension {
		case "country":
			k.value = r.Country
		case "device":
			k.value = r.Device
		case "placement":
			k.platform, k.value = r.PublisherPlatform, r.Placement
		case "publisher_platform":
			k.value = r.PublisherPlatform
		}
		if groups[k] == nil {
			groups[k] = metrics.Totals{}
			order = append(order, k)
		}
		groups[k].Add(r.Currency, r.Measures)
		all.add(r.Provider, r.Currency, r.Measures)
	}
	out := Breakdown{Range: rangeInfo(sc.Range), Dimension: dimension, Report: report,
		Summary: summarize(res, currencyInfo(res.fallback, all.all), all, nil), Rows: []BreakdownRow{}}
	for _, k := range order {
		v := out.CurrencyInfo.values(groups[k])
		row := BreakdownRow{Value: orUnknown(k.value), Label: orUnknown(k.value), Values: v}
		if dimension == "placement" {
			row.PublisherPlatform = orUnknown(k.platform)
			row.Label = row.PublisherPlatform + " · " + row.Value
		}
		if v.Spend != nil && out.Totals.Spend != nil && *out.Totals.Spend > 0 {
			row.SpendShare = ptr(roundTo(*v.Spend / *out.Totals.Spend, 6))
		}
		out.Rows = append(out.Rows, row)
	}
	slices.SortStableFunc(out.Rows, func(a, b BreakdownRow) int {
		if out.MixedCurrency {
			return cmp.Or(cmp.Compare(b.Impressions, a.Impressions), strings.Compare(a.Label, b.Label))
		}
		return cmp.Or(cmp.Compare(deref(b.Spend), deref(a.Spend)), cmp.Compare(b.Impressions, a.Impressions), strings.Compare(a.Label, b.Label))
	})
	return out, nil
}

func orUnknown(s string) string {
	if s == "" {
		return "unknown"
	}
	return s
}

func deref(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}

func ptr[T any](v T) *T { return &v }

func roundTo(f float64, places int) float64 {
	p := math.Pow10(places)
	return math.Round(f*p) / p
}
