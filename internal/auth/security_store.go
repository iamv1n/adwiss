package auth

// Hand-written SQL for the account-security tables (migration 00051). It is
// kept here rather than in db/queries so the shared generated store (and its
// User model) stays untouched; see plan/auth-security.md.

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type dbtx interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// securityState is the security-related part of a users row.
type securityState struct {
	EmailVerifiedAt   *time.Time
	Phone             *string
	PhoneVerifiedAt   *time.Time
	TOTPSecretEnc     []byte
	TOTPEnabledAt     *time.Time
	TOTPLastStep      int64
	Email2FAEnabled   bool
	PasswordChangedAt *time.Time
}

func (st securityState) TOTPEnabled() bool {
	return st.TOTPEnabledAt != nil && len(st.TOTPSecretEnc) > 0
}

func loadSecurityState(ctx context.Context, q dbtx, userID uuid.UUID, forUpdate bool) (securityState, error) {
	sql := `SELECT email_verified_at, phone, phone_verified_at, totp_secret_enc, totp_enabled_at,
       coalesce(totp_last_step, 0), email_2fa_enabled, password_changed_at
FROM users WHERE id = $1`
	if forUpdate {
		sql += " FOR UPDATE"
	}
	var st securityState
	err := q.QueryRow(ctx, sql, userID).Scan(&st.EmailVerifiedAt, &st.Phone, &st.PhoneVerifiedAt, &st.TOTPSecretEnc,
		&st.TOTPEnabledAt, &st.TOTPLastStep, &st.Email2FAEnabled, &st.PasswordChangedAt)
	return st, err
}

func recordEvent(ctx context.Context, q dbtx, userID *uuid.UUID, email, typ string, client ClientInfo) error {
	_, err := q.Exec(ctx, `INSERT INTO auth_events (user_id, email, type, ip, user_agent) VALUES ($1, $2, $3, $4, $5)`,
		userID, email, typ, client.IPAddress, truncate(client.UserAgent, 512))
	return err
}

// recentFailures counts failed password attempts for email inside the
// lockout window, ignoring those before the latest password change.
func recentFailures(ctx context.Context, q dbtx, email string) (int, error) {
	var n int
	err := q.QueryRow(ctx, `
SELECT count(*) FROM auth_events
WHERE email = $1 AND type = 'login_failed' AND created_at > now() - make_interval(secs => $2)
  AND created_at > coalesce((SELECT password_changed_at FROM users WHERE email = $1), '-infinity')`,
		email, lockoutWindow.Seconds()).Scan(&n)
	return n, err
}

// signInHistory reports whether the user ever signed in successfully and
// whether ip's prefix had a successful sign-in within ipHistoryWindow.
func signInHistory(ctx context.Context, q dbtx, userID uuid.UUID, ip string) (hasPrior, ipSeen bool, err error) {
	// Sessions count as sign-in history too, so accounts that predate
	// auth_events are judged by the networks they already use rather than
	// being treated as never having signed in.
	rows, err := q.Query(ctx, `
SELECT ip FROM auth_events
WHERE user_id = $1 AND type = 'login_succeeded' AND created_at > now() - make_interval(secs => $2)
UNION
SELECT ip_address FROM sessions
WHERE user_id = $1 AND ip_address <> '' AND created_at > now() - make_interval(secs => $2)`,
		userID, ipHistoryWindow.Seconds())
	if err != nil {
		return false, false, err
	}
	defer rows.Close()
	want := ipPrefix(ip)
	for rows.Next() {
		var seen string
		if err := rows.Scan(&seen); err != nil {
			return false, false, err
		}
		if ipPrefix(seen) == want {
			ipSeen = true
		}
	}
	if err := rows.Err(); err != nil {
		return false, false, err
	}
	// Password and email-code sign-ins only happen after signup (which signs
	// the user in directly), so every sign-in here has a prior one. A missing
	// history must not exempt an account from the new-device check.
	return true, ipSeen, nil
}

type knownDevice struct {
	ID           uuid.UUID
	Label        string
	LastIP       string
	LastSeenAt   time.Time
	TrustedUntil *time.Time
	DeviceHash   []byte
}

