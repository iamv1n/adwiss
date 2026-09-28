package auth

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"encoding/hex"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/platform/mailer"
	"github.com/iamv1n/adwise/internal/platform/secrets"
	"github.com/iamv1n/adwise/internal/platform/testdb"
)

func TestMain(m *testing.M) { os.Exit(testdb.Run(m)) }

type mailbox struct {
	mu   sync.Mutex
	msgs []mailer.Message
}

func (mb *mailbox) send(_ context.Context, m mailer.Message) error {
	mb.mu.Lock()
	defer mb.mu.Unlock()
	mb.msgs = append(mb.msgs, m)
	return nil
}

var sixDigits = regexp.MustCompile(`\b(\d{6})\b`)

// lastCode returns the 6-digit code from the newest email whose subject contains subj.
func (mb *mailbox) lastCode(t *testing.T, subj string) string {
	t.Helper()
	mb.mu.Lock()
	defer mb.mu.Unlock()
	for i := len(mb.msgs) - 1; i >= 0; i-- {
		if strings.Contains(mb.msgs[i].Subject, subj) {
			m := sixDigits.FindStringSubmatch(mb.msgs[i].Text)
			require.NotNil(t, m, mb.msgs[i].Text)
			return m[1]
		}
	}
	t.Fatalf("no email %q", subj)
	return ""
}

func (mb *mailbox) has(subj string) bool {
	mb.mu.Lock()
	defer mb.mu.Unlock()
	for _, m := range mb.msgs {
		if strings.Contains(m.Subject, subj) {
			return true
		}
	}
	return false
}

func (mb *mailbox) lastResetToken(t *testing.T) string {
	t.Helper()
	mb.mu.Lock()
	defer mb.mu.Unlock()
	re := regexp.MustCompile(`token=([A-Za-z0-9_-]+)`)
	for i := len(mb.msgs) - 1; i >= 0; i-- {
		if m := re.FindStringSubmatch(mb.msgs[i].Text); m != nil {
			return m[1]
		}
	}
	t.Fatal("no reset email")
	return ""
}

func newTestService(t *testing.T) (*Service, *mailbox) {
	db := testdb.New(t)
	kr, err := secrets.Parse(secrets.DevKeySpec)
	require.NoError(t, err)
	mb := &mailbox{}
	svc := NewService(db, time.Hour).ConfigureSecurity(SecurityConfig{Keys: kr, SendMail: mb.send, WebBaseURL: "http://app.test"})
	return svc, mb
}

func uniqueEmail() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return "u-" + hex.EncodeToString(b) + "@test.local"
}

func signupUser(t *testing.T, svc *Service, email, password string, client ClientInfo) string {
	t.Helper()
	ctx := context.Background()
	user, _, err := svc.Signup(ctx, email, "Test", password, client)
	require.NoError(t, err)
	return svc.AfterSignup(ctx, user, client)
}

