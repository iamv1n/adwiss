package automation

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTrendConditionEval(t *testing.T) {
	prev := Window{Impressions: 10000, Clicks: 200, Reach: 5000} // CTR 2%, freq 2
	cur := Window{Impressions: 10000, Clicks: 140, Reach: 4000}  // CTR 1.4% (-30%), freq 2.5 (+25%)

	ctrDown := Condition{Metric: "ctr", Op: OpChangeLT, Value: -0.25}
	res := ctrDown.Eval(cur, prev)
	require.True(t, res.Met)
	require.InDelta(t, 0.014, *res.Actual, 1e-9)
	require.InDelta(t, 0.02, *res.Previous, 1e-9)
	require.InDelta(t, -0.3, *res.Change, 1e-9)

	require.False(t, Condition{Metric: "ctr", Op: OpChangeLT, Value: -0.35}.Eval(cur, prev).Met)
	require.True(t, Condition{Metric: "frequency", Op: OpChangeGT, Value: 0.2}.Eval(cur, prev).Met)
	require.False(t, Condition{Metric: "frequency", Op: OpChangeGT, Value: 0.3}.Eval(cur, prev).Met)

	// No previous data: undefined, never matches.
	res = ctrDown.Eval(cur, Window{})
	require.False(t, res.Met)
	require.Nil(t, res.Change)
	// Previous value zero: no relative change.
	res = Condition{Metric: "clicks", Op: OpChangeGT, Value: 0.1}.Eval(cur, Window{Impressions: 10})
	require.False(t, res.Met)
	require.NotNil(t, res.Previous)
	require.Nil(t, res.Change)

	ok, results := EvalAll([]Condition{ctrDown, {Metric: "impressions", Op: "gte", Value: 5000}}, cur, prev)
	require.True(t, ok)
	require.Len(t, results, 2)
}

func TestValidateTrendCondition(t *testing.T) {
	require.NoError(t, ValidateCondition(Condition{Metric: "ctr", Op: OpChangeLT, Value: -0.25}))
	require.Error(t, ValidateCondition(Condition{Metric: "ctr", Op: OpChangeLT, Value: 0.25}))
	require.Error(t, ValidateCondition(Condition{Metric: "ctr", Op: OpChangeLT, Value: -1}))
	require.NoError(t, ValidateCondition(Condition{Metric: "frequency", Op: OpChangeGT, Value: 0.2}))
	require.Error(t, ValidateCondition(Condition{Metric: "frequency", Op: OpChangeGT, Value: -0.2}))
	require.Error(t, ValidateCondition(Condition{Metric: "spend", Op: "gt", Value: -1}))
}

func TestAdLevelActions(t *testing.T) {
	require.NoError(t, RuleAction{Type: RulePause}.ValidateFor(LevelAd))
	require.NoError(t, RuleAction{Type: RuleNotify}.ValidateFor(LevelAd))
	require.Error(t, RuleAction{Type: RuleIncreaseBudget, Value: 20}.ValidateFor(LevelAd))
	require.NoError(t, RuleAction{Type: RuleIncreaseBudget, Value: 20}.ValidateFor(LevelCampaign))

	a := Action{Status: StatusSucceeded, EntityType: LevelAd, ActionType: ActionPause, Before: map[string]any{"status": "active"}}
	require.True(t, revertible(a))
	a.ActionType, a.Before = ActionSetBudget, map[string]any{"daily_budget": 100.0}
	require.False(t, revertible(a))
}

func TestPreviousRange(t *testing.T) {
	f, to := PreviousRange("2026-09-20", "2026-09-26")
	require.Equal(t, "2026-09-13", f)
	require.Equal(t, "2026-09-19", to)
}

func TestDescribeTrendRule(t *testing.T) {
	r := Rule{Level: LevelAd, LookbackDays: 7, Action: RuleAction{Type: RulePause}, Conditions: []Condition{
		{Metric: "ctr", Op: OpChangeLT, Value: -0.2}, {Metric: "frequency", Op: "gte", Value: 2.5},
	}}
	require.Equal(t, "For each ad: if ctr fell > 20% vs the previous 7 days and frequency ≥ 2.5 in the last 7 days, pause it",
		DescribeRule(r, "INR"))
}
