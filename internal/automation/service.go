package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	dbstore "github.com/iamv1n/adwise/internal/store"
)

// Service is the API side: CRUD, previews, the actions log, reverts and
// "run now". The worker uses the same engine and executor through Worker.
type Service struct {
	db     *database.DB
	st     *store
	engine *Engine
	exec   *Executor
	log    *slog.Logger
}

// NewService builds the service. mut performs provider writes (nil disables
// execution: every live action then fails with a clear error).
func NewService(db *database.DB, mut Mutator) *Service {
	st := &store{pool: db.Pool}
	return &Service{db: db, st: st, engine: newEngine(st), exec: newExecutor(st, mut),
		log: slog.Default().With("component", "automation")}
}

func invalid(field, reason string) *httpx.Error {
	e := httpx.NewError(http.StatusUnprocessableEntity, "validation_failed", field+": "+reason)
	e.Fields = map[string]string{field: reason}
	return e
}

func notFound(err error) error {
	if errors.Is(err, errNotFound) {
		return httpx.ErrNotFound
	}
	return err
}

// --- views ---

// TargetView is a target in API responses.
type TargetView struct {
	ID          uuid.UUID `json:"id"`
	Level       string    `json:"level"`
	Name        string    `json:"name"`
	AccountID   uuid.UUID `json:"account_id"`
	AccountName string    `json:"account_name"`
	Provider    string    `json:"provider"`
	Currency    string    `json:"currency"`
	Timezone    string    `json:"timezone"`
	Status      string    `json:"status"`
	DailyBudget *float64  `json:"daily_budget"`
}

func viewTarget(t Target) TargetView {
	v := TargetView{ID: t.ID, Level: t.Level, Name: t.Name, AccountID: t.AccountID, AccountName: t.AccountName,
		Provider: t.Provider, Currency: t.Currency, Timezone: t.Timezone, Status: t.Status}
	if t.DailyBudgetMicros != nil {
		v.DailyBudget = ptrF(microsToUnits(*t.DailyBudgetMicros))
	}
	return v
}

// NextChange summarises a schedule's next transition.
type NextChange struct {
	At      time.Time `json:"at"`
	Summary string    `json:"summary"`
}

// ScheduleView is a schedule with its targets and status.
type ScheduleView struct {
	Schedule
	Targets      []TargetView `json:"targets"`
	ChangesTotal int          `json:"changes_total"`
	// ValueNow is the grid value in effect now (for the first target's clock).
	ValueNow   *float64    `json:"value_now"`
	NextChange *NextChange `json:"next_change"`
	// Pending counts changes the schedule wants right now but has not made
	// (always the case in dry run).
	PendingNow int `json:"pending_now"`
}

func (s *Service) scheduleView(ctx context.Context, sc Schedule, changes int) (ScheduleView, error) {
	v := ScheduleView{Schedule: sc, Targets: []TargetView{}, ChangesTotal: changes}
	targets, err := s.st.targets(ctx, sc.OrganizationID, sc.Level, sc.TargetIDs)
	if err != nil {
		return v, err
	}
	memos := map[uuid.UUID]ScheduleMemo{}
	for _, t := range targets {
		v.Targets = append(v.Targets, viewTarget(t))
		if memos[t.ID], err = s.st.memo(ctx, sc.ID, t.ID); err != nil {
			return v, err
		}
	}
	now := s.engine.now()
	if len(targets) > 0 {
		loc, _ := scheduleLocation(sc, targets[0])
		v.ValueNow = ptrF(sc.Grid.ValueAt(now, loc))
	}
	changes48, _ := simulateSchedule(sc, targets, memos, now, 48)
	for _, c := range changes48 {
		if c.At.Equal(now) {
			v.PendingNow++
		}
	}
	v.NextChange = nextChange(changes48, now)
	return v, nil
}

