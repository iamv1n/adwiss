package changelog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/testdb"
	"github.com/iamv1n/adwise/internal/store"
)

func TestMain(m *testing.M) { os.Exit(testdb.Run(m)) }

func TestValidate(t *testing.T) {
	ok := entryRequest{Slug: "new-thing", Title: "New thing", Summary: "A useful new thing.", Kind: "new", Tags: []string{"Leads", "leads", " "}}
	f, err := ok.Validate()
	require.NoError(t, err)
	require.Equal(t, []string{"leads"}, f.Tags)

	for name, mut := range map[string]func(*entryRequest){
		"slug upper":     func(r *entryRequest) { r.Slug = "New-Thing" },
		"slug double":    func(r *entryRequest) { r.Slug = "new--thing" },
		"slug trailing":  func(r *entryRequest) { r.Slug = "new-" },
		"slug space":     func(r *entryRequest) { r.Slug = "new thing" },
		"title short":    func(r *entryRequest) { r.Title = "ab" },
		"summary long":   func(r *entryRequest) { r.Summary = strings.Repeat("x", 301) },
		"kind":           func(r *entryRequest) { r.Kind = "breaking" },
		"link external":  func(r *entryRequest) { s := "//evil.com"; r.LinkPath = &s },
		"link relative":  func(r *entryRequest) { s := "app/learn"; r.LinkPath = &s },
		"image js":       func(r *entryRequest) { s := "javascript:alert(1)"; r.ImageURL = &s },
		"tag characters": func(r *entryRequest) { r.Tags = []string{"a b"} },
	} {
		r := ok
		mut(&r)
		_, err := r.Validate()
		require.Error(t, err, name)
	}
}

type harness struct {
	t      *testing.T
	db     *database.DB
	router http.Handler
}

func newHarness(t *testing.T) harness {
	db := testdb.New(t)
	// Drop the seeded entries so counts are deterministic within this package database.
	_, err := db.Pool.Exec(context.Background(), `DELETE FROM changelog_entries WHERE created_by IS NULL`)
	require.NoError(t, err)
	h := NewHandlers(db.Pool)
	r := chi.NewRouter()
	r.Route("/v1", func(r chi.Router) {
		r.Mount("/changelog", h.PublicRoutes())
		r.Group(func(r chi.Router) {
			// Stand-in for RequireUser: X-User carries the user id.
			r.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
					id, err := uuid.Parse(req.Header.Get("X-User"))
					if err != nil {
						w.WriteHeader(http.StatusUnauthorized)
						return
					}
					var u store.User
					require.NoError(t, db.Pool.QueryRow(req.Context(), `SELECT id, is_platform_admin FROM users WHERE id = $1`, id).Scan(&u.ID, &u.IsPlatformAdmin))
					next.ServeHTTP(w, req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{User: u})))
				})
			})
			h.RegisterMe(r)
			r.With(auth.RequirePlatformAdmin).Mount("/admin/changelog", h.AdminRoutes())
		})
	})
	return harness{t: t, db: db, router: r}
}

func (h harness) user(admin bool) uuid.UUID {
	var id uuid.UUID
	require.NoError(h.t, h.db.Pool.QueryRow(context.Background(),
		`INSERT INTO users (email, name, password_hash, is_platform_admin) VALUES ($1, 'T', 'x', $2) RETURNING id`,
		uuid.NewString()+"@test.local", admin).Scan(&id))
	return id
}

