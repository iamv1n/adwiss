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
	ID              uuid.UUID `json:"id"`
	Email           string    `json:"email"`
	Name            string    `json:"name"`
	IsPlatformAdmin bool      `json:"is_platform_admin"`
	CreatedAt       time.Time `json:"created_at"`
}

func ToUserResponse(u store.User) UserResponse {
	return UserResponse{ID: u.ID, Email: u.Email, Name: u.Name, IsPlatformAdmin: u.IsPlatformAdmin, CreatedAt: u.CreatedAt}
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
		h.securityPublicRoutes(r)
	})
	r.Group(func(r chi.Router) {
		r.Use(h.svc.RequireUser)
		r.Post("/logout", httpx.Handler(h.logout))
		r.Get("/me", httpx.Handler(h.me))
		r.Post("/impersonation/stop", httpx.Handler(h.stopImpersonation))
		h.securityRoutes(r)
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
	client := clientInfo(r)
	user, sess, err := h.svc.Signup(r.Context(), req.Email, req.Name, req.Password, client)
	if err != nil {
		return err
	}
	h.setSessionCookie(w, sess)
	h.setDeviceCookie(w, h.svc.AfterSignup(r.Context(), user, client))
	httpx.JSON(w, http.StatusCreated, map[string]any{"status": "ok", "user": ToUserResponse(user)})
	return nil
}

type loginRequest struct {
	Email          string `json:"email" validate:"required,email"`
	Password       string `json:"password" validate:"required,max=256"`
	RememberDevice bool   `json:"remember_device"`
}

func (h *Handlers) login(w http.ResponseWriter, r *http.Request) error {
	var req loginRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	res, err := h.svc.Login(r.Context(), req.Email, req.Password, req.RememberDevice, clientInfo(r))
	if err != nil {
		return err
	}
	h.writeLoginResult(w, res)
	return nil
}

func (h *Handlers) logout(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.Logout(r.Context(), FromContext(r.Context()).SessionID); err != nil {
		return err
	}
	h.clearCookie(w, SessionCookieName)
	h.clearCookie(w, AdminSessionCookieName)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) error {
	p := FromContext(r.Context())
	orgs, err := h.listOrgs(r, p.User.ID)
	if err != nil {
		return err
	}
	emailVerified, twoFactor, err := h.svc.MeSecurity(r.Context(), p.User.ID)
	if err != nil {
		return err
	}
	resp := map[string]any{"user": ToUserResponse(p.User), "organizations": orgs,
		"email_verified": emailVerified, "two_factor_enabled": twoFactor}
	if p.ImpersonatorID != nil {
		admin, err := h.svc.db.GetUserByID(r.Context(), *p.ImpersonatorID)
		if err != nil {
			return err
		}
		resp["impersonator"] = ToUserResponse(admin)
		resp["impersonation_expires_at"] = p.ExpiresAt
	}
	httpx.JSON(w, http.StatusOK, resp)
	return nil
}

// StartImpersonation switches the calling platform admin's browser into a
// session as targetID. The admin's own token is parked in
// AdminSessionCookieName until stopImpersonation restores it.
func (h *Handlers) StartImpersonation(w http.ResponseWriter, r *http.Request, targetID uuid.UUID) error {
	admin := FromContext(r.Context())
	target, sess, err := h.svc.StartImpersonation(r.Context(), admin, targetID, clientInfo(r))
	if err != nil {
		return err
	}
	h.setCookie(w, AdminSessionCookieName, tokenFromRequest(r), admin.ExpiresAt)
	h.setSessionCookie(w, sess)
	httpx.JSON(w, http.StatusOK, map[string]any{"user": ToUserResponse(target), "expires_at": sess.ExpiresAt})
	return nil
}

// stopImpersonation ends the impersonation and restores the admin's own
// session when its parked token is still valid; otherwise the browser ends
// up signed out.
func (h *Handlers) stopImpersonation(w http.ResponseWriter, r *http.Request) error {
	p := FromContext(r.Context())
	if err := h.svc.StopImpersonation(r.Context(), p); err != nil {
		return err
	}
	h.clearCookie(w, AdminSessionCookieName)
	if c, err := r.Cookie(AdminSessionCookieName); err == nil {
		admin, err := h.svc.Authenticate(r.Context(), c.Value)
		if err == nil && admin.User.ID == *p.ImpersonatorID && admin.ImpersonatorID == nil {
			h.setCookie(w, SessionCookieName, c.Value, admin.ExpiresAt)
			httpx.JSON(w, http.StatusOK, map[string]any{"restored": true, "user": ToUserResponse(admin.User)})
			return nil
		}
	}
	h.clearCookie(w, SessionCookieName)
	httpx.JSON(w, http.StatusOK, map[string]any{"restored": false})
	return nil
}

func (h *Handlers) setSessionCookie(w http.ResponseWriter, sess NewSession) {
	h.setCookie(w, SessionCookieName, sess.Token, sess.ExpiresAt)
}

func (h *Handlers) setCookie(w http.ResponseWriter, name, value string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handlers) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: h.cookieSecure, SameSite: http.SameSiteLaxMode,
	})
}

// clientInfo relies on chi's RealIP middleware having set RemoteAddr.
func clientInfo(r *http.Request) ClientInfo {
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}
	info := ClientInfo{UserAgent: r.UserAgent(), IPAddress: ip}
	if c, err := r.Cookie(DeviceCookieName); err == nil {
		info.DeviceToken = c.Value
	}
	return info
}
