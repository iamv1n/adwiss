package automation

import (
	"fmt"
	"math"
	"slices"
)

// Window holds a target's summed measures over a rule's lookback window,
// in the target's account currency (major units).
type Window struct {
	Impressions int64   `json:"impressions"`
	Clicks      int64   `json:"clicks"`
	Spend       float64 `json:"spend"`
	Conversions float64 `json:"conversions"`
	Revenue     float64 `json:"revenue"`
	// Reach summed over daily rows; 0 when the provider reports none. Reach
	// is not additive: metric_facts holds one reach per day (and per entity),
	// so the sum over-counts people reached on several days (and, above ad
	// level, in several ads). Frequency derived from it (impressions ÷ summed
	// daily reach) is therefore the average daily frequency, a lower bound of
	// the true window frequency. Trend conditions compare two windows of the
	// same length computed the same way, so the relative change is still
	// meaningful.
	Reach int64 `json:"reach"`
}

// Metric returns the named metric, or ok=false when it is undefined (a
// ratio with a zero denominator, or frequency without reach data).
func (w Window) Metric(name string) (float64, bool) {
	div := func(a, b float64) (float64, bool) {
		if b == 0 {
			return 0, false
		}
		return a / b, true
	}
	switch name {
	case "spend":
		return w.Spend, true
	case "conversions":
		return w.Conversions, true
	case "revenue":
		return w.Revenue, true
	case "impressions":
		return float64(w.Impressions), true
	case "clicks":
		return float64(w.Clicks), true
	case "cpa":
		return div(w.Spend, w.Conversions)
	case "roas":
		return div(w.Revenue, w.Spend)
	case "ctr":
		return div(float64(w.Clicks), float64(w.Impressions))
	case "cpc":
		return div(w.Spend, float64(w.Clicks))
	case "cpm":
		v, ok := div(w.Spend, float64(w.Impressions))
		return v * 1000, ok
	case "frequency":
		return div(float64(w.Impressions), float64(w.Reach))
	}
	return 0, false
}

// ValidateCondition checks the metric and operator.
func ValidateCondition(c Condition) error {
	if !slices.Contains(ConditionMetrics, c.Metric) {
		return fmt.Errorf("unknown metric %q", c.Metric)
	}
	if !slices.Contains(ConditionOps, c.Op) {
		return fmt.Errorf("unknown operator %q", c.Op)
	}
	if math.IsNaN(c.Value) || math.IsInf(c.Value, 0) {
		return fmt.Errorf("value must be a number")
	}
	switch c.Op {
	case OpChangeLT:
		// "fell by more than X%": a negative fraction above -100%.
		if c.Value <= -1 || c.Value >= 0 {
			return fmt.Errorf("a decrease must be between -100%% and 0%% (e.g. -0.25 for 25%%)")
		}
	case OpChangeGT:
		if c.Value <= 0 || c.Value > 10 {
			return fmt.Errorf("an increase must be between 0%% and 1000%% (e.g. 0.2 for 20%%)")
		}
	default:
		if c.Value < 0 {
			return fmt.Errorf("value must be a non-negative number")
		}
	}
	return nil
}

// ConditionResult is one condition evaluated against a window.
type ConditionResult struct {
	Condition
	Actual *float64 `json:"actual"` // nil when the metric is undefined
	// Trend conditions only: the metric over the previous window and the
	// relative change (Actual / Previous - 1). nil when undefined.
	Previous *float64 `json:"previous,omitempty"`
	Change   *float64 `json:"change,omitempty"`
	Met      bool     `json:"met"`
}

const eqEpsilon = 1e-9

// Eval reports whether c holds for w, with prev the previous window of the
// same length (used by trend operators only). An undefined metric never
// matches: CPA with no conversions is not "greater than X" (use spend and
// conversions = 0 for that), and a trend needs the metric defined and
// non-zero in the previous window.
func (c Condition) Eval(w, prev Window) ConditionResult {
	v, ok := w.Metric(c.Metric)
	res := ConditionResult{Condition: c}
	if !ok {
		return res
	}
	v = math.Round(v*1e6) / 1e6
	res.Actual = &v
	if c.IsTrend() {
		p, ok := prev.Metric(c.Metric)
		if !ok {
			return res
		}
		p = math.Round(p*1e6) / 1e6
		res.Previous = &p
		if p == 0 {
			return res
		}
		ch := math.Round((v/p-1)*1e6) / 1e6
		res.Change = &ch
		if c.Op == OpChangeGT {
			res.Met = ch > c.Value
		} else {
			res.Met = ch < c.Value
		}
		return res
	}
	switch c.Op {
	case "gt":
		res.Met = v > c.Value
	case "gte":
		res.Met = v >= c.Value-eqEpsilon
	case "lt":
		res.Met = v < c.Value
	case "lte":
		res.Met = v <= c.Value+eqEpsilon
	case "eq":
		res.Met = math.Abs(v-c.Value) <= eqEpsilon
	}
	return res
}

// EvalAll reports whether every condition holds (an empty list never
// matches, so a rule cannot act on everything by accident).
func EvalAll(conds []Condition, w, prev Window) (bool, []ConditionResult) {
	out := make([]ConditionResult, len(conds))
	all := len(conds) > 0
	for i, c := range conds {
		out[i] = c.Eval(w, prev)
		all = all && out[i].Met
	}
	return all, out
}
