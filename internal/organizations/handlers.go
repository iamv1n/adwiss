package organizations

import (
	"net/http"
	"net/url"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct {
	svc        *Service
	db         *database.DB
	webBaseURL string
}

func NewHandlers(svc *Service, db *database.DB, webBaseURL string) *Handlers {
	return &Handlers{svc: svc, db: db, webBaseURL: webBaseURL}
}

// OrgRoutes mounts under /v1/orgs. Callers must already be authenticated.
func (h *Handlers) OrgRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", httpx.Handler(h.list))
	r.Post("/", httpx.Handler(h.create))

	r.Route("/{orgID}", func(r chi.Router) {
		r.Use(RequireMember(h.db))

		r.Get("/members", httpx.Handler(h.listMembers))
		// Role checks for member mutations live in the service: members may remove themselves.
		r.Patch("/members/{userID}", httpx.Handler(h.changeRole))
		r.Delete("/members/{userID}", httpx.Handler(h.removeMember))

		r.Group(func(r chi.Router) {
			r.Use(RequireRole(RoleAdmin))
			r.Get("/invitations", httpx.Handler(h.listInvitations))
			r.Post("/invitations", httpx.Handler(h.createInvitation))
			r.Delete("/invitations/{invitationID}", httpx.Handler(h.revokeInvitation))
		})
	})
	return r
}

// InvitationRoutes mounts under /v1/invitations. Callers must already be authenticated.
func (h *Handlers) InvitationRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/accept", httpx.Handler(h.acceptInvitation))
	return r
}

// ListForMe backs the organizations list in /v1/auth/me.
func (h *Handlers) ListForMe(r *http.Request, userID uuid.UUID) (any, error) {
	return h.svc.ListForUser(r.Context(), userID)
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) error {
	orgs, err := h.svc.ListForUser(r.Context(), auth.FromContext(r.Context()).User.ID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"organizations": orgs})
	return nil
}

type createRequest struct {
	Name string `json:"name" validate:"required,min=1,max=100"`
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) error {
	var req createRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, err := h.svc.Create(r.Context(), auth.FromContext(r.Context()).User.ID, req.Name)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"organization": org})
	return nil
}

type memberResponse struct {
	ID       uuid.UUID `json:"id"`
	Email    string    `json:"email"`
	Name     string    `json:"name"`
	Role     Role      `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

func (h *Handlers) listMembers(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.svc.ListMembers(r.Context(), MembershipFromContext(r.Context()).OrganizationID)
	if err != nil {
		return err
	}
	out := make([]memberResponse, len(rows))
	for i, m := range rows {
		out[i] = memberResponse{ID: m.ID, Email: m.Email, Name: m.Name, Role: m.Role, JoinedAt: m.CreatedAt}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"members": out})
	return nil
}

type changeRoleRequest struct {
	Role Role `json:"role" validate:"required,oneof=owner admin member"`
}

func (h *Handlers) changeRole(w http.ResponseWriter, r *http.Request) error {
	target, err := uuidParam(r, "userID")
	if err != nil {
		return err
	}
	var req changeRoleRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	actor := MembershipFromContext(r.Context())
	if !AtLeast(actor.Role, RoleAdmin) {
		return httpx.ErrForbidden
	}
	if err := h.svc.ChangeRole(r.Context(), actor, target, req.Role); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) removeMember(w http.ResponseWriter, r *http.Request) error {
	target, err := uuidParam(r, "userID")
	if err != nil {
		return err
	}
	if err := h.svc.RemoveMember(r.Context(), MembershipFromContext(r.Context()), target); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

type invitationResponse struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Role      Role      `json:"role"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *Handlers) listInvitations(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.svc.ListInvitations(r.Context(), MembershipFromContext(r.Context()).OrganizationID)
	if err != nil {
		return err
	}
	out := make([]invitationResponse, len(rows))
	for i, inv := range rows {
		out[i] = invitationResponse{ID: inv.ID, Email: inv.Email, Role: inv.Role, ExpiresAt: inv.ExpiresAt, CreatedAt: inv.CreatedAt}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"invitations": out})
	return nil
}

type inviteRequest struct {
	Email string `json:"email" validate:"required,email,max=254"`
	Role  Role   `json:"role" validate:"required,oneof=owner admin member"`
}

func (h *Handlers) createInvitation(w http.ResponseWriter, r *http.Request) error {
	var req inviteRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	created, err := h.svc.Invite(r.Context(), MembershipFromContext(r.Context()), req.Email, req.Role)
	if err != nil {
		return err
	}
	inv := created.Invitation
	httpx.JSON(w, http.StatusCreated, map[string]any{
		"invitation": invitationResponse{ID: inv.ID, Email: inv.Email, Role: inv.Role, ExpiresAt: inv.ExpiresAt, CreatedAt: inv.CreatedAt},
		// Returned until email delivery exists so the inviter can share the link.
		"accept_url": h.webBaseURL + "/invite/" + url.PathEscape(created.Token),
	})
	return nil
}

func (h *Handlers) revokeInvitation(w http.ResponseWriter, r *http.Request) error {
	id, err := uuidParam(r, "invitationID")
	if err != nil {
		return err
	}
	if err := h.svc.RevokeInvitation(r.Context(), MembershipFromContext(r.Context()), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

type acceptRequest struct {
	Token string `json:"token" validate:"required,max=128"`
}

func (h *Handlers) acceptInvitation(w http.ResponseWriter, r *http.Request) error {
	var req acceptRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, err := h.svc.AcceptInvitation(r.Context(), auth.FromContext(r.Context()).User, req.Token)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"organization": org})
	return nil
}

func uuidParam(r *http.Request, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		return uuid.Nil, httpx.ErrNotFound
	}
	return id, nil
}
