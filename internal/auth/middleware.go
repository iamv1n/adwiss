package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/store"
)

const SessionCookieName = "adwise_session"

// AdminSessionCookieName holds a platform admin's own session token while
// they impersonate someone, so ending the impersonation can restore it. It
// never authenticates a request by itself.
const AdminSessionCookieName = "adwise_admin_session"

// Principal is the authenticated caller of a request.
type Principal struct {
	User      store.User
	SessionID uuid.UUID
	ExpiresAt time.Time
	// ImpersonatorID is the platform admin acting as User, if any.
	ImpersonatorID *uuid.UUID
}

type ctxKey struct{}

// FromContext returns the authenticated principal. Only call it behind RequireUser.
func FromContext(ctx context.Context) Principal {
	p, _ := ctx.Value(ctxKey{}).(Principal)
	return p
}

// RequireUser authenticates the request from the session cookie or a Bearer token.
func (s *Service) RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := tokenFromRequest(r)
		if token == "" {
			httpx.WriteError(w, r, httpx.ErrUnauthorized)
			return
		}
		p, err := s.Authenticate(r.Context(), token)
		if err != nil {
			httpx.WriteError(w, r, err)
			return
		}
		ctx := context.WithValue(r.Context(), ctxKey{}, p)
		if p.ImpersonatorID != nil {
			ctx = audit.WithImpersonator(ctx, *p.ImpersonatorID)
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequirePlatformAdmin allows platform admins using their own session. Use
// after RequireUser. Everyone else gets a 404, so the admin API is not
// discoverable.
func RequirePlatformAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := FromContext(r.Context())
		if !p.User.IsPlatformAdmin || p.ImpersonatorID != nil {
			httpx.WriteError(w, r, httpx.ErrNotFound)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func tokenFromRequest(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		if t, ok := strings.CutPrefix(h, "Bearer "); ok {
			return strings.TrimSpace(t)
		}
	}
	if c, err := r.Cookie(SessionCookieName); err == nil {
		return c.Value
	}
	return ""
}
