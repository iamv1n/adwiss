package analytics

import (
	"math"
	"time"

	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/metrics"
)

// Comparison modes for ?compare=.
const (
	CompareNone           = "none"
	ComparePreviousPeriod = "previous_period"
	ComparePreviousYear   = "previous_year"
)

// ComparisonRange returns the range to compare r against.
//
//   - previous_period: the same number of days immediately before r
//     (r = Jun 1–30 → May 2–31).
//   - previous_year: the same calendar dates one year earlier; Feb 29 maps to
//     Feb 28 (r = 2024-02-01..2024-02-29 → 2023-02-01..2023-02-28).
func ComparisonRange(r params.DateRange, mode string) (params.DateRange, bool) {
	switch mode {
	case ComparePreviousPeriod:
		to := r.From.AddDate(0, 0, -1)
		return params.DateRange{From: to.AddDate(0, 0, -(r.Days() - 1)), To: to}, true
	case ComparePreviousYear:
		return params.DateRange{From: minusYear(r.From), To: minusYear(r.To)}, true
	default:
		return params.DateRange{}, false
	}
}

func minusYear(d time.Time) time.Time {
	y, m, day := d.Date()
	// Clamp to the last day of the month (only Feb 29 is affected).
	last := time.Date(y-1, m+1, 0, 0, 0, 0, 0, time.UTC).Day()
	return time.Date(y-1, m, min(day, last), 0, 0, 0, 0, time.UTC)
}

// Deltas are relative changes (current − previous) / previous for each
// metric; null when either side is null or previous is 0. 0.25 means +25%.
type Deltas map[string]*float64

func ComputeDeltas(cur, prev metrics.Values) Deltas {
	d := Deltas{}
	f := func(v float64) *float64 { return &v }
	i := func(v int64) *float64 { return f(float64(v)) }
	pairs := map[string][2]*float64{
		"impressions":      {i(cur.Impressions), i(prev.Impressions)},
		"clicks":           {i(cur.Clicks), i(prev.Clicks)},
		"spend":            {cur.Spend, prev.Spend},
		"conversions":      {f(cur.Conversions), f(prev.Conversions)},
		"conversion_value": {cur.ConversionValue, prev.ConversionValue},
		"ctr":              {cur.CTR, prev.CTR},
		"cpc":              {cur.CPC, prev.CPC},
		"cpm":              {cur.CPM, prev.CPM},
		"cpa":              {cur.CPA, prev.CPA},
		"cvr":              {cur.CVR, prev.CVR},
		"roas":             {cur.ROAS, prev.ROAS},
		"acos":             {cur.ACOS, prev.ACOS},
	}
	for k, p := range pairs {
		d[k] = relChange(p[0], p[1])
	}
	return d
}

func relChange(cur, prev *float64) *float64 {
	if cur == nil || prev == nil || *prev == 0 {
		return nil
	}
	v := math.Round((*cur-*prev) / *prev * 1e6) / 1e6
	return &v
}
