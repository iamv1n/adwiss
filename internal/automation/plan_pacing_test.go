package automation

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func sum(v []float64) float64 {
	s := 0.0
	for _, x := range v {
		s += x
	}
	return s
}

func TestCurveWeights(t *testing.T) {
	tests := []struct {
		name   string
		curve  string
		n      int
		custom []float64
		want   []float64
	}{
		{"even", CurveEven, 4, nil, []float64{0.25, 0.25, 0.25, 0.25}},
		{"single day", CurveFrontLoaded, 1, nil, []float64{1}},
		{"front loaded", CurveFrontLoaded, 3, nil, []float64{1.5 / 3, 1.0 / 3, 0.5 / 3}},
		{"back loaded", CurveBackLoaded, 3, nil, []float64{0.5 / 3, 1.0 / 3, 1.5 / 3}},
		{"custom", CurveCustom, 3, []float64{1, 2, 1}, []float64{0.25, 0.5, 0.25}},
		{"custom wrong length falls back to even", CurveCustom, 2, []float64{1}, []float64{0.5, 0.5}},
		{"unknown curve is even", "zigzag", 2, nil, []float64{0.5, 0.5}},
		{"zero days", CurveEven, 0, nil, nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := CurveWeights(tc.curve, tc.n, tc.custom)
			require.Len(t, got, len(tc.want))
			for i := range got {
				require.InDelta(t, tc.want[i], got[i], 1e-9)
			}
			if tc.n > 0 {
				require.InDelta(t, 1, sum(got), 1e-9)
			}
		})
	}
}

func TestPlanDates(t *testing.T) {
	d := func(s string) time.Time { v, _ := time.Parse(time.DateOnly, s); return v }
	got := PlanDates(d("2026-02-27"), d("2026-03-02"))
	require.Len(t, got, 4)
	require.Equal(t, "2026-03-01", got[2].Format(time.DateOnly))
	require.Len(t, PlanDates(d("2026-03-02"), d("2026-03-01")), 0)
}

func TestRepace(t *testing.T) {
	even := CurveWeights(CurveEven, 4, nil)
	tests := []struct {
		name    string
		total   float64
		spent   float64
		weights []float64
		from    int
		want    []float64
	}{
		{"start of plan", 400, 0, even, 0, []float64{100, 100, 100, 100}},
		{"on track", 400, 200, even, 2, []float64{0, 0, 100, 100}},
		{"underdelivered catches up", 400, 100, even, 2, []float64{0, 0, 150, 150}},
		{"overdelivered slows down", 400, 300, even, 2, []float64{0, 0, 50, 50}},
		{"overspent never negative", 400, 500, even, 2, []float64{0, 0, 0, 0}},
		{"curve respected", 300, 0, []float64{0.5, 0.25, 0.25}, 1, []float64{0, 150, 150}},
		{"back loaded remaining", 600, 0, CurveWeights(CurveBackLoaded, 3, nil), 0, []float64{100, 200, 300}},
		{"past end", 400, 0, even, 4, []float64{0, 0, 0, 0}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Repace(tc.total, tc.spent, tc.weights, tc.from)
			require.Len(t, got, len(tc.want))
			for i := range got {
				require.InDelta(t, tc.want[i], got[i], 1e-9, "day %d", i)
			}
		})
	}
}

func TestSplitBudget(t *testing.T) {
	tests := []struct {
		name   string
		amount float64
		shares []float64
		mins   []float64
		want   []float64
	}{
		{"by share", 1000, []float64{50, 30, 20}, nil, []float64{500, 300, 200}},
		{"minimum raised, taken proportionally", 1000, []float64{50, 30, 20}, []float64{0, 0, 300},
			[]float64{437.5, 262.5, 300}},
		{"cascading minimums", 100, []float64{80, 10, 10}, []float64{0, 20, 15}, []float64{65, 20, 15}},
		{"minimums exceed amount are scaled down", 100, []float64{50, 50}, []float64{100, 100}, []float64{50, 50}},
		{"zero share gets its minimum", 100, []float64{100, 0}, []float64{0, 10}, []float64{90, 10}},
		{"rounding remainder to largest", 100, []float64{33.33, 33.33, 33.34}, nil, []float64{33.33, 33.33, 33.34}},
		{"zero amount", 0, []float64{50, 50}, []float64{10, 10}, []float64{0, 0}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := SplitBudget(tc.amount, tc.shares, tc.mins)
			require.Len(t, got, len(tc.want))
			for i := range got {
				require.InDelta(t, tc.want[i], got[i], 0.005, "campaign %d", i)
			}
			if tc.amount > 0 {
				require.InDelta(t, tc.amount, sum(got), 0.001)
			}
		})
	}
}

