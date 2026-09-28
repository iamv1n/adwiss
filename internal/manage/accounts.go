package manage

import (
	"context"
	"io"
	"math"
	"strings"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/metrics"
)

// ListPages returns the Facebook Pages an ad account can advertise as.
func (s *Service) ListPages(ctx context.Context, orgID, accountID uuid.UUID) ([]ads.Page, error) {
	t, err := s.connect(ctx, orgID, accountID)
	if err != nil {
		return nil, err
	}
	m, err := t.manager()
	if err != nil {
		return nil, err
	}
	pages, err := m.ListPages(ctx, t.account.ExternalID)
	if err != nil {
		return nil, s.providerError(ctx, t, err)
	}
	if pages == nil {
		pages = []ads.Page{}
	}
	return pages, nil
}

// MaxImageBytes bounds image uploads.
const MaxImageBytes = 8 << 20

// UploadImage adds an image to the ad account's image library.
func (s *Service) UploadImage(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, accountID uuid.UUID, filename string, data []byte) (ads.Image, error) {
	t, err := s.connect(ctx, orgID, accountID)
	if err != nil {
		return ads.Image{}, err
	}
	m, err := t.manager()
	if err != nil {
		return ads.Image{}, err
	}
	img, err := m.UploadImage(ctx, t.account.ExternalID, filename, data)
	if err != nil {
		return ads.Image{}, s.providerError(ctx, t, err)
	}
	err = s.record(ctx, orgID, actorID, "ad_image.uploaded", "ad_account", accountID.String(), map[string]any{
		"provider": t.provider(), "hash": img.Hash, "filename": filename, "bytes": len(data),
	})
	return img, err
}

// Limits is the account spend-limit response; money in major units.
type Limits struct {
	SpendCap    *float64 `json:"spend_cap"`
	AmountSpent float64  `json:"amount_spent"`
	Currency    string   `json:"currency"`
	Balance     float64  `json:"balance"`
}

func toLimits(l ads.AccountLimits, fallbackCurrency string) Limits {
	out := Limits{
		AmountSpent: metrics.MicrosToUnits(l.AmountSpent), Balance: metrics.MicrosToUnits(l.Balance),
		Currency: l.Currency,
	}
	if out.Currency == "" {
		out.Currency = fallbackCurrency
	}
	if l.SpendCap != nil {
		v := metrics.MicrosToUnits(*l.SpendCap)
		out.SpendCap = &v
	}
	return out
}

// AccountLimits reads the account-wide spend cap.
func (s *Service) AccountLimits(ctx context.Context, orgID, accountID uuid.UUID) (Limits, error) {
	t, err := s.connect(ctx, orgID, accountID)
	if err != nil {
		return Limits{}, err
	}
	m, err := t.manager()
	if err != nil {
		return Limits{}, err
	}
	l, err := m.AccountLimits(ctx, t.account.ExternalID)
	if err != nil {
		return Limits{}, s.providerError(ctx, t, err)
	}
	return toLimits(l, t.account.Currency), nil
}

// LimitsPatch is the PATCH /accounts/{id}/limits body; null removes the cap.
type LimitsPatch struct {
	SpendCap Optional[float64] `json:"spend_cap"`
}

// SetAccountSpendCap sets or removes the account-wide spend cap.
func (s *Service) SetAccountSpendCap(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, accountID uuid.UUID, p LimitsPatch) (Limits, error) {
	if !p.SpendCap.Set {
		return Limits{}, Invalid("spend_cap", "required (a number, or null to remove the cap)")
	}
	var capMicros *ads.Micros
	if !p.SpendCap.Null {
		if math.IsNaN(p.SpendCap.Value) || p.SpendCap.Value <= 0 || p.SpendCap.Value > maxAmount {
			return Limits{}, Invalid("spend_cap", "must be a positive amount or null")
		}
		m, _ := money("spend_cap", p.SpendCap.Value)
		capMicros = &m
	}
	t, err := s.connect(ctx, orgID, accountID)
	if err != nil {
		return Limits{}, err
	}
	m, err := t.manager()
	if err != nil {
		return Limits{}, err
	}
	var before *Limits
	if l, err := m.AccountLimits(ctx, t.account.ExternalID); err == nil {
		b := toLimits(l, t.account.Currency)
		before = &b
	}
	if err := m.SetAccountSpendCap(ctx, t.account.ExternalID, capMicros); err != nil {
		return Limits{}, s.providerError(ctx, t, err)
	}
	l, err := m.AccountLimits(ctx, t.account.ExternalID)
	if err != nil {
		return Limits{}, s.providerError(ctx, t, err)
	}
	after := toLimits(l, t.account.Currency)
	err = s.record(ctx, orgID, actorID, "ad_account.spend_cap_updated", "ad_account", accountID.String(), map[string]any{
		"provider": t.provider(), "external_id": t.account.ExternalID, "before": before, "after": after,
	})
	return after, err
}

