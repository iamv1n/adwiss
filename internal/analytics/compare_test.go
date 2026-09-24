package analytics

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/metrics"
)

func day(s string) time.Time {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return t
}

func rng(from, to string) params.DateRange { return params.DateRange{From: day(from), To: day(to)} }

func TestComparisonRange(t *testing.T) {
	cases := []struct {
		name, mode, from, to, wantFrom, wantTo string
	}{
		{"30 days", ComparePreviousPeriod, "2026-06-01", "2026-06-30", "2026-05-02", "2026-05-31"},
		{"single day", ComparePreviousPeriod, "2026-03-01", "2026-03-01", "2026-02-28", "2026-02-28"},
		{"across year", ComparePreviousPeriod, "2026-01-01", "2026-01-07", "2025-12-25", "2025-12-31"},
		{"leap february", ComparePreviousPeriod, "2024-03-01", "2024-03-31", "2024-01-30", "2024-02-29"},
		{"previous year", ComparePreviousYear, "2026-06-01", "2026-06-30", "2025-06-01", "2025-06-30"},
		{"previous year leap day", ComparePreviousYear, "2024-02-01", "2024-02-29", "2023-02-01", "2023-02-28"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := rng(c.from, c.to)
			got, ok := ComparisonRange(r, c.mode)
			assert.True(t, ok)
			assert.Equal(t, c.wantFrom, got.From.Format(time.DateOnly))
			assert.Equal(t, c.wantTo, got.To.Format(time.DateOnly))
			if c.mode == ComparePreviousPeriod {
				assert.Equal(t, r.Days(), got.Days(), "same length")
				assert.Equal(t, r.From.AddDate(0, 0, -1), got.To, "adjacent, no overlap or gap")
			}
		})
	}
	_, ok := ComparisonRange(rng("2026-06-01", "2026-06-30"), CompareNone)
	assert.False(t, ok)
}

func TestDeltas(t *testing.T) {
	cur := metrics.Compute(metrics.Measures{Impressions: 150, Clicks: 3, SpendMicros: 2_000_000}, "INR")
	prev := metrics.Compute(metrics.Measures{Impressions: 100, Clicks: 0, SpendMicros: 0}, "INR")
	d := ComputeDeltas(cur, prev)
	assert.Equal(t, 0.5, *d["impressions"])
	assert.Nil(t, d["clicks"], "previous is 0")
	assert.Nil(t, d["spend"], "previous is 0")
	assert.Nil(t, d["cpc"], "previous cpc is null")

	mixed := metrics.ComputeMixed(metrics.Measures{Impressions: 200})
	assert.Nil(t, ComputeDeltas(mixed, prev)["spend"], "money is null when currencies are mixed")
}

func TestWeekdayCounts(t *testing.T) {
	// 2026-09-07 is a Monday; 10 days → Mon..Wed twice, Thu..Sun once.
	c := WeekdayCounts(rng("2026-09-07", "2026-09-16"))
	assert.Equal(t, [8]int{0, 2, 2, 2, 1, 1, 1, 1}, c)
}

func TestPickMetric(t *testing.T) {
	v := metrics.Compute(metrics.Measures{Impressions: 1000, Clicks: 10, SpendMicros: 100_000_000, Conversions: 4, ConversionValueMicros: 300_000_000}, "INR")
	assert.Equal(t, 3.0, *pickMetric("roas", v, 2))
	assert.Equal(t, 50.0, *pickMetric("spend", v, 2), "additive metrics are averaged per weekday occurrence")
	assert.Equal(t, 150.0, *pickMetric("revenue", v, 2))
	assert.Equal(t, 2.0, *pickMetric("conversions", v, 2))
	assert.Nil(t, pickMetric("spend", v, 0), "weekday not in range")
	assert.Nil(t, pickMetric("cpa", metrics.Compute(metrics.Measures{SpendMicros: 1}, "INR"), 1))
}
