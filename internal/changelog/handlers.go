package changelog

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/store"
)

var (
	slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	tagRe  = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)
)

const (
	defaultLimit = 20
	maxLimit     = 50
)

type Handlers struct {
	pool  *pgxpool.Pool
	store *Store
}

func NewHandlers(pool *pgxpool.Pool) *Handlers { return &Handlers{pool: pool, store: NewStore(pool)} }

// PublicRoutes mounts under /v1/changelog with no authentication:
//
//	GET /?limit=&before=   published entries, newest first → { entries, next_before }
//	GET /{slug}            one published entry → { entry }
func (h *Handlers) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", httpx.Handler(h.listPublic))
	r.Get("/{slug}", httpx.Handler(h.getPublic))
	return r
}

// RegisterMe adds the signed-in routes; r must apply RequireUser.
//
//	GET  /me/changelog/unread → { count, latest_published_at }
//	POST /me/changelog/seen   → 204
func (h *Handlers) RegisterMe(r chi.Router) {
	r.Get("/me/changelog/unread", httpx.Handler(h.unread))
	r.Post("/me/changelog/seen", httpx.Handler(h.seen))
}

// AdminRoutes mounts under /v1/admin/changelog behind RequirePlatformAdmin:
//
//	GET    /                 every entry incl. drafts → { entries }
//	POST   /                 create a draft → { entry }
//	GET    /{id}             → { entry }
//	PUT    /{id}             replace the editable fields → { entry }
//	DELETE /{id}             → 204
//	POST   /{id}/publish     → { entry }
//	POST   /{id}/unpublish   → { entry }
func (h *Handlers) AdminRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", httpx.Handler(h.adminList))
	r.Post("/", httpx.Handler(h.adminCreate))
	r.Get("/{id}", httpx.Handler(h.adminGet))
	r.Put("/{id}", httpx.Handler(h.adminUpdate))
	r.Delete("/{id}", httpx.Handler(h.adminDelete))
	r.Post("/{id}/publish", httpx.Handler(h.adminPublish(true)))
	r.Post("/{id}/unpublish", httpx.Handler(h.adminPublish(false)))
	return r
}

// --- public ---

func (h *Handlers) listPublic(w http.ResponseWriter, r *http.Request) error {
	limit := defaultLimit
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return fieldError("limit", "must be a positive integer")
		}
		limit = min(n, maxLimit)
	}
	var before *time.Time
	if v := r.URL.Query().Get("before"); v != "" {
		t, err := time.Parse(time.RFC3339Nano, v)
		if err != nil {
			return fieldError("before", "must be an RFC 3339 timestamp")
		}
		before = &t
	}
	entries, err := h.store.ListPublished(r.Context(), limit, before)
	if err != nil {
		return err
	}
	var next *time.Time
	if len(entries) == limit {
		next = entries[len(entries)-1].PublishedAt
	}
	for i := range entries {
		entries[i].CreatedBy = nil
	}
	w.Header().Set("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
	httpx.JSON(w, http.StatusOK, map[string]any{"entries": entries, "next_before": next})
	return nil
}

func (h *Handlers) getPublic(w http.ResponseWriter, r *http.Request) error {
	slug := chi.URLParam(r, "slug")
	if !slugRe.MatchString(slug) {
		return httpx.ErrNotFound
	}
	e, err := h.store.GetPublished(r.Context(), slug)
	if errors.Is(err, ErrNotFound) {
		return httpx.ErrNotFound
	}
	if err != nil {
		return err
	}
	e.CreatedBy = nil
	w.Header().Set("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
	httpx.JSON(w, http.StatusOK, map[string]any{"entry": e})
	return nil
}

// --- signed in ---

func (h *Handlers) unread(w http.ResponseWriter, r *http.Request) error {
	u, err := h.store.Unread(r.Context(), auth.FromContext(r.Context()).User.ID)
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, http.StatusOK, u)
	return nil
}

