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
)

// sessionTouchInterval limits how often last_seen_at is written.
const sessionTouchInterval = 5 * time.Minute

// dummyHash is verified against when the email is unknown, so login timing
// does not reveal which emails are registered.
var dummyHash, _ = HashPassword("adwise-timing-equaliser")

type Service struct {
	db         *database.DB
	sessionTTL time.Duration
}

func NewService(db *database.DB, sessionTTL time.Duration) *Service {
	return &Service{db: db, sessionTTL: sessionTTL}
}

type ClientInfo struct {
	UserAgent string
	IPAddress string
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

func (s *Service) Login(ctx context.Context, email, password string, client ClientInfo) (store.User, NewSession, error) {
	user, err := s.db.GetUserByEmail(ctx, normalizeEmail(email))
	if database.IsNotFound(err) {
		_, _ = VerifyPassword(password, dummyHash)
		return store.User{}, NewSession{}, ErrInvalidCredentials
	}
	if err != nil {
		return store.User{}, NewSession{}, err
	}

	ok, err := VerifyPassword(password, user.PasswordHash)
	if err != nil {
		return store.User{}, NewSession{}, err
	}
	if !ok {
		return store.User{}, NewSession{}, ErrInvalidCredentials
	}

	sess, err := s.createSession(ctx, s.db.Queries, user.ID, client)
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
	return Principal{User: row.User, SessionID: row.SessionID}, nil
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
