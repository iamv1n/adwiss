package automation

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/google/uuid"
)

// Engine evaluates schedules and rules. Plans are pure reads; Evaluate*
// persists them as action rows and hands pending rows to enqueue.
type Engine struct {
	st  *store
	now func() time.Time
	log *slog.Logger
}

func newEngine(st *store) *Engine {
	return &Engine{st: st, now: time.Now, log: slog.Default().With("component", "automation.engine")}
}

// PlannedChange is one change a schedule or rule makes (or would make).
type PlannedChange struct {
	At          time.Time   `json:"at"`
	TargetID    uuid.UUID   `json:"target_id"`
	TargetName  string      `json:"target_name"`
	AccountName string      `json:"account_name"`
	Provider    string      `json:"provider"`
	Currency    string      `json:"currency"`
	Type        string      `json:"type"`
	Before      EntityState `json:"before"`
	After       EntityState `json:"after"`
	Reason      string      `json:"reason"`
	SkipReason  string      `json:"skip_reason,omitempty"`

	target    Target
	slotStart time.Time
	key       string
	silent    bool // cooldown: not recorded at all
}

func planned(t Target, c Change, at time.Time) PlannedChange {
	return PlannedChange{At: at, TargetID: t.ID, TargetName: t.Name, AccountName: t.AccountName, Provider: t.Provider,
		Currency: t.Currency, Type: c.Type, Before: c.Before, After: c.After, Reason: c.Reason, target: t}
}

// scheduleLocation is the clock a schedule uses for a target.
func scheduleLocation(s Schedule, t Target) (*time.Location, string) {
	name := t.Timezone
	if s.Timezone != nil && *s.Timezone != "" {
		name = *s.Timezone
	}
	loc, err := LoadLocation(name)
	if err != nil {
		return time.UTC, "UTC"
	}
	return loc, name
}

// planSchedule returns the changes s makes to its targets at now.
func (e *Engine) planSchedule(ctx context.Context, s Schedule, now time.Time) ([]Target, []PlannedChange, error) {
	targets, err := e.st.targets(ctx, s.OrganizationID, s.Level, s.TargetIDs)
	if err != nil {
		return nil, nil, err
	}
	var out []PlannedChange
	for _, t := range targets {
		loc, _ := scheduleLocation(s, t)
		v := s.Grid.ValueAt(now, loc)
		slot := s.Grid.SlotStart(now, loc)
		m, err := e.st.memo(ctx, s.ID, t.ID)
		if err != nil {
			return nil, nil, err
		}
		for _, c := range DecideSchedule(v, t, m) {
			if c.Type == ActionSetBudget {
				c.After.Multiplier = ptrF(v)
			}
			p := planned(t, c, now)
			p.slotStart = slot
			p.key = fmt.Sprintf("schedule:%s:%s:%s:%d", s.ID, t.ID, c.Type, slot.Unix())
			out = append(out, p)
		}
	}
	return targets, out, nil
}

// EvaluateSchedule records the current slot's changes for s and returns the
// IDs of the pending (live) actions to execute.
func (e *Engine) EvaluateSchedule(ctx context.Context, s Schedule) ([]uuid.UUID, int, error) {
	now := e.now()
	_, plan, err := e.planSchedule(ctx, s, now)
	if err != nil {
		return nil, 0, err
	}
	var pending []uuid.UUID
	recorded := 0
	for _, p := range plan {
		status := StatusPending
		if s.DryRun {
			status = StatusDryRun
		}
		id, ok, err := e.record(ctx, s.OrganizationID, SourceSchedule, s.ID, s.Name, p, status, "")
		if err != nil {
			return pending, recorded, err
		}
		if ok {
			recorded++
			if status == StatusPending {
				pending = append(pending, id)
			}
		}
	}
	if err := e.st.touchSchedule(ctx, s.ID, now); err != nil {
		return pending, recorded, err
	}
	return pending, recorded, nil
}

func (e *Engine) record(ctx context.Context, orgID uuid.UUID, source string, sourceID uuid.UUID, name string, p PlannedChange, status, reason string) (uuid.UUID, bool, error) {
	if reason == "" {
		reason = p.Reason
	}
	key := p.key
	slot := p.slotStart
	sid := sourceID
	return e.st.insertAction(ctx, newAction{
		OrganizationID: orgID, Source: source, SourceID: &sid, SourceName: name, Target: p.target,
		ActionType: p.Type, Before: p.Before.Map(), After: p.After.Map(), Status: status, Reason: reason,
		IdempotencyKey: &key, SlotStart: &slot,
	})
}

// SimulatedHour is one hour of a schedule's 24h preview for one target.
type SimulatedHour struct {
	At          time.Time `json:"at"`
	Value       float64   `json:"value"`
	Status      string    `json:"status"`
	DailyBudget *float64  `json:"daily_budget"`
}