// MaxVideoBytes bounds video uploads.
const MaxVideoBytes = 1 << 30

// UploadVideo streams a video to the ad account's library. It is usable in
// an ad once VideoStatus reports it ready.
func (s *Service) UploadVideo(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, accountID uuid.UUID, filename string, r io.Reader) (ads.Video, error) {
	t, err := s.connect(ctx, orgID, accountID)
	if err != nil {
		return ads.Video{}, err
	}
	m, err := t.manager()
	if err != nil {
		return ads.Video{}, err
	}
	v, err := m.UploadVideo(ctx, t.account.ExternalID, filename, r)
	if err != nil {
		return ads.Video{}, s.providerError(ctx, t, err)
	}
	err = s.record(ctx, orgID, actorID, "ad_video.uploaded", "ad_account", accountID.String(), map[string]any{
		"provider": t.provider(), "video_id": v.ID, "filename": filename,
	})
	return v, err
}

// VideoStatus reports whether an uploaded video has finished processing.
func (s *Service) VideoStatus(ctx context.Context, orgID, accountID uuid.UUID, id string) (ads.Video, error) {
	if err := videoID("video_id", id); err != nil {
		return ads.Video{}, err
	}
	t, err := s.connect(ctx, orgID, accountID)
	if err != nil {
		return ads.Video{}, err
	}
	m, err := t.manager()
	if err != nil {
		return ads.Video{}, err
	}
	v, err := m.GetVideo(ctx, t.account.ExternalID, id)
	if err != nil {
		return ads.Video{}, s.providerError(ctx, t, err)
	}
	return v, nil
}

// SearchTargeting finds interests, locations or languages by name.
func (s *Service) SearchTargeting(ctx context.Context, orgID, accountID uuid.UUID, kind ads.TargetingKind, query string) ([]ads.TargetingOption, error) {
	switch kind {
	case ads.TargetingInterests, ads.TargetingLocations, ads.TargetingLanguages:
	default:
		return nil, Invalid("type", "must be interests, locations or languages")
	}
	query = strings.TrimSpace(query)
	if query == "" || len(query) > 100 {
		return nil, Invalid("q", "must be 1–100 characters")
	}
	t, err := s.connect(ctx, orgID, accountID)
	if err != nil {
		return nil, err
	}
	m, err := t.manager()
	if err != nil {
		return nil, err
	}
	out, err := m.SearchTargeting(ctx, t.account.ExternalID, kind, query)
	if err != nil {
		return nil, s.providerError(ctx, t, err)
	}
	if out == nil {
		out = []ads.TargetingOption{}
	}
	return out, nil
}

// ListAudiences returns the account's custom and lookalike audiences.
func (s *Service) ListAudiences(ctx context.Context, orgID, accountID uuid.UUID) ([]ads.Audience, error) {
	t, err := s.connect(ctx, orgID, accountID)
	if err != nil {
		return nil, err
	}
	m, err := t.manager()
	if err != nil {
		return nil, err
	}
	out, err := m.ListAudiences(ctx, t.account.ExternalID)
	if err != nil {
		return nil, s.providerError(ctx, t, err)
	}
	if out == nil {
		out = []ads.Audience{}
	}
	return out, nil
}
