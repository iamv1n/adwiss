package providers

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
)

func TestDecimalToMicros(t *testing.T) {
	tests := []struct {
		in   string
		want ads.Micros
		err  bool
	}{
		{"", 0, false},
		{"0", 0, false},
		{"12.34", 12_340_000, false},
		{"12.3456789", 12_345_679, false},
		{"12.3456784", 12_345_678, false},
		{"0.000001", 1, false},
		{".5", 500_000, false},
		{"-1.5", -1_500_000, false},
		{"1500", 1_500_000_000, false},
		{"1e2", 100_000_000, false},
		{"abc", 0, true},
		{"1.2.3", 0, true},
		{"99999999999999999999", 0, true},
	}
	for _, tt := range tests {
		got, err := DecimalToMicros(tt.in)
		if tt.err {
			require.Error(t, err, tt.in)
			continue
		}
		require.NoError(t, err, tt.in)
		require.Equal(t, tt.want, got, tt.in)
	}
}

func TestMinorUnitConversion(t *testing.T) {
	require.Equal(t, ads.Micros(50_000_000), MinorToMicros(5000, 100))  // USD 50.00
	require.Equal(t, ads.Micros(5_000_000_000), MinorToMicros(5000, 1)) // JPY 5000
	require.Equal(t, int64(5000), MicrosToMinor(50_000_000, 100))
	require.Equal(t, int64(5000), MicrosToMinor(5_000_000_000, 1))
	require.Equal(t, int64(1235), MicrosToMinor(12_345_000, 100)) // rounds half up
	require.Equal(t, int64(1234), MicrosToMinor(12_344_999, 100))
	require.Equal(t, int64(13), MicrosToMinor(12_500_000, 1))
	require.Equal(t, ads.Micros(1_234_568), FloatToMicros(1.2345678))
}

func TestFlexTypes(t *testing.T) {
	var v struct {
		A FlexInt    `json:"a"`
		B FlexInt    `json:"b"`
		C FlexString `json:"c"`
		D FlexString `json:"d"`
		E FlexFloat  `json:"e"`
	}
	require.NoError(t, json.Unmarshal([]byte(`{"a":"123","b":45,"c":123456789012345,"d":"act_1","e":"2.5"}`), &v))
	require.Equal(t, FlexInt(123), v.A)
	require.Equal(t, FlexInt(45), v.B)
	require.Equal(t, FlexString("123456789012345"), v.C)
	require.Equal(t, FlexString("act_1"), v.D)
	require.Equal(t, FlexFloat(2.5), v.E)
}

func TestSplitDateRange(t *testing.T) {
	chunks, err := SplitDateRange(ads.DateRange{Start: "2026-01-01", End: "2026-01-10"}, 4)
	require.NoError(t, err)
	require.Equal(t, []ads.DateRange{
		{Start: "2026-01-01", End: "2026-01-04"},
		{Start: "2026-01-05", End: "2026-01-08"},
		{Start: "2026-01-09", End: "2026-01-10"},
	}, chunks)
	_, err = SplitDateRange(ads.DateRange{Start: "2026-01-10", End: "2026-01-01"}, 4)
	require.ErrorIs(t, err, ErrInvalidRequest)
}

func TestMergeFacts(t *testing.T) {
	reach := int64(10)
	facts := MergeFacts([]ads.MetricFact{
		{AccountExternalID: "1", Date: "2026-01-01", CampaignExternalID: "c", Country: "US", Impressions: 1, Clicks: 1, Spend: 10, Reach: &reach},
		{AccountExternalID: "1", Date: "2026-01-01", CampaignExternalID: "c", Country: "GB", Impressions: 5},
		{AccountExternalID: "1", Date: "2026-01-01", CampaignExternalID: "c", Country: "US", Impressions: 2, Clicks: 3, Spend: 5, Conversions: 0.5},
	})
	require.Len(t, facts, 2)
	require.Equal(t, int64(3), facts[0].Impressions)
	require.Equal(t, int64(4), facts[0].Clicks)
	require.Equal(t, ads.Micros(15), facts[0].Spend)
	require.Nil(t, facts[0].Reach)
	require.Equal(t, "GB", facts[1].Country)
}

func TestErrorWrapping(t *testing.T) {
	err := error(&Error{Provider: ads.ProviderMeta, Kind: ErrRateLimited, Code: "80004", RetryAfter: time.Minute})
	require.ErrorIs(t, err, ErrRateLimited)
	require.True(t, IsRetryable(err))
	d, ok := RetryAfter(err)
	require.True(t, ok)
	require.Equal(t, time.Minute, d)
	require.False(t, errors.Is(err, ErrUnauthorized))
	require.Contains(t, err.Error(), "80004")
}

func TestCatalog(t *testing.T) {
	def, ok := CatalogReport("campaign_country_daily")
	require.True(t, ok)
	require.Equal(t, []ads.Dimension{ads.DimCountry}, Breakdowns(def))
	_, ok = CatalogReport("nope")
	require.False(t, ok)
}
