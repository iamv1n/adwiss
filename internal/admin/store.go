package admin

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store holds the cross-organization read queries behind the admin console.
// They bypass tenant scoping on purpose, so they live only here, behind
// auth.RequirePlatformAdmin.
type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

type Stats struct {
	Users                   int64 `json:"users"`
	UsersLast7d             int64 `json:"users_last_7d"`
	ActiveUsers24h          int64 `json:"active_users_24h"`
	PlatformAdmins          int64 `json:"platform_admins"`
	Organizations           int64 `json:"organizations"`
	ActiveImpersonations    int64 `json:"active_impersonations"`
	IntegrationsActive      int64 `json:"integrations_active"`
	IntegrationsNeedsReauth int64 `json:"integrations_needs_reauth"`
	IntegrationsWithErrors  int64 `json:"integrations_with_errors"`
	AdAccounts              int64 `json:"ad_accounts"`
	AdAccountsSyncing       int64 `json:"ad_accounts_syncing"`
	Campaigns               int64 `json:"campaigns"`
	Ads                     int64 `json:"ads"`
	MetricFactsEstimate     int64 `json:"metric_facts_estimate"`
}

func (s *Store) Stats(ctx context.Context) (Stats, error) {
	var st Stats
	err := s.pool.QueryRow(ctx, `
SELECT
  (SELECT count(*) FROM users),
  (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days'),
  (SELECT count(DISTINCT user_id) FROM sessions
    WHERE impersonator_user_id IS NULL AND expires_at > now() AND last_seen_at > now() - interval '24 hours'),
  (SELECT count(*) FROM users WHERE is_platform_admin),
  (SELECT count(*) FROM organizations),
  (SELECT count(*) FROM sessions WHERE impersonator_user_id IS NOT NULL AND expires_at > now()),
  (SELECT count(*) FROM integrations WHERE status = 'active'),
  (SELECT count(*) FROM integrations WHERE status = 'needs_reauth'),
  (SELECT count(*) FROM integrations WHERE last_error IS NOT NULL AND status <> 'disconnected'),
  (SELECT count(*) FROM ad_accounts),
  (SELECT count(*) FROM ad_accounts WHERE sync_enabled),
  (SELECT count(*) FROM campaigns),
  (SELECT count(*) FROM ads),
  -- Planner estimate: exact counts on the partitioned fact table get slow.
  (SELECT coalesce(sum(greatest(c.reltuples, 0)), 0)::bigint
     FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'metric_facts'::regclass)`).Scan(
		&st.Users, &st.UsersLast7d, &st.ActiveUsers24h, &st.PlatformAdmins, &st.Organizations, &st.ActiveImpersonations,
		&st.IntegrationsActive, &st.IntegrationsNeedsReauth, &st.IntegrationsWithErrors,
		&st.AdAccounts, &st.AdAccountsSyncing, &st.Campaigns, &st.Ads, &st.MetricFactsEstimate)
	return st, err
}

// --- users ---

type UserRow struct {
	ID              uuid.UUID  `json:"id"`
	Email           string     `json:"email"`
	Name            string     `json:"name"`
	IsPlatformAdmin bool       `json:"is_platform_admin"`
	CreatedAt       time.Time  `json:"created_at"`
	OrgCount        int64      `json:"org_count"`
	LastSeenAt      *time.Time `json:"last_seen_at"`
	ActiveSessions  int64      `json:"active_sessions"`
}

const userRowCols = `
  u.id, u.email, u.name, u.is_platform_admin, u.created_at,
  (SELECT count(*) FROM organization_users ou WHERE ou.user_id = u.id),
  (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id AND s.impersonator_user_id IS NULL),
  (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now())`

func scanUserRow(row pgx.Row, u *UserRow, extra ...any) error {
	return row.Scan(append([]any{&u.ID, &u.Email, &u.Name, &u.IsPlatformAdmin, &u.CreatedAt, &u.OrgCount, &u.LastSeenAt, &u.ActiveSessions}, extra...)...)
}

