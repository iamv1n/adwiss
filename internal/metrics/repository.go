package metrics

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
)

// Repository is the analytical read side of metric facts (plan §32). It only
// knows about facts, never about business entities, so it can move to
// ClickHouse without changing callers: services aggregate here and join the
// results with entities from Postgres in Go.
type Repository interface {
	// Aggregate sums the measures of the facts matching q.Filter, grouped by
	// q.GroupBy. Rows are ordered by the group-by fields.
	Aggregate(ctx context.Context, q AggregateQuery) ([]Row, error)
}

// Writer persists facts. Implementations must be idempotent.
type Writer interface {
	UpsertMetricFacts(ctx context.Context, orgID uuid.UUID, facts []ads.MetricFact) error
}

// Field is a group-by key.
type Field string

const (
	FieldDate              Field = "date"    // account-local date
	FieldHour              Field = "hour"    // account-local hour 0–23 (hourly reports only)
	FieldWeekday           Field = "weekday" // ISO day of week of the account-local date: 1 = Monday … 7 = Sunday
	FieldCurrency          Field = "currency"
	FieldAccount           Field = "account_id"
	FieldProvider          Field = "provider"
	FieldCampaign          Field = "campaign_external_id"
	FieldAdGroup           Field = "ad_group_external_id"
	FieldAd                Field = "ad_external_id"
	FieldCreative          Field = "creative_external_id"
	FieldCountry           Field = "country"
	FieldDevice            Field = "device"
	FieldPlacement         Field = "placement"
	FieldPublisherPlatform Field = "publisher_platform"
	FieldKeyword           Field = "keyword"
	FieldSearchTerm        Field = "search_term"
)

// Filter selects facts. From and To are inclusive account-local dates (only
// the Y-M-D part is used). Empty slices and zero values mean "no filter".
type Filter struct {
	OrganizationID uuid.UUID
	Report         string
	From, To       time.Time

	AccountIDs          []uuid.UUID
	Provider            ads.Provider
	Currency            string
	CampaignExternalIDs []string
	AdGroupExternalIDs  []string
	AdExternalIDs       []string
	CreativeExternalIDs []string
}

type AggregateQuery struct {
	Filter  Filter
	GroupBy []Field
}

// Key holds the group-by values of a Row. Only the fields named in GroupBy
// are set.
type Key struct {
	Date              time.Time
	Hour              int
	Weekday           int
	Currency          string
	AccountID         uuid.UUID
	Provider          ads.Provider
	CampaignID        string // external IDs
	AdGroupID         string
	AdID              string
	CreativeID        string
	Country           string
	Device            string
	Placement         string
	PublisherPlatform string
	Keyword           string
	SearchTerm        string
}

type Row struct {
	Key
	Measures
}
