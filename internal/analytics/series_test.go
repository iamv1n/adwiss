package analytics_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/analytics"
	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/reports"
)

func TestSeriesZeroFilled(t *testing.T) {
	e := setup(t)
	e.facts(t,
		meta(reports.CampaignDaily, "2026-03-02", nil, 100, 300),
		meta(reports.CampaignDaily, "2026-03-04", nil, 40, 0),
		google(reports.CampaignDaily, "2026-03-03", nil, 10, 5),
	)
	var inCamp, usCamp uuid.UUID
	require.NoError(t, e.db.Pool.QueryRow(context.Background(), `SELECT id FROM campaigns WHERE external_id = 'c_in'`).Scan(&inCamp))
	require.NoError(t, e.db.Pool.QueryRow(context.Background(), `SELECT id FROM campaigns WHERE external_id = 'c_us'`).Scan(&usCamp))

	out, err := e.svc.Series(context.Background(), e.org, "campaign", []uuid.UUID{inCamp, usCamp, uuid.New()},
		params.DateRange{From: day("2026-03-01"), To: day("2026-03-04")})
	require.NoError(t, err)
	require.Equal(t, map[uuid.UUID]string{inCamp: "INR", usCamp: "USD"}, out.CurrencyByID)
	require.Len(t, out.Series, 2, "unknown ids are omitted")
	in := out.Series[inCamp]
	require.Len(t, in, 4)
	require.Equal(t, analytics.SeriesPoint{Date: "2026-03-01"}, in[0])
	require.Equal(t, analytics.SeriesPoint{Date: "2026-03-02", Spend: 100, Impressions: 1000, Clicks: 20, Conversions: 2, ConversionValue: 300}, in[1])
	require.Equal(t, analytics.SeriesPoint{Date: "2026-03-03"}, in[2])
	require.Equal(t, 40.0, in[3].Spend)
	require.Equal(t, 10.0, out.Series[usCamp][2].Spend)

	_, err = e.svc.Series(context.Background(), e.org, "keyword", []uuid.UUID{inCamp}, params.DateRange{From: day("2026-03-01"), To: day("2026-03-01")})
	require.Error(t, err)
}
