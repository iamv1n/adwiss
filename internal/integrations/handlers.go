package integrations

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct {
	svc *Service
}

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Register adds the org-scoped routes. Mount it inside a group that already
// applies RequireUser and organizations.RequireMember.
//
//	GET    /orgs/{orgID}/integrations                         member+
//	POST   /orgs/{orgID}/integrations/{provider}/connect      admin+
//	DELETE /orgs/{orgID}/integrations/{integrationID}         admin+
//	POST   /orgs/{orgID}/integrations/{integrationID}/discover admin+
//	POST   /orgs/{orgID}/integrations/{integrationID}/sync     admin+
//	GET    /orgs/{orgID}/integrations/{integrationID}/sync/progress member+
//	POST   /orgs/{orgID}/leads/instant                        admin+ (subscribe Pages to the leadgen webhook)
func (h *Handlers) Register(r chi.Router) {
	r.Get("/orgs/{orgID}/integrations", httpx.Handler(h.list))
	r.Get("/orgs/{orgID}/integrations/{integrationID}/sync/progress", httpx.Handler(h.syncProgress))
	r.Group(func(r chi.Router) {
		r.Use(organizations.RequireRole(organizations.RoleAdmin))
		r.Post("/orgs/{orgID}/integrations/{provider:meta|google}/connect", httpx.Handler(h.connect))
		r.Delete("/orgs/{orgID}/integrations/{integrationID}", httpx.Handler(h.disconnect))
		r.Post("/orgs/{orgID}/integrations/{integrationID}/discover", httpx.Handler(h.discover))
		r.Post("/orgs/{orgID}/integrations/{integrationID}/sync", httpx.Handler(h.sync))
		r.Post("/orgs/{orgID}/leads/instant", httpx.Handler(h.enableInstantLeads))
	})
}

// RegisterPublic adds the OAuth callback, which is a browser redirect from the
// provider: no session is required because the one-time state binds the org
// and user. Mount it outside RequireUser. The Meta webhook is authenticated
// by its verify token (handshake) and X-Hub-Signature-256 (deliveries); see
// leadwebhook.go.
//
//	GET  /integrations/{provider}/callback
//	GET  /webhooks/meta   verification handshake
//	POST /webhooks/meta   leadgen deliveries
func (h *Handlers) RegisterPublic(r chi.Router) {
	r.Get("/integrations/{provider}/callback", h.callback)
	r.Get("/webhooks/meta", h.webhookVerify)
	r.Post("/webhooks/meta", httpx.Handler(h.webhookReceive))
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	items, err := h.svc.List(r.Context(), organizations.MembershipFromContext(r.Context()).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"integrations": items,
		"providers":    h.providerStatus(),
	})
	return nil
}

type providerInfo struct {
	Provider   ads.Provider `json:"provider"`
	Configured bool         `json:"configured"`
}

func (h *Handlers) providerStatus() []providerInfo {
	out := []providerInfo{}
	for _, p := range []ads.Provider{ads.ProviderMeta, ads.ProviderGoogle} {
		app, ok := h.svc.apps[p]
		out = append(out, providerInfo{Provider: p, Configured: ok && app.Configured()})
	}
	return out
}

func (h *Handlers) connect(w http.ResponseWriter, r *http.Request) error {
	u, err := h.svc.StartConnect(r.Context(), organizations.MembershipFromContext(r.Context()), chi.URLParam(r, "provider"))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"authorize_url": u, "expires_in": int(StateTTL.Seconds())})
	return nil
}

func (h *Handlers) callback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	// Detach from the request's 30s timeout only for the slow provider calls;
	// keep a bound so a stuck provider cannot hold the connection forever.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 25*time.Second)
	defer cancel()
	target := h.svc.Callback(ctx, chi.URLParam(r, "provider"), CallbackParams{
		State: q.Get("state"), Code: q.Get("code"),
		Error: q.Get("error"), ErrorDescription: q.Get("error_description"),
	})
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, target, http.StatusFound)
}

func (h *Handlers) disconnect(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "integrationID")
	if err != nil {
		return err
	}
	if err := h.svc.Disconnect(r.Context(), organizations.MembershipFromContext(r.Context()), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) discover(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "integrationID")
	if err != nil {
		return err
	}
	accounts, err := h.svc.Discover(r.Context(), organizations.MembershipFromContext(r.Context()), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"accounts": accounts})
	return nil
}

type syncRequest struct {
	// Optional: limit to these provider account IDs (must be sync-enabled).
	AccountIDs []string `json:"account_ids" validate:"omitempty,max=200,dive,min=1,max=64"`
	// Optional: entities, metrics or both (default both).
	Scope string `json:"scope" validate:"omitempty,oneof=entities metrics all"`
	// Optional: metric date range (defaults to the last 3 days).
	Start string `json:"start" validate:"omitempty,datetime=2006-01-02"`
	End   string `json:"end" validate:"omitempty,datetime=2006-01-02"`
	// Optional: report names (defaults to every supported catalog report).
	Reports []string `json:"reports" validate:"omitempty,max=20,dive,min=1,max=64"`
}

func (h *Handlers) sync(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "integrationID")
	if err != nil {
		return err
	}
	var req syncRequest
	if r.ContentLength != 0 {
		if err := httpx.Decode(r, &req); err != nil {
			return err
		}
	}
	res, err := h.svc.RequestSync(r.Context(), organizations.MembershipFromContext(r.Context()), id, SyncOptions{
		AccountIDs: req.AccountIDs, Scope: req.Scope, Reports: req.Reports,
		Range: ads.DateRange{Start: req.Start, End: req.End},
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusAccepted, res)
	return nil
}

func (h *Handlers) syncProgress(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "integrationID")
	if err != nil {
		return err
	}
	p, err := h.svc.SyncProgress(r.Context(), organizations.MembershipFromContext(r.Context()).OrganizationID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"progress": p})
	return nil
}

func uuidParam(r *http.Request, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		return uuid.Nil, httpx.ErrNotFound
	}
	return id, nil
}
