package auth

import (
	"net"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/store"
)

// UserResponse is the public view of a user; it never includes the password hash.
type UserResponse struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

func ToUserResponse(u store.User) UserResponse {
	return UserResponse{ID: u.ID, Email: u.Email, Name: u.Name, CreatedAt: u.CreatedAt}
}

// OrgLister lets /auth/me include the caller's organizations without auth
// importing the organizations package.
type OrgLister func(r *http.Request, userID uuid.UUID) (any, error)

type Handlers struct {
	svc          *Service
	cookieSecure bool
	listOrgs     OrgLister
	// credentialLimit throttles signup and login attempts; nil disables it.
	credentialLimit func(http.Handler) http.Handler
}

func NewHandlers(svc *Service, cookieSecure bool, listOrgs OrgLister, credentialLimit func(http.Handler) http.Handler) *Handlers {
	return &Handlers{svc: svc, cookieSecure: cookieSecure, listOrgs: listOrgs, credentialLimit: credentialLimit}
}

// Routes mounts under /v1/auth.
func (h *Handlers) Routes() chi.Router {
	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		if h.credentialLimit != nil {
			r.Use(h.credentialLimit)
		}
		r.Post("/signup", httpx.Handler(h.signup))
		r.Post("/login", httpx.Handler(h.login))
	})
	r.Group(func(r chi.Router) {
		r.Use(h.svc.RequireUser)
		r.Post("/logout", httpx.Handler(h.logout))
		r.Get("/me", httpx.Handler(h.me))
	})
	return r
}

type signupRequest struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Name     string `json:"name" validate:"required,min=1,max=100"`
	Password string `json:"password" validate:"required,min=10,max=256"`
}

func (h *Handlers) signup(w http.ResponseWriter, r *http.Request) error {
	var req signupRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	user, sess, err := h.svc.Signup(r.Context(), req.Email, req.Name, req.Password, clientInfo(r))
	if err != nil {
		return err
	}
	h.setSessionCookie(w, sess)
	httpx.JSON(w, http.StatusCreated, map[string]any{"user": ToUserResponse(user)})
	return nil
}

type loginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,max=256"`
}

func (h *Handlers) login(w http.ResponseWriter, r *http.Request) error {
	var req loginRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	user, sess, err := h.svc.Login(r.Context(), req.Email, req.Password, clientInfo(r))
	if err != nil {
		return err
	}
	h.setSessionCookie(w, sess)
	httpx.JSON(w, http.StatusOK, map[string]any{"user": ToUserResponse(user)})
	return nil
}

func (h *Handlers) logout(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.Logout(r.Context(), FromContext(r.Context()).SessionID); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name: SessionCookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: h.cookieSecure, SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) error {
	p := FromContext(r.Context())
	orgs, err := h.listOrgs(r, p.User.ID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": ToUserResponse(p.User), "organizations": orgs})
	return nil
}

func (h *Handlers) setSessionCookie(w http.ResponseWriter, sess NewSession) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    sess.Token,
		Path:     "/",
		Expires:  sess.ExpiresAt,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

// clientInfo relies on chi's RealIP middleware having set RemoteAddr.
func clientInfo(r *http.Request) ClientInfo {
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}
	return ClientInfo{UserAgent: r.UserAgent(), IPAddress: ip}
}