func TestLoginChallengeFlow(t *testing.T) {
	svc, mb := newTestService(t)
	ctx := context.Background()
	email, pw := uniqueEmail(), "a long unique passphrase"
	home := ClientInfo{IPAddress: "198.51.100.10", UserAgent: "Mozilla/5.0 (Macintosh; Mac OS X) Chrome/129.0"}
	home.DeviceToken = signupUser(t, svc, email, pw, home)

	// Verify email with the code from the signup email.
	user, err := svc.db.GetUserByEmail(ctx, email)
	require.NoError(t, err)
	verified, _, err := svc.MeSecurity(ctx, user.ID)
	require.NoError(t, err)
	assert.False(t, verified)
	require.NoError(t, svc.VerifyEmail(ctx, user, mb.lastCode(t, "Confirm your email"), home))
	verified, _, _ = svc.MeSecurity(ctx, user.ID)
	assert.True(t, verified)

	// Same device: straight in.
	res, err := svc.Login(ctx, email, pw, false, home)
	require.NoError(t, err)
	assert.Equal(t, "ok", res.Status)
	require.NotNil(t, res.Session)

	// Wrong password.
	_, err = svc.Login(ctx, email, "wrong password!", false, home)
	assert.ErrorIs(t, err, ErrInvalidCredentials)

	// New device from a new network: email challenge.
	away := ClientInfo{IPAddress: "203.0.113.5", UserAgent: "Mozilla/5.0 (Windows NT 10.0) Firefox/130.0"}
	res, err = svc.Login(ctx, email, pw, true, away)
	require.NoError(t, err)
	require.Equal(t, "challenge", res.Status)
	assert.Equal(t, ReasonNewDevice, res.Reason)
	assert.Equal(t, []string{MethodEmail}, res.Methods)
	assert.Nil(t, res.Session)
	assert.Contains(t, res.EmailHint, "***@test.local")

	require.NoError(t, svc.SendChallengeEmail(ctx, res.Challenge, away))
	require.NoError(t, svc.SendChallengeEmail(ctx, res.Challenge, away)) // within cooldown: no-op
	code := mb.lastCode(t, "verification code")

	_, err = svc.VerifyChallenge(ctx, res.Challenge, MethodTOTP, code, false, away)
	assert.ErrorIs(t, err, ErrInvalidCode) // method not offered
	_, err = svc.VerifyChallenge(ctx, res.Challenge, MethodEmail, "000000", false, away)
	assert.ErrorIs(t, err, ErrInvalidCode)

	ok, err := svc.VerifyChallenge(ctx, res.Challenge, MethodEmail, code, false, away)
	require.NoError(t, err)
	assert.Equal(t, "ok", ok.Status)
	require.NotNil(t, ok.Session)
	require.NotEmpty(t, ok.DeviceToken)
	assert.True(t, mb.has("New sign-in"))

	// Challenge is single use.
	_, err = svc.VerifyChallenge(ctx, res.Challenge, MethodEmail, code, false, away)
	assert.ErrorIs(t, err, ErrChallengeExpired)

	// The new device is now known and trusted (remember_device on login).
	away.DeviceToken = ok.DeviceToken
	res, err = svc.Login(ctx, email, pw, false, away)
	require.NoError(t, err)
	assert.Equal(t, "ok", res.Status)

	p, err := svc.Authenticate(ctx, ok.Session.Token)
	require.NoError(t, err)
	o, err := svc.Overview(ctx, p, away.DeviceToken)
	require.NoError(t, err)
	assert.Len(t, o.Devices, 2)
	assert.True(t, o.EmailVerified)
	assert.GreaterOrEqual(t, o.SessionsCount, 3)
	var current, trusted int
	for _, d := range o.Devices {
		if d.Current {
			current++
			assert.True(t, d.Trusted)
			trusted++
		}
	}
	assert.Equal(t, 1, current)
	assert.NotEmpty(t, o.Events)
}

func TestLockout(t *testing.T) {
	svc, mb := newTestService(t)
	ctx := context.Background()
	email, pw := uniqueEmail(), "a long unique passphrase"
	client := ClientInfo{IPAddress: "198.51.100.20"}
	client.DeviceToken = signupUser(t, svc, email, pw, client)
	for range lockoutThreshold {
		_, err := svc.Login(ctx, email, "nope nope nope", false, client)
		assert.ErrorIs(t, err, ErrInvalidCredentials)
	}
	assert.True(t, mb.has("trying to sign in"))
	_, err := svc.Login(ctx, email, pw, false, client)
	assert.ErrorIs(t, err, ErrTooManyAttempts)
	// Unknown emails lock out identically (no enumeration).
	ghost := uniqueEmail()
	for range lockoutThreshold {
		_, err := svc.Login(ctx, ghost, "x", false, client)
		assert.ErrorIs(t, err, ErrInvalidCredentials)
	}
	_, err = svc.Login(ctx, ghost, "x", false, client)
	assert.ErrorIs(t, err, ErrTooManyAttempts)
}

