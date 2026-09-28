// Package manage writes campaign, ad set and ad changes to the ad providers
// (plan/campaign-management-api.md). Every mutation goes to the provider
// synchronously, is re-read from the provider and upserted locally, and is
// audited with before/after snapshots. Service is also the execution path
// for automations.
package manage

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/integrations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/providers"
	"github.com/iamv1n/adwise/internal/store"
)

var (
	ErrNoIntegration = httpx.NewError(http.StatusConflict, "integration_inactive",
		"this ad account is not linked to an active integration; reconnect it first")
	errCredentials = httpx.NewError(http.StatusConflict, "reauth_required",
		"the stored credentials for this integration could not be used; reconnect this integration")
)

// Unsupported returns a 422 unsupported error.
func Unsupported(msg string) *httpx.Error {
	return httpx.NewError(http.StatusUnprocessableEntity, "unsupported", msg)
}

// Invalid returns a 422 validation_failed error for one field.
func Invalid(field, reason string) *httpx.Error {
	e := httpx.NewError(http.StatusUnprocessableEntity, "validation_failed", field+": "+reason)
	e.Fields = map[string]string{field: reason}
	return e
}

type Service struct {
	db       *database.DB
	integ    *integrations.Service
	entities *entities.Service
	store    ads.Store
	logger   *slog.Logger
}

func NewService(db *database.DB, integ *integrations.Service, ents *entities.Service, st ads.Store) *Service {
	return &Service{db: db, integ: integ, entities: ents, store: st, logger: slog.Default()}
}

// target is a resolved ad account with an authenticated provider client.
type target struct {
	account store.AdAccount
	integ   store.Integration
	client  ads.Client
}

func (t target) provider() ads.Provider { return ads.Provider(t.account.Provider) }

func (t target) manager() (ads.Manager, error) {
	m, ok := t.client.(ads.Manager)
	if !ok {
		return nil, Unsupported(string(t.account.Provider) + " does not support this change in Adwise yet")
	}
	return m, nil
}

// connect loads the org's ad account and builds its provider client.
func (s *Service) connect(ctx context.Context, orgID, accountID uuid.UUID) (target, error) {
	row, err := s.db.GetAdAccount(ctx, store.GetAdAccountParams{OrganizationID: orgID, ID: accountID})
	if database.IsNotFound(err) {
		return target{}, entities.ErrAccountNotFound
	}
	if err != nil {
		return target{}, err
	}
	t := target{account: row.AdAccount}
	if t.account.IntegrationID == nil {
		return t, ErrNoIntegration
	}
	t.integ, err = s.db.GetIntegration(ctx, store.GetIntegrationParams{ID: *t.account.IntegrationID, OrganizationID: orgID})
	if database.IsNotFound(err) {
		return t, ErrNoIntegration
	}
	if err != nil {
		return t, err
	}
	t.client, err = s.integ.ClientFor(t.integ)
	if err != nil {
		var he *httpx.Error
		if errors.As(err, &he) {
			return t, he
		}
		s.logger.ErrorContext(ctx, "manage: build provider client", "integration_id", t.integ.ID, "err", err)
		return t, errCredentials
	}
	return t, nil
}

// providerError maps provider failures to API errors: 422 unsupported or
// validation_failed for checks made before calling the provider, 502
// provider_error with the provider's message when it rejected the change,
// and the integrations mapping (409 reauth_required, 403, 503) otherwise.
func (s *Service) providerError(ctx context.Context, t target, err error) error {
	var pe *providers.Error
	if errors.As(err, &pe) {
		switch {
		case errors.Is(err, providers.ErrUnsupported):
			return Unsupported(pe.Message)
		case errors.Is(err, providers.ErrInvalidRequest) && pe.HTTPStatus == 0:
			e := httpx.NewError(http.StatusUnprocessableEntity, "validation_failed", pe.Message)
			return e
		case errors.Is(err, providers.ErrNotFound) && pe.HTTPStatus == 0:
			return httpx.NewError(http.StatusNotFound, "not_found", pe.Message)
		case errors.Is(err, providers.ErrInvalidRequest), errors.Is(err, providers.ErrNotFound):
			msg := pe.Message
			if msg == "" {
				msg = "the provider rejected the change"
			}
			return httpx.NewError(http.StatusBadGateway, "provider_error", msg)
		}
	}
	return s.integ.ProviderError(ctx, t.integ.ID, err)
}

func (s *Service) record(ctx context.Context, orgID uuid.UUID, actorID *uuid.UUID, action, entityType, entityID string, meta map[string]any) error {
	return s.db.InTx(ctx, func(q *store.Queries) error {
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &orgID, ActorUserID: actorID,
			Action: action, EntityType: entityType, EntityID: entityID, Metadata: meta,
		})
	})
}

// --- entity views (the entities list response shape) ---

var bigPage = params.Page{Limit: params.MaxLimit}

