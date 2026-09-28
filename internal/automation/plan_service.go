package automation

import (
	"context"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/organizations"
)

// --- validation ---

// applyPlanInput validates in onto p. Campaign checks (existence, currency,
// daily budget, one enabled plan per campaign) need the database.
func (s *Service) applyPlanInput(ctx context.Context, p *BudgetPlan, in PlanInput, checkConflicts bool) ([]Target, error) {
	if in.Name != nil {
		p.Name = strings.TrimSpace(*in.Name)
	}
	if p.Name == "" || len(p.Name) > 200 {
		return nil, invalid("name", "must be 1–200 characters")
	}
	if in.TotalBudget != nil {
		p.TotalBudget = round2(*in.TotalBudget)
	}
	if math.IsNaN(p.TotalBudget) || p.TotalBudget <= 0 || p.TotalBudget >= 1e12 {
		return nil, invalid("total_budget", "must be a positive amount")
	}
	if in.Currency != nil {
		p.Currency = strings.ToUpper(strings.TrimSpace(*in.Currency))
	}
	if len(p.Currency) != 3 {
		return nil, invalid("currency", "must be a 3-letter currency code")
	}
	parseDate := func(field string, v *string, dst *time.Time) error {
		if v == nil {
			return nil
		}
		d, err := time.Parse(time.DateOnly, *v)
		if err != nil {
			return invalid(field, "must be a date (YYYY-MM-DD)")
		}
		*dst = d
		return nil
	}
	if err := parseDate("start_date", in.StartDate, &p.StartDate); err != nil {
		return nil, err
	}
	if err := parseDate("end_date", in.EndDate, &p.EndDate); err != nil {
		return nil, err
	}
	if p.StartDate.IsZero() {
		return nil, invalid("start_date", "is required")
	}
	if p.EndDate.IsZero() {
		return nil, invalid("end_date", "is required")
	}
	if p.EndDate.Before(p.StartDate) {
		return nil, invalid("end_date", "must be on or after the start date")
	}
	n := len(p.Dates())
	if n > MaxPlanDays {
		return nil, invalid("end_date", fmt.Sprintf("a plan can cover at most %d days", MaxPlanDays))
	}
	if in.Timezone != nil {
		if *in.Timezone == "" {
			p.Timezone = nil
		} else {
			if _, err := LoadLocation(*in.Timezone); err != nil {
				return nil, invalid("timezone", err.Error())
			}
			tz := *in.Timezone
			p.Timezone = &tz
		}
	}
	if in.Curve != nil {
		p.Curve = *in.Curve
	}
	if !slices.Contains([]string{CurveEven, CurveFrontLoaded, CurveBackLoaded, CurveCustom}, p.Curve) {
		return nil, invalid("curve", "must be even, front_loaded, back_loaded or custom")
	}
	if in.CustomWeights != nil {
		p.CustomWeights = *in.CustomWeights
	}
	if p.Curve == CurveCustom {
		if len(p.CustomWeights) != n {
			return nil, invalid("custom_weights", fmt.Sprintf("needs one weight per day (%d)", n))
		}
		for _, w := range p.CustomWeights {
			if math.IsNaN(w) || math.IsInf(w, 0) || w <= 0 {
				return nil, invalid("custom_weights", "every weight must be a positive number")
			}
		}
	} else {
		p.CustomWeights = nil
	}
	if in.AllocationMode != nil {
		p.AllocationMode = *in.AllocationMode
	}
	if !slices.Contains([]string{AllocManual, AllocPastSpend, AllocROAS}, p.AllocationMode) {
		return nil, invalid("allocation_mode", "must be manual, past_spend or roas")
	}
	if in.Reallocate != nil {
		p.Reallocate = *in.Reallocate
	}
	if in.Enabled != nil {
		p.Enabled = *in.Enabled
	}
	if in.DryRun != nil {
		p.DryRun = *in.DryRun
	}
	if in.Campaigns != nil {
		p.Campaigns = *in.Campaigns
	}
	if len(p.Campaigns) == 0 {
		return nil, invalid("campaigns", "add at least one campaign")
	}
	if len(p.Campaigns) > maxPlanCampaigns {
		return nil, invalid("campaigns", fmt.Sprintf("a plan can have at most %d campaigns", maxPlanCampaigns))
	}
	seen := map[uuid.UUID]bool{}
	total, minSum := 0.0, 0.0
	ids := make([]uuid.UUID, 0, len(p.Campaigns))
	for i := range p.Campaigns {
		c := &p.Campaigns[i]
		if seen[c.CampaignID] {
			return nil, invalid("campaigns", "a campaign is listed twice")
		}
		seen[c.CampaignID] = true
		ids = append(ids, c.CampaignID)
		c.SharePct, c.MinDailyBudget = round2(c.SharePct), round2(c.MinDailyBudget)
		if math.IsNaN(c.SharePct) || c.SharePct < 0 || c.SharePct > 100 {
			return nil, invalid("campaigns", "each share must be between 0 and 100 percent")
		}
		if math.IsNaN(c.MinDailyBudget) || c.MinDailyBudget < 0 {
			return nil, invalid("campaigns", "minimum daily budgets cannot be negative")
		}
		total += c.SharePct
		minSum += c.MinDailyBudget
	}
	if math.Abs(total-100) > shareTolerance {
		return nil, invalid("campaigns", fmt.Sprintf("shares must add up to 100%% (they add up to %g%%)", round2(total)))
	}
	if minSum*float64(n) > p.TotalBudget+shareTolerance {
		return nil, invalid("campaigns", "the minimum daily budgets over the period exceed the total budget")
	}
	targets, err := s.st.targets(ctx, p.OrganizationID, LevelCampaign, ids)
	if err != nil {
		return nil, err
	}
	byID := map[uuid.UUID]Target{}
	for _, t := range targets {
		byID[t.ID] = t
	}
	ordered := make([]Target, len(p.Campaigns))
	for i, c := range p.Campaigns {
		t, ok := byID[c.CampaignID]
		if !ok {
			return nil, invalid("campaigns", "a campaign was not found")
		}
		if !strings.EqualFold(t.Currency, p.Currency) {
			return nil, invalid("campaigns", fmt.Sprintf("%q is in %s; every campaign in the plan must be in %s", t.Name, t.Currency, p.Currency))
		}
		if t.DailyBudgetMicros == nil || *t.DailyBudgetMicros <= 0 {
			return nil, invalid("campaigns", fmt.Sprintf("%q has no campaign-level daily budget (it uses a lifetime or ad set budget)", t.Name))
		}
		ordered[i] = t
	}
	if checkConflicts && p.Enabled {
		conflicts, err := s.st.planConflicts(ctx, p.OrganizationID, p.ID, ids)
		if err != nil {
			return nil, err
		}
		if len(conflicts) > 0 {
			c := conflicts[0]
			return nil, invalid("campaigns", fmt.Sprintf("%q is already in the enabled plan %q; a campaign can be in one enabled plan at a time",
				byID[c.CampaignID].Name, c.PlanName))
		}
	}
	return ordered, nil
}

