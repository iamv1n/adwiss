package alerts

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct{ svc *Service }

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Register adds the routes under /orgs/{orgID}. r must already apply auth and
// organizations.RequireMember. Read state and preferences are the caller's
// own; running detection on demand requires admin.
func (h *Handlers) Register(r chi.Router) {
	const p = "/orgs/{orgID}/alerts"
	r.Get(p, httpx.Handler(h.list))
	r.Get(p+"/unread-count", httpx.Handler(h.unreadCount))
	r.Post(p+"/read-all", httpx.Handler(h.markAllRead))
	r.Post(p+"/{id}/read", httpx.Handler(h.markRead))
	r.Get(p+"/preferences", httpx.Handler(h.getPreferences))
	r.Put(p+"/preferences", httpx.Handler(h.putPreferences))
	r.With(organizations.RequireRole(organizations.RoleAdmin)).Post(p+"/run", httpx.Handler(h.run))
}

func member(r *http.Request) organizations.Membership {
	return organizations.MembershipFromContext(r.Context())
}

func badRequest(field, msg string) error {
	return &httpx.Error{Status: http.StatusBadRequest, Code: "invalid_query", Message: msg, Fields: map[string]string{field: msg}}
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	f := ListFilter{Status: q.Get("status"), Severity: q.Get("severity"), Kind: q.Get("kind")}
	switch f.Status {
	case "", "open", "resolved":
	default:
		return badRequest("status", "status must be open or resolved")
	}
	if f.Severity != "" && severityRank(f.Severity) == 0 {
		return badRequest("severity", "severity must be info, warning or critical")
	}
	if f.Kind != "" && !validKind(f.Kind) {
		return badRequest("kind", "unknown kind")
	}
	if v := q.Get("unread"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return badRequest("unread", "unread must be true or false")
		}
		f.UnreadOnly = b
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 200 {
			return badRequest("limit", "limit must be 1-200")
		}
		f.Limit = n
	}
	list, unread, err := h.svc.List(r.Context(), member(r), f)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"alerts": list, "unread_count": unread})
	return nil
}

func (h *Handlers) unreadCount(w http.ResponseWriter, r *http.Request) error {
	n, err := h.svc.UnreadCount(r.Context(), member(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"count": n})
	return nil
}

func (h *Handlers) markRead(w http.ResponseWriter, r *http.Request) error {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.ErrNotFound
	}
	if err := h.svc.MarkRead(r.Context(), member(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) markAllRead(w http.ResponseWriter, r *http.Request) error {
	n, err := h.svc.MarkAllRead(r.Context(), member(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]int64{"marked": n})
	return nil
}

func (h *Handlers) getPreferences(w http.ResponseWriter, r *http.Request) error {
	p, err := h.svc.Preferences(r.Context(), member(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"preferences": p, "kinds": Kinds})
	return nil
}

func (h *Handlers) putPreferences(w http.ResponseWriter, r *http.Request) error {
	var in PreferencesInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	p, err := h.svc.SavePreferences(r.Context(), member(r), in)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"preferences": p, "kinds": Kinds})
	return nil
}

func (h *Handlers) run(w http.ResponseWriter, r *http.Request) error {
	res, err := h.svc.RunOrg(r.Context(), member(r).OrganizationID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"result": res})
	return nil
}
