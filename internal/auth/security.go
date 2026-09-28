package auth

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/platform/mailer"
	"github.com/iamv1n/adwise/internal/platform/secrets"
	"github.com/iamv1n/adwise/internal/platform/sms"
	"github.com/iamv1n/adwise/internal/store"
)

// SecurityConfig wires the account-security features (plan/auth-security.md).
type SecurityConfig struct {
	Keys       *secrets.Keyring // seals TOTP secrets
	SendMail   func(ctx context.Context, m mailer.Message) error
	SMS        sms.Sender
	WebBaseURL string // links in emails
}

// ConfigureSecurity enables email, SMS and TOTP features on s.
func (s *Service) ConfigureSecurity(cfg SecurityConfig) *Service {
	s.sec = cfg
	return s
}

// LoginResult is the outcome of a sign-in step (password, email code or
// challenge): either a session or a pending second factor.
type LoginResult struct {
	Status    string        `json:"status"` // ok | challenge
	User      *UserResponse `json:"user,omitempty"`
	Challenge string        `json:"challenge,omitempty"`
	Methods   []string      `json:"methods,omitempty"`
	Reason    string        `json:"reason,omitempty"`
	EmailHint string        `json:"email_hint,omitempty"`

	Session     *NewSession `json:"-"`
	DeviceToken string      `json:"-"` // adwise_device cookie value to (re)set
}

func validDeviceToken(t string) bool {
	if len(t) != 43 {
		return false
	}
	b, err := base64.RawURLEncoding.DecodeString(t)
	return err == nil && len(b) == 32
}

func (s *Service) totpAD(userID uuid.UUID) []byte { return []byte("user:" + userID.String() + "|totp") }

// ---------------------------------------------------------------- sign-in

// Login checks the password and either signs in or issues a challenge.
func (s *Service) Login(ctx context.Context, email, password string, remember bool, client ClientInfo) (LoginResult, error) {
	email = normalizeEmail(email)
	q := s.db.Pool
	failures, err := recentFailures(ctx, q, email)
	if err != nil {
		return LoginResult{}, err
	}
	if failures >= lockoutThreshold {
		_, _ = VerifyPassword(password, dummyHash)
		return LoginResult{}, ErrTooManyAttempts
	}

	user, err := s.db.GetUserByEmail(ctx, email)
	found := err == nil
	if err != nil && !database.IsNotFound(err) {
		return LoginResult{}, err
	}
	ok := false
	if found {
		if ok, err = VerifyPassword(password, user.PasswordHash); err != nil {
			return LoginResult{}, err
		}
	} else {
		_, _ = VerifyPassword(password, dummyHash)
	}
	if !ok {
		var uid *uuid.UUID
		if found {
			uid = &user.ID
		}
		if err := recordEvent(ctx, q, uid, email, "login_failed", client); err != nil {
			return LoginResult{}, err
		}
		if found && failures+1 == lockoutThreshold {
			s.mailFailedAttempts(ctx, user.Email)
		}
		return LoginResult{}, ErrInvalidCredentials
	}
	return s.afterFirstFactor(ctx, user, failures, false, remember, client)
}

// StartEmailLogin emails a sign-in code when the account exists. It never
// reports whether it did.
func (s *Service) StartEmailLogin(ctx context.Context, email string, client ClientInfo) error {
	user, err := s.db.GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		if !database.IsNotFound(err) {
			slog.ErrorContext(ctx, "auth: email login lookup", "err", err)
		}
		return nil
	}
	code, _, err := s.issueCode(ctx, PurposeLoginEmail, user.Email, &user.ID, nil, client, false)
	if err != nil {
		return nil //nolint:nilerr // rate limited or failed: same response either way
	}
	s.mailLoginCode(ctx, user.Email, code)
	return nil
}

// VerifyEmailLogin completes (or steps up) an email-code sign-in.
func (s *Service) VerifyEmailLogin(ctx context.Context, email, code string, remember bool, client ClientInfo) (LoginResult, error) {
	email = normalizeEmail(email)
	user, err := s.db.GetUserByEmail(ctx, email)
	if database.IsNotFound(err) {
		return LoginResult{}, ErrInvalidCode
	}
	if err != nil {
		return LoginResult{}, err
	}
	if _, err := s.verifyCode(ctx, PurposeLoginEmail, user.Email, code); err != nil {
		return LoginResult{}, err
	}
	// The code proved control of the mailbox.
	if _, err := s.db.Pool.Exec(ctx, `UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1`, user.ID); err != nil {
		return LoginResult{}, err
	}
	failures, err := recentFailures(ctx, s.db.Pool, email)
	if err != nil {
		return LoginResult{}, err
	}
	return s.afterFirstFactor(ctx, user, failures, true, remember, client)
}

