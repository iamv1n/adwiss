package recommendations

import (
	"net/http"
	"slices"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct{ svc *Service }

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Register adds the routes under /orgs/{orgID}. r must already apply auth and
// organizations.RequireMember; decisions and target changes require admin.
func (h *Handlers) Register(r chi.Router) {
	admin := organizations.RequireRole(organizations.RoleAdmin)
	const rc = "/orgs/{orgID}/recommendations"
	r.Get(rc, httpx.Handler(h.list))
	r.Get(rc+"/count", httpx.Handler(h.count))
	r.With(admin).Post(rc+"/generate", httpx.Handler(h.generate))
	r.With(admin).Post(rc+"/{id}/accept", httpx.Handler(h.accept))
	r.With(admin).Post(rc+"/{id}/dismiss", httpx.Handler(h.dismiss))

	r.Get("/orgs/{orgID}/targets", httpx.Handler(h.getTargets))
	r.With(admin).Put("/orgs/{orgID}/targets", httpx.Handler(h.putTargets))

	r.Get("/orgs/{orgID}/campaigns/{id}/creative-fatigue", httpx.Handler(h.campaignFatigue))
}

func member(r *http.Request) organizations.Membership {
	return organizations.MembershipFromContext(r.Context())
}

func pathID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return id, httpx.ErrNotFound
	}
	return id, nil
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	status := r.URL.Query().Get("status")
	if status == "all" {
		status = ""
	} else if status == "" {
		status = StatusOpen
	} else if !slices.Contains(Statuses, status) {
		return invalid("status", "must be all, open, accepted, dismissed, expired or failed")
	}
	orgID := member(r).OrganizationID
	list, err := h.svc.List(r.Context(), orgID, status)
	if err != nil {
		return err
	}
	counts, err := h.svc.Counts(r.Context(), orgID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"recommendations": list, "counts": counts})
	return nil
}

func (h *Handlers) count(w http.ResponseWriter, r *http.Request) error {
	counts, err := h.svc.Counts(r.Context(), member(r).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"open": counts[StatusOpen]})
	return nil
}

func (h *Handlers) generate(w http.ResponseWriter, r *http.Request) error {
	res, err := h.svc.Generate(r.Context(), member(r).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, res)
	return nil
}

func (h *Handlers) accept(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	res, err := h.svc.Accept(r.Context(), member(r), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, res)
	return nil
}

func (h *Handlers) dismiss(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	rec, err := h.svc.Dismiss(r.Context(), member(r), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"recommendation": rec})
	return nil
}

func (h *Handlers) getTargets(w http.ResponseWriter, r *http.Request) error {
	t, err := h.svc.GetTargets(r.Context(), member(r).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"targets": t})
	return nil
}

func (h *Handlers) putTargets(w http.ResponseWriter, r *http.Request) error {
	var in Targets
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	t, err := h.svc.SetTargets(r.Context(), member(r), in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"targets": t})
	return nil
}

func (h *Handlers) campaignFatigue(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	list, cfg, err := h.svc.CampaignFatigue(r.Context(), member(r).OrganizationID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ads": list, "thresholds": cfg})
	return nil
}
