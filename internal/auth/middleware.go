package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/store"
)

const SessionCookieName = "adwise_session"

// Principal is the authenticated caller of a request.
type Principal struct {
	User      store.User
	SessionID uuid.UUID
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
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, p)))
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