func (s *Service) afterFirstFactor(ctx context.Context, user store.User, failures int, emailFirst, remember bool, client ClientInfo) (LoginResult, error) {
	q := s.db.Pool
	st, err := loadSecurityState(ctx, q, user.ID, false)
	if err != nil {
		return LoginResult{}, err
	}
	dev, err := findDevice(ctx, q, user.ID, client.DeviceToken)
	if err != nil {
		return LoginResult{}, err
	}
	hasPrior, ipSeen, err := signInHistory(ctx, q, user.ID, client.IPAddress)
	if err != nil {
		return LoginResult{}, err
	}
	d := decideRisk(riskInput{
		TOTPEnabled:      st.TOTPEnabled(),
		Email2FAEnabled:  st.Email2FAEnabled,
		DeviceKnown:      dev != nil,
		DeviceTrusted:    dev != nil && dev.TrustedUntil != nil && dev.TrustedUntil.After(time.Now()),
		IPSeenRecently:   ipSeen,
		HasPriorSignIn:   hasPrior,
		RecentFailures:   failures,
		EmailFirstFactor: emailFirst,
	})
	if !d.Challenge {
		return s.completeLogin(ctx, user, client, false, hasPrior)
	}

	token, hash, err := NewToken()
	if err != nil {
		return LoginResult{}, err
	}
	var chID uuid.UUID
	if err := q.QueryRow(ctx, `INSERT INTO auth_challenges (user_id, token_hash, reason, methods, remember_device, ip, user_agent, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, user.ID, hash, d.Reason, d.Methods, remember,
		client.IPAddress, truncate(client.UserAgent, 512), time.Now().Add(challengeTTL)).Scan(&chID); err != nil {
		return LoginResult{}, err
	}
	if err := recordEvent(ctx, q, &user.ID, user.Email, "challenge_issued", client); err != nil {
		return LoginResult{}, err
	}
	// The client asks for the email code (POST /auth/challenge/email).
	return LoginResult{Status: "challenge", Challenge: token, Methods: d.Methods, Reason: d.Reason, EmailHint: maskEmail(user.Email)}, nil
}

// completeLogin creates the session and records the device. alert sends the
// new sign-in email when the device is new (not for a first-ever sign-in).
func (s *Service) completeLogin(ctx context.Context, user store.User, client ClientInfo, trust, alert bool) (LoginResult, error) {
	sess, err := s.createSession(ctx, s.db.Queries, user.ID, client)
	if err != nil {
		return LoginResult{}, err
	}
	deviceToken := client.DeviceToken
	if !validDeviceToken(deviceToken) {
		if deviceToken, _, err = NewToken(); err != nil {
			return LoginResult{}, err
		}
	}
	isNew, err := upsertDevice(ctx, s.db.Pool, user.ID, deviceToken, client, trust)
	if err != nil {
		return LoginResult{}, err
	}
	if err := recordEvent(ctx, s.db.Pool, &user.ID, user.Email, "login_succeeded", client); err != nil {
		return LoginResult{}, err
	}
	if isNew && alert {
		s.mailNewSignIn(ctx, user.Email, client, time.Now())
	}
	u := ToUserResponse(user)
	return LoginResult{Status: "ok", User: &u, Session: &sess, DeviceToken: deviceToken}, nil
}

// AfterSignup records the first sign-in and device and emails the
// verification code. It returns the device cookie value.
func (s *Service) AfterSignup(ctx context.Context, user store.User, client ClientInfo) string {
	deviceToken := client.DeviceToken
	if !validDeviceToken(deviceToken) {
		deviceToken, _, _ = NewToken()
	}
	if _, err := upsertDevice(ctx, s.db.Pool, user.ID, deviceToken, client, false); err != nil {
		slog.ErrorContext(ctx, "auth: signup device", "err", err)
	}
	if err := recordEvent(ctx, s.db.Pool, &user.ID, user.Email, "login_succeeded", client); err != nil {
		slog.ErrorContext(ctx, "auth: signup event", "err", err)
	}
	if code, _, err := s.issueCode(ctx, PurposeVerifyEmail, user.Email, &user.ID, nil, client, false); err == nil {
		s.mailVerifyEmail(ctx, user.Email, code)
	}
	return deviceToken
}

// ---------------------------------------------------------------- challenges

func (s *Service) openChallenge(ctx context.Context, token string) (challenge, store.User, error) {
	ch, err := challengeByToken(ctx, s.db.Pool, token)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && (ch.ConsumedAt != nil || !time.Now().Before(ch.ExpiresAt))) {
		return challenge{}, store.User{}, ErrChallengeExpired
	}
	if err != nil {
		return challenge{}, store.User{}, err
	}
	if ch.Attempts >= maxCodeAttempts {
		return challenge{}, store.User{}, ErrTooManyAttempts
	}
	user, err := s.db.GetUserByID(ctx, ch.UserID)
	if err != nil {
		return challenge{}, store.User{}, err
	}
	return ch, user, nil
}

func (s *Service) sendChallengeCode(ctx context.Context, user store.User, client ClientInfo) {
	code, _, err := s.issueCode(ctx, PurposeTwoFactorEmail, user.Email, &user.ID, nil, client, false)
	if err == nil {
		s.mailTwoFactorCode(ctx, user.Email, code)
	}
}

// SendChallengeEmail emails a 2FA code for the challenge. Within the send
// cooldown it is a no-op (the previous code is still valid).
func (s *Service) SendChallengeEmail(ctx context.Context, token string, client ClientInfo) error {
	ch, user, err := s.openChallenge(ctx, token)
	if err != nil {
		return err
	}
	if !contains(ch.Methods, MethodEmail) {
		return nil
	}
	last, n, err := sendStats(ctx, s.db.Pool, PurposeTwoFactorEmail, user.Email)
	if err != nil {
		return err
	}
	if n >= sendsPerHour {
		return ErrRateLimited
	}
	if ok, _ := sendAllowed(last, n, time.Now()); !ok {
		return nil
	}
	s.sendChallengeCode(ctx, user, client)
	return nil
}

// VerifyChallenge checks the second factor and signs in.
func (s *Service) VerifyChallenge(ctx context.Context, token, method, code string, remember bool, client ClientInfo) (LoginResult, error) {
	ch, user, err := s.openChallenge(ctx, token)
	if err != nil {
		return LoginResult{}, err
	}
	var verr error = ErrInvalidCode
	if contains(ch.Methods, method) {
		verr = s.checkSecondFactor(ctx, user, method, code, client)
	}
	if verr != nil {
		var apiErr *httpx.Error
		if !errors.As(verr, &apiErr) {
			return LoginResult{}, verr
		}
		if _, err := s.db.Pool.Exec(ctx, `UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1`, ch.ID); err != nil {
			return LoginResult{}, err
		}
		if err := recordEvent(ctx, s.db.Pool, &user.ID, user.Email, "challenge_failed", client); err != nil {
			return LoginResult{}, err
		}
		if ch.Attempts+1 >= maxCodeAttempts {
			return LoginResult{}, ErrTooManyAttempts
		}
		return LoginResult{}, verr
	}
	tag, err := s.db.Pool.Exec(ctx, `UPDATE auth_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`, ch.ID)
	if err != nil {
		return LoginResult{}, err
	}
	if tag.RowsAffected() != 1 {
		return LoginResult{}, ErrChallengeExpired
	}
	if err := recordEvent(ctx, s.db.Pool, &user.ID, user.Email, "challenge_passed", client); err != nil {
		return LoginResult{}, err
	}
	return s.completeLogin(ctx, user, client, remember || ch.RememberDevice, true)
}

func (s *Service) checkSecondFactor(ctx context.Context, user store.User, method, code string, client ClientInfo) error {
	switch method {
	case MethodEmail:
		_, err := s.verifyCode(ctx, PurposeTwoFactorEmail, user.Email, code)
		return err
	case MethodTOTP:
		return s.checkTOTP(ctx, user.ID, code)
	case MethodRecovery:
		ok, err := useRecoveryCode(ctx, s.db.Pool, user.ID, code)
		if err != nil {
			return err
		}
		if !ok {
			return ErrInvalidCode
		}
		return recordEvent(ctx, s.db.Pool, &user.ID, user.Email, "recovery_code_used", client)
	}
	return ErrInvalidCode
}

// checkTOTP verifies an authenticator code for an enabled secret and
// advances the replay guard atomically.
func (s *Service) checkTOTP(ctx context.Context, userID uuid.UUID, code string) error {
	return pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		st, err := loadSecurityState(ctx, tx, userID, true)
		if err != nil {
			return err
		}
		if !st.TOTPEnabled() {
			return ErrInvalidCode
		}
		step, ok, err := s.matchTOTP(userID, st, code)
		if err != nil || !ok {
			if err == nil {
				err = ErrInvalidCode
			}
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE users SET totp_last_step = $2 WHERE id = $1`, userID, step)
		return err
	})
}

