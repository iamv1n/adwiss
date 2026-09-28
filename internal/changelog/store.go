// Package changelog stores product updates ("What's new"). Platform admins
// write entries; published ones are served publicly (the marketing site's
// changelog) and to signed-in users with a per-user unread count.
package changelog

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Kinds.
const (
	KindNew      = "new"
	KindImproved = "improved"
	KindFixed    = "fixed"
)

// NewUserWindow bounds the unread count for users who never opened
// "What's new", so new accounts are not flooded with old entries.
const NewUserWindow = 30 * 24 * time.Hour

var ErrNotFound = errors.New("changelog entry not found")

// Entry is one changelog entry. PublishedAt nil means draft.
type Entry struct {
	ID          uuid.UUID  `json:"id"`
	Slug        string     `json:"slug"`
	Title       string     `json:"title"`
	Summary     string     `json:"summary"`
	Body        string     `json:"body"`
	Kind        string     `json:"kind"`
	Tags        []string   `json:"tags"`
	LinkPath    *string    `json:"link_path"`
	LinkLabel   *string    `json:"link_label"`
	ImageURL    *string    `json:"image_url"`
	PublishedAt *time.Time `json:"published_at"`
	CreatedBy   *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// Fields are the admin-editable fields of an entry.
type Fields struct {
	Slug      string
	Title     string
	Summary   string
	Body      string
	Kind      string
	Tags      []string
	LinkPath  *string
	LinkLabel *string
	ImageURL  *string
}

// Unread is a user's unread state.
type Unread struct {
	Count             int        `json:"count"`
	LatestPublishedAt *time.Time `json:"latest_published_at"`
}

// DBTX is satisfied by *pgxpool.Pool and pgx.Tx.
type DBTX interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const cols = `id, slug, title, summary, body, kind, tags, link_path, link_label, image_url, published_at, created_by, created_at, updated_at`

func scan(row pgx.Row) (Entry, error) {
	var e Entry
	err := row.Scan(&e.ID, &e.Slug, &e.Title, &e.Summary, &e.Body, &e.Kind, &e.Tags, &e.LinkPath, &e.LinkLabel,
		&e.ImageURL, &e.PublishedAt, &e.CreatedBy, &e.CreatedAt, &e.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, ErrNotFound
	}
	if e.Tags == nil {
		e.Tags = []string{}
	}
	return e, err
}

func collect(rows pgx.Rows, err error) ([]Entry, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Entry{}
	for rows.Next() {
		e, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ListPublished returns published entries newest first, strictly before
// `before` when set.
func (s *Store) ListPublished(ctx context.Context, limit int, before *time.Time) ([]Entry, error) {
	return collect(s.pool.Query(ctx, `
		SELECT `+cols+` FROM changelog_entries
		WHERE published_at IS NOT NULL AND published_at <= now()
		  AND ($2::timestamptz IS NULL OR published_at < $2)
		ORDER BY published_at DESC, id DESC LIMIT $1`, limit, before))
}

// GetPublished returns a published entry by slug.
func (s *Store) GetPublished(ctx context.Context, slug string) (Entry, error) {
	return scan(s.pool.QueryRow(ctx, `
		SELECT `+cols+` FROM changelog_entries
		WHERE slug = $1 AND published_at IS NOT NULL AND published_at <= now()`, slug))
}

// ListAll returns every entry including drafts: drafts first, then newest.
func (s *Store) ListAll(ctx context.Context) ([]Entry, error) {
	return collect(s.pool.Query(ctx, `
		SELECT `+cols+` FROM changelog_entries
		ORDER BY published_at DESC NULLS FIRST, created_at DESC`))
}

func (s *Store) Get(ctx context.Context, id uuid.UUID) (Entry, error) {
	return scan(s.pool.QueryRow(ctx, `SELECT `+cols+` FROM changelog_entries WHERE id = $1`, id))
}

func Create(ctx context.Context, q DBTX, f Fields, createdBy uuid.UUID) (Entry, error) {
	return scan(q.QueryRow(ctx, `
		INSERT INTO changelog_entries (slug, title, summary, body, kind, tags, link_path, link_label, image_url, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING `+cols, f.Slug, f.Title, f.Summary, f.Body, f.Kind, f.Tags, f.LinkPath, f.LinkLabel, f.ImageURL, createdBy))
}

func Update(ctx context.Context, q DBTX, id uuid.UUID, f Fields) (Entry, error) {
	return scan(q.QueryRow(ctx, `
		UPDATE changelog_entries SET slug = $2, title = $3, summary = $4, body = $5, kind = $6, tags = $7,
		       link_path = $8, link_label = $9, image_url = $10, updated_at = now()
		WHERE id = $1 RETURNING `+cols,
		id, f.Slug, f.Title, f.Summary, f.Body, f.Kind, f.Tags, f.LinkPath, f.LinkLabel, f.ImageURL))
}

// SetPublished publishes (now, keeping an earlier publish time) or unpublishes.
func SetPublished(ctx context.Context, q DBTX, id uuid.UUID, publish bool) (Entry, error) {
	return scan(q.QueryRow(ctx, `
		UPDATE changelog_entries
		SET published_at = CASE WHEN $2 THEN coalesce(published_at, now()) ELSE NULL END, updated_at = now()
		WHERE id = $1 RETURNING `+cols, id, publish))
}

func Delete(ctx context.Context, q DBTX, id uuid.UUID) (Entry, error) {
	return scan(q.QueryRow(ctx, `DELETE FROM changelog_entries WHERE id = $1 RETURNING `+cols, id))
}

// Unread counts entries published after the user last opened "What's new"
// (or, if they never did, within NewUserWindow).
func (s *Store) Unread(ctx context.Context, userID uuid.UUID) (Unread, error) {
	var u Unread
	err := s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT count(*) FROM changelog_entries
		   WHERE published_at IS NOT NULL AND published_at <= now()
		     AND published_at > coalesce((SELECT seen_at FROM changelog_reads WHERE user_id = $1),
		                                 now() - make_interval(secs => $2))),
		  (SELECT max(published_at) FROM changelog_entries WHERE published_at IS NOT NULL AND published_at <= now())`,
		userID, NewUserWindow.Seconds()).Scan(&u.Count, &u.LatestPublishedAt)
	return u, err
}

// MarkSeen records that the user has seen everything published so far.
func (s *Store) MarkSeen(ctx context.Context, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO changelog_reads (user_id, seen_at) VALUES ($1, now())
		ON CONFLICT (user_id) DO UPDATE SET seen_at = now()`, userID)
	return err
}
