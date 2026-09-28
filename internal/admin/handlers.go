// Package admin is the platform admin console API: every user, organization,
// integration and background job across tenants. Mount it behind
// auth.RequireUser and auth.RequirePlatformAdmin.
package admin

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/config"
	"github.com/iamv1n/adwise/internal/integrations"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/platform/secrets"
)

// Impersonator switches the admin's browser session to another user.
// *auth.Handlers implements it.
type Impersonator interface {
	StartImpersonation(w http.ResponseWriter, r *http.Request, targetID uuid.UUID) error
}

type Handlers struct {
	cfg          config.Config
	db           *database.DB
	rdb          *redis.Client
	store        *Store
	auth         *auth.Service
	impersonator Impersonator
	integrations *integrations.Service
	inspector    *asynq.Inspector
}

func NewHandlers(cfg config.Config, db *database.DB, rdb *redis.Client, authSvc *auth.Service, imp Impersonator,
	integ *integrations.Service, inspector *asynq.Inspector) *Handlers {
	return &Handlers{cfg: cfg, db: db, rdb: rdb, store: NewStore(db.Pool), auth: authSvc, impersonator: imp,
		integrations: integ, inspector: inspector}
}

// Routes mounts under /v1/admin.
func (h *Handlers) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/stats", httpx.Handler(h.stats))

	r.Get("/users", httpx.Handler(h.listUsers))
	r.Get("/users/{userID}", httpx.Handler(h.getUser))
	r.Post("/users/{userID}/impersonate", httpx.Handler(h.impersonate))
	r.Post("/users/{userID}/revoke-sessions", httpx.Handler(h.revokeSessions))

	r.Get("/organizations", httpx.Handler(h.listOrgs))
	r.Get("/organizations/{orgID}", httpx.Handler(h.getOrg))

	r.Get("/integrations", httpx.Handler(h.listIntegrations))
	r.Post("/integrations/{integrationID}/sync", httpx.Handler(h.syncIntegration))

	r.Get("/queues", httpx.Handler(h.queuesOverview))
	r.Get("/queues/failures", httpx.Handler(h.failures))
	r.Get("/queues/{queue}/tasks", httpx.Handler(h.queueTasks))
	r.Post("/queues/{queue}/pause", httpx.Handler(h.queueAction("pause")))
	r.Post("/queues/{queue}/resume", httpx.Handler(h.queueAction("resume")))
	r.Post("/queues/{queue}/retry-all", httpx.Handler(h.queueAction("retry_all")))
	r.Post("/queues/{queue}/clear-archived", httpx.Handler(h.queueAction("clear_archived")))
	r.Post("/queues/{queue}/tasks/{taskID}/run", httpx.Handler(h.taskAction("run")))
	r.Post("/queues/{queue}/tasks/{taskID}/archive", httpx.Handler(h.taskAction("archive")))
	r.Delete("/queues/{queue}/tasks/{taskID}", httpx.Handler(h.taskAction("delete")))

	r.Get("/activity", httpx.Handler(h.activity))
	r.Get("/system", httpx.Handler(h.system))
	return r
}

// --- helpers ---

func urlParam(r *http.Request, name string) string { return chi.URLParam(r, name) }

func uuidParam(r *http.Request, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		return uuid.Nil, httpx.ErrNotFound
	}
	return id, nil
}

func queryInt(r *http.Request, name string, def int) int {
	if n, err := strconv.Atoi(r.URL.Query().Get(name)); err == nil {
		return n
	}
	return def
}

func queryUUID(r *http.Request, name string) *uuid.UUID {
	if id, err := uuid.Parse(r.URL.Query().Get(name)); err == nil {
		return &id
	}
	return nil
}

func paging(r *http.Request) (limit, offset int) {
	return min(max(queryInt(r, "limit", 50), 1), 200), max(queryInt(r, "offset", 0), 0)
}

func notFound(err error) error {
	if database.IsNotFound(err) {
		return httpx.ErrNotFound
	}
	return err
}

// record writes an admin audit entry attributed to the calling admin.
func (h *Handlers) record(r *http.Request, action, entityType, entityID string, meta map[string]any) error {
	admin := auth.FromContext(r.Context()).User.ID
	return audit.Record(r.Context(), h.db.Queries, audit.Entry{
		ActorUserID: &admin, Action: action, EntityType: entityType, EntityID: entityID, Metadata: meta,
	})
}

// --- overview ---

func (h *Handlers) stats(w http.ResponseWriter, r *http.Request) error {
	st, err := h.store.Stats(r.Context())
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"stats": st})
	return nil
}

// --- users ---

func (h *Handlers) listUsers(w http.ResponseWriter, r *http.Request) error {
	limit, offset := paging(r)
	users, total, err := h.store.ListUsers(r.Context(), r.URL.Query().Get("q"), limit, offset)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"users": users, "total": total})
	return nil
}

func (h *Handlers) getUser(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "userID")
	if err != nil {
		return err
	}
	ctx := r.Context()
	user, err := h.store.GetUser(ctx, id)
	if err != nil {
		return notFound(err)
	}
	memberships, err := h.store.UserMemberships(ctx, id)
	if err != nil {
		return err
	}
	sessions, err := h.store.UserSessions(ctx, id)
	if err != nil {
		return err
	}
	activity, err := h.store.Activity(ctx, ActivityFilter{ActorUserID: &id, SubjectUserID: &id, Limit: 50})
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user": user, "organizations": memberships, "sessions": sessions, "activity": activity,
	})
	return nil
}

func (h *Handlers) impersonate(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "userID")
	if err != nil {
		return err
	}
	return h.impersonator.StartImpersonation(w, r, id)
}