// ListUsers returns a page of users, newest first, and the total matching count.
func (s *Store) ListUsers(ctx context.Context, q string, limit, offset int) ([]UserRow, int64, error) {
	rows, err := s.pool.Query(ctx, `
SELECT`+userRowCols+`, count(*) OVER ()
FROM users u
WHERE $1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%'
ORDER BY u.created_at DESC
LIMIT $2 OFFSET $3`, q, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []UserRow{}
	var total int64
	for rows.Next() {
		var u UserRow
		if err := scanUserRow(rows, &u, &total); err != nil {
			return nil, 0, err
		}
		out = append(out, u)
	}
	return out, total, rows.Err()
}

func (s *Store) GetUser(ctx context.Context, id uuid.UUID) (UserRow, error) {
	var u UserRow
	err := scanUserRow(s.pool.QueryRow(ctx, `SELECT`+userRowCols+` FROM users u WHERE u.id = $1`, id), &u)
	return u, err
}

type UserMembership struct {
	OrganizationID uuid.UUID `json:"organization_id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	Role           string    `json:"role"`
	JoinedAt       time.Time `json:"joined_at"`
}

func (s *Store) UserMemberships(ctx context.Context, userID uuid.UUID) ([]UserMembership, error) {
	rows, err := s.pool.Query(ctx, `
SELECT o.id, o.name, o.slug, ou.role::text, ou.created_at
FROM organization_users ou JOIN organizations o ON o.id = ou.organization_id
WHERE ou.user_id = $1
ORDER BY o.name`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (UserMembership, error) {
		var m UserMembership
		err := r.Scan(&m.OrganizationID, &m.Name, &m.Slug, &m.Role, &m.JoinedAt)
		return m, err
	})
}

type SessionRow struct {
	ID                uuid.UUID  `json:"id"`
	UserAgent         string     `json:"user_agent"`
	IPAddress         string     `json:"ip_address"`
	CreatedAt         time.Time  `json:"created_at"`
	LastSeenAt        time.Time  `json:"last_seen_at"`
	ExpiresAt         time.Time  `json:"expires_at"`
	ImpersonatorID    *uuid.UUID `json:"impersonator_id"`
	ImpersonatorEmail *string    `json:"impersonator_email"`
}

func (s *Store) UserSessions(ctx context.Context, userID uuid.UUID) ([]SessionRow, error) {
	rows, err := s.pool.Query(ctx, `
SELECT s.id, s.user_agent, s.ip_address, s.created_at, s.last_seen_at, s.expires_at, s.impersonator_user_id, a.email::text
FROM sessions s LEFT JOIN users a ON a.id = s.impersonator_user_id
WHERE s.user_id = $1 AND s.expires_at > now()
ORDER BY s.last_seen_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (SessionRow, error) {
		var x SessionRow
		err := r.Scan(&x.ID, &x.UserAgent, &x.IPAddress, &x.CreatedAt, &x.LastSeenAt, &x.ExpiresAt, &x.ImpersonatorID, &x.ImpersonatorEmail)
		return x, err
	})
}

// --- organizations ---

type OrgRow struct {
	ID               uuid.UUID  `json:"id"`
	Name             string     `json:"name"`
	Slug             string     `json:"slug"`
	CreatedAt        time.Time  `json:"created_at"`
	Members          int64      `json:"members"`
	Integrations     int64      `json:"integrations"`
	IntegrationIssue int64      `json:"integration_issues"`
	AdAccounts       int64      `json:"ad_accounts"`
	Campaigns        int64      `json:"campaigns"`
	LastSyncedAt     *time.Time `json:"last_synced_at"`
}

const orgRowCols = `
  o.id, o.name, o.slug, o.created_at,
  (SELECT count(*) FROM organization_users ou WHERE ou.organization_id = o.id),
  (SELECT count(*) FROM integrations i WHERE i.organization_id = o.id AND i.status <> 'disconnected'),
  (SELECT count(*) FROM integrations i WHERE i.organization_id = o.id
     AND (i.status = 'needs_reauth' OR (i.status = 'active' AND i.last_error IS NOT NULL))),
  (SELECT count(*) FROM ad_accounts a WHERE a.organization_id = o.id),
  (SELECT count(*) FROM campaigns c WHERE c.organization_id = o.id),
  (SELECT max(ss.last_synced_at) FROM ad_account_sync_state ss WHERE ss.organization_id = o.id)`

func scanOrgRow(row pgx.Row, o *OrgRow, extra ...any) error {
	return row.Scan(append([]any{&o.ID, &o.Name, &o.Slug, &o.CreatedAt, &o.Members, &o.Integrations, &o.IntegrationIssue,
		&o.AdAccounts, &o.Campaigns, &o.LastSyncedAt}, extra...)...)
}