// --- computation ---

// planState is everything computed about a plan at one moment.
type planState struct {
	plan     BudgetPlan
	loc      *time.Location
	now      time.Time
	today    time.Time
	dates    []time.Time
	todayIdx int // may be < 0 (before start) or ≥ len(dates) (after end)
	targets  []*Target
	spend    []map[time.Time]float64 // per campaign, per date
	roas     []*float64
	planned  [][]float64 // per campaign, per date
	stored   map[dayKey]planDayRow
	// Today's amounts per campaign after split and reallocation.
	todayAmounts []float64
	reasons      []string
}

func dayIndex(dates []time.Time, d time.Time) int {
	if len(dates) == 0 {
		return 0
	}
	return int(d.Sub(dates[0]).Hours() / 24)
}

// computePlan loads targets and facts and paces the plan at now. stored is
// the plan's saved day rows (nil for a preview).
func (s *Service) computePlan(ctx context.Context, p BudgetPlan, targets []Target, stored map[dayKey]planDayRow, now time.Time) (*planState, error) {
	if p.EffectiveTZ == "" && p.Timezone != nil {
		p.EffectiveTZ = *p.Timezone
	}
	if p.EffectiveTZ == "" && len(targets) > 0 {
		p.EffectiveTZ = targets[0].Timezone
	}
	st := &planState{plan: p, loc: p.Location(), now: now, dates: p.Dates(), stored: stored}
	st.today = LocalDate(now, st.loc)
	st.todayIdx = dayIndex(st.dates, st.today)
	if stored == nil {
		st.stored = map[dayKey]planDayRow{}
	}
	nc := len(p.Campaigns)
	byID := map[uuid.UUID]Target{}
	for _, t := range targets {
		byID[t.ID] = t
	}
	st.targets = make([]*Target, nc)
	st.spend = make([]map[time.Time]float64, nc)
	st.roas = make([]*float64, nc)
	byAccount := map[uuid.UUID][]int{}
	for i, c := range p.Campaigns {
		st.spend[i] = map[time.Time]float64{}
		if t, ok := byID[c.CampaignID]; ok {
			st.targets[i] = &t
			byAccount[t.AccountID] = append(byAccount[t.AccountID], i)
		}
	}
	// Spend from the plan start through today (plan-local dates) and 7-day ROAS.
	last := st.today
	if last.After(p.EndDate) {
		last = p.EndDate
	}
	for acct, idx := range byAccount {
		ext := make([]string, len(idx))
		for k, i := range idx {
			ext[k] = st.targets[i].ExternalID
		}
		if !last.Before(p.StartDate) {
			sp, err := s.st.dailySpend(ctx, p.OrganizationID, acct, p.StartDate, last, ext)
			if err != nil {
				return nil, err
			}
			for _, i := range idx {
				if m := sp[st.targets[i].ExternalID]; m != nil {
					st.spend[i] = m
				}
			}
		}
		from, to := lookbackRange(now.AddDate(0, 0, -1), st.targets[idx[0]].Timezone, 7)
		ws, err := s.st.windows(ctx, p.OrganizationID, acct, LevelCampaign, from, to, ext)
		if err != nil {
			return nil, err
		}
		for _, i := range idx {
			if w := ws[st.targets[i].ExternalID]; w.Spend > 0 {
				st.roas[i] = ptrF(math.Round(w.Revenue/w.Spend*100) / 100)
			}
		}
	}

	shares := make([]float64, nc)
	mins := make([]float64, nc)
	for i, c := range p.Campaigns {
		shares[i], mins[i] = c.SharePct, c.MinDailyBudget
	}
	weights := CurveWeights(p.Curve, len(st.dates), p.CustomWeights)
	original := Repace(p.TotalBudget, 0, weights, 0)
	spentBefore := 0.0
	for i := range p.Campaigns {
		for d, v := range st.spend[i] {
			if d.Before(st.today) {
				spentBefore += v
			}
		}
	}
	// Re-pace today and later days over what is left (spend before today).
	from := max(st.todayIdx, 0)
	daily := original
	if st.todayIdx > 0 && st.todayIdx < len(st.dates) {
		daily = Repace(p.TotalBudget, spentBefore, weights, from)
	}
	st.planned = make([][]float64, nc)
	for i := range st.planned {
		st.planned[i] = make([]float64, len(st.dates))
	}
	for di, d := range st.dates {
		var split []float64
		if di < from {
			split = SplitBudget(original[di], shares, mins)
		} else {
			split = SplitBudget(daily[di], shares, mins)
		}
		for i, c := range p.Campaigns {
			if di < st.todayIdx {
				if r, ok := st.stored[dayKey{c.CampaignID, d}]; ok {
					st.planned[i][di] = r.Planned
					continue
				}
			}
			st.planned[i][di] = split[i]
		}
	}

	// Today: split, then reallocate from yesterday.
	st.todayAmounts = make([]float64, nc)
	st.reasons = make([]string, nc)
	if st.todayIdx >= 0 && st.todayIdx < len(st.dates) {
		for i := range p.Campaigns {
			st.todayAmounts[i] = st.planned[i][st.todayIdx]
		}
		if p.Reallocate && st.todayIdx > 0 {
			yday := st.dates[st.todayIdx-1]
			ys := make([]Yesterday, nc)
			for i, c := range p.Campaigns {
				if r, ok := st.stored[dayKey{c.CampaignID, yday}]; ok && r.BudgetSet != nil && *r.BudgetSet > 0 {
					ys[i] = Yesterday{Known: true, BudgetSet: *r.BudgetSet, Spent: st.spend[i][yday]}
				}
			}
			ra := Reallocate(st.todayAmounts, mins, ys, st.roas)
			st.todayAmounts = ra.Amounts
			st.describeReallocation(ra)
			for i := range p.Campaigns {
				st.planned[i][st.todayIdx] = st.todayAmounts[i]
			}
		}
	}
	return st, nil
}

