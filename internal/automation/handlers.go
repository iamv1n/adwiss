package automation

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct{ svc *Service }

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Register adds the routes under /orgs/{orgID}. r must already apply auth and
// organizations.RequireMember; mutations additionally require admin.
func (h *Handlers) Register(r chi.Router) {
	admin := organizations.RequireRole(organizations.RoleAdmin)
	const s = "/orgs/{orgID}/dayparting/schedules"
	r.Get(s, httpx.Handler(h.listSchedules))
	r.Get(s+"/{id}", httpx.Handler(h.getSchedule))
	r.With(admin).Post(s, httpx.Handler(h.createSchedule))
	r.With(admin).Post(s+"/preview", httpx.Handler(h.previewSchedule))
	r.With(admin).Patch(s+"/{id}", httpx.Handler(h.updateSchedule))
	r.With(admin).Delete(s+"/{id}", httpx.Handler(h.deleteSchedule))
	r.With(admin).Post(s+"/{id}/preview", httpx.Handler(h.previewSchedule))
	r.With(admin).Post(s+"/{id}/run", httpx.Handler(h.runSchedule))

	const rl = "/orgs/{orgID}/automations/rules"
	r.Get(rl, httpx.Handler(h.listRules))
	r.Get(rl+"/{id}", httpx.Handler(h.getRule))
	r.With(admin).Post(rl, httpx.Handler(h.createRule))
	r.With(admin).Post(rl+"/preview", httpx.Handler(h.previewRule))
	r.With(admin).Patch(rl+"/{id}", httpx.Handler(h.updateRule))
	r.With(admin).Delete(rl+"/{id}", httpx.Handler(h.deleteRule))
	r.With(admin).Post(rl+"/{id}/preview", httpx.Handler(h.previewRule))
	r.With(admin).Post(rl+"/{id}/run", httpx.Handler(h.runRule))

	h.registerPlans(r, admin)

	r.Get("/orgs/{orgID}/actions", httpx.Handler(h.listActions))
	r.Get("/orgs/{orgID}/actions/{id}", httpx.Handler(h.getAction))
	r.With(admin).Post("/orgs/{orgID}/actions/{id}/revert", httpx.Handler(h.revert))
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

func optPathID(r *http.Request) (*uuid.UUID, error) {
	if chi.URLParam(r, "id") == "" {
		return nil, nil
	}
	id, err := pathID(r)
	return &id, err
}

// --- schedules ---

func (h *Handlers) listSchedules(w http.ResponseWriter, r *http.Request) error {
	out, err := h.svc.ListSchedules(r.Context(), member(r).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"schedules": out})
	return nil
}

func (h *Handlers) getSchedule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	out, err := h.svc.GetSchedule(r.Context(), member(r).OrganizationID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"schedule": out})
	return nil
}

func (h *Handlers) createSchedule(w http.ResponseWriter, r *http.Request) error {
	var in ScheduleInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	out, err := h.svc.CreateSchedule(r.Context(), member(r), in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"schedule": out})
	return nil
}

func (h *Handlers) updateSchedule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in ScheduleInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	out, err := h.svc.UpdateSchedule(r.Context(), member(r), id, in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"schedule": out})
	return nil
}

func (h *Handlers) deleteSchedule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := h.svc.DeleteSchedule(r.Context(), member(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) previewSchedule(w http.ResponseWriter, r *http.Request) error {
	id, err := optPathID(r)
	if err != nil {
		return err
	}
	var in ScheduleInput
	if r.ContentLength != 0 {
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
	}
	out, err := h.svc.PreviewSchedule(r.Context(), member(r).OrganizationID, id, in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) runSchedule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	out, err := h.svc.RunSchedule(r.Context(), member(r), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

// --- rules ---

func (h *Handlers) listRules(w http.ResponseWriter, r *http.Request) error {
	out, err := h.svc.ListRules(r.Context(), member(r).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"rules": out})
	return nil
}

func (h *Handlers) getRule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	out, err := h.svc.GetRule(r.Context(), member(r).OrganizationID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"rule": out})
	return nil
}

func (h *Handlers) createRule(w http.ResponseWriter, r *http.Request) error {
	var in RuleInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	out, err := h.svc.CreateRule(r.Context(), member(r), in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"rule": out})
	return nil
}

func (h *Handlers) updateRule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in RuleInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	out, err := h.svc.UpdateRule(r.Context(), member(r), id, in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"rule": out})
	return nil
}

func (h *Handlers) deleteRule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := h.svc.DeleteRule(r.Context(), member(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) previewRule(w http.ResponseWriter, r *http.Request) error {
	id, err := optPathID(r)
	if err != nil {
		return err
	}
	var in RuleInput
	if r.ContentLength != 0 {
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
	}
	out, err := h.svc.PreviewRule(r.Context(), member(r).OrganizationID, id, in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) runRule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	out, err := h.svc.RunRule(r.Context(), member(r), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

// --- actions ---

func (h *Handlers) listActions(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	f := ActionFilter{Limit: 50}
	oneOf := func(key string, allowed ...string) (string, error) {
		v := q.Get(key)
		if v == "" {
			return "", nil
		}
		for _, a := range allowed {
			if v == a {
				return v, nil
			}
		}
		return "", invalid(key, "must be one of "+strings.Join(allowed, ", "))
	}
	var err error
	if f.Source, err = oneOf("source", SourceManual, SourceSchedule, SourceRule, SourceRevert, SourcePlan); err != nil {
		return err
	}
	if v := q.Get("status"); v != "" {
		if !validStatus(v) {
			return invalid("status", "unknown status")
		}
		f.Status = v
	}
	if f.ActionType, err = oneOf("action_type", ActionPause, ActionActivate, ActionSetBudget, ActionNotify, ActionArchive, ActionUpdate); err != nil {
		return err
	}
	for key, dst := range map[string]**uuid.UUID{"source_id": &f.SourceID, "entity_id": &f.EntityID} {
		if v := q.Get(key); v != "" {
			id, err := uuid.Parse(v)
			if err != nil {
				return invalid(key, "must be a UUID")
			}
			*dst = &id
		}
	}
	f.Search = strings.TrimSpace(q.Get("search"))
	if len(f.Search) > 200 {
		return invalid("search", "at most 200 characters")
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 200 {
			return invalid("limit", "between 1 and 200")
		}
		f.Limit = n
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return invalid("offset", "must be ≥ 0")
		}
		f.Offset = n
	}
	list, total, counts, err := h.svc.ListActions(r.Context(), member(r).OrganizationID, f)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"actions": list,
		"page":    map[string]int{"limit": f.Limit, "offset": f.Offset, "total": total},
		"counts":  counts,
	})
	return nil
}

func (h *Handlers) getAction(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	a, err := h.svc.st.getAction(r.Context(), member(r).OrganizationID, id)
	if err != nil {
		return notFound(err)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"action": a})
	return nil
}

func (h *Handlers) revert(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	a, err := h.svc.Revert(r.Context(), member(r), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"action": a})
	return nil
}