// nextChange groups the first future transition's changes into a sentence
// such as "pauses 3 campaigns".
func nextChange(changes []PlannedChange, now time.Time) *NextChange {
	var at time.Time
	counts := map[string]int{}
	var order []string
	for _, c := range changes {
		if !c.At.After(now) {
			continue
		}
		if at.IsZero() {
			at = c.At
		}
		if !c.At.Equal(at) {
			break
		}
		label := c.Type
		if c.Type == ActionSetBudget && c.After.Multiplier != nil {
			label = "budget:" + DescribeValue(*c.After.Multiplier)
		}
		if counts[label] == 0 {
			order = append(order, label)
		}
		counts[label]++
	}
	if at.IsZero() {
		return nil
	}
	parts := make([]string, 0, len(order))
	for _, l := range order {
		n := counts[l]
		noun := plural(n, "target")
		switch {
		case l == ActionPause:
			parts = append(parts, fmt.Sprintf("pauses %d %s", n, noun))
		case l == ActionActivate:
			parts = append(parts, fmt.Sprintf("activates %d %s", n, noun))
		case strings.HasPrefix(l, "budget:on"):
			parts = append(parts, fmt.Sprintf("restores %d %s", n, plural(n, "budget")))
		default:
			parts = append(parts, fmt.Sprintf("sets %s on %d %s", strings.TrimPrefix(l, "budget:"), n, noun))
		}
	}
	return &NextChange{At: at, Summary: strings.Join(parts, ", ")}
}

func plural(n int, s string) string {
	if n == 1 {
		return s
	}
	return s + "s"
}

// --- schedules ---

// ScheduleInput is the create/update body. On update, nil fields are unchanged.
type ScheduleInput struct {
	Name      *string      `json:"name"`
	Level     *string      `json:"level"`
	TargetIDs *[]uuid.UUID `json:"target_ids"`
	// Timezone: "" or null means each target's account timezone.
	Timezone *string `json:"timezone"`
	Grid     *Grid   `json:"grid"`
	Enabled  *bool   `json:"enabled"`
	DryRun   *bool   `json:"dry_run"`
}

const maxTargets = 500

func (s *Service) applyScheduleInput(ctx context.Context, sc *Schedule, in ScheduleInput, create bool) error {
	if in.Name != nil {
		sc.Name = strings.TrimSpace(*in.Name)
	}
	if sc.Name == "" || len(sc.Name) > 200 {
		return invalid("name", "must be 1–200 characters")
	}
	if in.Level != nil {
		sc.Level = *in.Level
	}
	if sc.Level != LevelCampaign && sc.Level != LevelAdGroup {
		return invalid("level", "must be campaign or ad_group")
	}
	if in.TargetIDs != nil {
		sc.TargetIDs = uniqueIDs(*in.TargetIDs)
	}
	if len(sc.TargetIDs) > maxTargets {
		return invalid("target_ids", fmt.Sprintf("at most %d targets", maxTargets))
	}
	if in.TargetIDs != nil || in.Level != nil || create {
		ts, err := s.st.targets(ctx, sc.OrganizationID, sc.Level, sc.TargetIDs)
		if err != nil {
			return err
		}
		if len(ts) != len(sc.TargetIDs) {
			return invalid("target_ids", "contains IDs that are not "+levelNoun(sc.Level)+"s in this organization")
		}
	}
	if in.Timezone != nil {
		if *in.Timezone == "" {
			sc.Timezone = nil
		} else {
			if _, err := LoadLocation(*in.Timezone); err != nil {
				return invalid("timezone", err.Error())
			}
			tz := *in.Timezone
			sc.Timezone = &tz
		}
	}
	if in.Grid != nil {
		sc.Grid = *in.Grid
	} else if create {
		sc.Grid = FullGrid()
	}
	if err := sc.Grid.Validate(); err != nil {
		return invalid("grid", err.Error())
	}
	if in.Enabled != nil {
		sc.Enabled = *in.Enabled
	}
	if in.DryRun != nil {
		sc.DryRun = *in.DryRun
	} else if create {
		sc.DryRun = true
	}
	if sc.Enabled && len(sc.TargetIDs) == 0 {
		return invalid("target_ids", "choose at least one "+levelNoun(sc.Level)+" before enabling")
	}
	return nil
}

