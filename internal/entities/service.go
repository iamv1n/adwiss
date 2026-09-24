// Package entities persists canonical advertising entities (ad accounts,
// campaigns, ad groups, ads, creatives) and serves them to the API.
//
// Store implements ads.Store for sync jobs; Service backs the read and
// account-settings endpoints.
package entities

import (
	"context"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/reports"
	"github.com/iamv1n/adwise/internal/store"
)

// StaleAfter is the freshness lag above which an account's sync is "stale"
// (plan §35: entities every few hours, metrics at least daily).
const StaleAfter = 6 * time.Hour

var ErrAccountNotFound = httpx.NewError(http.StatusNotFound, "account_not_found", "ad account not found")

type Service struct {
	db      *database.DB
	metrics metrics.Repository
	now     func() time.Time
}

func NewService(db *database.DB, repo metrics.Repository) *Service {
	return &Service{db: db, metrics: repo, now: time.Now}
}

// --- accounts ---

type SyncScope struct {
	Scope        string    `json:"scope"`
	LastSyncedAt time.Time `json:"last_synced_at"`
	LagSeconds   int64     `json:"lag_seconds"`
}

// Sync statuses, in order of precedence.
const (
	SyncDisabled         = "disabled"          // sync_enabled is false
	SyncIntegrationError = "integration_error" // integration missing, needs_reauth or disconnected
	SyncNeverSynced      = "never_synced"
	SyncStale            = "stale" // freshness lag > StaleAfter
	SyncOK               = "ok"
)

type Account struct {
	ID                uuid.UUID    `json:"id"`
	Provider          ads.Provider `json:"provider"`
	ExternalID        string       `json:"external_id"`
	Name              string       `json:"name"`
	Currency          string       `json:"currency"`
	Timezone          string       `json:"timezone"`
	Status            string       `json:"status"`
	SyncEnabled       bool         `json:"sync_enabled"`
	IntegrationID     *uuid.UUID   `json:"integration_id"`
	IntegrationStatus *string      `json:"integration_status"`
	SyncStatus        string       `json:"sync_status"`
	// LastSyncedAt is the oldest last_synced_at across scopes: every kind of
	// data for this account is at least this fresh. FreshnessLagSeconds is
	// now − LastSyncedAt (data_freshness_lag, plan §34).
	LastSyncedAt        *time.Time  `json:"last_synced_at"`
	FreshnessLagSeconds *int64      `json:"freshness_lag_seconds"`
	SyncScopes          []SyncScope `json:"sync_scopes"`
	CreatedAt           time.Time   `json:"created_at"`
	UpdatedAt           time.Time   `json:"updated_at"`
}

func (s *Service) ListAccounts(ctx context.Context, orgID uuid.UUID, provider ads.Provider) ([]Account, error) {
	rows, err := s.db.ListAdAccounts(ctx, store.ListAdAccountsParams{OrganizationID: orgID, Provider: providerArg(provider)})
	if err != nil {
		return nil, err
	}
	states, err := s.db.ListAccountSyncStates(ctx, orgID)
	if err != nil {
		return nil, err
	}
	byAccount := map[uuid.UUID][]store.AdAccountSyncState{}
	for _, st := range states {
		byAccount[st.AccountID] = append(byAccount[st.AccountID], st)
	}
	now := s.now()
	out := make([]Account, len(rows))
	for i, r := range rows {
		out[i] = toAccount(r.AdAccount, r.IntegrationStatus, byAccount[r.AdAccount.ID], now)
	}
	return out, nil
}

func (s *Service) GetAccount(ctx context.Context, orgID, id uuid.UUID) (Account, error) {
	r, err := s.db.GetAdAccount(ctx, store.GetAdAccountParams{OrganizationID: orgID, ID: id})
	if database.IsNotFound(err) {
		return Account{}, ErrAccountNotFound
	}
	if err != nil {
		return Account{}, err
	}
	states, err := s.db.ListAccountSyncStates(ctx, orgID)
	if err != nil {
		return Account{}, err
	}
	states = slices.DeleteFunc(states, func(st store.AdAccountSyncState) bool { return st.AccountID != id })
	return toAccount(r.AdAccount, r.IntegrationStatus, states, s.now()), nil
}

