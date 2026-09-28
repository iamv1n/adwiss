// Package alerts detects notable conditions in synced ad data (spend spikes,
// ROAS drops, campaigns that stopped delivering, integrations that need
// reconnecting, failed automation actions), stores them per organization,
// tracks per-user read state and emails members according to their
// preferences.
//
// Detection runs hourly in the worker (TaskRun). Detectors are pure functions
// over small inputs (detect.go) so thresholds are unit-tested; the service
// loads the inputs, upserts alerts by dedupe key, resolves conditions that
// cleared, and enqueues one batched email per recipient.
package alerts

import (
	"time"

	"github.com/google/uuid"
)

// Kinds.
const (
	KindSpendSpike        = "spend_spike"
	KindROASDrop          = "roas_drop"
	KindStoppedDelivering = "stopped_delivering"
	KindNeedsReauth       = "needs_reauth"
	KindActionFailed      = "action_failed"
)

// Kinds lists every kind with a label, for the preferences UI.
var Kinds = []KindInfo{
	{KindSpendSpike, "Spend spikes", "A campaign spent at least 2x its 7-day average yesterday."},
	{KindROASDrop, "ROAS drops", "Return on ad spend over the last 3 days fell 40% or more."},
	{KindStoppedDelivering, "Stopped delivering", "An active campaign got no impressions yesterday."},
	{KindNeedsReauth, "Reconnect needed", "An ad platform connection needs to be reconnected."},
	{KindActionFailed, "Failed actions", "A rule, schedule or manual change could not be applied."},
}

type KindInfo struct {
	Kind        string `json:"kind"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

func validKind(k string) bool {
	for _, ki := range Kinds {
		if ki.Kind == k {
			return true
		}
	}
	return false
}

// Severities, in increasing order.
const (
	SeverityInfo     = "info"
	SeverityWarning  = "warning"
	SeverityCritical = "critical"
)

func severityRank(s string) int {
	switch s {
	case SeverityInfo:
		return 1
	case SeverityWarning:
		return 2
	case SeverityCritical:
		return 3
	}
	return 0
}

// Email levels: the minimum severity emailed (none = never).
const (
	EmailAll      = "all"
	EmailWarning  = "warning"
	EmailCritical = "critical"
	EmailNone     = "none"
)

// Alert is a stored alert as returned by the API.
type Alert struct {
	ID             uuid.UUID      `json:"id"`
	OrganizationID uuid.UUID      `json:"organization_id"`
	Kind           string         `json:"kind"`
	Severity       string         `json:"severity"`
	EntityType     *string        `json:"entity_type"`
	EntityID       *uuid.UUID     `json:"entity_id"`
	EntityName     *string        `json:"entity_name"`
	Title          string         `json:"title"`
	Body           string         `json:"body"`
	Data           map[string]any `json:"data"`
	DedupeKey      string         `json:"-"`
	Link           string         `json:"link"` // app path, e.g. /app/campaigns/{id}
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	ResolvedAt     *time.Time     `json:"resolved_at"`
	ReadAt         *time.Time     `json:"read_at"`
}

// Detected is a condition found by a detector, before storage.
type Detected struct {
	Kind       string
	Severity   string
	EntityType string // "" = none
	EntityID   *uuid.UUID
	EntityName string
	Title      string
	Body       string
	Data       map[string]any
	DedupeKey  string
}

// Preferences are one user's email settings in one organization.
type Preferences struct {
	EmailLevel      string   `json:"email_level"`
	EmailMutedKinds []string `json:"email_muted_kinds"`
	IsDefault       bool     `json:"is_default"` // no saved row; role default applies
}

// DefaultPreferences: owners and admins get warning+critical by email,
// members get in-app only.
func DefaultPreferences(role string) Preferences {
	level := EmailNone
	if role == "owner" || role == "admin" {
		level = EmailWarning
	}
	return Preferences{EmailLevel: level, EmailMutedKinds: []string{}, IsDefault: true}
}

// WantsEmail reports whether p asks for an email about an alert of this kind
// and severity.
func (p Preferences) WantsEmail(kind, severity string) bool {
	for _, k := range p.EmailMutedKinds {
		if k == kind {
			return false
		}
	}
	switch p.EmailLevel {
	case EmailAll:
		return true
	case EmailWarning:
		return severityRank(severity) >= severityRank(SeverityWarning)
	case EmailCritical:
		return severityRank(severity) >= severityRank(SeverityCritical)
	}
	return false
}

// LinkFor is the app page an alert points to.
func LinkFor(kind string, entityType *string, entityID *uuid.UUID) string {
	switch kind {
	case KindNeedsReauth:
		return "/app/integrations"
	case KindActionFailed:
		return "/app/actions"
	}
	if entityType != nil && *entityType == "campaign" && entityID != nil {
		return "/app/campaigns/" + entityID.String()
	}
	return "/app/dashboard"
}
