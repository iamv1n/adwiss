package automation

import (
	"math"
	"time"
)

// Pure budget-plan pacing math (plan/budget-planner.md "Pacing math"). No
// I/O: evaluation, preview and the detail view share these functions.

// Budget plan curves.
const (
	CurveEven        = "even"
	CurveFrontLoaded = "front_loaded"
	CurveBackLoaded  = "back_loaded"
	CurveCustom      = "custom"
)

// Reallocation thresholds on yesterday's spend ÷ budget set.
const (
	CappedFraction      = 0.95
	UnderspentFraction  = 0.70
	minBudgetChangeFrac = 0.01 // changes smaller than 1% are not made
)

// CurveWeights returns the normalised weight (summing to 1) of each of n
// days. For day i, t = i/(n-1): even = 1, front_loaded = 1.5 − t,
// back_loaded = 0.5 + t, custom = custom[i]. Invalid input (n ≤ 0, custom of
// the wrong length or with a non-positive total) falls back to even.
func CurveWeights(curve string, n int, custom []float64) []float64 {
	if n <= 0 {
		return nil
	}
	w := make([]float64, n)
	for i := range w {
		t := 0.0
		if n > 1 {
			t = float64(i) / float64(n-1)
		}
		switch curve {
		case CurveFrontLoaded:
			w[i] = 1.5 - t
		case CurveBackLoaded:
			w[i] = 0.5 + t
		case CurveCustom:
			if len(custom) == n && custom[i] > 0 {
				w[i] = custom[i]
			}
		default:
			w[i] = 1
		}
	}
	sum := 0.0
	for _, v := range w {
		sum += v
	}
	if sum <= 0 || (curve == CurveCustom && len(custom) != n) {
		return CurveWeights(CurveEven, n, nil)
	}
	for i := range w {
		w[i] /= sum
	}
	return w
}

// PlanDates returns the inclusive list of dates from start to end (dates at
// UTC midnight, representing account-local calendar days).
func PlanDates(start, end time.Time) []time.Time {
	var out []time.Time
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		out = append(out, d)
	}
	return out
}

// Repace spreads what is left of the total (total − spent, never negative)
// over days from..n-1 in proportion to their weights, and returns the budget
// of every day (days before from are 0). Over- or under-delivery so far
// therefore self-corrects over the remaining days.
func Repace(total, spent float64, weights []float64, from int) []float64 {
	out := make([]float64, len(weights))
	if from < 0 {
		from = 0
	}
	if from >= len(weights) {
		return out
	}
	remaining := math.Max(0, total-spent)
	sum := 0.0
	for _, w := range weights[from:] {
		sum += w
	}
	if sum <= 0 {
		return out
	}
	for i := from; i < len(weights); i++ {
		out[i] = remaining * weights[i] / sum
	}
	return out
}

// SplitBudget splits amount across campaigns by share (percent), then raises
// any campaign below its minimum to the minimum, taking the difference from
// the campaigns above their minimum in proportion to their shares. When the
// minimums alone exceed amount they are scaled down proportionally, so the
// split never exceeds amount. Results are rounded to cents; the rounding
// remainder goes to the largest amount.
func SplitBudget(amount float64, sharesPct, mins []float64) []float64 {
	n := len(sharesPct)
	out := make([]float64, n)
	if n == 0 || amount <= 0 {
		return out
	}
	minOf := func(i int) float64 {
		if i < len(mins) && mins[i] > 0 {
			return mins[i]
		}
		return 0
	}
	sumMins := 0.0
	for i := range n {
		sumMins += minOf(i)
	}
	if sumMins >= amount {
		for i := range n {
			if sumMins > 0 {
				out[i] = amount * minOf(i) / sumMins
			}
		}
		return roundCents(out, amount)
	}
	fixed := make([]bool, n)
	for {
		rest, shareSum := amount, 0.0
		for i := range n {
			if fixed[i] {
				rest -= minOf(i)
			} else {
				shareSum += math.Max(0, sharesPct[i])
			}
		}
		changed := false
		for i := range n {
			if fixed[i] {
				out[i] = minOf(i)
				continue
			}
			if shareSum > 0 {
				out[i] = rest * math.Max(0, sharesPct[i]) / shareSum
			} else {
				out[i] = 0
			}
			if out[i] < minOf(i) {
				fixed[i] = true
				changed = true
			}
		}
		if !changed {
			break
		}
	}
	return roundCents(out, amount)
}

