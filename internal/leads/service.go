package leads

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/manage"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	dbstore "github.com/iamv1n/adwise/internal/store"
)

type Service struct {
	db    *database.DB
	store *Store
	now   func() time.Time
}

func NewService(db *database.DB) *Service {
	return &Service{db: db, store: NewStore(db.Pool), now: time.Now}
}

func validation(field, msg string) error {
	e := httpx.NewError(http.StatusUnprocessableEntity, "validation_failed", msg)
	e.Fields = map[string]string{field: msg}
	return e
}

func mapErr(err error) error {
	switch {
	case errors.Is(err, errNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, errBadCursor):
		return validation("cursor", "invalid cursor")
	}
	return err
}

// List returns a page of leads, newest first.
func (s *Service) List(ctx context.Context, orgID uuid.UUID, f Filter) ([]Lead, string, error) {
	if f.Status != "" && !slices.Contains(Statuses, f.Status) {
		return nil, "", validation("status", "unknown status")
	}
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	out, next, err := s.store.list(ctx, orgID, f)
	return out, next, mapErr(err)
}

func (s *Service) Get(ctx context.Context, orgID, id uuid.UUID) (Lead, error) {
	l, err := s.store.get(ctx, orgID, id)
	return l, mapErr(err)
}

// Summary returns pipeline counts, won value and spend per campaign over
// [from, to), plus totals. Money totals are only summed when every row shares
// one currency; otherwise the totals' money fields are nil.
func (s *Service) Summary(ctx context.Context, orgID uuid.UUID, from, to time.Time) (Summary, error) {
	if !to.After(from) {
		return Summary{}, validation("to", "to must be after from")
	}
	if to.Sub(from) > 400*24*time.Hour {
		return Summary{}, validation("from", "range is capped at 400 days")
	}
	rows, err := s.store.summary(ctx, orgID, from, to)
	if err != nil {
		return Summary{}, err
	}
	t := SummaryRow{ByStatus: map[string]int{}}
	currencies := map[string]bool{}
	var spend float64
	hasSpend := false
	for _, r := range rows {
		t.Leads += r.Leads
		t.Won += r.Won
		t.WonValue += r.WonValue
		for k, v := range r.ByStatus {
			t.ByStatus[k] += v
		}
		if r.Currency != "" {
			currencies[r.Currency] = true
		}
		if r.Spend != nil {
			spend += *r.Spend
			hasSpend = true
		}
	}
	for _, st := range Statuses {
		t.ByStatus[st] += 0
	}
	switch len(currencies) {
	case 0:
	case 1:
		for c := range currencies {
			t.Currency = c
		}
		if hasSpend {
			t.Spend = &spend
		}
	default:
		t.Currency = "mixed"
	}
	t.derive()
	return Summary{Totals: t, Campaigns: rows}, nil
}

// CreateInput is a lead entered by hand. Value is in the campaign account's
// currency, or Currency when there is no campaign.
type CreateInput struct {
	CampaignID    *uuid.UUID `json:"campaign_id"`
	Name          string     `json:"name" validate:"required,max=200"`
	Email         string     `json:"email" validate:"omitempty,email,max=320"`
	Phone         string     `json:"phone" validate:"omitempty,max=40"`
	Status        string     `json:"status" validate:"omitempty,oneof=new contacted qualified won lost"`
	Value         *float64   `json:"value" validate:"omitempty,gte=0"`
	Currency      string     `json:"currency" validate:"omitempty,len=3,uppercase"`
	Notes         string     `json:"notes" validate:"max=5000"`
	LeadCreatedAt *time.Time `json:"lead_created_at"`
}

func (s *Service) Create(ctx context.Context, m organizations.Membership, in CreateInput) (Lead, error) {
	p := createParams{
		orgID: m.OrganizationID, actorID: m.UserID, campaignID: in.CampaignID,
		name: strings.TrimSpace(in.Name), email: strings.TrimSpace(in.Email), phone: strings.TrimSpace(in.Phone),
		status: in.Status, value: in.Value, currency: in.Currency, notes: in.Notes, createdAt: s.now(),
	}
	if p.status == "" {
		p.status = StatusNew
	}
	if in.LeadCreatedAt != nil {
		p.createdAt = *in.LeadCreatedAt
	}
	if in.CampaignID != nil {
		acct, cur, err := s.store.campaignAccount(ctx, m.OrganizationID, *in.CampaignID)
		if errors.Is(err, errNotFound) {
			return Lead{}, validation("campaign_id", "campaign not found")
		}
		if err != nil {
			return Lead{}, err
		}
		p.accountID, p.currency = &acct, cur
	}
	id, err := s.store.create(ctx, p)
	if err != nil {
		return Lead{}, err
	}
	l, err := s.Get(ctx, m.OrganizationID, id)
	if err != nil {
		return Lead{}, err
	}
	return l, s.record(ctx, m, "lead.created", id, map[string]any{"status": l.Status, "value": l.Value, "campaign_id": l.CampaignID})
}

// UpdateInput changes the pipeline fields; omitted fields are unchanged.
// "value": null clears the value.
type UpdateInput struct {
	Status *string                  `json:"status" validate:"omitempty,oneof=new contacted qualified won lost"`
	Value  manage.Optional[float64] `json:"value"`
	Notes  *string                  `json:"notes" validate:"omitempty,max=5000"`
	Name   *string                  `json:"name" validate:"omitempty,max=200"`
	Email  *string                  `json:"email" validate:"omitempty,max=320"`
	Phone  *string                  `json:"phone" validate:"omitempty,max=40"`
}

func (s *Service) Update(ctx context.Context, m organizations.Membership, id uuid.UUID, in UpdateInput) (Lead, error) {
	before, err := s.Get(ctx, m.OrganizationID, id)
	if err != nil {
		return Lead{}, err
	}
	if v := in.Value.Ptr(); v != nil && *v < 0 {
		return Lead{}, validation("value", "value must not be negative")
	}
	p := updateParams{status: in.Status, notes: in.Notes, name: in.Name, email: in.Email, phone: in.Phone}
	p.value, p.clearValue = in.Value.Ptr(), in.Value.Set && in.Value.Null
	if err := s.store.update(ctx, m.OrganizationID, id, p); err != nil {
		return Lead{}, mapErr(err)
	}
	after, err := s.Get(ctx, m.OrganizationID, id)
	if err != nil {
		return Lead{}, err
	}
	action := "lead.updated"
	if after.Status == StatusWon && before.Status != StatusWon {
		action = "lead.won"
	}
	return after, s.record(ctx, m, action, id, map[string]any{
		"before": map[string]any{"status": before.Status, "value": before.Value},
		"after":  map[string]any{"status": after.Status, "value": after.Value},
	})
}

func (s *Service) record(ctx context.Context, m organizations.Membership, action string, id uuid.UUID, meta map[string]any) error {
	orgID, uid := m.OrganizationID, m.UserID
	return s.db.InTx(ctx, func(q *dbstore.Queries) error {
		return audit.Record(ctx, q, audit.Entry{OrganizationID: &orgID, ActorUserID: &uid, Action: action,
			EntityType: "lead", EntityID: id.String(), Metadata: meta})
	})
}