func (s *Service) matchTOTP(userID uuid.UUID, st securityState, code string) (int64, bool, error) {
	if s.sec.Keys == nil || len(st.TOTPSecretEnc) == 0 {
		return 0, false, nil
	}
	secret, err := s.sec.Keys.OpenString(st.TOTPSecretEnc, s.totpAD(userID))
	if err != nil {
		return 0, false, fmt.Errorf("open totp secret: %w", err)
	}
	step, ok := verifyTOTP(secret, code, time.Now(), st.TOTPLastStep)
	return step, ok, nil
}

// ---------------------------------------------------------------- codes

// issueCode creates a code (and, withToken, a link token) after the send rate
// limit. Older open codes of the same purpose are invalidated.
func (s *Service) issueCode(ctx context.Context, purpose, email string, userID *uuid.UUID, data map[string]string, client ClientInfo, withToken bool) (code, token string, err error) {
	last, n, err := sendStats(ctx, s.db.Pool, purpose, email)
	if err != nil {
		return "", "", err
	}
	if ok, _ := sendAllowed(last, n, time.Now()); !ok {
		return "", "", ErrRateLimited
	}
	c := authCode{UserID: userID, Email: email, Purpose: purpose, Data: data, ExpiresAt: time.Now().Add(codeTTL(purpose))}
	var tokenHash []byte
	if withToken {
		if token, tokenHash, err = NewToken(); err != nil {
			return "", "", err
		}
	} else {
		if code, err = newNumericCode(); err != nil {
			return "", "", err
		}
		c.CodeHash = hashCode(purpose, email, code)
	}
	if err := insertCode(ctx, s.db.Pool, c, tokenHash, client.IPAddress); err != nil {
		return "", "", err
	}
	return code, token, nil
}