func (h harness) do(method, path string, user uuid.UUID, body any) (int, map[string]any) {
	var rd *strings.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = strings.NewReader(string(b))
	} else {
		rd = strings.NewReader("")
	}
	req := httptest.NewRequest(method, path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if user != uuid.Nil {
		req.Header.Set("X-User", user.String())
	}
	w := httptest.NewRecorder()
	h.router.ServeHTTP(w, req)
	out := map[string]any{}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func entryBody(slug string) map[string]any {
	return map[string]any{"slug": slug, "title": "Title " + slug, "summary": "Summary for " + slug, "body": "- one\n- two", "kind": "new", "tags": []string{"x"}}
}

func TestAdminFlowAndPublicVisibility(t *testing.T) {
	h := newHarness(t)
	admin, member := h.user(true), h.user(false)
	slug := "entry-" + uuid.NewString()[:8]

	// Non-admins cannot write (404 hides the admin API).
	code, _ := h.do("POST", "/v1/admin/changelog/", member, entryBody(slug))
	require.Equal(t, http.StatusNotFound, code)
	code, _ = h.do("GET", "/v1/admin/changelog/", member, nil)
	require.Equal(t, http.StatusNotFound, code)

	// Invalid slug.
	bad := entryBody("Bad Slug")
	code, _ = h.do("POST", "/v1/admin/changelog/", admin, bad)
	require.Equal(t, http.StatusUnprocessableEntity, code)

	code, out := h.do("POST", "/v1/admin/changelog/", admin, entryBody(slug))
	require.Equal(t, http.StatusCreated, code, out)
	id := out["entry"].(map[string]any)["id"].(string)
	require.Nil(t, out["entry"].(map[string]any)["published_at"])

	// Duplicate slug.
	code, out = h.do("POST", "/v1/admin/changelog/", admin, entryBody(slug))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Contains(t, out["error"].(map[string]any)["fields"], "slug")

	// Drafts are hidden publicly.
	code, _ = h.do("GET", "/v1/changelog/"+slug, uuid.Nil, nil)
	require.Equal(t, http.StatusNotFound, code)
	_, out = h.do("GET", "/v1/changelog/", uuid.Nil, nil)
	require.Empty(t, out["entries"])

	// Audited.
	var n int
	require.NoError(t, h.db.Pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_logs WHERE entity_id = $1 AND action = 'changelog.create'`, id).Scan(&n))
	require.Equal(t, 1, n)

	code, _ = h.do("POST", "/v1/admin/changelog/"+id+"/publish", admin, nil)
	require.Equal(t, http.StatusOK, code)
	code, out = h.do("GET", "/v1/changelog/"+slug, uuid.Nil, nil)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, slug, out["entry"].(map[string]any)["slug"])
	require.NotContains(t, out["entry"], "created_by")

	// Update and unpublish.
	upd := entryBody(slug)
	upd["title"] = "Renamed entry"
	code, out = h.do("PUT", "/v1/admin/changelog/"+id, admin, upd)
	require.Equal(t, http.StatusOK, code, out)
	require.Equal(t, "Renamed entry", out["entry"].(map[string]any)["title"])
	code, _ = h.do("POST", "/v1/admin/changelog/"+id+"/unpublish", admin, nil)
	require.Equal(t, http.StatusOK, code)
	code, _ = h.do("GET", "/v1/changelog/"+slug, uuid.Nil, nil)
	require.Equal(t, http.StatusNotFound, code)

	code, _ = h.do("DELETE", "/v1/admin/changelog/"+id, member, nil)
	require.Equal(t, http.StatusNotFound, code)
	code, _ = h.do("DELETE", "/v1/admin/changelog/"+id, admin, nil)
	require.Equal(t, http.StatusNoContent, code)
	code, _ = h.do("GET", "/v1/admin/changelog/"+id, admin, nil)
	require.Equal(t, http.StatusNotFound, code)
}

func insertPublished(t *testing.T, db *database.DB, publishedAt *time.Time) {
	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO changelog_entries (slug, title, summary, kind, published_at, created_by)
		VALUES ($1, 'Test entry', 'Test summary text', 'new', $2, (SELECT id FROM users LIMIT 1))`,
		"t-"+uuid.NewString()[:8], publishedAt)
	require.NoError(t, err)
}

func TestUnreadAndPagination(t *testing.T) {
	h := newHarness(t)
	_, err := h.db.Pool.Exec(context.Background(), `DELETE FROM changelog_entries`)
	require.NoError(t, err)
	user := h.user(false)
	now := time.Now()
	at := func(d time.Duration) *time.Time { v := now.Add(-d); return &v }
	insertPublished(t, h.db, at(time.Hour))
	insertPublished(t, h.db, at(10*24*time.Hour))
	insertPublished(t, h.db, at(60*24*time.Hour)) // older than the new-user window
	insertPublished(t, h.db, nil)                 // draft
	future := now.Add(time.Hour)
	insertPublished(t, h.db, &future) // scheduled, not yet visible

	// New user: only the last 30 days count.
	_, out := h.do("GET", "/v1/me/changelog/unread", user, nil)
	require.EqualValues(t, 2, out["count"])
	require.NotNil(t, out["latest_published_at"])

	code, _ := h.do("POST", "/v1/me/changelog/seen", user, nil)
	require.Equal(t, http.StatusNoContent, code)
	_, out = h.do("GET", "/v1/me/changelog/unread", user, nil)
	require.EqualValues(t, 0, out["count"])

	// Entries published after seen_at count, however old seen_at is.
	_, err = h.db.Pool.Exec(context.Background(), `UPDATE changelog_reads SET seen_at = now() - interval '90 days' WHERE user_id = $1`, user)
	require.NoError(t, err)
	_, out = h.do("GET", "/v1/me/changelog/unread", user, nil)
	require.EqualValues(t, 3, out["count"])

	// Pagination: 3 visible entries, newest first.
	_, out = h.do("GET", "/v1/changelog/?limit=2", uuid.Nil, nil)
	require.Len(t, out["entries"], 2)
	next := out["next_before"].(string)
	_, out = h.do("GET", "/v1/changelog/?limit=2&before="+url.QueryEscape(next), uuid.Nil, nil)
	require.Len(t, out["entries"], 1)
	require.Nil(t, out["next_before"])
}
