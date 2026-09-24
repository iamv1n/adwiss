package metrics

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestComputeDerivedMetrics(t *testing.T) {
	v := Compute(Measures{Impressions: 10_000, Clicks: 200, SpendMicros: 4_000_000_000, Conversions: 10,
		ConversionValueMicros: 12_000_000_000}, "INR")
	require.NotNil(t, v.Currency)
	assert.Equal(t, "INR", *v.Currency)
	assert.Equal(t, 4000.0, *v.Spend)
	assert.Equal(t, 12000.0, *v.ConversionValue)
	assert.Equal(t, 0.02, *v.CTR)
	assert.Equal(t, 20.0, *v.CPC)
	assert.Equal(t, 400.0, *v.CPM)
	assert.Equal(t, 400.0, *v.CPA)
	assert.Equal(t, 0.05, *v.CVR)
	assert.Equal(t, 3.0, *v.ROAS)
	assert.InDelta(t, 0.333333, *v.ACOS, 1e-9)
}

func TestComputeZeroDenominatorsAreNull(t *testing.T) {
	v := Compute(Measures{}, "INR")
	assert.Equal(t, 0.0, *v.Spend)
	for name, p := range map[string]*float64{"ctr": v.CTR, "cpc": v.CPC, "cpm": v.CPM, "cpa": v.CPA, "cvr": v.CVR, "roas": v.ROAS, "acos": v.ACOS} {
		assert.Nil(t, p, name)
	}

	// Spend without clicks or conversions: cost ratios are null, ROAS is 0.
	v = Compute(Measures{Impressions: 1000, SpendMicros: 5_000_000}, "INR")
	assert.Nil(t, v.CPC)
	assert.Nil(t, v.CPA)
	assert.Nil(t, v.CVR)
	assert.Equal(t, 0.0, *v.CTR)
	assert.Equal(t, 0.0, *v.ROAS)
	assert.Nil(t, v.ACOS, "acos denominator (conversion value) is 0")
	assert.Equal(t, 5.0, *v.CPM)
}

func TestDerivedMetricsUseSummedMeasures(t *testing.T) {
	// Two rows with very different CTRs: the combined CTR is clicks/impressions
	// of the sums (0.0101), not the mean of the per-row CTRs (0.055).
	tot := Totals{}
	tot.Add("INR", Measures{Impressions: 100, Clicks: 10})
	tot.Add("INR", Measures{Impressions: 10_000, Clicks: 92})
	v := tot.Values("")
	assert.InDelta(t, 102.0/10100.0, *v.CTR, 1e-6)
}

func TestMixedCurrencyNeverSumsMoney(t *testing.T) {
	tot := Totals{}
	tot.Add("INR", Measures{Impressions: 100, Clicks: 10, SpendMicros: 1_000_000_000, Conversions: 2, ConversionValueMicros: 3_000_000_000})
	tot.Add("USD", Measures{Impressions: 50, Clicks: 5, SpendMicros: 10_000_000, Conversions: 1, ConversionValueMicros: 40_000_000})
	assert.ElementsMatch(t, []string{"INR", "USD"}, tot.Currencies())

	v := tot.Values("")
	assert.Nil(t, v.Currency)
	assert.Nil(t, v.Spend)
	assert.Nil(t, v.ConversionValue)
	for _, p := range []*float64{v.CPC, v.CPM, v.CPA, v.ROAS, v.ACOS} {
		assert.Nil(t, p)
	}
	// Counts and count ratios are still meaningful.
	assert.Equal(t, int64(150), v.Impressions)
	assert.Equal(t, int64(15), v.Clicks)
	assert.Equal(t, 3.0, v.Conversions)
	assert.Equal(t, 0.1, *v.CTR)
	assert.Equal(t, 0.2, *v.CVR)
}

func TestTotalsValuesFallbackCurrency(t *testing.T) {
	v := Totals{}.Values("EUR")
	require.NotNil(t, v.Currency)
	assert.Equal(t, "EUR", *v.Currency)
	assert.Equal(t, 0.0, *v.Spend)
	assert.Nil(t, Totals{}.Values("").Currency)
}

func TestBuildAggregateSQLValidation(t *testing.T) {
	_, _, err := BuildAggregateSQL(AggregateQuery{Filter: Filter{Report: "campaign_daily"}})
	assert.Error(t, err, "date range required")

	d := MustDate("2026-01-01")
	_, _, err = BuildAggregateSQL(AggregateQuery{Filter: Filter{Report: "campaign_daily", From: d, To: d},
		GroupBy: []Field{"id; DROP TABLE users"}})
	assert.Error(t, err, "only whitelisted group-by fields")

	sql, args, err := BuildAggregateSQL(AggregateQuery{Filter: Filter{Report: "campaign_daily", From: d, To: d,
		Provider: "meta", CampaignExternalIDs: []string{"1"}}, GroupBy: []Field{FieldDate, FieldCurrency}})
	require.NoError(t, err)
	assert.Contains(t, sql, "GROUP BY 1, 2")
	assert.Len(t, args, 6)
}

func MustDate(s string) time.Time {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return t
}