// verifyCode checks and consumes the newest open code of purpose for email.
func (s *Service) verifyCode(ctx context.Context, purpose, email, code string) (authCode, error) {
	c, err := latestOpenCode(ctx, s.db.Pool, purpose, email)
	if errors.Is(err, pgx.ErrNoRows) {
		return authCode{}, ErrInvalidCode
	}
	if err != nil {
		return authCode{}, err
	}
	if _, err := checkCode(c.state(), hashCode(purpose, email, code), time.Now()); err != nil {
		if errors.Is(err, ErrInvalidCode) {
			if berr := bumpCodeAttempts(ctx, s.db.Pool, c.ID); berr != nil {
				return authCode{}, berr
			}
			if c.Attempts+1 >= maxCodeAttempts {
				return authCode{}, ErrTooManyAttempts
			}
		}
		return authCode{}, err
	}
	ok, err := consumeCode(ctx, s.db.Pool, c.ID)
	if err != nil {
		return authCode{}, err
	}
	if !ok {
		return authCode{}, ErrInvalidCode
	}
	return c, nil
}

// ---------------------------------------------------------------- email verification

func (s *Service) VerifyEmail(ctx context.Context, user store.User, code string, client ClientInfo) error {
	if _, err := s.verifyCode(ctx, PurposeVerifyEmail, user.Email, code); err != nil {
		return err
	}
	if _, err := s.db.Pool.Exec(ctx, `UPDATE users SET email_verified_at = coalesce(email_verified_at, now()), updated_at = now() WHERE id = $1`, user.ID); err != nil {
		return err
	}
	return recordEvent(ctx, s.db.Pool, &user.ID, user.Email, "email_verified", client)
}

