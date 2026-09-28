package leads

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct{ svc *Service }

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Register adds the routes. r must already apply auth and
// organizations.RequireMember. Members may work leads (sales teams usually
// are members), so writes need no admin role.
//
//	GET   /orgs/{orgID}/leads?status=&campaign_id=&q=&from=&to=&limit=&cursor=
//	GET   /orgs/{orgID}/leads/summary?from=YYYY-MM-DD&to=YYYY-MM-DD   (to is inclusive)
//	GET   /orgs/{orgID}/leads/{id}
//	POST  /orgs/{orgID}/leads
//	PATCH /orgs/{orgID}/leads/{id}
//	GET   /orgs/{orgID}/leads/setup       setup status (what ads they run, lead access)
//	PUT   /orgs/{orgID}/leads/setup       admin+: { "ad_types": [...] }
func (h *Handlers) Register(r chi.Router) {
	r.Get("/orgs/{orgID}/leads/setup", httpx.Handler(h.getSetup))
	r.With(organizations.RequireRole(organizations.RoleAdmin)).Put("/orgs/{orgID}/leads/setup", httpx.Handler(h.putSetup))
	r.Get("/orgs/{orgID}/leads", httpx.Handler(h.list))
	r.Get("/orgs/{orgID}/leads/summary", httpx.Handler(h.summary))
	r.Get("/orgs/{orgID}/leads/{id}", httpx.Handler(h.get))
	r.Post("/orgs/{orgID}/leads", httpx.Handler(h.create))
	r.Patch("/orgs/{orgID}/leads/{id}", httpx.Handler(h.update))
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

// dateParam parses YYYY-MM-DD as midnight UTC; inclusive adds a day.
func dateParam(r *http.Request, name string, inclusive bool) (*time.Time, error) {
	v := r.URL.Query().Get(name)
	if v == "" {
		return nil, nil
	}
	t, err := time.Parse(time.DateOnly, v)
	if err != nil {
		return nil, validation(name, "use YYYY-MM-DD")
	}
	if inclusive {
		t = t.AddDate(0, 0, 1)
	}
	return &t, nil
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	f := Filter{Status: q.Get("status"), Query: q.Get("q"), Cursor: q.Get("cursor")}
	if v := q.Get("campaign_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			return validation("campaign_id", "invalid id")
		}
		f.CampaignID = &id
	}
	var err error
	if f.From, err = dateParam(r, "from", false); err != nil {
		return err
	}
	if f.To, err = dateParam(r, "to", true); err != nil {
		return err
	}
	if v := q.Get("limit"); v != "" {
		if f.Limit, err = strconv.Atoi(v); err != nil {
			return validation("limit", "must be a number")
		}
	}
	items, next, err := h.svc.List(r.Context(), member(r).OrganizationID, f)
	if err != nil {
		return err
	}
	var nextPtr *string
	if next != "" {
		nextPtr = &next
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"leads": items, "next_cursor": nextPtr})
	return nil
}

func (h *Handlers) summary(w http.ResponseWriter, r *http.Request) error {
	from, err := dateParam(r, "from", false)
	if err != nil {
		return err
	}
	to, err := dateParam(r, "to", true)
	if err != nil {
		return err
	}
	if from == nil || to == nil {
		return validation("from", "from and to are required")
	}
	s, err := h.svc.Summary(r.Context(), member(r).OrganizationID, *from, *to)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, s)
	return nil
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	l, err := h.svc.Get(r.Context(), member(r).OrganizationID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"lead": l})
	return nil
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) error {
	var in CreateInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	l, err := h.svc.Create(r.Context(), member(r), in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"lead": l})
	return nil
}

func (h *Handlers) update(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in UpdateInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	l, err := h.svc.Update(r.Context(), member(r), id, in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"lead": l})
	return nil
}

func (h *Handlers) getSetup(w http.ResponseWriter, r *http.Request) error {
	s, err := h.svc.Setup(r.Context(), member(r).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"setup": s})
	return nil
}

type setupRequest struct {
	AdTypes []string `json:"ad_types" validate:"required,min=1,max=10"`
}

func (h *Handlers) putSetup(w http.ResponseWriter, r *http.Request) error {
	var req setupRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	s, err := h.svc.SetAdTypes(r.Context(), member(r), req.AdTypes)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"setup": s})
	return nil
}
