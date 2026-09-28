package recommendations

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/automation"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	dbstore "github.com/iamv1n/adwise/internal/store"
)

// Service is the API and worker side of the inbox, fatigue and targets.
type Service struct {
	db   *database.DB
	st   *store
	auto *automation.Service
	now  func() time.Time
	log  *slog.Logger
}

// NewService builds the service. auto records and executes accepted
// recommendations as manual actions.
func NewService(db *database.DB, auto *automation.Service) *Service {
	return &Service{db: db, st: &store{pool: db.Pool}, auto: auto, now: time.Now,
		log: slog.Default().With("component", "recommendations")}
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

// windowRanges returns the current window (the last `days` complete days in
// the account's timezone, ending yesterday) and the previous one.
func windowRanges(now time.Time, tz string, days int) (from, to, prevFrom, prevTo string) {
	loc, err := automation.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	l := now.In(loc)
	end := time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -1)
	from, to = end.AddDate(0, 0, -(days-1)).Format(time.DateOnly), end.Format(time.DateOnly)
	prevFrom, prevTo = automation.PreviousRange(from, to)
	return
}

// --- targets ---

// GetTargets returns the organization's targets; Currency defaults to the
// currency most of its accounts use.
func (s *Service) GetTargets(ctx context.Context, orgID uuid.UUID) (Targets, error) {
	t, err := s.st.targets(ctx, orgID)
	if err != nil {
		return t, err
	}
	if t.Currency == "" {
		if t.Currency, err = s.st.primaryCurrency(ctx, orgID); err != nil {
			return t, err
		}
	}
	return t, nil
}

// SetTargets replaces the targets. A nil target clears it.
func (s *Service) SetTargets(ctx context.Context, m organizations.Membership, in Targets) (Targets, error) {
	check := func(field string, v *float64, max float64) error {
		if v != nil && (math.IsNaN(*v) || *v <= 0 || *v > max) {
			return invalid(field, fmt.Sprintf("must be a positive number up to %g", max))
		}
		return nil
	}
	if err := check("target_cpa", in.TargetCPA, 1e9); err != nil {
		return Targets{}, err
	}
	if err := check("target_roas", in.TargetROAS, 1000); err != nil {
		return Targets{}, err
	}
	if in.Currency == "" {
		c, err := s.st.primaryCurrency(ctx, m.OrganizationID)
		if err != nil {
			return Targets{}, err
		}
		in.Currency = c
	}
	if len(in.Currency) > 3 {
		return Targets{}, invalid("currency", "must be an ISO 4217 code")
	}
	if in.TargetCPA != nil {
		in.TargetCPA = ptr(round(*in.TargetCPA, 2))
	}
	if in.TargetROAS != nil {
		in.TargetROAS = ptr(round(*in.TargetROAS, 3))
	}
	before, _ := s.st.targets(ctx, m.OrganizationID)
	if err := s.st.saveTargets(ctx, m.OrganizationID, m.UserID, in); err != nil {
		return Targets{}, err
	}
	s.audit(ctx, m, "organization.targets_updated", "organization", m.OrganizationID, map[string]any{"before": before, "after": in})
	return s.GetTargets(ctx, m.OrganizationID)
}

// --- creative fatigue ---

// AdFatigue is one ad's fatigue verdict.
type AdFatigue struct {
	AdID   uuid.UUID `json:"ad_id"`
	AdName string    `json:"ad_name"`
	Status string    `json:"status"`
	Fatigue
}

// CampaignFatigue evaluates every ad of a campaign with DefaultFatigue.
func (s *Service) CampaignFatigue(ctx context.Context, orgID, campaignID uuid.UUID) ([]AdFatigue, FatigueConfig, error) {
	cfg := DefaultFatigue
	var accountID uuid.UUID
	var tz string
	err := s.db.Pool.QueryRow(ctx, `SELECT a.id, a.timezone FROM campaigns c JOIN ad_accounts a ON a.id = c.account_id
		WHERE c.organization_id = $1 AND c.id = $2`, orgID, campaignID).Scan(&accountID, &tz)
	if err != nil {
		return nil, cfg, httpx.ErrNotFound
	}
	list, err := s.st.ads(ctx, orgID, accountID, &campaignID)
	if err != nil {
		return nil, cfg, err
	}
	res, err := s.fatigue(ctx, orgID, accountID, tz, list, cfg)
	if err != nil {
		return nil, cfg, err
	}
	out := make([]AdFatigue, 0, len(list))
	for i, e := range list {
		out = append(out, AdFatigue{AdID: e.ID, AdName: e.Name, Status: e.Status, Fatigue: res[i]})
	}
	return out, cfg, nil
}

