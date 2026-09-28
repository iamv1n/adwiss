package analytics

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct {
	svc *Service
}

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Register adds the analytics routes under /orgs/{orgID}/analytics. r must
// already apply auth and organizations.RequireMember.
func (h *Handlers) Register(r chi.Router) {
	r.Get("/orgs/{orgID}/analytics/overview", httpx.Handler(h.overview))
	r.Get("/orgs/{orgID}/analytics/campaigns", httpx.Handler(h.campaigns))
	r.Get("/orgs/{orgID}/analytics/hourly", httpx.Handler(h.hourly))
	r.Get("/orgs/{orgID}/analytics/dayparting", httpx.Handler(h.dayparting))
	r.Get("/orgs/{orgID}/analytics/breakdowns", httpx.Handler(h.breakdowns))
	r.Get("/orgs/{orgID}/analytics/wasted-spend", httpx.Handler(h.wastedSpend))
	r.Get("/orgs/{orgID}/analytics/series", httpx.Handler(h.series))
}

func parseScope(r *http.Request, allowCompare bool) (Scope, error) {
	q := r.URL.Query()
	sc := Scope{OrganizationID: organizations.MembershipFromContext(r.Context()).OrganizationID}
	var err error
	if sc.Range, err = params.DateRangeOrDefault(q); err != nil {
		return sc, err
	}
	if sc.AccountID, err = params.UUID(q, "account_id"); err != nil {
		return sc, err
	}
	if sc.CampaignID, err = params.UUID(q, "campaign_id"); err != nil {
		return sc, err
	}
	if sc.Provider, err = params.Provider(q); err != nil {
		return sc, err
	}
	if sc.Currency, err = params.Currency(q); err != nil {
		return sc, err
	}
	if allowCompare {
		if sc.Compare, err = params.OneOf(q, "compare", CompareNone, CompareNone, ComparePreviousPeriod, ComparePreviousYear); err != nil {
			return sc, err
		}
	}
	return sc, nil
}

func (h *Handlers) overview(w http.ResponseWriter, r *http.Request) error {
	sc, err := parseScope(r, true)
	if err != nil {
		return err
	}
	out, err := h.svc.Overview(r.Context(), sc)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) campaigns(w http.ResponseWriter, r *http.Request) error {
	sc, err := parseScope(r, true)
	if err != nil {
		return err
	}
	q := r.URL.Query()
	cq := CampaignQuery{Scope: sc}
	status, err := params.Status(q)
	if err != nil {
		return err
	}
	cq.Status = string(status)
	if cq.Search, err = params.Search(q); err != nil {
		return err
	}
	if cq.Sort, err = params.OneOf(q, "sort", "spend", CampaignSorts...); err != nil {
		return err
	}
	defOrder := "desc"
	if cq.Sort == "name" || cq.Sort == "status" {
		defOrder = "asc"
	}
	if cq.Order, err = params.OneOf(q, "order", defOrder, "asc", "desc"); err != nil {
		return err
	}
	if cq.Page, err = params.ParsePage(q); err != nil {
		return err
	}
	out, err := h.svc.Campaigns(r.Context(), cq)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) hourly(w http.ResponseWriter, r *http.Request) error {
	sc, err := parseScope(r, false)
	if err != nil {
		return err
	}
	out, err := h.svc.Hourly(r.Context(), sc)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) dayparting(w http.ResponseWriter, r *http.Request) error {
	sc, err := parseScope(r, false)
	if err != nil {
		return err
	}
	metric, err := params.OneOf(r.URL.Query(), "metric", "roas", DaypartingMetrics...)
	if err != nil {
		return err
	}
	out, err := h.svc.Dayparting(r.Context(), sc, metric)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) breakdowns(w http.ResponseWriter, r *http.Request) error {
	sc, err := parseScope(r, false)
	if err != nil {
		return err
	}
	dim := r.URL.Query().Get("dimension")
	if dim == "" {
		return params.Invalid("dimension", "required; one of "+strings.Join(BreakdownDimensions, ", "))
	}
	out, err := h.svc.Breakdowns(r.Context(), sc, dim)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}

func (h *Handlers) wastedSpend(w http.ResponseWriter, r *http.Request) error {
	sc, err := parseScope(r, false)
	if err != nil {
		return err
	}
	q := r.URL.Query()
	wq := WastedQuery{Scope: sc}
	c := &wq.Criteria
	if c.Level, err = params.OneOf(q, "level", "campaign", WastedLevels...); err != nil {
		return err
	}
	if c.MinSpend, err = params.Float(q, "min_spend", 0); err != nil {
		return err
	}
	if c.MaxConversions, err = params.Float(q, "max_conversions", 0); err != nil {
		return err
	}
	if c.ROASBelow, err = params.Float(q, "roas_below", 1); err != nil {
		return err
	}
	if wq.Page, err = params.ParsePage(q); err != nil {
		return err
	}
	out, err := h.svc.WastedSpend(r.Context(), wq)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, out)
	return nil
}