func TestPasswordResetFlow(t *testing.T) {
	svc, mb := newTestService(t)
	ctx := context.Background()
	email, pw := uniqueEmail(), "a long unique passphrase"
	client := ClientInfo{IPAddress: "198.51.100.30"}
	client.DeviceToken = signupUser(t, svc, email, pw, client)
	res, err := svc.Login(ctx, email, pw, false, client)
	require.NoError(t, err)

	require.NoError(t, svc.ForgotPassword(ctx, "nobody-"+email, client)) // silent
	require.NoError(t, svc.ForgotPassword(ctx, email, client))
	token := mb.lastResetToken(t)

	assert.ErrorIs(t, svc.ResetPassword(ctx, "bogus", "another good passphrase", client), ErrInvalidToken)
	assert.ErrorIs(t, svc.ResetPassword(ctx, token, "short", client), ErrWeakPassword)
	require.NoError(t, svc.ResetPassword(ctx, token, "another good passphrase", client))
	assert.ErrorIs(t, svc.ResetPassword(ctx, token, "another good passphrase 2", client), ErrInvalidToken)

	_, err = svc.Authenticate(ctx, res.Session.Token)
	assert.Error(t, err, "sessions revoked")
	_, err = svc.Login(ctx, email, pw, false, client)
	assert.ErrorIs(t, err, ErrInvalidCredentials)
	res, err = svc.Login(ctx, email, "another good passphrase", false, client)
	require.NoError(t, err)
	assert.Equal(t, "ok", res.Status)
	assert.True(t, mb.has("password was changed"))

	// Change password keeps the current session and revokes others.
	other, err := svc.Login(ctx, email, "another good passphrase", false, client)
	require.NoError(t, err)
	p, err := svc.Authenticate(ctx, res.Session.Token)
	require.NoError(t, err)
	assert.ErrorIs(t, svc.ChangePassword(ctx, p, "wrong", "third good passphrase", client), ErrWrongPassword)
	require.NoError(t, svc.ChangePassword(ctx, p, "another good passphrase", "third good passphrase", client))
	_, err = svc.Authenticate(ctx, res.Session.Token)
	assert.NoError(t, err)
	_, err = svc.Authenticate(ctx, other.Session.Token)
	assert.Error(t, err)
}

func currentTOTP(t *testing.T, secret string, offset int64) string {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	require.NoError(t, err)
	return hotp(key, uint64(totpStep(time.Now())+offset), 6)
}

func TestTOTPEnableChallengeDisable(t *testing.T) {
	svc, _ := newTestService(t)
	ctx := context.Background()
	email, pw := uniqueEmail(), "a long unique passphrase"
	client := ClientInfo{IPAddress: "198.51.100.40"}
	client.DeviceToken = signupUser(t, svc, email, pw, client)
	res, err := svc.Login(ctx, email, pw, false, client)
	require.NoError(t, err)
	p, err := svc.Authenticate(ctx, res.Session.Token)
	require.NoError(t, err)

	_, _, err = svc.SetupTOTP(ctx, p, "wrong")
	assert.ErrorIs(t, err, ErrWrongPassword)
	secret, u, err := svc.SetupTOTP(ctx, p, pw)
	require.NoError(t, err)
	parsed, err := url.Parse(u)
	require.NoError(t, err)
	assert.Equal(t, secret, parsed.Query().Get("secret"))

	_, err = svc.EnableTOTP(ctx, p, "000000", client)
	assert.ErrorIs(t, err, ErrInvalidCode)
	codes, err := svc.EnableTOTP(ctx, p, currentTOTP(t, secret, -1), client)
	require.NoError(t, err)
	assert.Len(t, codes, recoveryCodeCount)
	_, twoFA, _ := svc.MeSecurity(ctx, p.User.ID)
	assert.True(t, twoFA)

	// Login now needs a second factor even on a known device.
	res, err = svc.Login(ctx, email, pw, false, client)
	require.NoError(t, err)
	require.Equal(t, "challenge", res.Status)
	assert.Equal(t, ReasonTwoFactor, res.Reason)
	assert.Equal(t, []string{MethodTOTP, MethodEmail, MethodRecovery}, res.Methods)
	// Replay of the code used to enable is refused.
	_, err = svc.VerifyChallenge(ctx, res.Challenge, MethodTOTP, currentTOTP(t, secret, -1), false, client)
	assert.ErrorIs(t, err, ErrInvalidCode)
	ok, err := svc.VerifyChallenge(ctx, res.Challenge, MethodTOTP, currentTOTP(t, secret, 0), false, client)
	require.NoError(t, err)
	assert.Equal(t, "ok", ok.Status)

	// Recovery code works once.
	res, err = svc.Login(ctx, email, pw, false, client)
	require.NoError(t, err)
	_, err = svc.VerifyChallenge(ctx, res.Challenge, MethodRecovery, strings.ToUpper(codes[0]), false, client)
	require.NoError(t, err)
	res, err = svc.Login(ctx, email, pw, false, client)
	require.NoError(t, err)
	_, err = svc.VerifyChallenge(ctx, res.Challenge, MethodRecovery, codes[0], false, client)
	assert.ErrorIs(t, err, ErrInvalidCode)

	o, err := svc.Overview(ctx, p, client.DeviceToken)
	require.NoError(t, err)
	assert.Equal(t, recoveryCodeCount-1, o.RecoveryCodesRemaining)

	// Disable needs the password and a code (recovery accepted).
	assert.ErrorIs(t, svc.DisableTOTP(ctx, p, "wrong", codes[1], client), ErrWrongPassword)
	assert.ErrorIs(t, svc.DisableTOTP(ctx, p, pw, "zzzz-zzzz", client), ErrInvalidCode)
	require.NoError(t, svc.DisableTOTP(ctx, p, pw, codes[1], client))
	_, twoFA, _ = svc.MeSecurity(ctx, p.User.ID)
	assert.False(t, twoFA)
	res, err = svc.Login(ctx, email, pw, false, client)
	require.NoError(t, err)
	assert.Equal(t, "ok", res.Status)
}