func (s *Service) ResendVerification(ctx context.Context, user store.User, client ClientInfo) error {
	st, err := loadSecurityState(ctx, s.db.Pool, user.ID, false)
	if err != nil {
		return err
	}
	if st.EmailVerifiedAt != nil {
		return nil
	}
	code, _, err := s.issueCode(ctx, PurposeVerifyEmail, user.Email, &user.ID, nil, client, false)
	if err != nil {
		return err
	}
	s.mailVerifyEmail(ctx, user.Email, code)
	return nil
}

// ---------------------------------------------------------------- passwords

// ForgotPassword emails a reset link when the account exists. It never
// reports whether it did.
func (s *Service) ForgotPassword(ctx context.Context, email string, client ClientInfo) error {
	user, err := s.db.GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		if !database.IsNotFound(err) {
			slog.ErrorContext(ctx, "auth: forgot password lookup", "err", err)
		}
		return nil
	}
	_, token, err := s.issueCode(ctx, PurposeResetPassword, user.Email, &user.ID, nil, client, true)
	if err != nil {
		return nil //nolint:nilerr // same response either way
	}
	s.mailResetLink(ctx, user.Email, token)
	return nil
}

// ResetPassword sets a new password from a reset link and signs the user
// out everywhere. It does not sign in.
func (s *Service) ResetPassword(ctx context.Context, token, password string, client ClientInfo) error {
	c, err := codeByToken(ctx, s.db.Pool, PurposeResetPassword, HashToken(token))
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && c.ConsumedAt != nil) {
		return ErrInvalidToken
	}
	if err != nil {
		return err
	}
	if !time.Now().Before(c.ExpiresAt) {
		return ErrCodeExpired
	}
	if c.UserID == nil {
		return ErrInvalidToken
	}
	if err := checkPasswordStrength(password, c.Email); err != nil {
		return err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		if ok, err := consumeCode(ctx, tx, c.ID); err != nil || !ok {
			if err == nil {
				err = ErrInvalidToken
			}
			return err
		}
		// The link proved control of the mailbox.
		if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2, password_changed_at = now(),
    email_verified_at = coalesce(email_verified_at, now()), updated_at = now() WHERE id = $1`, *c.UserID, hash); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, *c.UserID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE auth_challenges SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL`, *c.UserID); err != nil {
			return err
		}
		return recordEvent(ctx, tx, c.UserID, c.Email, "password_reset", client)
	})
	if err != nil {
		return err
	}
	s.mailPasswordChanged(ctx, c.Email)
	return nil
}

