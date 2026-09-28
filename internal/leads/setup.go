package leads

import (
	"context"
	"errors"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/iamv1n/adwise/internal/organizations"
)

// Ad types an organization can say it runs. They decide which setup steps
// apply and, later, how results and value are measured.
const (
	AdOnlineSales  = "online_sales"  // purchases on a website or store (pixel)
	AdLeadForms    = "lead_forms"    // Meta instant forms
	AdMessages     = "messages"      // click-to-WhatsApp / Messenger / call ads
	AdWebsiteLeads = "website_leads" // sign-ups, bookings, enquiries on a website
	AdAppInstalls  = "app_installs"
	AdStoreVisits  = "store_visits" // local / offline stores
	AdAwareness    = "awareness"    // reach and video views
)

var AdTypes = []string{AdOnlineSales, AdLeadForms, AdMessages, AdWebsiteLeads, AdAppInstalls, AdStoreVisits, AdAwareness}

// LeadScope is the Meta permission needed to read lead-form leads.
const LeadScope = "leads_retrieval"

// Setup is an organization's lead setup: what it runs and whether Adwise can
// read its leads. It is complete once AdTypes is answered and, when lead-form
// ads are among them, an active Meta connection granted LeadScope.
type Setup struct {
	// nil until answered.
	AdTypes  []string `json:"ad_types"`
	Complete bool     `json:"complete"`
	// The steps still to do: "ad_types", "connect_meta", "grant_lead_access".
	Pending         []string          `json:"pending"`
	MetaConnections []SetupConnection `json:"meta_connections"`
	// InstantLeads is optional (not a pending step): Pages subscribed to
	// Meta's leadgen webhook push leads as they arrive instead of hourly.
	InstantLeads InstantLeads `json:"instant_leads"`
}

type InstantLeads struct {
	Enabled bool `json:"enabled"`
	Pages   int  `json:"pages"`
}

type SetupConnection struct {
	IntegrationID uuid.UUID `json:"integration_id"`
	DisplayName   string    `json:"display_name"`
	HasLeadAccess bool      `json:"has_lead_access"`
}

func (st *Store) setup(ctx context.Context, orgID uuid.UUID) (Setup, error) {
	s := Setup{Pending: []string{}, MetaConnections: []SetupConnection{}}
	err := st.pool.QueryRow(ctx, `SELECT ad_types FROM organization_ad_profiles WHERE organization_id = $1`, orgID).Scan(&s.AdTypes)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return s, err
	}
	rows, err := st.pool.Query(ctx, `
		SELECT id, display_name, $2 = ANY(scopes) FROM integrations
		WHERE organization_id = $1 AND provider = 'meta' AND status = 'active' ORDER BY created_at`, orgID, LeadScope)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var c SetupConnection
		if err := rows.Scan(&c.IntegrationID, &c.DisplayName, &c.HasLeadAccess); err != nil {
			rows.Close()
			return s, err
		}
		s.MetaConnections = append(s.MetaConnections, c)
	}
	if err := rows.Err(); err != nil {
		return s, err
	}

	if err := st.pool.QueryRow(ctx,
		`SELECT count(*) FROM lead_page_subscriptions WHERE organization_id = $1`, orgID).Scan(&s.InstantLeads.Pages); err != nil {
		return s, err
	}
	s.InstantLeads.Enabled = s.InstantLeads.Pages > 0

	switch {
	case s.AdTypes == nil:
		s.Pending = append(s.Pending, "ad_types")
	case slices.Contains(s.AdTypes, AdLeadForms):
		if len(s.MetaConnections) == 0 {
			s.Pending = append(s.Pending, "connect_meta")
		} else if !slices.ContainsFunc(s.MetaConnections, func(c SetupConnection) bool { return c.HasLeadAccess }) {
			s.Pending = append(s.Pending, "grant_lead_access")
		}
	}
	s.Complete = len(s.Pending) == 0
	return s, nil
}

func (st *Store) setAdTypes(ctx context.Context, orgID, userID uuid.UUID, types []string) error {
	_, err := st.pool.Exec(ctx, `
		INSERT INTO organization_ad_profiles (organization_id, ad_types, updated_by) VALUES ($1, $2, $3)
		ON CONFLICT (organization_id) DO UPDATE SET ad_types = EXCLUDED.ad_types, updated_by = EXCLUDED.updated_by, updated_at = now()`,
		orgID, types, userID)
	return err
}

// Setup returns the organization's lead setup status.
func (s *Service) Setup(ctx context.Context, orgID uuid.UUID) (Setup, error) {
	return s.store.setup(ctx, orgID)
}

// SetAdTypes records what the organization runs. At least one type.
func (s *Service) SetAdTypes(ctx context.Context, m organizations.Membership, types []string) (Setup, error) {
	if len(types) == 0 {
		return Setup{}, validation("ad_types", "choose at least one")
	}
	clean := []string{}
	for _, t := range types {
		if !slices.Contains(AdTypes, t) {
			return Setup{}, validation("ad_types", "unknown ad type "+t)
		}
		if !slices.Contains(clean, t) {
			clean = append(clean, t)
		}
	}
	if err := s.store.setAdTypes(ctx, m.OrganizationID, m.UserID, clean); err != nil {
		return Setup{}, err
	}
	if err := s.record(ctx, m, "organization.ad_types_updated", m.OrganizationID, map[string]any{"ad_types": clean}); err != nil {
		return Setup{}, err
	}
	return s.Setup(ctx, m.OrganizationID)
}