func uniqueIDs(ids []uuid.UUID) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(ids))
	seen := map[uuid.UUID]bool{}
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func (s *Service) ListSchedules(ctx context.Context, orgID uuid.UUID) ([]ScheduleView, error) {
	list, err := s.st.listSchedules(ctx, orgID)
	if err != nil {
		return nil, err
	}
	counts, err := s.st.scheduleChanges(ctx, orgID)
	if err != nil {
		return nil, err
	}
	out := make([]ScheduleView, 0, len(list))
	for _, sc := range list {
		v, err := s.scheduleView(ctx, sc, counts[sc.ID])
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func (s *Service) GetSchedule(ctx context.Context, orgID, id uuid.UUID) (ScheduleView, error) {
	sc, err := s.st.getSchedule(ctx, orgID, id)
	if err != nil {
		return ScheduleView{}, notFound(err)
	}
	counts, err := s.st.scheduleChanges(ctx, orgID)
	if err != nil {
		return ScheduleView{}, err
	}
	return s.scheduleView(ctx, sc, counts[id])
}

func (s *Service) CreateSchedule(ctx context.Context, m organizations.Membership, in ScheduleInput) (ScheduleView, error) {
	sc := Schedule{OrganizationID: m.OrganizationID, Level: LevelCampaign, CreatedBy: &m.UserID}
	if err := s.applyScheduleInput(ctx, &sc, in, true); err != nil {
		return ScheduleView{}, err
	}
	sc, err := s.st.insertSchedule(ctx, sc)
	if err != nil {
		return ScheduleView{}, err
	}
	s.audit(ctx, m, "dayparting_schedule.created", "dayparting_schedule", sc.ID, map[string]any{"schedule": sc})
	return s.scheduleView(ctx, sc, 0)
}

func (s *Service) UpdateSchedule(ctx context.Context, m organizations.Membership, id uuid.UUID, in ScheduleInput) (ScheduleView, error) {
	sc, err := s.st.getSchedule(ctx, m.OrganizationID, id)
	if err != nil {
		return ScheduleView{}, notFound(err)
	}
	before := sc
	if err := s.applyScheduleInput(ctx, &sc, in, false); err != nil {
		return ScheduleView{}, err
	}
	if sc, err = s.st.updateSchedule(ctx, sc); err != nil {
		return ScheduleView{}, err
	}
	s.audit(ctx, m, "dayparting_schedule.updated", "dayparting_schedule", sc.ID, map[string]any{"before": before, "after": sc})
	return s.GetSchedule(ctx, m.OrganizationID, id)
}

func (s *Service) DeleteSchedule(ctx context.Context, m organizations.Membership, id uuid.UUID) error {
	if err := s.st.deleteSchedule(ctx, m.OrganizationID, id); err != nil {
		return notFound(err)
	}
	s.audit(ctx, m, "dayparting_schedule.deleted", "dayparting_schedule", id, nil)
	return nil
}

// SchedulePreview is what a schedule does now and over the next 24 hours.
type SchedulePreview struct {
	GeneratedAt time.Time `json:"generated_at"`
	Affected    struct {
		Accounts int `json:"accounts"`
		Targets  int `json:"targets"`
	} `json:"affected"`
	Targets  []PreviewTargetView           `json:"targets"`
	Now      []PlannedChange               `json:"now"`
	Next24h  []PlannedChange               `json:"next_24h"`
	Timeline map[uuid.UUID][]SimulatedHour `json:"timeline"`
	Warnings []string                      `json:"warnings"`
}

// PreviewTargetView is a target with the schedule's value for it now.
type PreviewTargetView struct {
	TargetView
	ValueNow     float64 `json:"value_now"`
	TimezoneUsed string  `json:"timezone_used"`
}

// PreviewSchedule evaluates an unsaved (id == nil) or saved schedule, with
// in applied on top, without recording or executing anything.
func (s *Service) PreviewSchedule(ctx context.Context, orgID uuid.UUID, id *uuid.UUID, in ScheduleInput) (SchedulePreview, error) {
	sc := Schedule{OrganizationID: orgID, Level: LevelCampaign}
	create := true
	if id != nil {
		var err error
		if sc, err = s.st.getSchedule(ctx, orgID, *id); err != nil {
			return SchedulePreview{}, notFound(err)
		}
		create = false
	} else {
		sc.ID = uuid.Nil
	}
	// Preview never enables anything; validate the rest.
	in.Enabled = nil
	sc.Enabled = false
	if in.Name == nil && sc.Name == "" {
		n := "Preview"
		in.Name = &n
	}
	if err := s.applyScheduleInput(ctx, &sc, in, create); err != nil {
		return SchedulePreview{}, err
	}
	targets, err := s.st.targets(ctx, orgID, sc.Level, sc.TargetIDs)
	if err != nil {
		return SchedulePreview{}, err
	}
	now := s.engine.now()
	memos := map[uuid.UUID]ScheduleMemo{}
	out := SchedulePreview{GeneratedAt: now, Now: []PlannedChange{}, Next24h: []PlannedChange{}, Warnings: []string{}, Targets: []PreviewTargetView{}}
	accounts := map[uuid.UUID]bool{}
	noBudget := 0
	for _, t := range targets {
		if sc.ID != uuid.Nil {
			if memos[t.ID], err = s.st.memo(ctx, sc.ID, t.ID); err != nil {
				return out, err
			}
		}
		loc, tz := scheduleLocation(sc, t)
		out.Targets = append(out.Targets, PreviewTargetView{TargetView: viewTarget(t), ValueNow: sc.Grid.ValueAt(now, loc), TimezoneUsed: tz})
		accounts[t.AccountID] = true
		if t.DailyBudgetMicros == nil {
			noBudget++
		}
		if !t.manageable() {
			out.Warnings = append(out.Warnings, fmt.Sprintf("%q is %s and will not be changed.", t.Name, t.Status))
		}
	}
	out.Affected.Accounts, out.Affected.Targets = len(accounts), len(targets)
	changes, timeline := simulateSchedule(sc, targets, memos, now, 24)
	out.Timeline = timeline
	for _, c := range changes {
		if c.At.Equal(now) {
			out.Now = append(out.Now, c)
		} else {
			out.Next24h = append(out.Next24h, c)
		}
	}
	if usesMultiplier(sc.Grid) && noBudget > 0 {
		out.Warnings = append(out.Warnings, fmt.Sprintf("%d %s no daily budget, so budget multipliers skip them (on/off still applies).",
			noBudget, map[bool]string{true: "target has", false: "targets have"}[noBudget == 1]))
	}
	for _, t := range targets {
		if t.Status == "paused" {
			if m := memos[t.ID]; !m.PausedBySchedule {
				out.Warnings = append(out.Warnings, fmt.Sprintf("%q is paused by someone else; the schedule will leave it paused.", t.Name))
			}
		}
	}
	return out, nil
}

func usesMultiplier(g Grid) bool {
	for d := range g {
		for _, v := range g[d] {
			if v != 0 && v != 1 {
				return true
			}
		}
	}
	return false
}

// RunResult reports a manual evaluation.
type RunResult struct {
	Recorded int      `json:"recorded"`
	Actions  []Action `json:"actions"`
}

// RunSchedule evaluates the current hour now and executes live changes
// synchronously. Dry-run schedules only record.
func (s *Service) RunSchedule(ctx context.Context, m organizations.Membership, id uuid.UUID) (RunResult, error) {
	sc, err := s.st.getSchedule(ctx, m.OrganizationID, id)
	if err != nil {
		return RunResult{}, notFound(err)
	}
	pending, recorded, err := s.engine.EvaluateSchedule(ctx, sc)
	if err != nil {
		return RunResult{}, err
	}
	res := RunResult{Recorded: recorded, Actions: []Action{}}
	for _, aid := range pending {
		a, err := s.exec.Execute(ctx, aid)
		if err != nil {
			return res, err
		}
		res.Actions = append(res.Actions, a)
	}
	s.audit(ctx, m, "dayparting_schedule.run", "dayparting_schedule", id, map[string]any{"recorded": recorded, "executed": len(pending)})
	return res, nil
}

// --- rules ---

// RuleInput is the create/update body. On update, nil fields are unchanged.
type RuleInput struct {
	Name                 *string      `json:"name"`
	Level                *string      `json:"level"`
	ScopeType            *string      `json:"scope_type"`
	ScopeIDs             *[]uuid.UUID `json:"scope_ids"`
	Conditions           *[]Condition `json:"conditions"`
	LookbackDays         *int         `json:"lookback_days"`
	Action               *RuleAction  `json:"action"`
	CheckIntervalMinutes *int         `json:"check_interval_minutes"`
	CooldownMinutes      *int         `json:"cooldown_minutes"`
	MaxChangesPerRun     *int         `json:"max_changes_per_run"`
	Enabled              *bool        `json:"enabled"`
	DryRun               *bool        `json:"dry_run"`
}

// RuleView is a rule with a plain-language description.
type RuleView struct {
	Rule
	Description string `json:"description"`
}

func (s *Service) applyRuleInput(ctx context.Context, r *Rule, in RuleInput, create bool) error {
	if in.Name != nil {
		r.Name = strings.TrimSpace(*in.Name)
	}
	if r.Name == "" || len(r.Name) > 200 {
		return invalid("name", "must be 1–200 characters")
	}
	if in.Level != nil {
		r.Level = *in.Level
	}
	if r.Level == "" {
		r.Level = LevelCampaign
	}
	if !slices.Contains(RuleLevels, r.Level) {
		return invalid("level", "must be campaign, ad_group or ad")
	}
	if in.ScopeType != nil {
		r.ScopeType = *in.ScopeType
	}
	if in.ScopeIDs != nil {
		r.ScopeIDs = uniqueIDs(*in.ScopeIDs)
	}
	switch r.ScopeType {
	case ScopeOrg:
		r.ScopeIDs = []uuid.UUID{}
	case ScopeAccount, ScopeCampaigns:
		if len(r.ScopeIDs) == 0 {
			return invalid("scope_ids", "choose at least one "+map[string]string{ScopeAccount: "account", ScopeCampaigns: "campaign"}[r.ScopeType])
		}
		if len(r.ScopeIDs) > maxTargets {
			return invalid("scope_ids", fmt.Sprintf("at most %d", maxTargets))
		}
		table := "ad_accounts"
		if r.ScopeType == ScopeCampaigns {
			table = "campaigns"
		}
		var n int
		if err := s.db.Pool.QueryRow(ctx, `SELECT count(*) FROM `+table+` WHERE organization_id = $1 AND id = ANY($2)`,
			r.OrganizationID, r.ScopeIDs).Scan(&n); err != nil {
			return err
		}
		if n != len(r.ScopeIDs) {
			return invalid("scope_ids", "contains IDs that are not in this organization")
		}
	default:
		return invalid("scope_type", "must be org, account or campaigns")
	}
	if in.Conditions != nil {
		r.Conditions = *in.Conditions
	}
	if len(r.Conditions) == 0 || len(r.Conditions) > 6 {
		return invalid("conditions", "between 1 and 6 conditions")
	}
	for i, c := range r.Conditions {
		if err := ValidateCondition(c); err != nil {
			return invalid(fmt.Sprintf("conditions[%d]", i), err.Error())
		}
	}
	if in.LookbackDays != nil {
		r.LookbackDays = *in.LookbackDays
	}
	if r.LookbackDays < 1 || r.LookbackDays > 90 {
		return invalid("lookback_days", "between 1 and 90")
	}
	if in.Action != nil {
		r.Action = *in.Action
	}
	if err := r.Action.ValidateFor(r.Level); err != nil {
		return invalid("action", err.Error())
	}
	if in.CheckIntervalMinutes != nil {
		r.CheckIntervalMinutes = *in.CheckIntervalMinutes
	}
	if r.CheckIntervalMinutes < 15 || r.CheckIntervalMinutes > 10080 {
		return invalid("check_interval_minutes", "between 15 and 10080")
	}
	if in.CooldownMinutes != nil {
		r.CooldownMinutes = *in.CooldownMinutes
	}
	if r.CooldownMinutes < 0 || r.CooldownMinutes > 43200 {
		return invalid("cooldown_minutes", "between 0 and 43200")
	}
	if in.MaxChangesPerRun != nil {
		r.MaxChangesPerRun = *in.MaxChangesPerRun
	}
	if r.MaxChangesPerRun < 1 || r.MaxChangesPerRun > 500 {
		return invalid("max_changes_per_run", "between 1 and 500")
	}
	wasEnabled := r.Enabled
	if in.Enabled != nil {
		r.Enabled = *in.Enabled
	}
	if in.DryRun != nil {
		r.DryRun = *in.DryRun
	} else if create {
		r.DryRun = true
	}
	// A newly enabled rule (or a changed interval) runs on the next tick.
	if r.Enabled && (!wasEnabled || in.CheckIntervalMinutes != nil) {
		r.NextRunAt = nil
	}
	return nil
}

func (s *Service) ruleViews(ctx context.Context, orgID uuid.UUID, rules []Rule) ([]RuleView, error) {
	stats, err := s.st.ruleStats(ctx, orgID, s.engine.now().Add(-7*24*time.Hour))
	if err != nil {
		return nil, err
	}
	currency := ""
	_ = s.db.Pool.QueryRow(ctx, `SELECT currency FROM ad_accounts WHERE organization_id = $1 GROUP BY currency ORDER BY count(*) DESC LIMIT 1`, orgID).Scan(&currency)
	out := make([]RuleView, 0, len(rules))
	for _, r := range rules {
		st := stats[r.ID]
		r.ChangesTotal, r.Changes7d = st[0], st[1]
		out = append(out, RuleView{Rule: r, Description: DescribeRule(r, currency)})
	}
	return out, nil
}

func (s *Service) ListRules(ctx context.Context, orgID uuid.UUID) ([]RuleView, error) {
	rules, err := s.st.listRules(ctx, orgID)
	if err != nil {
		return nil, err
	}
	return s.ruleViews(ctx, orgID, rules)
}

func (s *Service) GetRule(ctx context.Context, orgID, id uuid.UUID) (RuleView, error) {
	r, err := s.st.getRule(ctx, orgID, id)
	if err != nil {
		return RuleView{}, notFound(err)
	}
	v, err := s.ruleViews(ctx, orgID, []Rule{r})
	if err != nil {
		return RuleView{}, err
	}
	return v[0], nil
}

func (s *Service) CreateRule(ctx context.Context, m organizations.Membership, in RuleInput) (RuleView, error) {
	r := Rule{OrganizationID: m.OrganizationID, Level: LevelCampaign, ScopeType: ScopeOrg, LookbackDays: 3, CheckIntervalMinutes: 60,
		CooldownMinutes: 1440, MaxChangesPerRun: 10, CreatedBy: &m.UserID}
	if err := s.applyRuleInput(ctx, &r, in, true); err != nil {
		return RuleView{}, err
	}
	r, err := s.st.insertRule(ctx, r)
	if err != nil {
		return RuleView{}, err
	}
	s.audit(ctx, m, "automation_rule.created", "automation_rule", r.ID, map[string]any{"rule": r})
	return s.GetRule(ctx, m.OrganizationID, r.ID)
}

func (s *Service) UpdateRule(ctx context.Context, m organizations.Membership, id uuid.UUID, in RuleInput) (RuleView, error) {
	r, err := s.st.getRule(ctx, m.OrganizationID, id)
	if err != nil {
		return RuleView{}, notFound(err)
	}
	before := r
	if err := s.applyRuleInput(ctx, &r, in, false); err != nil {
		return RuleView{}, err
	}
	if _, err := s.st.updateRule(ctx, r); err != nil {
		return RuleView{}, err
	}
	s.audit(ctx, m, "automation_rule.updated", "automation_rule", id, map[string]any{"before": before, "after": r})
	return s.GetRule(ctx, m.OrganizationID, id)
}

func (s *Service) DeleteRule(ctx context.Context, m organizations.Membership, id uuid.UUID) error {
	if err := s.st.deleteRule(ctx, m.OrganizationID, id); err != nil {
		return notFound(err)
	}
	s.audit(ctx, m, "automation_rule.deleted", "automation_rule", id, nil)
	return nil
}

// RulePreview is what a rule matches and would change right now.
type RulePreview struct {
	GeneratedAt   time.Time           `json:"generated_at"`
	Description   string              `json:"description"`
	Evaluated     int                 `json:"evaluated"`
	Matched       int                 `json:"matched"`
	ChecksNext24h int                 `json:"checks_next_24h"`
	Changes       []PlannedChange     `json:"changes"`
	Targets       []RulePreviewTarget `json:"targets"`
	Warnings      []string            `json:"warnings"`
}

// RulePreviewTarget is one campaign's evaluation.
type RulePreviewTarget struct {
	TargetView
	Window     Window            `json:"window"`
	Previous   *Window           `json:"previous,omitempty"`
	Conditions []ConditionResult `json:"conditions"`
	Matched    bool              `json:"matched"`
}

func (s *Service) PreviewRule(ctx context.Context, orgID uuid.UUID, id *uuid.UUID, in RuleInput) (RulePreview, error) {
	r := Rule{OrganizationID: orgID, Level: LevelCampaign, ScopeType: ScopeOrg, LookbackDays: 3, CheckIntervalMinutes: 60, CooldownMinutes: 1440, MaxChangesPerRun: 10}
	create := true
	if id != nil {
		var err error
		if r, err = s.st.getRule(ctx, orgID, *id); err != nil {
			return RulePreview{}, notFound(err)
		}
		create = false
	}
	in.Enabled = nil
	if in.Name == nil && r.Name == "" {
		n := "Preview"
		in.Name = &n
	}
	if err := s.applyRuleInput(ctx, &r, in, create); err != nil {
		return RulePreview{}, err
	}
	now := s.engine.now()
	targets, plan, err := s.engine.planRule(ctx, r, now)
	if err != nil {
		return RulePreview{}, err
	}
	out := RulePreview{GeneratedAt: now, Evaluated: len(targets), ChecksNext24h: 24 * 60 / r.CheckIntervalMinutes,
		Changes: []PlannedChange{}, Targets: []RulePreviewTarget{}, Warnings: []string{}}
	currency := ""
	for _, t := range targets {
		if currency == "" {
			currency = t.Currency
		}
		if t.Matched {
			out.Matched++
		}
		out.Targets = append(out.Targets, RulePreviewTarget{TargetView: viewTarget(t.Target), Window: t.Window, Previous: t.Previous, Conditions: t.Conditions, Matched: t.Matched})
	}
	out.Description = DescribeRule(r, currency)
	out.Changes = append(out.Changes, plan...)
	if len(targets) == 0 {
		out.Warnings = append(out.Warnings, fmt.Sprintf("No active or paused %ss on sync-enabled accounts are in scope.", levelNoun(r.Level)))
	}
	if HasTrend(r.Conditions) {
		out.Warnings = append(out.Warnings, fmt.Sprintf("Trend conditions compare the last %d days with the %d days before; %ss without data in the earlier window never match them.",
			r.LookbackDays, r.LookbackDays, levelNoun(r.Level)))
	}
	for _, c := range r.Conditions {
		if c.Metric == "frequency" {
			out.Warnings = append(out.Warnings, fmt.Sprintf("Frequency needs reach data and is impressions ÷ daily reach summed over the window (the average daily frequency); %ss without reach never match a frequency condition.", levelNoun(r.Level)))
			break
		}
	}
	if r.Action.ChangesBudget() {
		out.Warnings = append(out.Warnings, fmt.Sprintf("Budget changes apply to %ss with a daily budget; others are skipped.", levelNoun(r.Level)))
	}
	return out, nil
}

// RunRule evaluates a rule now (even if disabled) and executes live changes.
func (s *Service) RunRule(ctx context.Context, m organizations.Membership, id uuid.UUID) (RunResult, error) {
	r, err := s.st.getRule(ctx, m.OrganizationID, id)
	if err != nil {
		return RunResult{}, notFound(err)
	}
	pending, err := s.engine.EvaluateRule(ctx, r)
	if err != nil {
		return RunResult{}, err
	}
	res := RunResult{Actions: []Action{}}
	for _, aid := range pending {
		a, err := s.exec.Execute(ctx, aid)
		if err != nil {
			return res, err
		}
		res.Actions = append(res.Actions, a)
	}
	after, _ := s.st.getRule(ctx, m.OrganizationID, id)
	res.Recorded = after.LastRunChanges
	s.audit(ctx, m, "automation_rule.run", "automation_rule", id, map[string]any{"recorded": res.Recorded, "executed": len(pending)})
	return res, nil
}

// --- actions ---

func (s *Service) ListActions(ctx context.Context, orgID uuid.UUID, f ActionFilter) ([]Action, int, map[string]int, error) {
	if err := s.ImportManual(ctx, orgID); err != nil {
		s.log.ErrorContext(ctx, "import manual changes", "err", err)
	}
	return s.st.listActions(ctx, orgID, f)
}

// ImportManual copies person-made entity changes from the audit log into
// the actions log (idempotent: keyed by audit entry ID).
func (s *Service) ImportManual(ctx context.Context, orgID uuid.UUID) error {
	rows, err := s.st.unimportedAudit(ctx, orgID, 500)
	if err != nil {
		return err
	}
	for _, r := range rows {
		a, ok := manualFromAudit(orgID, r)
		if !ok {
			// Still mark it imported so it is not re-read forever.
			a.ActionType, a.Status = ActionUpdate, StatusSucceeded
		}
		if a.Target.AccountID != uuid.Nil {
			if name, provider, currency, _, err := s.st.accountInfo(ctx, orgID, a.Target.AccountID); err == nil {
				a.Target.AccountName, a.Target.Provider, a.Target.Currency = name, provider, currency
			}
		}
		if _, _, err := s.st.insertAction(ctx, a); err != nil {
			return err
		}
	}
	return nil
}

var trackedFields = []string{"status", "daily_budget", "lifetime_budget", "name", "spend_cap", "bid_amount", "end_time"}

// manualFromAudit converts a manage audit entry (metadata before/after in the
// entities list shape) into an action row.
func manualFromAudit(orgID uuid.UUID, r auditRow) (newAction, bool) {
	key := "audit:" + r.ID.String()
	actor := r.ActorID
	created := r.CreatedAt
	a := newAction{OrganizationID: orgID, Source: SourceManual, ActorUserID: &actor, IdempotencyKey: &key,
		CreatedAt: &created, ExecutedAt: &created, Status: StatusSucceeded, Before: map[string]any{}, After: map[string]any{}}
	id, err := uuid.Parse(r.EntityID)
	if err != nil {
		return a, false
	}
	level := r.EntityType
	a.Target = Target{ID: id, Level: level}
	var meta struct {
		Before map[string]any `json:"before"`
		After  map[string]any `json:"after"`
	}
	if err := json.Unmarshal(r.Metadata, &meta); err != nil || meta.After == nil {
		return a, false
	}
	if n, ok := meta.After["name"].(string); ok {
		a.Target.Name = n
	}
	if acct, ok := meta.After["account_id"].(string); ok {
		a.Target.AccountID, _ = uuid.Parse(acct)
	}
	for _, f := range trackedFields {
		b, aft := meta.Before[f], meta.After[f]
		if fmt.Sprint(b) != fmt.Sprint(aft) {
			a.Before[f], a.After[f] = b, aft
		}
	}
	switch {
	case strings.HasSuffix(r.Action, ".archived") || a.After["status"] == "archived":
		a.ActionType = ActionArchive
	case a.After["status"] == "paused":
		a.ActionType = ActionPause
	case a.After["status"] == "active":
		a.ActionType = ActionActivate
	case a.After["daily_budget"] != nil && len(a.After) == 1:
		a.ActionType = ActionSetBudget
	default:
		a.ActionType = ActionUpdate
	}
	return a, true
}

// Revert undoes a succeeded pause/activate/budget change by recording and
// executing the opposite change, live and synchronously.
func (s *Service) Revert(ctx context.Context, m organizations.Membership, id uuid.UUID) (Action, error) {
	orig, err := s.st.getAction(ctx, m.OrganizationID, id)
	if err != nil {
		return Action{}, notFound(err)
	}
	if !orig.Revertible {
		return Action{}, httpx.NewError(http.StatusUnprocessableEntity, "unsupported", "this action cannot be reverted")
	}
	t, err := s.st.target(ctx, m.OrganizationID, orig.EntityType, orig.EntityID)
	if err != nil {
		return Action{}, notFound(err)
	}
	before := t.State()
	var after EntityState
	typ := ActionSetBudget
	switch orig.ActionType {
	case ActionPause, ActionActivate:
		st, _ := orig.Before["status"].(string)
		after = EntityState{Status: st}
		typ = ActionPause
		if st == "active" {
			typ = ActionActivate
		}
	case ActionSetBudget:
		b := orig.Before["daily_budget"].(float64)
		after = EntityState{Status: t.Status, DailyBudget: &b}
	}
	key := "revert:" + orig.ID.String()
	sid := orig.ID
	uid := m.UserID
	nid, ok, err := s.st.insertAction(ctx, newAction{OrganizationID: m.OrganizationID, Source: SourceRevert, SourceID: &sid,
		SourceName: "Revert of " + orig.ActionType + " by " + sourceLabel(orig), ActorUserID: &uid, Target: t,
		ActionType: typ, Before: before.Map(), After: after.Map(), Status: StatusPending,
		Reason: "reverting the change from " + orig.CreatedAt.Format(time.RFC3339), IdempotencyKey: &key})
	if err != nil {
		return Action{}, err
	}
	if !ok {
		return Action{}, httpx.NewError(http.StatusConflict, "already_reverted", "this action was already reverted")
	}
	res, err := s.exec.Execute(ctx, nid)
	if err != nil {
		return Action{}, err
	}
	if res.Status == StatusSucceeded || res.Status == StatusSkipped {
		if err := s.st.markReverted(ctx, orig.ID, nid); err != nil {
			return res, err
		}
	}
	s.audit(ctx, m, "action.reverted", res.EntityType, res.EntityID, map[string]any{"action_id": orig.ID, "revert_action_id": nid, "status": res.Status})
	return res, nil
}

func sourceLabel(a Action) string {
	switch a.Source {
	case SourceManual:
		if a.ActorName != "" {
			return a.ActorName
		}
		return "a person"
	case SourceSchedule:
		return "schedule " + a.SourceName
	case SourceRule:
		return "rule " + a.SourceName
	case SourcePlan:
		return "budget plan " + a.SourceName
	}
	return a.Source
}

func (s *Service) audit(ctx context.Context, m organizations.Membership, action, entityType string, id uuid.UUID, meta map[string]any) {
	orgID, uid := m.OrganizationID, m.UserID
	err := s.db.InTx(ctx, func(q *dbstore.Queries) error {
		return audit.Record(ctx, q, audit.Entry{OrganizationID: &orgID, ActorUserID: &uid, Action: action,
			EntityType: entityType, EntityID: id.String(), Metadata: meta})
	})
	if err != nil {
		s.log.ErrorContext(ctx, "audit", "action", action, "err", err)
	}
}

// ScheduleStatuses reports whether a list contains v (used by handlers).
func validStatus(v string) bool {
	return slices.Contains([]string{StatusDryRun, StatusPending, StatusRunning, StatusSucceeded, StatusFailed, StatusSkipped}, v)
}
