package alerts

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/platform/mailer"
	dbstore "github.com/iamv1n/adwise/internal/store"
)

type Service struct {
	db         *database.DB
	st         *store
	enq        mailer.Enqueuer // nil = no email (in-app only)
	webBaseURL string
	th         Thresholds
	log        *slog.Logger
}

// NewService builds the service. enq may be nil, in which case alerts are
// in-app only.
func NewService(db *database.DB, enq mailer.Enqueuer, webBaseURL string) *Service {
	return &Service{db: db, st: &store{pool: db.Pool}, enq: enq, webBaseURL: webBaseURL,
		th: DefaultThresholds, log: slog.Default().With("component", "alerts")}
}

// --- reads and read state ---

func (s *Service) List(ctx context.Context, m organizations.Membership, f ListFilter) ([]Alert, int, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	list, err := s.st.list(ctx, m.OrganizationID, m.UserID, f)
	if err != nil {
		return nil, 0, err
	}
	n, err := s.st.unreadCount(ctx, m.OrganizationID, m.UserID)
	return list, n, err
}

func (s *Service) UnreadCount(ctx context.Context, m organizations.Membership) (int, error) {
	return s.st.unreadCount(ctx, m.OrganizationID, m.UserID)
}

func (s *Service) MarkRead(ctx context.Context, m organizations.Membership, id uuid.UUID) error {
	if err := s.st.markRead(ctx, m.OrganizationID, m.UserID, id); err != nil {
		if errors.Is(err, errNotFound) {
			return httpx.ErrNotFound
		}
		return err
	}
	return nil
}

func (s *Service) MarkAllRead(ctx context.Context, m organizations.Membership) (int64, error) {
	return s.st.markAllRead(ctx, m.OrganizationID, m.UserID)
}

// --- preferences ---

func (s *Service) Preferences(ctx context.Context, m organizations.Membership) (Preferences, error) {
	p, ok, err := s.st.preferences(ctx, m.OrganizationID, m.UserID)
	if err != nil {
		return p, err
	}
	if !ok {
		return DefaultPreferences(string(m.Role)), nil
	}
	if p.EmailMutedKinds == nil {
		p.EmailMutedKinds = []string{}
	}
	return p, nil
}

type PreferencesInput struct {
	EmailLevel      string   `json:"email_level" validate:"required,oneof=all warning critical none"`
	EmailMutedKinds []string `json:"email_muted_kinds" validate:"omitempty,max=20"`
}

func (s *Service) SavePreferences(ctx context.Context, m organizations.Membership, in PreferencesInput) (Preferences, error) {
	muted := []string{}
	for _, k := range in.EmailMutedKinds {
		if !validKind(k) {
			return Preferences{}, &httpx.Error{Status: http.StatusUnprocessableEntity, Code: "validation_failed",
				Message: "unknown alert kind", Fields: map[string]string{"email_muted_kinds": "unknown kind " + k}}
		}
		if !slices.Contains(muted, k) {
			muted = append(muted, k)
		}
	}
	sort.Strings(muted)
	before, err := s.Preferences(ctx, m)
	if err != nil {
		return Preferences{}, err
	}
	p := Preferences{EmailLevel: in.EmailLevel, EmailMutedKinds: muted}
	if err := s.st.savePreferences(ctx, m.OrganizationID, m.UserID, p); err != nil {
		return Preferences{}, err
	}
	orgID, uid := m.OrganizationID, m.UserID
	if err := s.db.InTx(ctx, func(q *dbstore.Queries) error {
		return audit.Record(ctx, q, audit.Entry{OrganizationID: &orgID, ActorUserID: &uid, Action: "alert_preferences.updated",
			EntityType: "user", EntityID: uid.String(), Metadata: map[string]any{"before": before, "after": p}})
	}); err != nil {
		s.log.ErrorContext(ctx, "audit", "err", err)
	}
	return p, nil
}

// --- detection ---

// RunResult summarises one organization's run.
type RunResult struct {
	Created  int `json:"created"`
	Updated  int `json:"updated"`
	Resolved int `json:"resolved"`
	Emails   int `json:"emails"`
}