func (h *Handlers) revokeSessions(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "userID")
	if err != nil {
		return err
	}
	admin := auth.FromContext(r.Context())
	if id == admin.User.ID {
		return httpx.NewError(http.StatusConflict, "cannot_revoke_self", "use Log out to end your own sessions")
	}
	n, err := h.auth.RevokeAllSessions(r.Context(), admin, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"revoked": n})
	return nil
}

// --- organizations ---

func (h *Handlers) listOrgs(w http.ResponseWriter, r *http.Request) error {
	limit, offset := paging(r)
	orgs, total, err := h.store.ListOrgs(r.Context(), r.URL.Query().Get("q"), limit, offset)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"organizations": orgs, "total": total})
	return nil
}

func (h *Handlers) getOrg(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "orgID")
	if err != nil {
		return err
	}
	ctx := r.Context()
	org, err := h.store.GetOrg(ctx, id)
	if err != nil {
		return notFound(err)
	}
	members, err := h.store.OrgMembers(ctx, id)
	if err != nil {
		return err
	}
	integs, err := h.store.ListIntegrations(ctx, &id)
	if err != nil {
		return err
	}
	accounts, err := h.store.OrgAccounts(ctx, id)
	if err != nil {
		return err
	}
	activity, err := h.store.Activity(ctx, ActivityFilter{OrganizationID: &id, Limit: 50})
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"organization": org, "members": members, "integrations": integs, "accounts": accounts, "activity": activity,
	})
	return nil
}

// --- integrations ---

func (h *Handlers) listIntegrations(w http.ResponseWriter, r *http.Request) error {
	integs, err := h.store.ListIntegrations(r.Context(), queryUUID(r, "organization_id"))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"integrations": integs})
	return nil
}

type syncRequest struct {
	Scope string `json:"scope" validate:"omitempty,oneof=entities metrics all"`
}

func (h *Handlers) syncIntegration(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "integrationID")
	if err != nil {
		return err
	}
	var req syncRequest
	if r.ContentLength > 0 {
		if err := httpx.Decode(r, &req); err != nil {
			return err
		}
	}
	orgID, err := h.store.IntegrationOrg(r.Context(), id)
	if err != nil {
		return notFound(err)
	}
	admin := auth.FromContext(r.Context()).User.ID
	// The admin acts with owner rights in the integration's organization.
	res, err := h.integrations.RequestSync(r.Context(),
		organizations.Membership{OrganizationID: orgID, UserID: admin, Role: organizations.RoleOwner},
		id, integrations.SyncOptions{Scope: req.Scope})
	if err != nil {
		return err
	}
	if err := h.record(r, "admin.sync_requested", "integration", id.String(),
		map[string]any{"organization_id": orgID.String(), "task_id": res.TaskID, "scope": req.Scope}); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusAccepted, res)
	return nil
}

// --- activity ---

func (h *Handlers) activity(w http.ResponseWriter, r *http.Request) error {
	f := ActivityFilter{
		OrganizationID: queryUUID(r, "organization_id"),
		ActorUserID:    queryUUID(r, "actor_id"),
		ActionPrefix:   r.URL.Query().Get("action"),
		Limit:          min(max(queryInt(r, "limit", 100), 1), 500),
	}
	if b, err := time.Parse(time.RFC3339Nano, r.URL.Query().Get("before")); err == nil {
		f.Before = &b
	}
	rows, err := h.store.Activity(r.Context(), f)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"activity": rows})
	return nil
}

// --- system ---

type check struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail"`
}

func configCheck(name string, ok bool, yes, no string) check {
	if ok {
		return check{name, true, yes}
	}
	return check{name, false, no}
}

func (h *Handlers) system(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	checks := []check{}
	dbInfo, err := h.store.DBInfo(ctx)
	if err != nil {
		checks = append(checks, check{"PostgreSQL", false, err.Error()})
	} else {
		checks = append(checks, check{"PostgreSQL", true, "version " + dbInfo.ServerVersion})
	}
	redisMem := ""
	if err := h.rdb.Ping(ctx).Err(); err != nil {
		checks = append(checks, check{"Redis", false, err.Error()})
	} else {
		if info, err := h.rdb.InfoMap(ctx, "memory").Result(); err == nil {
			for _, section := range info { // keyed "Memory"
				if v, ok := section["used_memory_human"]; ok {
					redisMem = v
				}
			}
		}
		checks = append(checks, check{"Redis", true, "memory used " + redisMem})
	}
	workers := 0
	if servers, err := h.inspector.Servers(); err == nil {
		workers = len(servers)
	}
	if workers == 0 {
		checks = append(checks, check{"Worker", false, "no worker is running; syncs and schedules are stopped (make worker)"})
	} else {
		checks = append(checks, check{"Worker", true, strconv.Itoa(workers) + " running"})
	}
	i := h.cfg.Integrations
	customKey := i.TokenEncryptionKey != "" && i.TokenEncryptionKey != secrets.DevKeySpec
	checks = append(checks,
		configCheck("Meta app", i.MetaConfigured(), "configured", "META_APP_ID / META_APP_SECRET not set"),
		configCheck("Google Ads app", i.GoogleConfigured(), "configured", "Google OAuth client or developer token not set"),
		configCheck("Token encryption key", customKey, "custom key set", "using the public development key"),
		configCheck("Secure cookies", h.cfg.CookieSecure, "on", "off (fine for local HTTP only)"),
	)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"env":               h.cfg.Env,
		"web_base_url":      h.cfg.WebBaseURL,
		"api_base_url":      i.APIBaseURL,
		"database":          dbInfo,
		"redis_memory":      redisMem,
		"checks":            checks,
		"session_ttl_hours": h.cfg.SessionTTL.Hours(),
	})
	return nil
}