func findDevice(ctx context.Context, q dbtx, userID uuid.UUID, deviceToken string) (*knownDevice, error) {
	if !validDeviceToken(deviceToken) {
		return nil, nil
	}
	var d knownDevice
	err := q.QueryRow(ctx, `SELECT id, label, last_ip, last_seen_at, trusted_until, device_hash FROM known_devices
WHERE user_id = $1 AND device_hash = $2`, userID, HashToken(deviceToken)).
		Scan(&d.ID, &d.Label, &d.LastIP, &d.LastSeenAt, &d.TrustedUntil, &d.DeviceHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// upsertDevice records the sign-in on the device and reports whether it was new.
func upsertDevice(ctx context.Context, q dbtx, userID uuid.UUID, deviceToken string, client ClientInfo, trust bool) (bool, error) {
	var trustedUntil *time.Time
	if trust {
		t := time.Now().Add(trustedDeviceTTL)
		trustedUntil = &t
	}
	var inserted bool
	err := q.QueryRow(ctx, `
INSERT INTO known_devices (user_id, device_hash, label, last_ip, trusted_until)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, device_hash) DO UPDATE SET
    label = EXCLUDED.label, last_ip = EXCLUDED.last_ip, last_seen_at = now(),
    trusted_until = coalesce(EXCLUDED.trusted_until, known_devices.trusted_until)
RETURNING (xmax = 0)`, userID, HashToken(deviceToken), deviceLabel(client.UserAgent), client.IPAddress, trustedUntil).Scan(&inserted)
	return inserted, err
}

// authCode is an auth_codes row.
type authCode struct {
	ID         uuid.UUID
	UserID     *uuid.UUID
	Email      string
	Purpose    string
	CodeHash   []byte
	Attempts   int
	Data       map[string]string
	ExpiresAt  time.Time
	ConsumedAt *time.Time
}

func (c authCode) state() codeState {
	return codeState{CodeHash: c.CodeHash, Attempts: c.Attempts, ExpiresAt: c.ExpiresAt, ConsumedAt: c.ConsumedAt}
}

func scanCode(row pgx.Row) (authCode, error) {
	var c authCode
	var data []byte
	err := row.Scan(&c.ID, &c.UserID, &c.Email, &c.Purpose, &c.CodeHash, &c.Attempts, &data, &c.ExpiresAt, &c.ConsumedAt)
	if err == nil && len(data) > 0 {
		_ = json.Unmarshal(data, &c.Data)
	}
	return c, err
}

const codeColumns = `id, user_id, email, purpose, code_hash, attempts, data, expires_at, consumed_at`

// latestOpenCode returns the newest unconsumed code of purpose for email.
func latestOpenCode(ctx context.Context, q dbtx, purpose, email string) (authCode, error) {
	return scanCode(q.QueryRow(ctx, `SELECT `+codeColumns+` FROM auth_codes
WHERE purpose = $1 AND email = $2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`, purpose, email))
}

func codeByToken(ctx context.Context, q dbtx, purpose string, tokenHash []byte) (authCode, error) {
	return scanCode(q.QueryRow(ctx, `SELECT `+codeColumns+` FROM auth_codes WHERE purpose = $1 AND token_hash = $2`, purpose, tokenHash))
}

// sendStats returns the latest send time and number of sends in the last hour.
func sendStats(ctx context.Context, q dbtx, purpose, email string) (time.Time, int, error) {
	var last *time.Time
	var n int
	err := q.QueryRow(ctx, `SELECT max(created_at), count(*) FROM auth_codes
WHERE purpose = $1 AND email = $2 AND created_at > now() - interval '1 hour'`, purpose, email).Scan(&last, &n)
	if last == nil {
		return time.Time{}, n, err
	}
	return *last, n, err
}

func insertCode(ctx context.Context, q dbtx, c authCode, tokenHash []byte, ip string) error {
	if _, err := q.Exec(ctx, `UPDATE auth_codes SET consumed_at = now() WHERE purpose = $1 AND email = $2 AND consumed_at IS NULL`,
		c.Purpose, c.Email); err != nil {
		return err
	}
	data, _ := json.Marshal(c.Data)
	if c.Data == nil {
		data = []byte("{}")
	}
	_, err := q.Exec(ctx, `INSERT INTO auth_codes (user_id, email, purpose, code_hash, token_hash, data, created_ip, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, c.UserID, c.Email, c.Purpose, c.CodeHash, tokenHash, data, ip, c.ExpiresAt)
	return err
}

func bumpCodeAttempts(ctx context.Context, q dbtx, id uuid.UUID) error {
	_, err := q.Exec(ctx, `UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1`, id)
	return err
}

// consumeCode marks the code used; false if it was already consumed (race).
func consumeCode(ctx context.Context, q dbtx, id uuid.UUID) (bool, error) {
	tag, err := q.Exec(ctx, `UPDATE auth_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`, id)
	return tag.RowsAffected() == 1, err
}

type challenge struct {
	ID             uuid.UUID
	UserID         uuid.UUID
	Reason         string
	Methods        []string
	RememberDevice bool
	Attempts       int
	ExpiresAt      time.Time
	ConsumedAt     *time.Time
}

func challengeByToken(ctx context.Context, q dbtx, token string) (challenge, error) {
	var c challenge
	err := q.QueryRow(ctx, `SELECT id, user_id, reason, methods, remember_device, attempts, expires_at, consumed_at
FROM auth_challenges WHERE token_hash = $1`, HashToken(token)).
		Scan(&c.ID, &c.UserID, &c.Reason, &c.Methods, &c.RememberDevice, &c.Attempts, &c.ExpiresAt, &c.ConsumedAt)
	return c, err
}

// replaceRecoveryCodes stores hashes of fresh codes and returns the codes.
func replaceRecoveryCodes(ctx context.Context, q dbtx, userID uuid.UUID) ([]string, error) {
	if _, err := q.Exec(ctx, `DELETE FROM recovery_codes WHERE user_id = $1`, userID); err != nil {
		return nil, err
	}
	codes := make([]string, 0, recoveryCodeCount)
	for range recoveryCodeCount {
		c, err := newRecoveryCode()
		if err != nil {
			return nil, err
		}
		if _, err := q.Exec(ctx, `INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
			userID, recoveryHash(userID, c)); err != nil {
			return nil, err
		}
		codes = append(codes, c)
	}
	return codes, nil
}

func recoveryHash(userID uuid.UUID, code string) []byte {
	return HashToken("recovery|" + userID.String() + "|" + normalizeRecoveryCode(code))
}

// useRecoveryCode consumes a matching unused recovery code. Every stored hash
// is compared in constant time.
func useRecoveryCode(ctx context.Context, q dbtx, userID uuid.UUID, code string) (bool, error) {
	rows, err := q.Query(ctx, `SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`, userID)
	if err != nil {
		return false, err
	}
	want := recoveryHash(userID, code)
	var match *uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		var h []byte
		if err := rows.Scan(&id, &h); err != nil {
			rows.Close()
			return false, err
		}
		if equalHash(h, want) && match == nil {
			match = &id
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil || match == nil {
		return false, err
	}
	tag, err := q.Exec(ctx, `UPDATE recovery_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL`, *match)
	return tag.RowsAffected() == 1, err
}

// CleanupSecurityData prunes expired codes and challenges and security
// events older than 180 days. The worker runs it with the session cleanup.
func CleanupSecurityData(ctx context.Context, q dbtx) (int64, error) {
	var total int64
	for _, sql := range []string{
		`DELETE FROM auth_codes WHERE expires_at < now() - interval '1 day'`,
		`DELETE FROM auth_challenges WHERE expires_at < now() - interval '1 day'`,
		`DELETE FROM auth_events WHERE created_at < now() - interval '180 days'`,
	} {
		tag, err := q.Exec(ctx, sql)
		if err != nil {
			return total, err
		}
		total += tag.RowsAffected()
	}
	return total, nil
}