// simulateSchedule plays the schedule forward hour by hour from now, as if
// every change succeeded, and returns the changes and each target's hourly
// state. The first hour's changes are the ones EvaluateSchedule would make now.
func simulateSchedule(s Schedule, targets []Target, memos map[uuid.UUID]ScheduleMemo, now time.Time, hours int) ([]PlannedChange, map[uuid.UUID][]SimulatedHour) {
	var changes []PlannedChange
	timeline := map[uuid.UUID][]SimulatedHour{}
	for _, t0 := range targets {
		t := t0
		m := memos[t.ID]
		if m.AppliedMultiplier == 0 {
			m.AppliedMultiplier = 1
		}
		loc, _ := scheduleLocation(s, t)
		at := now
		for h := range hours {
			if h > 0 {
				at = HourStart(at, loc).Add(time.Hour)
			}
			v := s.Grid.ValueAt(at, loc)
			for _, c := range DecideSchedule(v, t, m) {
				if c.Type == ActionSetBudget {
					c.After.Multiplier = ptrF(v)
				}
				changes = append(changes, planned(t, c, at))
				ApplyScheduleChange(&t, &m, c)
			}
			hour := SimulatedHour{At: at, Value: v, Status: t.Status}
			if t.DailyBudgetMicros != nil {
				hour.DailyBudget = ptrF(microsToUnits(*t.DailyBudgetMicros))
			}
			timeline[t.ID] = append(timeline[t.ID], hour)
		}
	}
	slices.SortStableFunc(changes, func(a, b PlannedChange) int { return a.At.Compare(b.At) })
	return changes, timeline
}

// --- rules ---

// ruleTarget is one entity in a rule's scope with its evaluated window (and,
// for rules with trend conditions, the previous window).
type ruleTarget struct {
	Target
	Window     Window            `json:"window"`
	Previous   *Window           `json:"previous,omitempty"`
	Conditions []ConditionResult `json:"conditions"`
	Matched    bool              `json:"matched"`
}

// lookbackRange returns the inclusive account-local dates of a lookback
// window ending today.
func lookbackRange(now time.Time, tz string, days int) (string, string) {
	loc, err := LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	l := now.In(loc)
	to := time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, time.UTC)
	return to.AddDate(0, 0, -(days - 1)).Format(time.DateOnly), to.Format(time.DateOnly)
}

// PreviousRange returns the window of the same length immediately before the
// inclusive date range [from, to].
func PreviousRange(from, to string) (string, string) {
	f, err1 := time.Parse(time.DateOnly, from)
	t, err2 := time.Parse(time.DateOnly, to)
	if err1 != nil || err2 != nil {
		return from, to
	}
	days := int(t.Sub(f).Hours()/24) + 1
	return f.AddDate(0, 0, -days).Format(time.DateOnly), f.AddDate(0, 0, -1).Format(time.DateOnly)
}

// ruleSlot buckets evaluation time for idempotency keys.
func ruleSlot(r Rule, now time.Time) time.Time {
	iv := time.Duration(r.CheckIntervalMinutes) * time.Minute
	if iv <= 0 {
		iv = time.Hour
	}
	return now.UTC().Truncate(iv)
}