func (st *planState) name(i int) string {
	if st.targets[i] != nil {
		return st.targets[i].Name
	}
	return "a removed campaign"
}

// describeReallocation writes each affected campaign's reason, e.g.
// "reallocated $38 from Prospecting — spent 52% yesterday".
func (st *planState) describeReallocation(ra Reallocation) {
	cur := currencyPrefix(st.plan.Currency)
	var from []string
	for _, t := range ra.Taken {
		st.reasons[t.Index] = fmt.Sprintf("moved %s%s to capped campaigns — spent %g%% yesterday", cur, money(t.Amount), t.SpentPct)
		from = append(from, fmt.Sprintf("%s (spent %g%% yesterday)", st.name(t.Index), t.SpentPct))
	}
	for _, g := range ra.Given {
		st.reasons[g.Index] = fmt.Sprintf("reallocated %s%s from %s — capped yesterday at %g%% of budget",
			cur, money(g.Amount), strings.Join(from, ", "), g.SpentPct)
	}
}

func money(v float64) string {
	if v == math.Trunc(v) {
		return fmt.Sprintf("%.0f", v)
	}
	return fmt.Sprintf("%.2f", v)
}

// view renders the plan.
func (st *planState) view() PlanView {
	p := st.plan
	v := PlanView{
		PlanSummary: PlanSummary{ID: p.ID, Name: p.Name, TotalBudget: p.TotalBudget, Currency: p.Currency,
			StartDate: p.StartDate.Format(time.DateOnly), EndDate: p.EndDate.Format(time.DateOnly), Curve: p.Curve,
			Enabled: p.Enabled, DryRun: p.DryRun, Status: p.Status(st.today), CampaignCount: len(p.Campaigns),
			LastRunAt: p.LastRunAt, NextRunAt: p.NextRunAt},
		Timezone: p.Timezone, CustomWeights: p.CustomWeights, AllocationMode: p.AllocationMode, Reallocate: p.Reallocate,
		Days: make([]DayPlan, len(st.dates)), Campaigns: make([]CampaignPlan, len(p.Campaigns)), RecentActions: []Action{},
		CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
	// Share of today elapsed, for planned-to-date.
	mid := localMidnight(st.today, st.loc)
	dayLen := localMidnight(st.today.AddDate(0, 0, 1), st.loc).Sub(mid)
	elapsed := math.Min(1, math.Max(0, st.now.Sub(mid).Seconds()/dayLen.Seconds()))
	for di, d := range st.dates {
		dp := DayPlan{Day: d.Format(time.DateOnly)}
		var spent, set float64
		hasSet := false
		for i, c := range p.Campaigns {
			dp.Planned += st.planned[i][di]
			spent += st.spend[i][d]
			if r, ok := st.stored[dayKey{c.CampaignID, d}]; ok && r.BudgetSet != nil {
				set += *r.BudgetSet
				hasSet = true
			}
		}
		dp.Planned = round2(dp.Planned)
		if !d.After(st.today) {
			dp.Spent = ptrF(round2(spent))
			v.SpentToDate += spent
			switch {
			case d.Before(st.today):
				v.PlannedToDate += dp.Planned
			default:
				v.PlannedToDate += dp.Planned * elapsed
			}
		}
		if hasSet {
			dp.BudgetSet = ptrF(round2(set))
		}
		v.Days[di] = dp
	}
	v.SpentToDate, v.PlannedToDate = round2(v.SpentToDate), round2(v.PlannedToDate)
	if v.PlannedToDate > 0 {
		v.DeliveryPct = ptrF(math.Round(v.SpentToDate/v.PlannedToDate*1000) / 10)
	}
	todayIdx := min(max(st.todayIdx, 0), len(st.dates)-1)
	for i, c := range p.Campaigns {
		cp := CampaignPlan{CampaignID: c.CampaignID, Name: st.name(i), SharePct: c.SharePct, MinDailyBudget: c.MinDailyBudget,
			ROAS7d: st.roas[i]}
		if t := st.targets[i]; t != nil {
			cp.Provider = t.Provider
			if t.DailyBudgetMicros != nil {
				cp.CurrentDailyBudget = ptrF(microsToUnits(*t.DailyBudgetMicros))
			}
		}
		if st.todayIdx < len(st.dates) {
			cp.PlannedToday = round2(st.planned[i][todayIdx])
		}
		for _, x := range st.planned[i] {
			cp.PlannedTotal += x
		}
		cp.PlannedTotal = round2(cp.PlannedTotal)
		for _, x := range st.spend[i] {
			cp.SpentToDate += x
		}
		cp.SpentToDate = round2(cp.SpentToDate)
		v.Campaigns[i] = cp
	}
	return v
}

// --- CRUD ---

func (s *Service) planState(ctx context.Context, p BudgetPlan) (*planState, error) {
	ids := make([]uuid.UUID, len(p.Campaigns))
	for i, c := range p.Campaigns {
		ids[i] = c.CampaignID
	}
	targets, err := s.st.targets(ctx, p.OrganizationID, LevelCampaign, ids)
	if err != nil {
		return nil, err
	}
	stored, err := s.st.planDays(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	return s.computePlan(ctx, p, targets, stored, s.engine.now())
}

func (s *Service) ListPlans(ctx context.Context, orgID uuid.UUID) ([]PlanSummary, error) {
	plans, err := s.st.listPlans(ctx, orgID)
	if err != nil {
		return nil, err
	}
	out := make([]PlanSummary, 0, len(plans))
	for _, p := range plans {
		st, err := s.planState(ctx, p)
		if err != nil {
			return nil, err
		}
		out = append(out, st.view().PlanSummary)
	}
	return out, nil
}

func (s *Service) GetPlan(ctx context.Context, orgID, id uuid.UUID) (PlanView, error) {
	p, err := s.st.getPlan(ctx, orgID, id)
	if err != nil {
		return PlanView{}, notFound(err)
	}
	st, err := s.planState(ctx, p)
	if err != nil {
		return PlanView{}, err
	}
	v := st.view()
	actions, _, _, err := s.st.listActions(ctx, orgID, ActionFilter{Source: SourcePlan, SourceID: &id, Limit: 50})
	if err != nil {
		return v, err
	}
	v.RecentActions = actions
	return v, nil
}

func (s *Service) CreatePlan(ctx context.Context, m organizations.Membership, in PlanInput) (PlanView, error) {
	p := BudgetPlan{OrganizationID: m.OrganizationID, Curve: CurveEven, AllocationMode: AllocManual, Reallocate: true,
		DryRun: true, CreatedBy: &m.UserID}
	if _, err := s.applyPlanInput(ctx, &p, in, true); err != nil {
		return PlanView{}, err
	}
	id, err := s.st.savePlan(ctx, p)
	if err != nil {
		return PlanView{}, err
	}
	s.audit(ctx, m, "budget_plan.created", "budget_plan", id, map[string]any{"name": p.Name, "total_budget": p.TotalBudget})
	return s.GetPlan(ctx, m.OrganizationID, id)
}

func (s *Service) UpdatePlan(ctx context.Context, m organizations.Membership, id uuid.UUID, in PlanInput) (PlanView, error) {
	p, err := s.st.getPlan(ctx, m.OrganizationID, id)
	if err != nil {
		return PlanView{}, notFound(err)
	}
	wasEnabled := p.Enabled
	if _, err := s.applyPlanInput(ctx, &p, in, true); err != nil {
		return PlanView{}, err
	}
	if p.Enabled && !wasEnabled {
		p.NextRunAt = nil // due on the next tick
	}
	if _, err := s.st.savePlan(ctx, p); err != nil {
		return PlanView{}, notFound(err)
	}
	s.audit(ctx, m, "budget_plan.updated", "budget_plan", id, map[string]any{"name": p.Name, "enabled": p.Enabled, "dry_run": p.DryRun})
	return s.GetPlan(ctx, m.OrganizationID, id)
}

func (s *Service) DeletePlan(ctx context.Context, m organizations.Membership, id uuid.UUID) error {
	if err := s.st.deletePlan(ctx, m.OrganizationID, id); err != nil {
		return notFound(err)
	}
	s.audit(ctx, m, "budget_plan.deleted", "budget_plan", id, nil)
	return nil
}

// PreviewPlan paces an unsaved plan. No writes.
func (s *Service) PreviewPlan(ctx context.Context, orgID uuid.UUID, in PlanInput) (PlanPreview, error) {
	p := BudgetPlan{OrganizationID: orgID, Curve: CurveEven, AllocationMode: AllocManual, Reallocate: true, DryRun: true}
	targets, err := s.applyPlanInput(ctx, &p, in, false)
	if err != nil {
		return PlanPreview{}, err
	}
	st, err := s.computePlan(ctx, p, targets, nil, s.engine.now())
	if err != nil {
		return PlanPreview{}, err
	}
	v := st.view()
	// A preview shows the plan, not the delivery of an unsaved plan.
	for i := range v.Days {
		v.Days[i].Spent, v.Days[i].BudgetSet = nil, nil
	}
	return PlanPreview{Days: v.Days, Campaigns: v.Campaigns}, nil
}

// SuggestSplit proposes shares from each campaign's spend or ROAS over the
// last days full days (equal shares when there is no data).
func (s *Service) SuggestSplit(ctx context.Context, orgID uuid.UUID, ids []uuid.UUID, mode string, days int) ([]ShareSuggestion, error) {
	targets, err := s.st.targets(ctx, orgID, LevelCampaign, ids)
	if err != nil {
		return nil, err
	}
	byAccount := map[uuid.UUID][]Target{}
	for _, t := range targets {
		byAccount[t.AccountID] = append(byAccount[t.AccountID], t)
	}
	windows := map[uuid.UUID]Window{}
	now := s.engine.now()
	for acct, ts := range byAccount {
		from, to := lookbackRange(now.AddDate(0, 0, -1), ts[0].Timezone, days)
		ext := make([]string, len(ts))
		for i, t := range ts {
			ext[i] = t.ExternalID
		}
		ws, err := s.st.windows(ctx, orgID, acct, LevelCampaign, from, to, ext)
		if err != nil {
			return nil, err
		}
		for _, t := range ts {
			windows[t.ID] = ws[t.ExternalID]
		}
	}
	values := make([]float64, len(ids))
	for i, id := range ids {
		w := windows[id]
		if mode == AllocROAS {
			if w.Spend > 0 {
				values[i] = w.Revenue / w.Spend
			}
		} else {
			values[i] = w.Spend
		}
	}
	shares := NormaliseShares(values)
	out := make([]ShareSuggestion, len(ids))
	for i, id := range ids {
		out[i] = ShareSuggestion{CampaignID: id, SharePct: shares[i]}
	}
	return out, nil
}

// --- evaluation ---

// planChange is the budget a plan wants for one campaign today.
type planChange struct {
	target     Target
	base       float64  // the plan's daily budget
	live       float64  // what to write to the provider (base × dayparting multiplier)
	multiplier *float64 // set when a live dayparting schedule holds a multiplier
	current    float64  // the comparable current value (base or live)
	reason     string
	skip       string
}

// EvaluatePlan paces p at now, records today's set_budget actions (slot =
// the plan-local day, so at most one per campaign per day) and the day rows,
// and returns the pending action IDs and every action recorded for today.
func (s *Service) EvaluatePlan(ctx context.Context, p BudgetPlan) (pending []uuid.UUID, recorded []uuid.UUID, err error) {
	now := s.engine.now()
	ps, err := s.planState(ctx, p)
	if err != nil {
		return nil, nil, err
	}
	ps.now = now
	status := p.Status(ps.today)
	setToday := map[uuid.UUID]*float64{}
	if status == PlanActive || (status == PlanDraft && ps.todayIdx >= 0 && ps.todayIdx < len(ps.dates)) {
		schedules, err := s.st.enabledSchedules(ctx, &p.OrganizationID)
		if err != nil {
			return nil, nil, err
		}
		slot := localMidnight(ps.today, ps.loc)
		date := ps.today.Format(time.DateOnly)
		for i, c := range p.Campaigns {
			t := ps.targets[i]
			if t == nil || !t.manageable() {
				continue
			}
			ch, err := s.planChangeFor(ctx, ps, i, *t, schedules)
			if err != nil {
				return nil, nil, err
			}
			if ch == nil {
				// Already at the plan's budget.
				if t.DailyBudgetMicros != nil {
					setToday[c.CampaignID] = ptrF(round2(ps.todayAmounts[i]))
				}
				continue
			}
			st := StatusPending
			reason := ch.reason
			switch {
			case ch.skip != "":
				st, reason = StatusSkipped, ch.skip
			case p.DryRun:
				st = StatusDryRun
			}
			before := t.State().Map()
			after := map[string]any{"status": t.Status, "daily_budget": ch.live}
			if ch.multiplier != nil {
				after["base_daily_budget"] = ch.base
				after["multiplier"] = *ch.multiplier
			}
			key := fmt.Sprintf("plan:%s:%s:%s", p.ID, t.ID, date)
			if p.DryRun {
				// Switching to live later the same day still makes the change.
				key += ":dry"
			}
			sid := p.ID
			id, ok, err := s.st.insertAction(ctx, newAction{OrganizationID: p.OrganizationID, Source: SourcePlan, SourceID: &sid,
				SourceName: p.Name, Target: *t, ActionType: ActionSetBudget, Before: before, After: after, Status: st,
				Reason: reason, IdempotencyKey: &key, SlotStart: &slot})
			if err != nil {
				return pending, recorded, err
			}
			if ok {
				recorded = append(recorded, id)
				if st == StatusPending {
					pending = append(pending, id)
				}
			}
			if st == StatusPending {
				setToday[c.CampaignID] = ptrF(ch.base)
			} else if t.DailyBudgetMicros != nil {
				setToday[c.CampaignID] = ptrF(microsToUnits(*t.DailyBudgetMicros))
			}
		}
	}
	if err := s.savePlanDays(ctx, ps, setToday); err != nil {
		return pending, recorded, err
	}
	return pending, recorded, s.st.finishPlanRun(ctx, p.ID, now, NextPlanRun(now, ps.loc))
}

// planChangeFor decides campaign i's change today, or nil when its budget is
// already within 1% of the plan.
//
// Dayparting: when a live, enabled schedule currently holds a multiplier on
// the campaign (its memo has a captured base budget), the plan's amount is
// that schedule's new base: the live budget becomes base × multiplier and the
// executor rewrites the memo's base, so the schedule keeps applying its
// multiplier to the plan's budget and restores the plan's budget (not the
// old one) when the multiplier ends.
func (s *Service) planChangeFor(ctx context.Context, ps *planState, i int, t Target, schedules []Schedule) (*planChange, error) {
	base := round2(ps.todayAmounts[i])
	ch := &planChange{target: t, base: base, live: base}
	cur := ""
	if pre := currencyPrefix(ps.plan.Currency); pre != "" {
		cur = pre
	}
	ch.reason = fmt.Sprintf("budget plan: %s%s today (%s%s over %s–%s)", cur, money(base), cur, money(ps.plan.TotalBudget),
		ps.plan.StartDate.Format("Jan 2"), ps.plan.EndDate.Format("Jan 2"))
	if r := ps.reasons[i]; r != "" {
		ch.reason += "; " + r
	}
	if t.DailyBudgetMicros == nil {
		ch.skip = "no daily budget on this campaign (it uses a lifetime or ad set budget)"
		return ch, nil
	}
	if base <= 0 {
		ch.skip = "the plan's budget is used up; a daily budget cannot be set to zero"
		return ch, nil
	}
	current := microsToUnits(*t.DailyBudgetMicros)
	ch.current = current
	for _, sc := range schedules {
		if sc.DryRun || sc.Level != LevelCampaign || !slices.Contains(sc.TargetIDs, t.ID) {
			continue
		}
		m, err := s.st.memo(ctx, sc.ID, t.ID)
		if err != nil {
			return nil, err
		}
		if m.AppliedMultiplier != 1 && m.AppliedMultiplier != 0 && m.BaseBudgetMicros != nil {
			mult := m.AppliedMultiplier
			ch.multiplier = &mult
			ch.current = microsToUnits(*m.BaseBudgetMicros)
			ch.live = microsToUnits(roundMicros(float64(unitsToMicros(base)) * mult))
			ch.reason += fmt.Sprintf("; dayparting schedule %q applies %s on top", sc.Name, DescribeValue(mult))
			break
		}
	}
	if !NeedsBudgetChange(ch.current, base) {
		return nil, nil
	}
	return ch, nil
}

// savePlanDays writes every campaign's planned amount per day, spend through
// today, and today's budget.
func (s *Service) savePlanDays(ctx context.Context, ps *planState, setToday map[uuid.UUID]*float64) error {
	var rows []planDayRow
	for i, c := range ps.plan.Campaigns {
		for di, d := range ps.dates {
			r := planDayRow{CampaignID: c.CampaignID, Day: d, Planned: round2(ps.planned[i][di])}
			if !d.After(ps.today) {
				r.Spent = ptrF(round2(ps.spend[i][d]))
			}
			if d.Equal(ps.today) {
				r.BudgetSet = setToday[c.CampaignID]
			}
			rows = append(rows, r)
		}
	}
	return s.st.savePlanDays(ctx, ps.plan.ID, ps.today, rows)
}

// RunPlan evaluates a plan now (even if disabled) and executes live changes.
// Returns the plan's actions for today and how many were newly recorded.
func (s *Service) RunPlan(ctx context.Context, m organizations.Membership, id uuid.UUID) (RunResult, error) {
	p, err := s.st.getPlan(ctx, m.OrganizationID, id)
	if err != nil {
		return RunResult{}, notFound(err)
	}
	pending, recorded, err := s.EvaluatePlan(ctx, p)
	if err != nil {
		return RunResult{}, err
	}
	for _, aid := range pending {
		if _, err := s.exec.Execute(ctx, aid); err != nil {
			return RunResult{}, err
		}
	}
	slot := localMidnight(LocalDate(s.engine.now(), p.Location()), p.Location())
	all, _, _, err := s.st.listActions(ctx, m.OrganizationID, ActionFilter{Source: SourcePlan, SourceID: &id, Limit: 500})
	if err != nil {
		return RunResult{}, err
	}
	res := RunResult{Recorded: len(recorded), Actions: []Action{}}
	for _, a := range all {
		if a.SlotStart != nil && a.SlotStart.Equal(slot) {
			res.Actions = append(res.Actions, a)
		}
	}
	s.audit(ctx, m, "budget_plan.run", "budget_plan", id, map[string]any{"recorded": len(recorded), "executed": len(pending)})
	return res, nil
}