func (s *Store) ListOrgs(ctx context.Context, q string, limit, offset int) ([]OrgRow, int64, error) {
	rows, err := s.pool.Query(ctx, `
SELECT`+orgRowCols+`, count(*) OVER ()
FROM organizations o
WHERE $1 = '' OR o.name ILIKE '%' || $1 || '%' OR o.slug ILIKE '%' || $1 || '%'
ORDER BY o.created_at DESC
LIMIT $2 OFFSET $3`, q, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []OrgRow{}
	var total int64
	for rows.Next() {
		var o OrgRow
		if err := scanOrgRow(rows, &o, &total); err != nil {
			return nil, 0, err
		}
		out = append(out, o)
	}
	return out, total, rows.Err()
}

func (s *Store) GetOrg(ctx context.Context, id uuid.UUID) (OrgRow, error) {
	var o OrgRow
	err := scanOrgRow(s.pool.QueryRow(ctx, `SELECT`+orgRowCols+` FROM organizations o WHERE o.id = $1`, id), &o)
	return o, err
}

type OrgMember struct {
	ID              uuid.UUID `json:"id"`
	Email           string    `json:"email"`
	Name            string    `json:"name"`
	Role            string    `json:"role"`
	IsPlatformAdmin bool      `json:"is_platform_admin"`
	JoinedAt        time.Time `json:"joined_at"`
}

func (s *Store) OrgMembers(ctx context.Context, orgID uuid.UUID) ([]OrgMember, error) {
	rows, err := s.pool.Query(ctx, `
SELECT u.id, u.email, u.name, ou.role::text, u.is_platform_admin, ou.created_at
FROM organization_users ou JOIN users u ON u.id = ou.user_id
WHERE ou.organization_id = $1
ORDER BY ou.role, u.email`, orgID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (OrgMember, error) {
		var m OrgMember
		err := r.Scan(&m.ID, &m.Email, &m.Name, &m.Role, &m.IsPlatformAdmin, &m.JoinedAt)
		return m, err
	})
}

type AccountRow struct {
	ID            uuid.UUID  `json:"id"`
	IntegrationID *uuid.UUID `json:"integration_id"`
	Provider      string     `json:"provider"`
	ExternalID    string     `json:"external_id"`
	Name          string     `json:"name"`
	Currency      string     `json:"currency"`
	Status        string     `json:"status"`
	SyncEnabled   bool       `json:"sync_enabled"`
	Campaigns     int64      `json:"campaigns"`
	// Oldest and newest sync across the account's scopes.
	OldestSyncAt *time.Time `json:"oldest_synced_at"`
	LastSyncAt   *time.Time `json:"last_synced_at"`
}

func (s *Store) OrgAccounts(ctx context.Context, orgID uuid.UUID) ([]AccountRow, error) {
	rows, err := s.pool.Query(ctx, `
SELECT a.id, a.integration_id, a.provider::text, a.external_id, a.name, a.currency, a.status::text, a.sync_enabled,
  (SELECT count(*) FROM campaigns c WHERE c.account_id = a.id),
  (SELECT min(ss.last_synced_at) FROM ad_account_sync_state ss WHERE ss.account_id = a.id),
  (SELECT max(ss.last_synced_at) FROM ad_account_sync_state ss WHERE ss.account_id = a.id)
FROM ad_accounts a
WHERE a.organization_id = $1
ORDER BY a.provider, a.name`, orgID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (AccountRow, error) {
		var a AccountRow
		err := r.Scan(&a.ID, &a.IntegrationID, &a.Provider, &a.ExternalID, &a.Name, &a.Currency, &a.Status, &a.SyncEnabled,
			&a.Campaigns, &a.OldestSyncAt, &a.LastSyncAt)
		return a, err
	})
}

// --- integrations ---

type IntegrationRow struct {
	ID               uuid.UUID  `json:"id"`
	OrganizationID   uuid.UUID  `json:"organization_id"`
	OrganizationName string     `json:"organization_name"`
	Provider         string     `json:"provider"`
	Status           string     `json:"status"`
	DisplayName      string     `json:"display_name"`
	LastError        *string    `json:"last_error"`
	LastDiscoveredAt *time.Time `json:"last_discovered_at"`
	TokenExpiresAt   *time.Time `json:"token_expires_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	Accounts         int64      `json:"accounts"`
	SyncEnabled      int64      `json:"sync_enabled"`
	LastSyncedAt     *time.Time `json:"last_synced_at"`
}

// ListIntegrations returns integrations across all organizations (or one,
// when orgID is set), problems first.
func (s *Store) ListIntegrations(ctx context.Context, orgID *uuid.UUID) ([]IntegrationRow, error) {
	rows, err := s.pool.Query(ctx, `
SELECT i.id, i.organization_id, o.name, i.provider::text, i.status::text, i.display_name, i.last_error,
  i.last_discovered_at, i.token_expires_at, i.created_at, i.updated_at,
  (SELECT count(*) FROM ad_accounts a WHERE a.integration_id = i.id),
  (SELECT count(*) FROM ad_accounts a WHERE a.integration_id = i.id AND a.sync_enabled),
  (SELECT max(ss.last_synced_at) FROM ad_account_sync_state ss JOIN ad_accounts a ON a.id = ss.account_id
    WHERE a.integration_id = i.id)
FROM integrations i JOIN organizations o ON o.id = i.organization_id
WHERE $1::uuid IS NULL OR i.organization_id = $1
ORDER BY (i.status = 'needs_reauth' OR i.last_error IS NOT NULL) DESC, i.status = 'disconnected', o.name, i.provider`, orgID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (IntegrationRow, error) {
		var x IntegrationRow
		err := r.Scan(&x.ID, &x.OrganizationID, &x.OrganizationName, &x.Provider, &x.Status, &x.DisplayName, &x.LastError,
			&x.LastDiscoveredAt, &x.TokenExpiresAt, &x.CreatedAt, &x.UpdatedAt, &x.Accounts, &x.SyncEnabled, &x.LastSyncedAt)
		return x, err
	})
}

func (s *Store) IntegrationOrg(ctx context.Context, id uuid.UUID) (uuid.UUID, error) {
	var org uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT organization_id FROM integrations WHERE id = $1`, id).Scan(&org)
	return org, err
}

