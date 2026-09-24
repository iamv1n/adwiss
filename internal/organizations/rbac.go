package organizations

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/store"
)

type Role = store.OrganizationRole

const (
	RoleOwner  = store.OrganizationRoleOwner
	RoleAdmin  = store.OrganizationRoleAdmin
	RoleMember = store.OrganizationRoleMember
)

func rank(r Role) int {
	switch r {
	case RoleOwner:
		return 3
	case RoleAdmin:
		return 2
	case RoleMember:
		return 1
	default:
		return 0
	}
}

// AtLeast reports whether r grants at least the privileges of min.
func AtLeast(r, min Role) bool { return rank(r) >= rank(min) && rank(min) > 0 }

// Membership is the caller's role in the organization addressed by the request.
type Membership struct {
	OrganizationID uuid.UUID
	UserID         uuid.UUID
	Role           Role
}

type ctxKey struct{}

// MembershipFromContext returns the membership loaded by RequireMember.
func MembershipFromContext(ctx context.Context) Membership {
	m, _ := ctx.Value(ctxKey{}).(Membership)
	return m
}

// RequireMember loads the caller's membership for the {orgID} URL parameter.
// Non-members get 404 so organization IDs cannot be probed.
func RequireMember(db *database.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			orgID, err := uuid.Parse(chi.URLParam(r, "orgID"))
			if err != nil {
				httpx.WriteError(w, r, httpx.ErrNotFound)
				return
			}
			user := auth.FromContext(r.Context()).User
			m, err := db.GetMembership(r.Context(), store.GetMembershipParams{OrganizationID: orgID, UserID: user.ID})
			if database.IsNotFound(err) {
				httpx.WriteError(w, r, httpx.ErrNotFound)
				return
			}
			if err != nil {
				httpx.WriteError(w, r, err)
				return
			}
			ctx := context.WithValue(r.Context(), ctxKey{}, Membership{OrganizationID: orgID, UserID: user.ID, Role: m.Role})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole rejects callers whose organization role is below min. Use after RequireMember.
func RequireRole(min Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !AtLeast(MembershipFromContext(r.Context()).Role, min) {
				httpx.WriteError(w, r, httpx.ErrForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