func (h *Handlers) seen(w http.ResponseWriter, r *http.Request) error {
	if err := h.store.MarkSeen(r.Context(), auth.FromContext(r.Context()).User.ID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// --- admin ---

type entryRequest struct {
	Slug      string   `json:"slug"`
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	Body      string   `json:"body"`
	Kind      string   `json:"kind"`
	Tags      []string `json:"tags"`
	LinkPath  *string  `json:"link_path"`
	LinkLabel *string  `json:"link_label"`
	ImageURL  *string  `json:"image_url"`
}

func trimOpt(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

// Validate normalizes the request into Fields or returns a 422 listing each bad field.
func (req entryRequest) Validate() (Fields, error) {
	f := Fields{
		Slug:      strings.TrimSpace(req.Slug),
		Title:     strings.TrimSpace(req.Title),
		Summary:   strings.TrimSpace(req.Summary),
		Body:      strings.TrimSpace(req.Body),
		Kind:      strings.TrimSpace(req.Kind),
		Tags:      []string{},
		LinkPath:  trimOpt(req.LinkPath),
		LinkLabel: trimOpt(req.LinkLabel),
		ImageURL:  trimOpt(req.ImageURL),
	}
	bad := map[string]string{}
	if !slugRe.MatchString(f.Slug) || len(f.Slug) > 80 {
		bad["slug"] = "use lowercase letters, digits and single hyphens (max 80)"
	}
	if n := utf8.RuneCountInString(f.Title); n < 3 || n > 120 {
		bad["title"] = "must be 3 to 120 characters"
	}
	if n := utf8.RuneCountInString(f.Summary); n < 10 || n > 300 {
		bad["summary"] = "must be 10 to 300 characters"
	}
	if utf8.RuneCountInString(f.Body) > 20000 {
		bad["body"] = "must be at most 20000 characters"
	}
	switch f.Kind {
	case KindNew, KindImproved, KindFixed:
	default:
		bad["kind"] = "must be new, improved or fixed"
	}
	if len(req.Tags) > 10 {
		bad["tags"] = "at most 10 tags"
	}
	seen := map[string]bool{}
	for _, t := range req.Tags {
		t = strings.ToLower(strings.TrimSpace(t))
		if t == "" || seen[t] {
			continue
		}
		if !tagRe.MatchString(t) {
			bad["tags"] = "tags use lowercase letters, digits and hyphens (max 32)"
			break
		}
		seen[t] = true
		f.Tags = append(f.Tags, t)
	}
	if p := f.LinkPath; p != nil && (!strings.HasPrefix(*p, "/") || strings.HasPrefix(*p, "//") || strings.ContainsAny(*p, " \\") || len(*p) > 200) {
		bad["link_path"] = "must be an in-app path starting with /"
	}
	if l := f.LinkLabel; l != nil && utf8.RuneCountInString(*l) > 40 {
		bad["link_label"] = "must be at most 40 characters"
	}
	if u := f.ImageURL; u != nil {
		pu, err := url.Parse(*u)
		if err != nil || (pu.Scheme != "https" && pu.Scheme != "http") || pu.Host == "" || len(*u) > 500 {
			bad["image_url"] = "must be an http(s) URL"
		}
	}
	if len(bad) > 0 {
		e := httpx.NewError(http.StatusUnprocessableEntity, "validation_failed", "request validation failed")
		e.Fields = bad
		return f, e
	}
	return f, nil
}

func fieldError(field, msg string) error {
	e := httpx.NewError(http.StatusUnprocessableEntity, "validation_failed", msg)
	e.Fields = map[string]string{field: msg}
	return e
}

func idParam(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return id, httpx.ErrNotFound
	}
	return id, nil
}

// write runs fn and its audit entry in one transaction.
func (h *Handlers) write(r *http.Request, action string, fn func(ctx context.Context, tx pgx.Tx) (Entry, error)) (Entry, error) {
	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit
	e, err := fn(ctx, tx)
	switch {
	case errors.Is(err, ErrNotFound):
		return e, httpx.ErrNotFound
	case database.IsUniqueViolation(err):
		return e, fieldError("slug", "another entry already uses this slug")
	case err != nil:
		return e, err
	}
	actor := auth.FromContext(ctx).User.ID
	if err := audit.Record(ctx, store.New(tx), audit.Entry{
		ActorUserID: &actor, Action: action, EntityType: "changelog_entry", EntityID: e.ID.String(),
		Metadata: map[string]any{"slug": e.Slug, "title": e.Title},
	}); err != nil {
		return e, err
	}
	return e, tx.Commit(ctx)
}

func (h *Handlers) adminList(w http.ResponseWriter, r *http.Request) error {
	entries, err := h.store.ListAll(r.Context())
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"entries": entries})
	return nil
}

func (h *Handlers) adminGet(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r)
	if err != nil {
		return err
	}
	e, err := h.store.Get(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.ErrNotFound
	}
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"entry": e})
	return nil
}

func (h *Handlers) decode(r *http.Request) (Fields, error) {
	var req entryRequest
	if err := httpx.Decode(r, &req); err != nil {
		return Fields{}, err
	}
	return req.Validate()
}

func (h *Handlers) adminCreate(w http.ResponseWriter, r *http.Request) error {
	f, err := h.decode(r)
	if err != nil {
		return err
	}
	e, err := h.write(r, "changelog.create", func(ctx context.Context, tx pgx.Tx) (Entry, error) {
		return Create(ctx, tx, f, auth.FromContext(ctx).User.ID)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"entry": e})
	return nil
}

func (h *Handlers) adminUpdate(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r)
	if err != nil {
		return err
	}
	f, err := h.decode(r)
	if err != nil {
		return err
	}
	e, err := h.write(r, "changelog.update", func(ctx context.Context, tx pgx.Tx) (Entry, error) {
		return Update(ctx, tx, id, f)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"entry": e})
	return nil
}

func (h *Handlers) adminDelete(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r)
	if err != nil {
		return err
	}
	if _, err := h.write(r, "changelog.delete", func(ctx context.Context, tx pgx.Tx) (Entry, error) {
		return Delete(ctx, tx, id)
	}); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) adminPublish(publish bool) func(http.ResponseWriter, *http.Request) error {
	action := "changelog.unpublish"
	if publish {
		action = "changelog.publish"
	}
	return func(w http.ResponseWriter, r *http.Request) error {
		id, err := idParam(r)
		if err != nil {
			return err
		}
		e, err := h.write(r, action, func(ctx context.Context, tx pgx.Tx) (Entry, error) {
			return SetPublished(ctx, tx, id, publish)
		})
		if err != nil {
			return err
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"entry": e})
		return nil
	}
}