// fatigue evaluates ads of one account; results are in list order.
func (s *Service) fatigue(ctx context.Context, orgID, accountID uuid.UUID, tz string, list []entity, cfg FatigueConfig) ([]Fatigue, error) {
	from, to, pf, pt := windowRanges(s.now(), tz, cfg.Days)
	ext := make([]string, len(list))
	for i, e := range list {
		ext[i] = e.ExternalID
	}
	cur, err := s.st.windows(ctx, orgID, accountID, "ad_daily", "ad_external_id", from, to, ext)
	if err != nil {
		return nil, err
	}
	prev, err := s.st.windows(ctx, orgID, accountID, "ad_daily", "ad_external_id", pf, pt, ext)
	if err != nil {
		return nil, err
	}
	out := make([]Fatigue, len(list))
	for i, e := range list {
		out[i] = DetectFatigue(cur[e.ExternalID], prev[e.ExternalID], from, to, pf, pt, cfg)
	}
	return out, nil
}

// --- generation ---

// GenerateResult summarises one organization's run.
type GenerateResult struct {
	Created   int `json:"created"`
	Refreshed int `json:"refreshed"`
	Expired   int `json:"expired"`
}

// GenerateAll runs Generate for every organization with sync-enabled accounts.
func (s *Service) GenerateAll(ctx context.Context) error {
	orgs, err := s.st.orgsToScan(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, org := range orgs {
		res, err := s.Generate(ctx, org)
		if err != nil {
			s.log.ErrorContext(ctx, "generate recommendations", "org", org, "err", err)
			errs = append(errs, err)
			continue
		}
		if res.Created+res.Expired > 0 {
			s.log.InfoContext(ctx, "recommendations generated", "org", org, "created", res.Created, "refreshed", res.Refreshed, "expired", res.Expired)
		}
	}
	return errors.Join(errs...)
}

// Generate creates or refreshes the organization's open recommendations and
// expires the ones that no longer hold.
func (s *Service) Generate(ctx context.Context, orgID uuid.UUID) (GenerateResult, error) {
	var res GenerateResult
	now := s.now()
	runStart := now
	targets, err := s.st.targets(ctx, orgID)
	if err != nil {
		return res, err
	}
	accounts, err := s.st.accounts(ctx, orgID)
	if err != nil {
		return res, err
	}
	var recs []Recommendation
	for _, a := range accounts {
		rs, err := s.accountSuggestions(ctx, orgID, a, targets, now)
		if err != nil {
			return res, fmt.Errorf("account %s: %w", a.ID, err)
		}
		recs = append(recs, rs...)
	}
	for _, r := range recs {
		quiet, err := s.st.quiet(ctx, orgID, r.DedupeKey, now)
		if err != nil {
			return res, err
		}
		if quiet {
			continue
		}
		created, err := s.st.upsertOpen(ctx, r, now)
		if err != nil {
			return res, err
		}
		if created {
			res.Created++
		} else {
			res.Refreshed++
		}
	}
	n, err := s.st.expireStale(ctx, orgID, runStart)
	res.Expired = int(n)
	return res, err
}

func (s *Service) accountSuggestions(ctx context.Context, orgID uuid.UUID, a account, targets Targets, now time.Time) ([]Recommendation, error) {
	provider := a.Provider
	acct := a.ID
	base := func(kind, level string, id uuid.UUID, name string) Recommendation {
		return Recommendation{OrganizationID: orgID, Kind: kind, EntityType: level, EntityID: id, EntityName: name,
			AccountID: &acct, AccountName: a.Name, Provider: &provider, Currency: a.Currency, DedupeKey: DedupeKey(kind, id)}
	}
	var out []Recommendation

	// Creative fatigue → pause the ad.
	adList, err := s.st.ads(ctx, orgID, a.ID, nil)
	if err != nil {
		return nil, err
	}
	fat, err := s.fatigue(ctx, orgID, a.ID, a.Timezone, adList, DefaultFatigue)
	if err != nil {
		return nil, err
	}
	for i, e := range adList {
		f := fat[i]
		if !f.Fatigued {
			continue
		}
		r := base(KindCreativeFatigue, automation.LevelAd, e.ID, e.Name)
		r.Title = "Pause a fatigued ad"
		r.Reason = fmt.Sprintf("In campaign %q, %s. People have seen it too often; pausing it lets fresher ads take the delivery.",
			e.CampaignName, f.Reason)
		r.Evidence = map[string]any{"current": f.Current, "previous": f.Previous, "frequency_change": f.FrequencyChange,
			"ctr_change": f.CTRChange, "campaign_id": e.CampaignID, "campaign_name": e.CampaignName, "thresholds": DefaultFatigue}
		r.Action = ProposedAction{Type: automation.ActionPause}
		out = append(out, r)
	}

	// Campaign heuristics.
	camps, err := s.st.activeCampaigns(ctx, orgID, a.ID)
	if err != nil {
		return nil, err
	}
	if len(camps) == 0 {
		return out, nil
	}
	from, to, _, _ := windowRanges(now, a.Timezone, WindowDays)
	ext := make([]string, len(camps))
	for i, c := range camps {
		ext[i] = c.ExternalID
	}
	ws, err := s.st.windows(ctx, orgID, a.ID, "campaign_daily", "campaign_external_id", from, to, ext)
	if err != nil {
		return nil, err
	}
	f30, t30, _, _ := windowRanges(now, a.Timezone, 30)
	tot, err := s.st.accountTotals(ctx, orgID, a.ID, f30, t30)
	if err != nil {
		return nil, err
	}
	ref := Reference{TracksRevenue: tot.Revenue > 0}
	ref.TargetCPA, ref.TargetROAS = targets.For(a.Currency)
	if v, ok := tot.Metric("cpa"); ok {
		ref.AccountCPA = &v
	}
	for _, e := range camps {
		c := Campaign{ID: e.ID, Name: e.Name, Status: e.Status, Currency: a.Currency, Window: ws[e.ExternalID]}
		if e.BudgetMicros != nil {
			c.DailyBudget = ptr(round(float64(*e.BudgetMicros)/1e6, 2))
		}
		if c.ScheduleControl, _, err = s.auto.ScheduleControl(ctx, orgID, automation.LevelCampaign, e.ID); err != nil {
			return nil, err
		}
		if c.RecentlyChanged, err = s.auto.RecentlyChanged(ctx, orgID, e.ID, now.Add(-RecentChange)); err != nil {
			return nil, err
		}
		sug := SuggestCampaign(c, ref)
		if sug == nil {
			continue
		}
		r := base(sug.Kind, automation.LevelCampaign, e.ID, e.Name)
		r.Title, r.Reason, r.Evidence, r.Action = sug.Title, sug.Reason, sug.Evidence, sug.Action
		r.Evidence["from"], r.Evidence["to"] = from, to
		out = append(out, r)
	}
	return out, nil
}

// --- inbox ---

func (s *Service) List(ctx context.Context, orgID uuid.UUID, status string) ([]Recommendation, error) {
	return s.st.list(ctx, orgID, status, 200)
}

func (s *Service) Counts(ctx context.Context, orgID uuid.UUID) (map[string]int, error) {
	return s.st.counts(ctx, orgID)
}

// AcceptResult is the recommendation after accepting it and the action that
// carried it out (nil when it could not be recorded).
type AcceptResult struct {
	Recommendation Recommendation     `json:"recommendation"`
	Action         *automation.Action `json:"action"`
}

// Accept applies an open recommendation as a live manual action, now.
// Provider errors mark it failed with the message.
func (s *Service) Accept(ctx context.Context, m organizations.Membership, id uuid.UUID) (AcceptResult, error) {
	r, err := s.st.get(ctx, m.OrganizationID, id)
	if err != nil {
		return AcceptResult{}, notFound(err)
	}
	if r.Status != StatusOpen {
		return AcceptResult{}, httpx.NewError(http.StatusConflict, "not_open", "this recommendation is already "+r.Status)
	}
	rid := r.ID
	change := automation.ManualChange{Level: r.EntityType, EntityID: r.EntityID, Type: r.Action.Type, Budget: r.Action.Value,
		ExpectBudget: r.Action.Before, SourceID: &rid, SourceName: "Recommendation: " + r.Title, Reason: r.Reason,
		Key: "recommendation:" + r.ID.String()}
	a, err := s.auto.ApplyManual(ctx, m, change)
	var res AcceptResult
	status, msg := StatusAccepted, ""
	var actionID *uuid.UUID
	switch {
	case err != nil:
		var he *httpx.Error
		if !errors.As(err, &he) {
			return AcceptResult{}, err
		}
		status, msg = StatusFailed, he.Message
	default:
		res.Action = &a
		actionID = &a.ID
		switch a.Status {
		case automation.StatusFailed:
			status, msg = StatusFailed, a.Error
		case automation.StatusSkipped:
			msg = "Not changed: " + a.Reason
		}
	}
	if _, err := s.st.decide(ctx, m.OrganizationID, id, status, m.UserID, actionID, msg); err != nil {
		return res, err
	}
	s.audit(ctx, m, "recommendation."+map[string]string{StatusAccepted: "accepted", StatusFailed: "failed"}[status], "recommendation", id,
		map[string]any{"kind": r.Kind, "entity_type": r.EntityType, "entity_id": r.EntityID, "proposed_action": r.Action,
			"action_id": actionID, "error": msg})
	res.Recommendation, err = s.st.get(ctx, m.OrganizationID, id)
	return res, err
}

// Dismiss closes an open recommendation; the same suggestion is not made
// again for DismissQuiet.
func (s *Service) Dismiss(ctx context.Context, m organizations.Membership, id uuid.UUID) (Recommendation, error) {
	r, err := s.st.get(ctx, m.OrganizationID, id)
	if err != nil {
		return r, notFound(err)
	}
	ok, err := s.st.decide(ctx, m.OrganizationID, id, StatusDismissed, m.UserID, nil, "")
	if err != nil {
		return r, err
	}
	if !ok {
		return r, httpx.NewError(http.StatusConflict, "not_open", "this recommendation is already "+r.Status)
	}
	s.audit(ctx, m, "recommendation.dismissed", "recommendation", id, map[string]any{"kind": r.Kind, "entity_id": r.EntityID})
	return s.st.get(ctx, m.OrganizationID, id)
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