// planRule evaluates r at now: each target's window and conditions, and the
// change (or skip reason) for each match, applying max changes, cooldown,
// schedule precedence and one-rule-per-entity-per-hour.
func (e *Engine) planRule(ctx context.Context, r Rule, now time.Time) ([]ruleTarget, []PlannedChange, error) {
	level := r.Level
	if level == "" {
		level = LevelCampaign
	}
	targets, err := e.st.ruleTargets(ctx, r.OrganizationID, level, r.ScopeType, r.ScopeIDs)
	if err != nil {
		return nil, nil, err
	}
	trend := HasTrend(r.Conditions)
	// Windows, one query per account.
	byAccount := map[uuid.UUID][]Target{}
	for _, t := range targets {
		byAccount[t.AccountID] = append(byAccount[t.AccountID], t)
	}
	windows := map[uuid.UUID]Window{}
	previous := map[uuid.UUID]Window{}
	for acct, ts := range byAccount {
		from, to := lookbackRange(now, ts[0].Timezone, r.LookbackDays)
		ext := make([]string, len(ts))
		for i, t := range ts {
			ext[i] = t.ExternalID
		}
		ws, err := e.st.windows(ctx, r.OrganizationID, acct, level, from, to, ext)
		if err != nil {
			return nil, nil, err
		}
		for _, t := range ts {
			windows[t.ID] = ws[t.ExternalID]
		}
		if trend {
			pf, pt := PreviousRange(from, to)
			ps, err := e.st.windows(ctx, r.OrganizationID, acct, level, pf, pt, ext)
			if err != nil {
				return nil, nil, err
			}
			for _, t := range ts {
				previous[t.ID] = ps[t.ExternalID]
			}
		}
	}
	schedules, err := e.st.enabledSchedules(ctx, &r.OrganizationID)
	if err != nil {
		return nil, nil, err
	}

	slot := ruleSlot(r, now)
	hour := now.Truncate(time.Hour)
	live := []string{StatusPending, StatusRunning, StatusSucceeded}
	counted := live
	if r.DryRun {
		counted = append(slices.Clone(live), StatusDryRun)
	}
	cooldownSince := now.Add(-time.Duration(r.CooldownMinutes) * time.Minute)

	out := make([]ruleTarget, 0, len(targets))
	var plan []PlannedChange
	changes := 0
	for _, t := range targets {
		rt := ruleTarget{Target: t, Window: windows[t.ID]}
		if trend {
			p := previous[t.ID]
			rt.Previous = &p
		}
		rt.Matched, rt.Conditions = EvalAll(r.Conditions, rt.Window, previous[t.ID])
		out = append(out, rt)
		if !rt.Matched {
			continue
		}
		c, noop, skip := DecideRule(r.Action, t)
		if noop {
			continue
		}
		p := planned(t, c, now)
		p.Reason = DescribeRule(r, t.Currency)
		p.slotStart = slot
		p.key = fmt.Sprintf("rule:%s:%s:%d", r.ID, t.ID, slot.Unix())
		if skip == "" && c.Type != ActionNotify {
			if conflict, why := ScheduleConflict(r.DryRun, e.claims(ctx, schedules, t, now, hour)); conflict {
				skip = why
			}
		}
		if skip == "" && r.CooldownMinutes > 0 {
			recent, err := e.st.recentAction(ctx, r.OrganizationID, t.ID, SourceRule, &r.ID, nil, counted, cooldownSince)
			if err != nil {
				return nil, nil, err
			}
			if recent {
				p.SkipReason = "in cooldown after a recent change by this rule"
				p.silent = true
				plan = append(plan, p)
				continue
			}
		}
		if skip == "" && c.Type != ActionNotify {
			other, err := e.st.recentAction(ctx, r.OrganizationID, t.ID, SourceRule, nil, &r.ID, counted, hour)
			if err != nil {
				return nil, nil, err
			}
			if other {
				skip = "another rule already changed it this hour"
			}
		}
		if skip == "" && c.Type == ActionSetBudget {
			// A budget plan that set this budget this hour takes precedence.
			planned, err := e.st.recentAction(ctx, r.OrganizationID, t.ID, SourcePlan, nil, nil, counted, hour)
			if err != nil {
				return nil, nil, err
			}
			if planned {
				skip = "a budget plan set its budget this hour; budget plans take precedence over rules"
			}
		}
		if skip == "" && changes >= r.MaxChangesPerRun {
			skip = fmt.Sprintf("the rule's limit of %d changes per run was reached", r.MaxChangesPerRun)
		}
		if skip == "" {
			changes++
		}
		p.SkipReason = skip
		plan = append(plan, p)
	}
	return out, plan, nil
}

// claims lists the enabled schedules targeting t with their current value.
func (e *Engine) claims(ctx context.Context, schedules []Schedule, t Target, now, hour time.Time) []ScheduleClaim {
	var out []ScheduleClaim
	for _, s := range schedules {
		if s.Level != t.Level || !slices.Contains(s.TargetIDs, t.ID) {
			continue
		}
		loc, _ := scheduleLocation(s, t)
		c := ScheduleClaim{ScheduleID: s.ID, ScheduleName: s.Name, DryRun: s.DryRun, Value: s.Grid.ValueAt(now, loc)}
		sid := s.ID
		acted, err := e.st.recentAction(ctx, s.OrganizationID, t.ID, SourceSchedule, &sid, nil,
			[]string{StatusPending, StatusRunning, StatusSucceeded, StatusDryRun}, hour)
		if err != nil {
			e.log.ErrorContext(ctx, "schedule claim lookup", "err", err)
		}
		c.ActedThisSlot = acted
		out = append(out, c)
	}
	return out
}

// EvaluateRule records r's changes and returns the pending action IDs.
func (e *Engine) EvaluateRule(ctx context.Context, r Rule) ([]uuid.UUID, error) {
	now := e.now()
	targets, plan, err := e.planRule(ctx, r, now)
	if err != nil {
		return nil, err
	}
	matched := 0
	for _, t := range targets {
		if t.Matched {
			matched++
		}
	}
	var pending []uuid.UUID
	changes := 0
	for _, p := range plan {
		if p.silent {
			continue
		}
		status := StatusPending
		reason := p.Reason
		switch {
		case p.SkipReason != "":
			status, reason = StatusSkipped, p.SkipReason
		case r.DryRun:
			status = StatusDryRun
		case p.Type == ActionNotify:
			status = StatusSucceeded
		}
		id, ok, err := e.record(ctx, r.OrganizationID, SourceRule, r.ID, r.Name, p, status, reason)
		if err != nil {
			return pending, err
		}
		if ok && status != StatusSkipped {
			changes++
		}
		if ok && status == StatusPending {
			pending = append(pending, id)
		}
	}
	next := now.Add(time.Duration(r.CheckIntervalMinutes) * time.Minute)
	return pending, e.st.finishRuleRun(ctx, r.ID, now, next, matched, changes)
}