// SetSyncEnabled turns syncing on or off for an account (admin+), recording
// an audit entry in the same transaction.
func (s *Service) SetSyncEnabled(ctx context.Context, orgID, actorID, id uuid.UUID, enabled bool) (Account, error) {
	err := s.db.InTx(ctx, func(q *store.Queries) error {
		before, err := q.GetAdAccount(ctx, store.GetAdAccountParams{OrganizationID: orgID, ID: id})
		if database.IsNotFound(err) {
			return ErrAccountNotFound
		}
		if err != nil {
			return err
		}
		if before.AdAccount.SyncEnabled == enabled {
			return nil
		}
		if _, err := q.SetAdAccountSyncEnabled(ctx, store.SetAdAccountSyncEnabledParams{
			OrganizationID: orgID, ID: id, SyncEnabled: enabled,
		}); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &orgID, ActorUserID: &actorID,
			Action: "ad_account.sync_updated", EntityType: "ad_account", EntityID: id.String(),
			Metadata: map[string]any{"sync_enabled": enabled, "provider": before.AdAccount.Provider, "external_id": before.AdAccount.ExternalID},
		})
	})
	if err != nil {
		return Account{}, err
	}
	return s.GetAccount(ctx, orgID, id)
}

func toAccount(a store.AdAccount, integrationStatus *store.IntegrationStatus, states []store.AdAccountSyncState, now time.Time) Account {
	out := Account{
		ID: a.ID, Provider: ads.Provider(a.Provider), ExternalID: a.ExternalID, Name: a.Name,
		Currency: a.Currency, Timezone: a.Timezone, Status: string(a.Status), SyncEnabled: a.SyncEnabled,
		IntegrationID: a.IntegrationID, SyncScopes: []SyncScope{}, CreatedAt: a.CreatedAt, UpdatedAt: a.UpdatedAt,
	}
	if integrationStatus != nil {
		v := string(*integrationStatus)
		out.IntegrationStatus = &v
	}
	for _, st := range states {
		out.SyncScopes = append(out.SyncScopes, SyncScope{
			Scope: st.Scope, LastSyncedAt: st.LastSyncedAt, LagSeconds: lagSeconds(now, st.LastSyncedAt),
		})
		if out.LastSyncedAt == nil || st.LastSyncedAt.Before(*out.LastSyncedAt) {
			t := st.LastSyncedAt
			out.LastSyncedAt = &t
		}
	}
	if out.LastSyncedAt != nil {
		lag := lagSeconds(now, *out.LastSyncedAt)
		out.FreshnessLagSeconds = &lag
	}
	switch {
	case !a.SyncEnabled:
		out.SyncStatus = SyncDisabled
	case integrationStatus == nil || *integrationStatus != store.IntegrationStatusActive:
		out.SyncStatus = SyncIntegrationError
	case out.LastSyncedAt == nil:
		out.SyncStatus = SyncNeverSynced
	case now.Sub(*out.LastSyncedAt) > StaleAfter:
		out.SyncStatus = SyncStale
	default:
		out.SyncStatus = SyncOK
	}
	return out
}

func lagSeconds(now, t time.Time) int64 { return max(0, int64(now.Sub(t).Seconds())) }

// --- entity lists ---

// ListFilter holds the filters shared by the entity list endpoints. Range,
// when set, adds aggregated metrics to each row.
type ListFilter struct {
	AccountID  *uuid.UUID
	Provider   ads.Provider
	Status     ads.Status
	Search     string
	CampaignID *uuid.UUID
	AdGroupID  *uuid.UUID
	Range      *params.DateRange
	Page       params.Page
}