// roundCents rounds each value to cents and moves the remainder against
// target onto the largest value.
func roundCents(v []float64, target float64) []float64 {
	if len(v) == 0 {
		return v
	}
	sum, big := 0.0, 0
	for i := range v {
		v[i] = math.Round(v[i]*100) / 100
		sum += v[i]
		if v[i] > v[big] {
			big = i
		}
	}
	if diff := math.Round((target-sum)*100) / 100; diff != 0 && v[big]+diff >= 0 {
		v[big] = math.Round((v[big]+diff)*100) / 100
	}
	return v
}

// Yesterday is one campaign's previous full plan day.
type Yesterday struct {
	Known     bool // a budget was set and spend is known
	BudgetSet float64
	Spent     float64
}

// Capped reports spend at or above 95% of the budget set.
func (y Yesterday) Capped() bool {
	return y.Known && y.BudgetSet > 0 && y.Spent >= CappedFraction*y.BudgetSet
}

// Underspent reports spend below 70% of the budget set.
func (y Yesterday) Underspent() bool {
	return y.Known && y.BudgetSet > 0 && y.Spent < UnderspentFraction*y.BudgetSet
}

// Move is budget taken from or given to one campaign by reallocation.
type Move struct {
	Index  int
	Amount float64
	// SpentPct is yesterday's spend ÷ budget set × 100 (for the reason).
	SpentPct float64
}

// Reallocation is the result of Reallocate.
type Reallocation struct {
	Amounts []float64
	Taken   []Move // from underspent campaigns
	Given   []Move // to capped campaigns
}

// Reallocate moves budget from yesterday's underspent campaigns to its
// capped ones. From each underspent campaign it takes yesterday's unspent
// amount, but never below today's minimum; the pool goes to capped campaigns
// weighted by 7-day ROAS (equal weights when no capped campaign has a
// positive ROAS; a capped campaign without ROAS then gets nothing while
// others have one). Nothing moves without both kinds of campaign. The total
// is unchanged.
func Reallocate(amounts, mins []float64, y []Yesterday, roas []*float64) Reallocation {
	out := Reallocation{Amounts: append([]float64(nil), amounts...)}
	var capped, under []int
	for i := range amounts {
		if i >= len(y) {
			break
		}
		switch {
		case y[i].Capped():
			capped = append(capped, i)
		case y[i].Underspent():
			under = append(under, i)
		}
	}
	if len(capped) == 0 || len(under) == 0 {
		return out
	}
	pool := 0.0
	for _, i := range under {
		m := 0.0
		if i < len(mins) {
			m = mins[i]
		}
		take := math.Min(y[i].BudgetSet-y[i].Spent, out.Amounts[i]-m)
		take = math.Floor(take*100) / 100
		if take <= 0 {
			continue
		}
		out.Amounts[i] = math.Round((out.Amounts[i]-take)*100) / 100
		pool += take
		out.Taken = append(out.Taken, Move{Index: i, Amount: take, SpentPct: math.Round(y[i].Spent/y[i].BudgetSet*1000) / 10})
	}
	if pool <= 0 {
		return out
	}
	weights := make([]float64, len(capped))
	wsum := 0.0
	for k, i := range capped {
		if i < len(roas) && roas[i] != nil && *roas[i] > 0 {
			weights[k] = *roas[i]
			wsum += weights[k]
		}
	}
	if wsum == 0 {
		for k := range weights {
			weights[k] = 1
		}
		wsum = float64(len(weights))
	}
	given := 0.0
	last := -1
	for k := range capped {
		if weights[k] > 0 {
			last = k
		}
	}
	for k, i := range capped {
		if weights[k] <= 0 {
			continue
		}
		g := math.Round(pool*weights[k]/wsum*100) / 100
		if k == last {
			g = math.Round((pool-given)*100) / 100
		}
		given += g
		out.Amounts[i] = math.Round((out.Amounts[i]+g)*100) / 100
		y := y[i]
		out.Given = append(out.Given, Move{Index: i, Amount: g, SpentPct: math.Round(y.Spent/y.BudgetSet*1000) / 10})
	}
	return out
}

// NeedsBudgetChange reports whether want differs from current by at least 1%.
func NeedsBudgetChange(current, want float64) bool {
	if current <= 0 {
		return want > 0
	}
	return math.Abs(want-current)/current >= minBudgetChangeFrac
}

// NormaliseShares scales values to percentages with two decimals summing to
// exactly 100 (the remainder goes to the largest). All-zero input yields
// equal shares.
func NormaliseShares(values []float64) []float64 {
	n := len(values)
	out := make([]float64, n)
	if n == 0 {
		return out
	}
	sum := 0.0
	for _, v := range values {
		sum += math.Max(0, v)
	}
	for i, v := range values {
		if sum > 0 {
			out[i] = math.Max(0, v) / sum * 100
		} else {
			out[i] = 100 / float64(n)
		}
	}
	return roundCents(out, 100)
}