// RunAll runs detection for every organization. One organization failing does
// not stop the others.
func (s *Service) RunAll(ctx context.Context) error {
	orgs, err := s.st.organizations(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, o := range orgs {
		res, err := s.runOrg(ctx, o.ID, o.Name)
		if err != nil {
			s.log.ErrorContext(ctx, "alerts run failed", "org", o.ID, "err", err)
			errs = append(errs, fmt.Errorf("org %s: %w", o.ID, err))
			continue
		}
		if res != (RunResult{}) {
			s.log.InfoContext(ctx, "alerts run", "org", o.ID, "created", res.Created, "updated", res.Updated, "resolved", res.Resolved, "emails", res.Emails)
		}
	}
	return errors.Join(errs...)
}

// RunOrg runs detection for one organization (admin "run now").
func (s *Service) RunOrg(ctx context.Context, orgID uuid.UUID) (RunResult, error) {
	name, err := s.st.orgName(ctx, orgID)
	if err != nil {
		return RunResult{}, err
	}
	return s.runOrg(ctx, orgID, name)
}

func (s *Service) runOrg(ctx context.Context, orgID uuid.UUID, orgName string) (RunResult, error) {
	var res RunResult
	var fires []Detected
	var clears []string

	series, err := s.st.campaignSeries(ctx, orgID)
	if err != nil {
		return res, fmt.Errorf("campaign series: %w", err)
	}
	for _, cs := range series {
		f, c := DetectCampaign(cs, s.th)
		fires, clears = append(fires, f...), append(clears, c...)
	}

	ints, err := s.st.integrations(ctx, orgID)
	if err != nil {
		return res, fmt.Errorf("integrations: %w", err)
	}
	f, c := DetectIntegrations(ints)
	fires, clears = append(fires, f...), append(clears, c...)
	// Deleted connections: resolve their open reconnect alerts too.
	open, err := s.st.openKeys(ctx, orgID, KindNeedsReauth)
	if err != nil {
		return res, err
	}
	clears = append(clears, staleKeys(open, f)...)

	groups, err := s.st.failedActions(ctx, orgID)
	if err != nil {
		return res, fmt.Errorf("failed actions: %w", err)
	}
	fires = append(fires, DetectFailedActions(groups, s.th)...)

	for _, d := range fires {
		inserted, err := s.st.upsert(ctx, orgID, d)
		if err != nil {
			return res, fmt.Errorf("upsert %s: %w", d.DedupeKey, err)
		}
		if inserted {
			res.Created++
		} else {
			res.Updated++
		}
	}
	n, err := s.st.resolve(ctx, orgID, clears)
	if err != nil {
		return res, err
	}
	res.Resolved = int(n)

	res.Emails, err = s.deliver(ctx, orgID, orgName)
	return res, err
}

// staleKeys returns open keys that no longer fire.
func staleKeys(open []string, fires []Detected) []string {
	firing := map[string]bool{}
	for _, d := range fires {
		firing[d.DedupeKey] = true
	}
	var out []string
	for _, k := range open {
		if !firing[k] {
			out = append(out, k)
		}
	}
	return out
}

// deliver emails new alerts: one batched email per recipient, filtered by
// their preferences. Alerts are marked processed once every email is queued.
func (s *Service) deliver(ctx context.Context, orgID uuid.UUID, orgName string) (int, error) {
	pending, err := s.st.pendingEmail(ctx, orgID)
	if err != nil || len(pending) == 0 {
		return 0, err
	}
	sent := 0
	if s.enq != nil {
		recipients, err := s.st.recipients(ctx, orgID)
		if err != nil {
			return 0, err
		}
		msgs, err := PlanEmails(s.webBaseURL, orgName, recipients, pending)
		if err != nil {
			return 0, err
		}
		for _, pm := range msgs {
			// The task ID makes a retried run idempotent per recipient + alert set.
			err := mailer.Enqueue(ctx, s.enq, pm.Message, asynq.TaskID("alerts-email:"+pm.Key))
			if err != nil && !errors.Is(err, asynq.ErrTaskIDConflict) {
				return sent, err
			}
			sent++
		}
	}
	ids := make([]uuid.UUID, len(pending))
	for i, a := range pending {
		ids[i] = a.ID
	}
	return sent, s.st.markEmailed(ctx, ids)
}

// PlannedEmail is one recipient's batched email.
type PlannedEmail struct {
	Key     string // stable per recipient + alert set
	Message mailer.Message
}

// PlanEmails builds the emails for a batch of new alerts.
func PlanEmails(webBaseURL, orgName string, recipients []Recipient, list []Alert) ([]PlannedEmail, error) {
	var out []PlannedEmail
	for _, r := range recipients {
		mine := r.Filter(list)
		msg, ok, err := BuildEmail(webBaseURL, orgName, r, mine)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		h := sha256.New()
		h.Write([]byte(strings.ToLower(r.Email)))
		for _, a := range mine {
			h.Write(a.ID[:])
		}
		out = append(out, PlannedEmail{Key: hex.EncodeToString(h.Sum(nil)[:16]), Message: msg})
	}
	return out, nil
}