// ChangePassword keeps the current session and revokes all others.
func (s *Service) ChangePassword(ctx context.Context, p Principal, current, next string, client ClientInfo) error {
	user, err := s.requirePassword(ctx, p, current)
	if err != nil {
		return err
	}
	if err := checkPasswordStrength(next, user.Email); err != nil {
		return err
	}
	hash, err := HashPassword(next)
	if err != nil {
		return err
	}
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`, user.ID, hash); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, user.ID, p.SessionID); err != nil {
			return err
		}
		return recordEvent(ctx, tx, &user.ID, user.Email, "password_changed", client)
	})
	if err != nil {
		return err
	}
	s.mailPasswordChanged(ctx, user.Email)
	return nil
}

// requirePassword re-checks the caller's current password for a sensitive change.
func (s *Service) requirePassword(ctx context.Context, p Principal, password string) (store.User, error) {
	user, err := s.db.GetUserByID(ctx, p.User.ID)
	if err != nil {
		return store.User{}, err
	}
	if password == "" {
		return store.User{}, ErrPasswordRequired
	}
	ok, err := VerifyPassword(password, user.PasswordHash)
	if err != nil {
		return store.User{}, err
	}
	if !ok {
		return store.User{}, ErrWrongPassword
	}
	return user, nil
}

// ---------------------------------------------------------------- two-factor settings

var errTOTPAlreadyEnabled = httpx.NewError(http.StatusConflict, "totp_already_enabled", "authenticator app is already set up")

// SetupTOTP stores a new pending secret (not active until EnableTOTP).
func (s *Service) SetupTOTP(ctx context.Context, p Principal, password string) (secret, otpauthURL string, err error) {
	user, err := s.requirePassword(ctx, p, password)
	if err != nil {
		return "", "", err
	}
	if s.sec.Keys == nil {
		return "", "", errors.New("auth: TOTP needs an encryption keyring")
	}
	st, err := loadSecurityState(ctx, s.db.Pool, user.ID, false)
	if err != nil {
		return "", "", err
	}
	if st.TOTPEnabled() {
		return "", "", errTOTPAlreadyEnabled
	}
	if secret, err = newTOTPSecret(); err != nil {
		return "", "", err
	}
	enc, err := s.sec.Keys.SealString(secret, s.totpAD(user.ID))
	if err != nil {
		return "", "", err
	}
	if _, err := s.db.Pool.Exec(ctx, `UPDATE users SET totp_secret_enc = $2, totp_enabled_at = NULL, totp_last_step = NULL, updated_at = now() WHERE id = $1`,
		user.ID, enc); err != nil {
		return "", "", err
	}
	return secret, totpURL(secret, user.Email), nil
}

// EnableTOTP confirms the pending secret with a code and returns fresh recovery codes.
func (s *Service) EnableTOTP(ctx context.Context, p Principal, code string, client ClientInfo) ([]string, error) {
	var codes []string
	err := pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		st, err := loadSecurityState(ctx, tx, p.User.ID, true)
		if err != nil {
			return err
		}
		if st.TOTPEnabled() {
			return errTOTPAlreadyEnabled
		}
		if len(st.TOTPSecretEnc) == 0 {
			return ErrTOTPNotPending
		}
		step, ok, err := s.matchTOTP(p.User.ID, st, code)
		if err != nil {
			return err
		}
		if !ok {
			return ErrInvalidCode
		}
		if _, err := tx.Exec(ctx, `UPDATE users SET totp_enabled_at = now(), totp_last_step = $2, updated_at = now() WHERE id = $1`, p.User.ID, step); err != nil {
			return err
		}
		if codes, err = replaceRecoveryCodes(ctx, tx, p.User.ID); err != nil {
			return err
		}
		return recordEvent(ctx, tx, &p.User.ID, p.User.Email, "totp_enabled", client)
	})
	if err != nil {
		return nil, err
	}
	s.mailTwoFactorChanged(ctx, p.User.Email, "The authenticator app", true)
	return codes, nil
}

// DisableTOTP turns the authenticator off; code may be a TOTP or recovery code.
func (s *Service) DisableTOTP(ctx context.Context, p Principal, password, code string, client ClientInfo) error {
	user, err := s.requirePassword(ctx, p, password)
	if err != nil {
		return err
	}
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		st, err := loadSecurityState(ctx, tx, user.ID, true)
		if err != nil {
			return err
		}
		if !st.TOTPEnabled() {
			return ErrTOTPNotEnabled
		}
		_, ok, err := s.matchTOTP(user.ID, st, code)
		if err != nil {
			return err
		}
		if !ok {
			if ok, err = useRecoveryCode(ctx, tx, user.ID, code); err != nil {
				return err
			}
		}
		if !ok {
			return ErrInvalidCode
		}
		if _, err := tx.Exec(ctx, `UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL, updated_at = now() WHERE id = $1`, user.ID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM recovery_codes WHERE user_id = $1`, user.ID); err != nil {
			return err
		}
		return recordEvent(ctx, tx, &user.ID, user.Email, "totp_disabled", client)
	})
	if err != nil {
		return err
	}
	s.mailTwoFactorChanged(ctx, user.Email, "The authenticator app", false)
	return nil
}

// SetEmail2FA turns email one-time codes as a second factor on or off.
func (s *Service) SetEmail2FA(ctx context.Context, p Principal, password string, enabled bool, client ClientInfo) error {
	user, err := s.requirePassword(ctx, p, password)
	if err != nil {
		return err
	}
	st, err := loadSecurityState(ctx, s.db.Pool, user.ID, false)
	if err != nil {
		return err
	}
	if enabled && st.EmailVerifiedAt == nil {
		return ErrEmailNotVerified
	}
	if st.Email2FAEnabled == enabled {
		return nil
	}
	if _, err := s.db.Pool.Exec(ctx, `UPDATE users SET email_2fa_enabled = $2, updated_at = now() WHERE id = $1`, user.ID, enabled); err != nil {
		return err
	}
	typ := "email_2fa_disabled"
	if enabled {
		typ = "email_2fa_enabled"
	}
	if err := recordEvent(ctx, s.db.Pool, &user.ID, user.Email, typ, client); err != nil {
		return err
	}
	s.mailTwoFactorChanged(ctx, user.Email, "Email codes", enabled)
	return nil
}