// OrgNames maps organization IDs to names, for labelling queue tasks.
func (s *Store) OrgNames(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	out := map[uuid.UUID]string{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT id, name FROM organizations WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = name
	}
	return out, rows.Err()
}

// --- activity ---

type ActivityFilter struct {
	OrganizationID *uuid.UUID
	ActorUserID    *uuid.UUID
	// Subject also matches entries about this user (e.g. being impersonated).
	SubjectUserID *uuid.UUID
	ActionPrefix  string
	Before        *time.Time
	Limit         int
}

type ActivityRow struct {
	ID               uuid.UUID       `json:"id"`
	CreatedAt        time.Time       `json:"created_at"`
	Action           string          `json:"action"`
	EntityType       string          `json:"entity_type"`
	EntityID         string          `json:"entity_id"`
	Metadata         json.RawMessage `json:"metadata"`
	OrganizationID   *uuid.UUID      `json:"organization_id"`
	OrganizationName *string         `json:"organization_name"`
	ActorID          *uuid.UUID      `json:"actor_id"`
	ActorEmail       *string         `json:"actor_email"`
	ActorName        *string         `json:"actor_name"`
}

func (s *Store) Activity(ctx context.Context, f ActivityFilter) ([]ActivityRow, error) {
	var subject *string
	if f.SubjectUserID != nil {
		v := f.SubjectUserID.String()
		subject = &v
	}
	rows, err := s.pool.Query(ctx, `
SELECT l.id, l.created_at, l.action, l.entity_type, l.entity_id, l.metadata,
  l.organization_id, o.name, l.actor_user_id, u.email::text, u.name
FROM audit_logs l
LEFT JOIN organizations o ON o.id = l.organization_id
LEFT JOIN users u ON u.id = l.actor_user_id
WHERE ($1::uuid IS NULL OR l.organization_id = $1)
  AND ($2::uuid IS NULL OR l.actor_user_id = $2
       OR ($3::text IS NOT NULL AND l.entity_type = 'user' AND l.entity_id = $3))
  AND ($4 = '' OR l.action LIKE $4 || '%')
  AND ($5::timestamptz IS NULL OR l.created_at < $5)
ORDER BY l.created_at DESC
LIMIT $6`, f.OrganizationID, f.ActorUserID, subject, f.ActionPrefix, f.Before, f.Limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (ActivityRow, error) {
		var a ActivityRow
		err := r.Scan(&a.ID, &a.CreatedAt, &a.Action, &a.EntityType, &a.EntityID, &a.Metadata,
			&a.OrganizationID, &a.OrganizationName, &a.ActorID, &a.ActorEmail, &a.ActorName)
		return a, err
	})
}

// --- system ---

type DBInfo struct {
	SizeBytes        int64  `json:"size_bytes"`
	MigrationVersion int64  `json:"migration_version"`
	ServerVersion    string `json:"server_version"`
	ExpiredSessions  int64  `json:"expired_sessions"`
}

func (s *Store) DBInfo(ctx context.Context) (DBInfo, error) {
	var d DBInfo
	err := s.pool.QueryRow(ctx, `
SELECT pg_database_size(current_database()),
  (SELECT coalesce(max(version_id), 0) FROM goose_db_version WHERE is_applied),
  current_setting('server_version'),
  (SELECT count(*) FROM sessions WHERE expires_at <= now())`).Scan(&d.SizeBytes, &d.MigrationVersion, &d.ServerVersion, &d.ExpiredSessions)
	return d, err
}
