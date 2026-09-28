package manage

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/providers"
)

// Money in requests is in major units of the account currency.
const maxAmount = 1e12

func money(field string, v float64) (ads.Micros, error) {
	if math.IsNaN(v) || v <= 0 || v > maxAmount {
		return 0, Invalid(field, "must be a positive amount")
	}
	return providers.FloatToMicros(v), nil
}

// optMoney converts a budget-like field where null means "not changing".
func optMoney(field string, o Optional[float64]) (*ads.Micros, error) {
	p := o.Ptr()
	if p == nil {
		return nil, nil
	}
	m, err := money(field, *p)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func parseStatus(field string, s *string, allowArchived bool) (*ads.Status, error) {
	if s == nil {
		return nil, nil
	}
	switch st := ads.Status(*s); st {
	case ads.StatusActive, ads.StatusPaused:
		return &st, nil
	case ads.StatusArchived:
		if allowArchived {
			return &st, nil
		}
	}
	if allowArchived {
		return nil, Invalid(field, "must be one of active, paused, archived")
	}
	return nil, Invalid(field, "must be active or paused")
}

func parseName(n *string) (*string, error) {
	if n == nil {
		return nil, nil
	}
	v := strings.TrimSpace(*n)
	if v == "" || len(v) > 400 {
		return nil, Invalid("name", "must be 1–400 characters")
	}
	return &v, nil
}

// CampaignPatch is the PATCH /campaigns/{id} body. Absent fields are left
// unchanged; spend_cap and end_time accept null to clear.
type CampaignPatch struct {
	Status         *string             `json:"status"`
	Name           *string             `json:"name"`
	DailyBudget    Optional[float64]   `json:"daily_budget"`
	LifetimeBudget Optional[float64]   `json:"lifetime_budget"`
	SpendCap       Optional[float64]   `json:"spend_cap"`
	EndTime        Optional[time.Time] `json:"end_time"`
}

func (p CampaignPatch) toAds() (ads.CampaignPatch, error) {
	var out ads.CampaignPatch
	var err error
	if out.Status, err = parseStatus("status", p.Status, true); err != nil {
		return out, err
	}
	if out.Name, err = parseName(p.Name); err != nil {
		return out, err
	}
	if out.DailyBudget, err = optMoney("daily_budget", p.DailyBudget); err != nil {
		return out, err
	}
	if out.LifetimeBudget, err = optMoney("lifetime_budget", p.LifetimeBudget); err != nil {
		return out, err
	}
	if out.DailyBudget != nil && out.LifetimeBudget != nil {
		return out, Invalid("lifetime_budget", "set either daily_budget or lifetime_budget, not both")
	}
	if p.SpendCap.Null {
		out.ClearSpendCap = true
	} else if out.SpendCap, err = optMoney("spend_cap", p.SpendCap); err != nil {
		return out, err
	}
	if p.EndTime.Null {
		out.ClearEndTime = true
	} else {
		out.EndTime = p.EndTime.Ptr()
	}
	return out, nil
}

// AdGroupPatch is the PATCH /ad-groups/{id} body (Meta ad set).
type AdGroupPatch struct {
	Status         *string             `json:"status"`
	Name           *string             `json:"name"`
	DailyBudget    Optional[float64]   `json:"daily_budget"`
	LifetimeBudget Optional[float64]   `json:"lifetime_budget"`
	BidAmount      Optional[float64]   `json:"bid_amount"`
	EndTime        Optional[time.Time] `json:"end_time"`
}

func (p AdGroupPatch) toAds() (ads.AdGroupPatch, error) {
	var out ads.AdGroupPatch
	var err error
	if out.Status, err = parseStatus("status", p.Status, true); err != nil {
		return out, err
	}
	if out.Name, err = parseName(p.Name); err != nil {
		return out, err
	}
	if out.DailyBudget, err = optMoney("daily_budget", p.DailyBudget); err != nil {
		return out, err
	}
	if out.LifetimeBudget, err = optMoney("lifetime_budget", p.LifetimeBudget); err != nil {
		return out, err
	}
	if out.DailyBudget != nil && out.LifetimeBudget != nil {
		return out, Invalid("lifetime_budget", "set either daily_budget or lifetime_budget, not both")
	}
	if out.BidAmount, err = optMoney("bid_amount", p.BidAmount); err != nil {
		return out, err
	}
	if p.EndTime.Null {
		out.ClearEndTime = true
	} else {
		out.EndTime = p.EndTime.Ptr()
	}
	return out, nil
}

// AdPatch is the PATCH /ads/{id} body.
type AdPatch struct {
	Status *string `json:"status"`
	Name   *string `json:"name"`
}

func (p AdPatch) toAds() (ads.AdPatch, error) {
	var out ads.AdPatch
	var err error
	if out.Status, err = parseStatus("status", p.Status, true); err != nil {
		return out, err
	}
	out.Name, err = parseName(p.Name)
	return out, err
}

func actionFor(entity string, archived bool) string {
	if archived {
		return entity + ".archived"
	}
	return entity + ".updated"
}

// UpdateCampaign applies p to a campaign at its provider and returns the
// refreshed campaign. actorID is nil for system actors (automations).
func (s *Service) UpdateCampaign(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, id uuid.UUID, p CampaignPatch) (entities.Campaign, error) {
	patch, err := p.toAds()
	if err != nil {
		return entities.Campaign{}, err
	}
	before, err := s.CampaignView(ctx, orgID, id)
	if err != nil {
		return entities.Campaign{}, err
	}
	t, err := s.connect(ctx, orgID, before.AccountID)
	if err != nil {
		return entities.Campaign{}, err
	}
	if m, ok := t.client.(ads.Manager); ok {
		err = m.UpdateCampaign(ctx, t.account.ExternalID, before.ExternalID, patch)
	} else {
		err = s.updateCampaignBasic(ctx, t, before.ExternalID, patch)
	}
	if err != nil {
		return entities.Campaign{}, s.providerError(ctx, t, err)
	}
	s.afterWrite(ctx, "campaign", func() error { return s.refreshCampaign(ctx, orgID, t, before.ExternalID) })
	after, err := s.CampaignView(ctx, orgID, id)
	if err != nil {
		return entities.Campaign{}, err
	}
	archived := patch.Status != nil && *patch.Status == ads.StatusArchived
	err = s.record(ctx, orgID, actorID, actionFor("campaign", archived), "campaign", id.String(), map[string]any{
		"provider": t.provider(), "external_id": before.ExternalID, "changes": p, "before": before, "after": after,
	})
	return after, err
}

// updateCampaignBasic covers providers without ads.Manager (Google): status
// active/paused and the daily budget through ads.Client.
func (s *Service) updateCampaignBasic(ctx context.Context, t target, externalID string, p ads.CampaignPatch) error {
	if p.Name != nil || p.LifetimeBudget != nil || p.SpendCap != nil || p.ClearSpendCap || p.EndTime != nil || p.ClearEndTime {
		return providers.Unsupported(t.provider(), "only status and daily_budget can be changed for %s campaigns", t.provider())
	}
	if p.Status != nil && *p.Status == ads.StatusArchived {
		return providers.Unsupported(t.provider(), "%s campaigns cannot be archived from Adwise", t.provider())
	}
	if p.DailyBudget != nil {
		if err := t.client.UpdateCampaignBudget(ctx, t.account.ExternalID, externalID, *p.DailyBudget); err != nil {
			return err
		}
	}
	if p.Status != nil {
		if err := t.client.SetCampaignStatus(ctx, t.account.ExternalID, externalID, *p.Status); err != nil {
			return err
		}
	}
	return nil
}

// UpdateAdGroup applies p to an ad group (Meta ad set).
func (s *Service) UpdateAdGroup(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, id uuid.UUID, p AdGroupPatch) (entities.AdGroup, error) {
	patch, err := p.toAds()
	if err != nil {
		return entities.AdGroup{}, err
	}
	before, err := s.AdGroupView(ctx, orgID, id)
	if err != nil {
		return entities.AdGroup{}, err
	}
	t, err := s.connect(ctx, orgID, before.AccountID)
	if err != nil {
		return entities.AdGroup{}, err
	}
	m, err := t.manager()
	if err != nil {
		return entities.AdGroup{}, err
	}
	if err := m.UpdateAdGroup(ctx, t.account.ExternalID, before.ExternalID, patch); err != nil {
		return entities.AdGroup{}, s.providerError(ctx, t, err)
	}
	s.afterWrite(ctx, "ad_group", func() error { return s.refreshAdGroup(ctx, orgID, t, before.ExternalID) })
	after, err := s.AdGroupView(ctx, orgID, id)
	if err != nil {
		return entities.AdGroup{}, err
	}
	archived := patch.Status != nil && *patch.Status == ads.StatusArchived
	err = s.record(ctx, orgID, actorID, actionFor("ad_group", archived), "ad_group", id.String(), map[string]any{
		"provider": t.provider(), "external_id": before.ExternalID, "changes": p, "before": before, "after": after,
	})
	return after, err
}

// UpdateAd applies p to an ad.
func (s *Service) UpdateAd(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, id uuid.UUID, p AdPatch) (entities.Ad, error) {
	patch, err := p.toAds()
	if err != nil {
		return entities.Ad{}, err
	}
	before, err := s.AdView(ctx, orgID, id)
	if err != nil {
		return entities.Ad{}, err
	}
	t, err := s.connect(ctx, orgID, before.AccountID)
	if err != nil {
		return entities.Ad{}, err
	}
	m, err := t.manager()
	if err != nil {
		return entities.Ad{}, err
	}
	if err := m.UpdateAd(ctx, t.account.ExternalID, before.ExternalID, patch); err != nil {
		return entities.Ad{}, s.providerError(ctx, t, err)
	}
	s.afterWrite(ctx, "ad", func() error { return s.refreshAd(ctx, orgID, t, before.ExternalID) })
	after, err := s.AdView(ctx, orgID, id)
	if err != nil {
		return entities.Ad{}, err
	}
	archived := patch.Status != nil && *patch.Status == ads.StatusArchived
	err = s.record(ctx, orgID, actorID, actionFor("ad", archived), "ad", id.String(), map[string]any{
		"provider": t.provider(), "external_id": before.ExternalID, "changes": p, "before": before, "after": after,
	})
	return after, err
}

// Levels accepted by SetStatus and the bulk endpoint.
const (
	LevelCampaign = "campaign"
	LevelAdGroup  = "ad_group"
	LevelAd       = "ad"
)

// SetStatus sets one entity's status (active, paused or archived).
func (s *Service) SetStatus(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, level string, id uuid.UUID, status ads.Status) error {
	st := string(status)
	var err error
	switch level {
	case LevelCampaign:
		_, err = s.UpdateCampaign(ctx, orgID, actorID, id, CampaignPatch{Status: &st})
	case LevelAdGroup:
		_, err = s.UpdateAdGroup(ctx, orgID, actorID, id, AdGroupPatch{Status: &st})
	case LevelAd:
		_, err = s.UpdateAd(ctx, orgID, actorID, id, AdPatch{Status: &st})
	default:
		return Invalid("level", "must be one of campaign, ad_group, ad")
	}
	return err
}

type BulkStatusRequest struct {
	Level  string      `json:"level"`
	IDs    []uuid.UUID `json:"ids"`
	Status string      `json:"status"`
}

type BulkResult struct {
	ID    uuid.UUID `json:"id"`
	OK    bool      `json:"ok"`
	Error string    `json:"error,omitempty"`
}

// MaxBulk bounds one bulk request (each item is a synchronous provider call).
const MaxBulk = 100

// BulkStatus sets the status of many entities, one after another. Failures
// are reported per item.
func (s *Service) BulkStatus(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, req BulkStatusRequest) ([]BulkResult, error) {
	switch req.Level {
	case LevelCampaign, LevelAdGroup, LevelAd:
	default:
		return nil, Invalid("level", "must be one of campaign, ad_group, ad")
	}
	st, err := parseStatus("status", &req.Status, true)
	if err != nil {
		return nil, err
	}
	if len(req.IDs) == 0 || len(req.IDs) > MaxBulk {
		return nil, Invalid("ids", "must list 1–100 ids")
	}
	out := make([]BulkResult, 0, len(req.IDs))
	seen := map[uuid.UUID]bool{}
	for _, id := range req.IDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		if err := ctx.Err(); err != nil {
			out = append(out, BulkResult{ID: id, Error: "request cancelled"})
			continue
		}
		err := s.SetStatus(ctx, orgID, actorID, req.Level, id, *st)
		if err != nil {
			var he *httpx.Error
			if !errors.As(err, &he) {
				s.logger.ErrorContext(ctx, "manage: bulk status item failed", "level", req.Level, "id", id, "err", err)
			}
			out = append(out, BulkResult{ID: id, Error: errorMessage(err)})
			continue
		}
		out = append(out, BulkResult{ID: id, OK: true})
	}
	return out, nil
}

func errorMessage(err error) string {
	var he *httpx.Error
	if errors.As(err, &he) {
		return he.Message
	}
	return "internal error"
}