func TestEmailCodeLoginAndPhone(t *testing.T) {
	svc, mb := newTestService(t)
	ctx := context.Background()
	email, pw := uniqueEmail(), "a long unique passphrase"
	client := ClientInfo{IPAddress: "198.51.100.50"}
	client.DeviceToken = signupUser(t, svc, email, pw, client)

	require.NoError(t, svc.StartEmailLogin(ctx, "ghost-"+email, client))
	require.NoError(t, svc.StartEmailLogin(ctx, email, client))
	_, err := svc.VerifyEmailLogin(ctx, email, "111111x", false, client)
	assert.Error(t, err)
	res, err := svc.VerifyEmailLogin(ctx, email, mb.lastCode(t, "sign-in code"), false, client)
	require.NoError(t, err)
	assert.Equal(t, "ok", res.Status)
	verified, _, _ := svc.MeSecurity(ctx, res.User.ID)
	assert.True(t, verified, "email code proves the mailbox")

	p, err := svc.Authenticate(ctx, res.Session.Token)
	require.NoError(t, err)
	assert.ErrorIs(t, svc.AddPhone(ctx, p, pw, "12345", client), ErrInvalidPhone)
	var sent string
	svc.sec.SMS = smsFunc(func(_ context.Context, _, body string) error { sent = body; return nil })
	require.NoError(t, svc.AddPhone(ctx, p, pw, "+1 415 555 0123", client))
	o, _ := svc.Overview(ctx, p, "")
	require.NotNil(t, o.Phone)
	assert.Equal(t, "+14155550123", *o.Phone)
	assert.False(t, o.PhoneVerified)
	require.NoError(t, svc.VerifyPhone(ctx, p, sixDigits.FindString(sent), client))
	o, _ = svc.Overview(ctx, p, "")
	assert.True(t, o.PhoneVerified)
	require.NoError(t, svc.RemovePhone(ctx, p, pw, client))
	o, _ = svc.Overview(ctx, p, "")
	assert.Nil(t, o.Phone)

	n, err := svc.RevokeOtherSessions(ctx, p, client)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, n, int64(1))
}

type smsFunc func(ctx context.Context, to, body string) error

func (f smsFunc) Send(ctx context.Context, to, body string) error { return f(ctx, to, body) }
