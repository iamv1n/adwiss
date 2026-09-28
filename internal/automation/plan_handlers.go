package automation

import (
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/platform/httpx"
)

// registerPlans adds the budget planner routes (plan/budget-planner.md "API").
func (h *Handlers) registerPlans(r chi.Router, admin func(http.Handler) http.Handler) {
	const p = "/orgs/{orgID}/budget-plans"
	r.Get(p, httpx.Handler(h.listPlans))
	r.Get(p+"/suggest-split", httpx.Handler(h.suggestSplit))
	r.Get(p+"/{id}", httpx.Handler(h.getPlan))
	r.With(admin).Post(p, httpx.Handler(h.createPlan))
	r.With(admin).Post(p+"/preview", httpx.Handler(h.previewPlan))
	r.With(admin).Patch(p+"/{id}", httpx.Handler(h.updatePlan))
	r.With(admin).Delete(p+"/{id}", httpx.Handler(h.deletePlan))
	r.With(admin).Post(p+"/{id}/run", httpx.Handler(h.runPlan))
}

func (h *Handlers) listPlans(w http.ResponseWriter, r *http.Request) error {
	out, err := h.svc.ListPlans(r.Context(), member(r).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"plans": out})
	return nil
}

func (h *Handlers) getPlan(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	out, err := h.svc.GetPlan(r.Context(), member(r).OrganizationID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) createPlan(w http.ResponseWriter, r *http.Request) error {
	var in PlanInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	out, err := h.svc.CreatePlan(r.Context(), member(r), in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, out)
	return nil
}

func (h *Handlers) updatePlan(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in PlanInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	out, err := h.svc.UpdatePlan(r.Context(), member(r), id, in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) deletePlan(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := h.svc.DeletePlan(r.Context(), member(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) previewPlan(w http.ResponseWriter, r *http.Request) error {
	var in PlanInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	out, err := h.svc.PreviewPlan(r.Context(), member(r).OrganizationID, in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) runPlan(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	out, err := h.svc.RunPlan(r.Context(), member(r), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

// suggestSplit: ?campaign_ids=a,b,c (or repeated) &mode=past_spend|roas &days=30.
func (h *Handlers) suggestSplit(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	var ids []uuid.UUID
	for _, v := range q["campaign_ids"] {
		for _, part := range strings.Split(v, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			id, err := uuid.Parse(part)
			if err != nil {
				return invalid("campaign_ids", "must be campaign IDs")
			}
			if !slices.Contains(ids, id) {
				ids = append(ids, id)
			}
		}
	}
	if len(ids) == 0 {
		return invalid("campaign_ids", "is required")
	}
	if len(ids) > maxPlanCampaigns {
		return invalid("campaign_ids", "too many campaigns")
	}
	mode := q.Get("mode")
	if mode == "" {
		mode = AllocPastSpend
	}
	if mode != AllocPastSpend && mode != AllocROAS {
		return invalid("mode", "must be past_spend or roas")
	}
	days := 30
	if v := q.Get("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 90 {
			return invalid("days", "must be between 1 and 90")
		}
		days = n
	}
	out, err := h.svc.SuggestSplit(r.Context(), member(r).OrganizationID, ids, mode, days)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"shares": out})
	return nil
}