// RegenerateRecoveryCodes replaces the recovery codes (TOTP must be on).
func (s *Service) RegenerateRecoveryCodes(ctx context.Context, p Principal, password string, client ClientInfo) ([]string, error) {
	user, err := s.requirePassword(ctx, p, password)
	if err != nil {
		return nil, err
	}
	var codes []string
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		st, err := loadSecurityState(ctx, tx, user.ID, true)
		if err != nil {
			return err
		}
		if !st.TOTPEnabled() {
			return ErrTOTPNotEnabled
		}
		if codes, err = replaceRecoveryCodes(ctx, tx, user.ID); err != nil {
			return err
		}
		return recordEvent(ctx, tx, &user.ID, user.Email, "recovery_codes_regenerated", client)
	})
	if err != nil {
		return nil, err
	}
	s.mailRecoveryCodes(ctx, user.Email)
	return codes, nil
}

// ---------------------------------------------------------------- phone

// AddPhone stores an unverified number and texts it a code.
func (s *Service) AddPhone(ctx context.Context, p Principal, password, phone string, client ClientInfo) error {
	user, err := s.requirePassword(ctx, p, password)
	if err != nil {
		return err
	}
	phone, err = normalizePhone(phone)
	if err != nil {
		return err
	}
	code, _, err := s.issueCode(ctx, PurposeVerifyPhone, user.Email, &user.ID, map[string]string{"phone": phone}, client, false)
	if err != nil {
		return err
	}
	if _, err := s.db.Pool.Exec(ctx, `UPDATE users SET phone = $2, phone_verified_at = NULL, updated_at = now() WHERE id = $1`, user.ID, phone); err != nil {
		return err
	}
	if err := recordEvent(ctx, s.db.Pool, &user.ID, user.Email, "phone_added", client); err != nil {
		return err
	}
	if s.sec.SMS != nil {
		if err := s.sec.SMS.Send(ctx, phone, "Your Adwise verification code is "+code+". It expires in 10 minutes."); err != nil {
			slog.ErrorContext(ctx, "auth: sms not sent", "err", err)
		}
	}
	return nil
}

func (s *Service) VerifyPhone(ctx context.Context, p Principal, code string, client ClientInfo) error {
	c, err := s.verifyCode(ctx, PurposeVerifyPhone, p.User.Email, code)
	if err != nil {
		return err
	}
	tag, err := s.db.Pool.Exec(ctx, `UPDATE users SET phone_verified_at = now(), updated_at = now() WHERE id = $1 AND phone = $2`, p.User.ID, c.Data["phone"])
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidCode // number was changed or removed since the code was sent
	}
	return recordEvent(ctx, s.db.Pool, &p.User.ID, p.User.Email, "phone_verified", client)
}

func (s *Service) RemovePhone(ctx context.Context, p Principal, password string, client ClientInfo) error {
	user, err := s.requirePassword(ctx, p, password)
	if err != nil {
		return err
	}
	if _, err := s.db.Pool.Exec(ctx, `UPDATE users SET phone = NULL, phone_verified_at = NULL, updated_at = now() WHERE id = $1`, user.ID); err != nil {
		return err
	}
	return recordEvent(ctx, s.db.Pool, &user.ID, user.Email, "phone_removed", client)
}

// ---------------------------------------------------------------- overview, devices, sessions

type SecurityDevice struct {
	ID         uuid.UUID `json:"id"`
	Label      string    `json:"label"`
	LastIP     string    `json:"last_ip"`
	LastSeenAt time.Time `json:"last_seen_at"`
	Trusted    bool      `json:"trusted"`
	Current    bool      `json:"current"`
}