func (s *Service) CampaignView(ctx context.Context, orgID, id uuid.UUID) (entities.Campaign, error) {
	rows, _, err := s.entities.ListCampaigns(ctx, orgID, entities.ListFilter{CampaignID: &id, Page: params.Page{Limit: 1}})
	if err != nil {
		return entities.Campaign{}, err
	}
	if len(rows) == 0 {
		return entities.Campaign{}, httpx.ErrNotFound
	}
	return rows[0], nil
}

func (s *Service) AdGroupView(ctx context.Context, orgID, id uuid.UUID) (entities.AdGroup, error) {
	var campaignID uuid.UUID
	var ext string
	err := s.db.Pool.QueryRow(ctx, `SELECT campaign_id, external_id FROM ad_groups WHERE organization_id = $1 AND id = $2`, orgID, id).Scan(&campaignID, &ext)
	if database.IsNotFound(err) {
		return entities.AdGroup{}, httpx.ErrNotFound
	}
	if err != nil {
		return entities.AdGroup{}, err
	}
	rows, _, err := s.entities.ListAdGroups(ctx, orgID, entities.ListFilter{CampaignID: &campaignID, Search: ext, Page: bigPage})
	if err != nil {
		return entities.AdGroup{}, err
	}
	for _, r := range rows {
		if r.ID == id {
			return r, nil
		}
	}
	return entities.AdGroup{}, httpx.ErrNotFound
}

func (s *Service) AdView(ctx context.Context, orgID, id uuid.UUID) (entities.Ad, error) {
	var adGroupID uuid.UUID
	var ext string
	err := s.db.Pool.QueryRow(ctx, `SELECT ad_group_id, external_id FROM ads WHERE organization_id = $1 AND id = $2`, orgID, id).Scan(&adGroupID, &ext)
	if database.IsNotFound(err) {
		return entities.Ad{}, httpx.ErrNotFound
	}
	if err != nil {
		return entities.Ad{}, err
	}
	rows, _, err := s.entities.ListAds(ctx, orgID, entities.ListFilter{AdGroupID: &adGroupID, Search: ext, Page: bigPage})
	if err != nil {
		return entities.Ad{}, err
	}
	for _, r := range rows {
		if r.ID == id {
			return r, nil
		}
	}
	return entities.Ad{}, httpx.ErrNotFound
}

func (s *Service) idByExternal(ctx context.Context, table string, accountID uuid.UUID, externalID string) (uuid.UUID, error) {
	var id uuid.UUID
	// table is one of a fixed set of names, never user input.
	err := s.db.Pool.QueryRow(ctx, `SELECT id FROM `+table+` WHERE account_id = $1 AND external_id = $2`, accountID, externalID).Scan(&id)
	return id, err
}

// --- refresh from provider ---

func (s *Service) refreshCampaign(ctx context.Context, orgID uuid.UUID, t target, externalID string) error {
	var c ads.Campaign
	if m, ok := t.client.(ads.Manager); ok {
		var err error
		if c, err = m.GetCampaign(ctx, t.account.ExternalID, externalID); err != nil {
			return err
		}
	} else {
		list, err := t.client.ListCampaigns(ctx, t.account.ExternalID)
		if err != nil {
			return err
		}
		found := false
		for _, x := range list {
			if x.ExternalID == externalID {
				c, found = x, true
				break
			}
		}
		if !found {
			return errors.New("campaign not returned by provider")
		}
	}
	return s.store.UpsertCampaigns(ctx, orgID, []ads.Campaign{c})
}

func (s *Service) refreshAdGroup(ctx context.Context, orgID uuid.UUID, t target, externalID string) error {
	m, err := t.manager()
	if err != nil {
		return err
	}
	g, err := m.GetAdGroup(ctx, t.account.ExternalID, externalID)
	if err != nil {
		return err
	}
	return s.store.UpsertAdGroups(ctx, orgID, []ads.AdGroup{g})
}

func (s *Service) refreshAd(ctx context.Context, orgID uuid.UUID, t target, externalID string) error {
	m, err := t.manager()
	if err != nil {
		return err
	}
	a, err := m.GetAd(ctx, t.account.ExternalID, externalID)
	if err != nil {
		return err
	}
	if a.CreativeExternalID != "" {
		if cr, err := m.GetCreative(ctx, t.account.ExternalID, a.CreativeExternalID); err == nil {
			if err := s.store.UpsertCreatives(ctx, orgID, []ads.Creative{cr}); err != nil {
				s.logger.WarnContext(ctx, "manage: upsert creative", "err", err)
			}
		} else {
			s.logger.WarnContext(ctx, "manage: fetch creative", "creative", a.CreativeExternalID, "err", err)
		}
	}
	return s.store.UpsertAds(ctx, orgID, []ads.Ad{a})
}

// afterWrite re-reads an entity after a successful provider write. A failed
// refresh does not undo the write, so it is logged and the stale local row
// is returned.
func (s *Service) afterWrite(ctx context.Context, what string, refresh func() error) {
	if err := refresh(); err != nil {
		s.logger.WarnContext(ctx, "manage: refresh after write failed; local copy is stale until the next sync", "entity", what, "err", err)
	}
}