type Campaign struct {
	ID             uuid.UUID       `json:"id"`
	AccountID      uuid.UUID       `json:"account_id"`
	AccountName    string          `json:"account_name"`
	Provider       ads.Provider    `json:"provider"`
	ExternalID     string          `json:"external_id"`
	Name           string          `json:"name"`
	Status         string          `json:"status"`
	Objective      string          `json:"objective"`
	Currency       string          `json:"currency"`
	Timezone       string          `json:"timezone"`
	DailyBudget    *float64        `json:"daily_budget"`
	LifetimeBudget *float64        `json:"lifetime_budget"`
	Pacing         *metrics.Pacing `json:"pacing"`
	Metrics        *metrics.Values `json:"metrics,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type AdGroup struct {
	ID           uuid.UUID       `json:"id"`
	AccountID    uuid.UUID       `json:"account_id"`
	AccountName  string          `json:"account_name"`
	CampaignID   uuid.UUID       `json:"campaign_id"`
	CampaignName string          `json:"campaign_name"`
	Provider     ads.Provider    `json:"provider"`
	ExternalID   string          `json:"external_id"`
	Name         string          `json:"name"`
	Status       string          `json:"status"`
	Currency     string          `json:"currency"`
	DailyBudget  *float64        `json:"daily_budget"`
	Metrics      *metrics.Values `json:"metrics,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

type Ad struct {
	ID                 uuid.UUID       `json:"id"`
	AccountID          uuid.UUID       `json:"account_id"`
	AccountName        string          `json:"account_name"`
	CampaignID         uuid.UUID       `json:"campaign_id"`
	CampaignName       string          `json:"campaign_name"`
	AdGroupID          uuid.UUID       `json:"ad_group_id"`
	AdGroupName        string          `json:"ad_group_name"`
	Provider           ads.Provider    `json:"provider"`
	ExternalID         string          `json:"external_id"`
	Name               string          `json:"name"`
	Status             string          `json:"status"`
	Currency           string          `json:"currency"`
	CreativeID         *uuid.UUID      `json:"creative_id"`
	CreativeExternalID string          `json:"creative_external_id"`
	Metrics            *metrics.Values `json:"metrics,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

type Creative struct {
	ID           uuid.UUID       `json:"id"`
	AccountID    uuid.UUID       `json:"account_id"`
	AccountName  string          `json:"account_name"`
	Provider     ads.Provider    `json:"provider"`
	ExternalID   string          `json:"external_id"`
	Name         string          `json:"name"`
	Type         string          `json:"type"`
	ThumbnailURL string          `json:"thumbnail_url"`
	Currency     string          `json:"currency"`
	Metrics      *metrics.Values `json:"metrics,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

func (s *Service) ListCampaigns(ctx context.Context, orgID uuid.UUID, f ListFilter) ([]Campaign, int64, error) {
	search, exact := searchArgs(f.Search)
	rows, err := s.db.ListCampaigns(ctx, store.ListCampaignsParams{
		OrganizationID: orgID, AccountID: f.AccountID, Provider: providerArg(f.Provider), Status: statusArg(f.Status),
		CampaignID: f.CampaignID, Search: search, SearchExact: exact,
		RowLimit: int32(f.Page.Limit), RowOffset: int32(f.Page.Offset),
	})
	if err != nil {
		return nil, 0, err
	}
	out := make([]Campaign, len(rows))
	var total int64
	for i, r := range rows {
		c := r.Campaign
		total = r.Total
		out[i] = Campaign{
			ID: c.ID, AccountID: c.AccountID, AccountName: r.AccountName, Provider: ads.Provider(c.Provider),
			ExternalID: c.ExternalID, Name: c.Name, Status: string(c.Status), Objective: c.Objective,
			Currency: r.Currency, Timezone: r.Timezone,
			DailyBudget: units(c.DailyBudgetMicros), LifetimeBudget: units(c.LifetimeBudgetMicros),
			CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
		}
	}
	if len(rows) == 0 && f.Page.Offset > 0 {
		// Past the end: the window count is unavailable, so fetch it from page one.
		f.Page, f.Range = params.Page{Limit: 1}, nil
		_, total, err := s.ListCampaigns(ctx, orgID, f)
		return []Campaign{}, total, err
	}
	pin := make([]metrics.PacingInput, len(rows))
	for i, r := range rows {
		pin[i] = metrics.PacingInput{AccountID: r.Campaign.AccountID, Timezone: r.Timezone,
			CampaignExternalID: r.Campaign.ExternalID, DailyBudgetMicros: r.Campaign.DailyBudgetMicros,
			Active: r.Campaign.Status == store.AdEntityStatusActive}
	}
	pacing, err := metrics.BudgetPacing(ctx, s.metrics, orgID, pin, s.now())
	if err != nil {
		return nil, 0, err
	}
	for i := range out {
		out[i].Pacing = &pacing[i]
	}
	if f.Range != nil && len(out) > 0 {
		refs := make([]rowRef, len(out))
		for i, c := range out {
			refs[i] = rowRef{c.AccountID, c.ExternalID, c.Currency}
		}
		vals, err := s.rowMetrics(ctx, orgID, reports.CampaignDaily, metrics.FieldCampaign, *f.Range, refs)
		if err != nil {
			return nil, 0, err
		}
		for i := range out {
			out[i].Metrics = &vals[i]
		}
	}
	return out, total, nil
}

func (s *Service) ListAdGroups(ctx context.Context, orgID uuid.UUID, f ListFilter) ([]AdGroup, int64, error) {
	search, exact := searchArgs(f.Search)
	rows, err := s.db.ListAdGroups(ctx, store.ListAdGroupsParams{
		OrganizationID: orgID, AccountID: f.AccountID, Provider: providerArg(f.Provider), Status: statusArg(f.Status),
		CampaignID: f.CampaignID, Search: search, SearchExact: exact,
		RowLimit: int32(f.Page.Limit), RowOffset: int32(f.Page.Offset),
	})
	if err != nil {
		return nil, 0, err
	}
	out := make([]AdGroup, len(rows))
	var total int64
	for i, r := range rows {
		g := r.AdGroup
		total = r.Total
		out[i] = AdGroup{
			ID: g.ID, AccountID: g.AccountID, AccountName: r.AccountName, CampaignID: g.CampaignID,
			CampaignName: r.CampaignName, Provider: ads.Provider(g.Provider), ExternalID: g.ExternalID,
			Name: g.Name, Status: string(g.Status), Currency: r.Currency, DailyBudget: units(g.DailyBudgetMicros),
			CreatedAt: g.CreatedAt, UpdatedAt: g.UpdatedAt,
		}
	}
	if len(rows) == 0 && f.Page.Offset > 0 {
		// Past the end: the window count is unavailable, so fetch it from page one.
		f.Page, f.Range = params.Page{Limit: 1}, nil
		_, total, err := s.ListAdGroups(ctx, orgID, f)
		return []AdGroup{}, total, err
	}
	if f.Range != nil && len(out) > 0 {
		refs := make([]rowRef, len(out))
		for i, g := range out {
			refs[i] = rowRef{g.AccountID, g.ExternalID, g.Currency}
		}
		vals, err := s.rowMetrics(ctx, orgID, reports.AdDaily, metrics.FieldAdGroup, *f.Range, refs)
		if err != nil {
			return nil, 0, err
		}
		for i := range out {
			out[i].Metrics = &vals[i]
		}
	}
	return out, total, nil
}

func (s *Service) ListAds(ctx context.Context, orgID uuid.UUID, f ListFilter) ([]Ad, int64, error) {
	search, exact := searchArgs(f.Search)
	rows, err := s.db.ListAds(ctx, store.ListAdsParams{
		OrganizationID: orgID, AccountID: f.AccountID, Provider: providerArg(f.Provider), Status: statusArg(f.Status),
		CampaignID: f.CampaignID, AdGroupID: f.AdGroupID, Search: search, SearchExact: exact,
		RowLimit: int32(f.Page.Limit), RowOffset: int32(f.Page.Offset),
	})
	if err != nil {
		return nil, 0, err
	}
	out := make([]Ad, len(rows))
	var total int64
	for i, r := range rows {
		a := r.Ad
		total = r.Total
		out[i] = Ad{
			ID: a.ID, AccountID: a.AccountID, AccountName: r.AccountName, CampaignID: a.CampaignID,
			CampaignName: r.CampaignName, AdGroupID: a.AdGroupID, AdGroupName: r.AdGroupName,
			Provider: ads.Provider(a.Provider), ExternalID: a.ExternalID, Name: a.Name, Status: string(a.Status),
			Currency: r.Currency, CreativeID: r.CreativeID, CreativeExternalID: a.CreativeExternalID,
			CreatedAt: a.CreatedAt, UpdatedAt: a.UpdatedAt,
		}
	}
	if len(rows) == 0 && f.Page.Offset > 0 {
		// Past the end: the window count is unavailable, so fetch it from page one.
		f.Page, f.Range = params.Page{Limit: 1}, nil
		_, total, err := s.ListAds(ctx, orgID, f)
		return []Ad{}, total, err
	}
	if f.Range != nil && len(out) > 0 {
		refs := make([]rowRef, len(out))
		for i, a := range out {
			refs[i] = rowRef{a.AccountID, a.ExternalID, a.Currency}
		}
		vals, err := s.rowMetrics(ctx, orgID, reports.AdDaily, metrics.FieldAd, *f.Range, refs)
		if err != nil {
			return nil, 0, err
		}
		for i := range out {
			out[i].Metrics = &vals[i]
		}
	}
	return out, total, nil
}

func (s *Service) ListCreatives(ctx context.Context, orgID uuid.UUID, f ListFilter) ([]Creative, int64, error) {
	search, exact := searchArgs(f.Search)
	rows, err := s.db.ListCreatives(ctx, store.ListCreativesParams{
		OrganizationID: orgID, AccountID: f.AccountID, Provider: providerArg(f.Provider),
		CampaignID: f.CampaignID, Search: search, SearchExact: exact,
		RowLimit: int32(f.Page.Limit), RowOffset: int32(f.Page.Offset),
	})
	if err != nil {
		return nil, 0, err
	}
	out := make([]Creative, len(rows))
	var total int64
	for i, r := range rows {
		c := r.Creative
		total = r.Total
		out[i] = Creative{
			ID: c.ID, AccountID: c.AccountID, AccountName: r.AccountName, Provider: ads.Provider(c.Provider),
			ExternalID: c.ExternalID, Name: c.Name, Type: c.Type, ThumbnailURL: c.ThumbnailUrl,
			Currency: r.Currency, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
		}
	}
	if len(rows) == 0 && f.Page.Offset > 0 {
		// Past the end: the window count is unavailable, so fetch it from page one.
		f.Page, f.Range = params.Page{Limit: 1}, nil
		_, total, err := s.ListCreatives(ctx, orgID, f)
		return []Creative{}, total, err
	}
	if f.Range != nil && len(out) > 0 {
		refs := make([]rowRef, len(out))
		for i, c := range out {
			refs[i] = rowRef{c.AccountID, c.ExternalID, c.Currency}
		}
		vals, err := s.rowMetrics(ctx, orgID, reports.CreativeDaily, metrics.FieldCreative, *f.Range, refs)
		if err != nil {
			return nil, 0, err
		}
		for i := range out {
			out[i].Metrics = &vals[i]
		}
	}
	return out, total, nil
}

type rowRef struct {
	account    uuid.UUID
	externalID string
	currency   string
}

// rowMetrics aggregates report over r for each row, keyed by (account,
// external ID of field). Each row belongs to one account, hence one currency.
func (s *Service) rowMetrics(ctx context.Context, orgID uuid.UUID, report string, field metrics.Field, r params.DateRange, refs []rowRef) ([]metrics.Values, error) {
	f := metrics.Filter{OrganizationID: orgID, Report: report, From: r.From, To: r.To}
	seenAcct := map[uuid.UUID]bool{}
	for _, ref := range refs {
		if !seenAcct[ref.account] {
			seenAcct[ref.account] = true
			f.AccountIDs = append(f.AccountIDs, ref.account)
		}
		switch field {
		case metrics.FieldCampaign:
			f.CampaignExternalIDs = append(f.CampaignExternalIDs, ref.externalID)
		case metrics.FieldAdGroup:
			f.AdGroupExternalIDs = append(f.AdGroupExternalIDs, ref.externalID)
		case metrics.FieldAd:
			f.AdExternalIDs = append(f.AdExternalIDs, ref.externalID)
		case metrics.FieldCreative:
			f.CreativeExternalIDs = append(f.CreativeExternalIDs, ref.externalID)
		}
	}
	rows, err := s.metrics.Aggregate(ctx, metrics.AggregateQuery{Filter: f, GroupBy: []metrics.Field{metrics.FieldAccount, field}})
	if err != nil {
		return nil, err
	}
	type key struct {
		account uuid.UUID
		ext     string
	}
	sums := make(map[key]metrics.Measures, len(rows))
	for _, row := range rows {
		var ext string
		switch field {
		case metrics.FieldCampaign:
			ext = row.CampaignID
		case metrics.FieldAdGroup:
			ext = row.AdGroupID
		case metrics.FieldAd:
			ext = row.AdID
		case metrics.FieldCreative:
			ext = row.CreativeID
		}
		sums[key{row.AccountID, ext}] = row.Measures
	}
	out := make([]metrics.Values, len(refs))
	for i, ref := range refs {
		out[i] = metrics.Compute(sums[key{ref.account, ref.externalID}], ref.currency)
	}
	return out, nil
}

func units(micros *int64) *float64 {
	if micros == nil {
		return nil
	}
	v := metrics.MicrosToUnits(*micros)
	return &v
}

func providerArg(p ads.Provider) *store.AdProvider {
	if p == "" {
		return nil
	}
	v := store.AdProvider(p)
	return &v
}

func statusArg(s ads.Status) *store.AdEntityStatus {
	if s == "" {
		return nil
	}
	v := store.AdEntityStatus(s)
	return &v
}

func searchArgs(s string) (pattern, exact *string) {
	if s == "" {
		return nil, nil
	}
	p := params.LikePattern(s)
	return &p, &s
}