type SecurityEvent struct {
	Type      string    `json:"type"`
	IP        string    `json:"ip"`
	UserAgent string    `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
}

type SecurityOverview struct {
	Email                  string           `json:"email"`
	EmailVerified          bool             `json:"email_verified"`
	Phone                  *string          `json:"phone"`
	PhoneVerified          bool             `json:"phone_verified"`
	TOTPEnabled            bool             `json:"totp_enabled"`
	Email2FAEnabled        bool             `json:"email_2fa_enabled"`
	RecoveryCodesRemaining int              `json:"recovery_codes_remaining"`
	PasswordChangedAt      *time.Time       `json:"password_changed_at"`
	Devices                []SecurityDevice `json:"devices"`
	SessionsCount          int              `json:"sessions_count"`
	Events                 []SecurityEvent  `json:"events"`
}

func (s *Service) Overview(ctx context.Context, p Principal, deviceToken string) (SecurityOverview, error) {
	q := s.db.Pool
	st, err := loadSecurityState(ctx, q, p.User.ID, false)
	if err != nil {
		return SecurityOverview{}, err
	}
	o := SecurityOverview{
		Email: p.User.Email, EmailVerified: st.EmailVerifiedAt != nil,
		Phone: st.Phone, PhoneVerified: st.Phone != nil && st.PhoneVerifiedAt != nil,
		TOTPEnabled: st.TOTPEnabled(), Email2FAEnabled: st.Email2FAEnabled,
		PasswordChangedAt: st.PasswordChangedAt,
		Devices:           []SecurityDevice{}, Events: []SecurityEvent{},
	}
	if err := q.QueryRow(ctx, `SELECT count(*) FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`, p.User.ID).Scan(&o.RecoveryCodesRemaining); err != nil {
		return o, err
	}
	if !o.TOTPEnabled {
		o.RecoveryCodesRemaining = 0
	}
	if err := q.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE user_id = $1 AND expires_at > now()`, p.User.ID).Scan(&o.SessionsCount); err != nil {
		return o, err
	}
	var current []byte
	if validDeviceToken(deviceToken) {
		current = HashToken(deviceToken)
	}
	rows, err := q.Query(ctx, `SELECT id, label, last_ip, last_seen_at, trusted_until, device_hash FROM known_devices
WHERE user_id = $1 ORDER BY last_seen_at DESC`, p.User.ID)
	if err != nil {
		return o, err
	}
	for rows.Next() {
		var d knownDevice
		if err := rows.Scan(&d.ID, &d.Label, &d.LastIP, &d.LastSeenAt, &d.TrustedUntil, &d.DeviceHash); err != nil {
			rows.Close()
			return o, err
		}
		o.Devices = append(o.Devices, SecurityDevice{
			ID: d.ID, Label: d.Label, LastIP: d.LastIP, LastSeenAt: d.LastSeenAt,
			Trusted: d.TrustedUntil != nil && d.TrustedUntil.After(time.Now()),
			Current: current != nil && equalHash(d.DeviceHash, current),
		})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return o, err
	}
	rows, err = q.Query(ctx, `SELECT type, ip, user_agent, created_at FROM auth_events
WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, p.User.ID, securityEventsShown)
	if err != nil {
		return o, err
	}
	defer rows.Close()
	for rows.Next() {
		var e SecurityEvent
		if err := rows.Scan(&e.Type, &e.IP, &e.UserAgent, &e.CreatedAt); err != nil {
			return o, err
		}
		o.Events = append(o.Events, e)
	}
	return o, rows.Err()
}

func (s *Service) RemoveDevice(ctx context.Context, p Principal, id uuid.UUID, client ClientInfo) error {
	tag, err := s.db.Pool.Exec(ctx, `DELETE FROM known_devices WHERE id = $1 AND user_id = $2`, id, p.User.ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpx.ErrNotFound
	}
	return recordEvent(ctx, s.db.Pool, &p.User.ID, p.User.Email, "device_removed", client)
}

func (s *Service) RevokeOtherSessions(ctx context.Context, p Principal, client ClientInfo) (int64, error) {
	tag, err := s.db.Pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, p.User.ID, p.SessionID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), recordEvent(ctx, s.db.Pool, &p.User.ID, p.User.Email, "sessions_revoked", client)
}

// MeSecurity returns the /auth/me flags.
func (s *Service) MeSecurity(ctx context.Context, userID uuid.UUID) (emailVerified, twoFactor bool, err error) {
	st, err := loadSecurityState(ctx, s.db.Pool, userID, false)
	if err != nil {
		return false, false, err
	}
	return st.EmailVerifiedAt != nil, st.TOTPEnabled() || st.Email2FAEnabled, nil
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
