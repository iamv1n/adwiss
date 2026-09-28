// Package auth implements self-hosted email/password authentication with
// server-side sessions.
package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/store"
)

var (
	ErrInvalidCredentials = httpx.NewError(http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
	ErrEmailTaken         = httpx.NewError(http.StatusConflict, "email_taken", "an account with this email already exists")
	ErrCannotImpersonate  = httpx.NewError(http.StatusForbidden, "cannot_impersonate", "platform admins cannot be impersonated")
	ErrNotImpersonating   = httpx.NewError(http.StatusConflict, "not_impersonating", "this session is not an impersonation")
)

// ImpersonationTTL bounds how long an admin can act as another user.
const ImpersonationTTL = time.Hour

// sessionTouchInterval limits how often last_seen_at is written.
const sessionTouchInterval = 5 * time.Minute

// dummyHash is verified against when the email is unknown, so login timing
// does not reveal which emails are registered.
var dummyHash, _ = HashPassword("adwise-timing-equaliser")

type Service struct {
	db         *database.DB
	sessionTTL time.Duration
	sec        SecurityConfig
}

func NewService(db *database.DB, sessionTTL time.Duration) *Service {
	return &Service{db: db, sessionTTL: sessionTTL}
}

type ClientInfo struct {
	UserAgent string
	IPAddress string
	// DeviceToken is the adwise_device cookie value, if the browser sent one.
	DeviceToken string
}

type NewSession struct {
	Token     string
	ExpiresAt time.Time
}

func normalizeEmail(email string) string { return strings.TrimSpace(email) }

func (s *Service) Signup(ctx context.Context, email, name, password string, client ClientInfo) (store.User, NewSession, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return store.User{}, NewSession{}, err
	}

	var user store.User
	var sess NewSession
	err = s.db.InTx(ctx, func(q *store.Queries) error {
		user, err = q.CreateUser(ctx, store.CreateUserParams{
			Email:        normalizeEmail(email),
			Name:         strings.TrimSpace(name),
			PasswordHash: hash,
		})
		if database.IsUniqueViolation(err) {
			return ErrEmailTaken
		}
		if err != nil {
			return err
		}
		if sess, err = s.createSession(ctx, q, user.ID, client); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			ActorUserID: &user.ID, Action: "user.signed_up", EntityType: "user", EntityID: user.ID.String(),
		})
	})
	return user, sess, err
}

func (s *Service) Logout(ctx context.Context, sessionID uuid.UUID) error {
	return s.db.DeleteSession(ctx, sessionID)
}

// Authenticate resolves a raw session token to its user. It returns
// httpx.ErrUnauthorized for unknown or expired tokens.
func (s *Service) Authenticate(ctx context.Context, token string) (Principal, error) {
	row, err := s.db.GetSessionUserByTokenHash(ctx, HashToken(token))
	if database.IsNotFound(err) {
		return Principal{}, httpx.ErrUnauthorized
	}
	if err != nil {
		return Principal{}, err
	}

	if time.Since(row.LastSeenAt) > sessionTouchInterval {
		// Best effort; failing to record activity must not fail the request.
		_ = s.db.TouchSession(ctx, row.SessionID)
	}
	return Principal{User: row.User, SessionID: row.SessionID, ExpiresAt: row.ExpiresAt, ImpersonatorID: row.ImpersonatorUserID}, nil
}

// StartImpersonation creates a short-lived session in which admin acts as
// the target user. Platform admins cannot be impersonated.
func (s *Service) StartImpersonation(ctx context.Context, admin Principal, targetID uuid.UUID, client ClientInfo) (store.User, NewSession, error) {
	if !admin.User.IsPlatformAdmin || admin.ImpersonatorID != nil {
		return store.User{}, NewSession{}, httpx.ErrForbidden
	}
	var target store.User
	var sess NewSession
	err := s.db.InTx(ctx, func(q *store.Queries) error {
		var err error
		target, err = q.GetUserByID(ctx, targetID)
		if database.IsNotFound(err) {
			return httpx.ErrNotFound
		}
		if err != nil {
			return err
		}
		if target.IsPlatformAdmin {
			return ErrCannotImpersonate
		}
		token, hash, err := NewToken()
		if err != nil {
			return err
		}
		expiresAt := time.Now().Add(ImpersonationTTL)
		if _, err := q.CreateImpersonationSession(ctx, store.CreateImpersonationSessionParams{
			UserID:             target.ID,
			TokenHash:          hash,
			UserAgent:          truncate(client.UserAgent, 512),
			IpAddress:          client.IPAddress,
			ExpiresAt:          expiresAt,
			ImpersonatorUserID: &admin.User.ID,
		}); err != nil {
			return err
		}
		sess = NewSession{Token: token, ExpiresAt: expiresAt}
		return audit.Record(ctx, q, audit.Entry{
			ActorUserID: &admin.User.ID, Action: "admin.impersonation_started", EntityType: "user", EntityID: target.ID.String(),
			Metadata: map[string]any{"target_email": target.Email, "ip_address": client.IPAddress},
		})
	})
	return target, sess, err
}

// StopImpersonation ends the impersonation session p is using.
func (s *Service) StopImpersonation(ctx context.Context, p Principal) error {
	if p.ImpersonatorID == nil {
		return ErrNotImpersonating
	}
	return s.db.InTx(ctx, func(q *store.Queries) error {
		if err := q.DeleteSession(ctx, p.SessionID); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			ActorUserID: p.ImpersonatorID, Action: "admin.impersonation_ended", EntityType: "user", EntityID: p.User.ID.String(),
			Metadata: map[string]any{"target_email": p.User.Email},
		})
	})
}

// RevokeAllSessions signs a user out everywhere, including any impersonation sessions.
func (s *Service) RevokeAllSessions(ctx context.Context, admin Principal, userID uuid.UUID) (int64, error) {
	var n int64
	err := s.db.InTx(ctx, func(q *store.Queries) error {
		if _, err := q.GetUserByID(ctx, userID); database.IsNotFound(err) {
			return httpx.ErrNotFound
		} else if err != nil {
			return err
		}
		var err error
		if n, err = q.DeleteUserSessions(ctx, userID); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			ActorUserID: &admin.User.ID, Action: "admin.sessions_revoked", EntityType: "user", EntityID: userID.String(),
			Metadata: map[string]any{"sessions": n},
		})
	})
	return n, err
}

func (s *Service) createSession(ctx context.Context, q *store.Queries, userID uuid.UUID, client ClientInfo) (NewSession, error) {
	token, hash, err := NewToken()
	if err != nil {
		return NewSession{}, err
	}
	expiresAt := time.Now().Add(s.sessionTTL)
	_, err = q.CreateSession(ctx, store.CreateSessionParams{
		UserID:    userID,
		TokenHash: hash,
		UserAgent: truncate(client.UserAgent, 512),
		IpAddress: client.IPAddress,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return NewSession{}, err
	}
	return NewSession{Token: token, ExpiresAt: expiresAt}, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