func TestReallocate(t *testing.T) {
	r := func(v float64) *float64 { return &v }
	tests := []struct {
		name    string
		amounts []float64
		mins    []float64
		y       []Yesterday
		roas    []*float64
		want    []float64
		taken   int
		given   int
	}{
		{
			name:    "no capped campaign: nothing moves",
			amounts: []float64{100, 100},
			y:       []Yesterday{{true, 100, 50}, {true, 100, 90}},
			want:    []float64{100, 100},
		},
		{
			name:    "no underspent campaign: nothing moves",
			amounts: []float64{100, 100},
			y:       []Yesterday{{true, 100, 96}, {true, 100, 80}},
			want:    []float64{100, 100},
		},
		{
			name:    "unspent moves to capped",
			amounts: []float64{100, 100},
			y:       []Yesterday{{true, 100, 100}, {true, 100, 60}},
			want:    []float64{140, 60},
			taken:   1, given: 1,
		},
		{
			name:    "never below minimum",
			amounts: []float64{100, 100},
			mins:    []float64{0, 80},
			y:       []Yesterday{{true, 100, 99}, {true, 100, 10}},
			want:    []float64{120, 80},
			taken:   1, given: 1,
		},
		{
			name:    "weighted by roas",
			amounts: []float64{100, 100, 100},
			y:       []Yesterday{{true, 100, 100}, {true, 100, 95}, {true, 100, 40}},
			roas:    []*float64{r(3), r(1), nil},
			want:    []float64{145, 115, 40},
			taken:   1, given: 2,
		},
		{
			name:    "equal weights without roas",
			amounts: []float64{100, 100, 100},
			y:       []Yesterday{{true, 100, 100}, {true, 100, 95}, {true, 100, 40}},
			want:    []float64{130, 130, 40},
			taken:   1, given: 2,
		},
		{
			name:    "unknown yesterday is ignored",
			amounts: []float64{100, 100},
			y:       []Yesterday{{true, 100, 100}, {false, 0, 0}},
			want:    []float64{100, 100},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Reallocate(tc.amounts, tc.mins, tc.y, tc.roas)
			for i := range tc.want {
				require.InDelta(t, tc.want[i], got.Amounts[i], 0.005, "campaign %d", i)
			}
			require.InDelta(t, sum(tc.amounts), sum(got.Amounts), 0.001, "total unchanged")
			require.Len(t, got.Taken, tc.taken)
			require.Len(t, got.Given, tc.given)
			require.Equal(t, 100.0, tc.amounts[0], "input not mutated")
		})
	}
}

func TestNeedsBudgetChange(t *testing.T) {
	require.False(t, NeedsBudgetChange(100, 100.5))
	require.True(t, NeedsBudgetChange(100, 101))
	require.True(t, NeedsBudgetChange(100, 90))
	require.True(t, NeedsBudgetChange(0, 10))
}

func TestNormaliseShares(t *testing.T) {
	got := NormaliseShares([]float64{1, 1, 1})
	require.InDelta(t, 100, sum(got), 1e-9)
	require.Equal(t, []float64{33.34, 33.33, 33.33}, got)
	require.Equal(t, []float64{50, 50}, NormaliseShares([]float64{0, 0}))
	require.Equal(t, []float64{75, 25}, NormaliseShares([]float64{300, 100}))
}
