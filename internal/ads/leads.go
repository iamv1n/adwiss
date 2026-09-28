package ads

import (
	"context"
	"encoding/json"
	"time"
)

// Lead is a lead-form submission as the provider reports it. IDs are provider
// external IDs.
type Lead struct {
	ExternalID string
	AccountID  string
	CampaignID string
	AdGroupID  string
	AdID       string
	FormID     string
	CreatedAt  time.Time
	IsOrganic  bool
	// Fields maps each form question to its answer(s), joined with ", ".
	Fields map[string]string
	Raw    json.RawMessage
}

// LeadReader is implemented by clients that can read lead-form leads (Meta
// Lead Ads). Leads are read per ad; since limits them to newer submissions.
type LeadReader interface {
	ListAdLeads(ctx context.Context, accountID, adID string, since time.Time) ([]Lead, error)
}

// LeadGetter is implemented by clients that can read one lead by its provider
// ID (Meta's leadgen webhook delivers only the ID).
type LeadGetter interface {
	GetLead(ctx context.Context, leadID string) (Lead, error)
}
