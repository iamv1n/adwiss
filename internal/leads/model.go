// Package leads stores lead-form leads imported from Meta Lead Ads and leads
// entered by hand, and the sales outcome the team records against them
// (contacted → qualified → won / lost, with a deal value).
//
// A won lead's value is revenue attributed to the campaign and ad that
// produced it, which is how businesses whose sale happens offline (real
// estate, education, services, B2B) get cost per deal and real ROAS.
//
// Imports run inside the account sync (internal/integrations calls
// Store.SyncTargets and Store.UpsertImported); they never overwrite the
// status, value or notes the team entered.
package leads

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Lead statuses, in pipeline order.
const (
	StatusNew       = "new"
	StatusContacted = "contacted"
	StatusQualified = "qualified"
	StatusWon       = "won"
	StatusLost      = "lost"
)

var Statuses = []string{StatusNew, StatusContacted, StatusQualified, StatusWon, StatusLost}

// Lead sources.
const (
	SourceMetaForm = "meta_form"
	SourceManual   = "manual"
)

// Lead is the API shape of a lead. Value is in major units of Currency.
type Lead struct {
	ID              uuid.UUID         `json:"id"`
	Source          string            `json:"source"`
	Provider        *string           `json:"provider"`
	ExternalID      *string           `json:"external_id"`
	AccountID       *uuid.UUID        `json:"account_id"`
	CampaignID      *uuid.UUID        `json:"campaign_id"`
	CampaignName    *string           `json:"campaign_name"`
	AdGroupID       *uuid.UUID        `json:"ad_group_id"`
	AdGroupName     *string           `json:"ad_group_name"`
	AdID            *uuid.UUID        `json:"ad_id"`
	AdName          *string           `json:"ad_name"`
	FormID          string            `json:"form_id"`
	IsOrganic       bool              `json:"is_organic"`
	Name            string            `json:"name"`
	Email           string            `json:"email"`
	Phone           string            `json:"phone"`
	Fields          map[string]string `json:"fields"`
	Status          string            `json:"status"`
	Value           *float64          `json:"value"`
	Currency        string            `json:"currency"`
	Notes           string            `json:"notes"`
	LeadCreatedAt   time.Time         `json:"lead_created_at"`
	StatusChangedAt *time.Time        `json:"status_changed_at"`
	WonAt           *time.Time        `json:"won_at"`
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
}

// Filter narrows a lead listing.
type Filter struct {
	Status     string
	CampaignID *uuid.UUID
	Query      string
	From, To   *time.Time // lead_created_at, [From, To)
	Limit      int
	// Cursor is the last row of the previous page: lead_created_at|id.
	Cursor string
}

// Summary is the pipeline over a period, overall and per campaign.
type Summary struct {
	Totals    SummaryRow   `json:"totals"`
	Campaigns []SummaryRow `json:"campaigns"`
}

// SummaryRow counts leads by status. Spend is the campaign's spend over the
// same period (from campaign_daily metrics); money is in major units and only
// summed within one currency per row.
type SummaryRow struct {
	CampaignID   *uuid.UUID     `json:"campaign_id,omitempty"`
	CampaignName *string        `json:"campaign_name,omitempty"`
	Currency     string         `json:"currency"`
	Leads        int            `json:"leads"`
	ByStatus     map[string]int `json:"by_status"`
	Won          int            `json:"won"`
	WonValue     float64        `json:"won_value"`
	Spend        *float64       `json:"spend"`
	// Derived; nil when undefined.
	CostPerLead *float64 `json:"cost_per_lead"`
	CostPerWon  *float64 `json:"cost_per_won"`
	WinRate     *float64 `json:"win_rate"`
	ROAS        *float64 `json:"roas"`
}

func (r *SummaryRow) derive() {
	if r.Leads > 0 {
		v := float64(r.Won) / float64(r.Leads)
		r.WinRate = &v
	}
	if r.Spend == nil {
		return
	}
	s := *r.Spend
	if r.Leads > 0 {
		v := s / float64(r.Leads)
		r.CostPerLead = &v
	}
	if r.Won > 0 {
		v := s / float64(r.Won)
		r.CostPerWon = &v
	}
	if s > 0 {
		v := r.WonValue / s
		r.ROAS = &v
	}
}

// Imported is one lead from a provider, with Adwise IDs resolved.
type imported struct {
	externalID string
	accountID  uuid.UUID
	campaignID *uuid.UUID
	adGroupID  *uuid.UUID
	adID       *uuid.UUID
	formID     string
	isOrganic  bool
	name       string
	email      string
	phone      string
	fields     json.RawMessage
	currency   string
	createdAt  time.Time
}
