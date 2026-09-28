package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/iamv1n/adwise/internal/platform/httpx"
)

// Code purposes (auth_codes.purpose).
const (
	PurposeVerifyEmail    = "verify_email"
	PurposeLoginEmail     = "login_email"
	PurposeResetPassword  = "reset_password"
	PurposeTwoFactorEmail = "two_factor_email"
	PurposeVerifyPhone    = "verify_phone"
)

// Challenge reasons and methods.
const (
	ReasonTwoFactor      = "two_factor"
	ReasonNewDevice      = "new_device"
	ReasonFailedAttempts = "failed_attempts"

	MethodTOTP     = "totp"
	MethodEmail    = "email"
	MethodRecovery = "recovery"
)

// Limits (plan/auth-security.md "Principles").
const (
	maxCodeAttempts     = 5
	sendCooldown        = 60 * time.Second
	sendsPerHour        = 5
	lockoutThreshold    = 5
	lockoutWindow       = 15 * time.Minute
	riskyFailures       = 3
	challengeTTL        = 10 * time.Minute
	trustedDeviceTTL    = 30 * 24 * time.Hour
	deviceCookieTTL     = 365 * 24 * time.Hour
	ipHistoryWindow     = 90 * 24 * time.Hour
	recoveryCodeCount   = 10
	minPasswordLength   = 10
	maxPasswordLength   = 256
	securityEventsShown = 10
)

// DeviceCookieName identifies a browser across sign-ins (random 32-byte token).
const DeviceCookieName = "adwise_device"

var (
	ErrTooManyAttempts  = httpx.NewError(http.StatusTooManyRequests, "too_many_attempts", "too many attempts, try again later")
	ErrInvalidCode      = httpx.NewError(http.StatusBadRequest, "invalid_code", "the code is incorrect")
	ErrCodeExpired      = httpx.NewError(http.StatusBadRequest, "code_expired", "the code has expired, request a new one")
	ErrChallengeExpired = httpx.NewError(http.StatusBadRequest, "challenge_expired", "this sign-in attempt has expired, sign in again")
	ErrPasswordRequired = httpx.NewError(http.StatusForbidden, "password_required", "enter your current password")
	// ErrWrongPassword is a failed re-check on a sensitive change. It is 403,
	// not 401, so clients do not mistake it for a lost session.
	ErrWrongPassword    = httpx.NewError(http.StatusForbidden, "invalid_credentials", "your current password is incorrect")
	ErrWeakPassword     = httpx.NewError(http.StatusUnprocessableEntity, "weak_password", "choose a password of at least 10 characters that is hard to guess")
	ErrInvalidPhone     = httpx.NewError(http.StatusUnprocessableEntity, "invalid_phone", "enter the number in international format, e.g. +14155550123")
	ErrRateLimited      = httpx.NewError(http.StatusTooManyRequests, "rate_limited", "too many requests, try again later")
	ErrInvalidToken     = httpx.NewError(http.StatusBadRequest, "invalid_code", "this link is invalid or has already been used")
	ErrTOTPNotEnabled   = httpx.NewError(http.StatusConflict, "totp_not_enabled", "authenticator app is not set up")
	ErrTOTPNotPending   = httpx.NewError(http.StatusConflict, "totp_not_pending", "start authenticator setup first")
	ErrEmailNotVerified = httpx.NewError(http.StatusConflict, "email_not_verified", "verify your email address first")
)

// codeTTL is the lifetime of a code of the given purpose.
func codeTTL(purpose string) time.Duration {
	switch purpose {
	case PurposeVerifyEmail:
		return 24 * time.Hour
	case PurposeResetPassword:
		return time.Hour
	}
	return 10 * time.Minute
}

// newNumericCode returns a uniformly random 6-digit code.
func newNumericCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

const recoveryAlphabet = "abcdefghjkmnpqrstuvwxyz23456789" // no 0/o/1/l/i

// newRecoveryCode returns a code formatted xxxx-xxxx.
func newRecoveryCode() (string, error) {
	var b strings.Builder
	for i := range 8 {
		if i == 4 {
			b.WriteByte('-')
		}
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(recoveryAlphabet))))
		if err != nil {
			return "", err
		}
		b.WriteByte(recoveryAlphabet[n.Int64()])
	}
	return b.String(), nil
}

// normalizeRecoveryCode lower-cases and re-inserts the dash so "ABCD EFGH",
// "abcdefgh" and "abcd-efgh" all hash the same.
func normalizeRecoveryCode(s string) string {
	s = strings.ToLower(strings.Map(func(r rune) rune {
		if r == ' ' || r == '-' {
			return -1
		}
		return r
	}, s))
	if len(s) != 8 {
		return s
	}
	return s[:4] + "-" + s[4:]
}

// hashCode hashes a short code bound to its purpose and email, so a hash
// cannot be replayed for another purpose or account.
func hashCode(purpose, email, code string) []byte {
	return HashToken(purpose + "|" + strings.ToLower(email) + "|" + normalizeDigits(code))
}

func equalHash(a, b []byte) bool { return len(a) > 0 && subtle.ConstantTimeCompare(a, b) == 1 }

// codeState is what verifying a stored code needs.
type codeState struct {
	CodeHash   []byte
	Attempts   int
	ExpiresAt  time.Time
	ConsumedAt *time.Time
}

// checkCode decides the outcome of presenting guess for c. On a mismatch the
// caller must increment attempts.
func checkCode(c codeState, guessHash []byte, now time.Time) (ok bool, err error) {
	switch {
	case c.ConsumedAt != nil:
		return false, ErrInvalidCode
	case c.Attempts >= maxCodeAttempts:
		return false, ErrTooManyAttempts
	case !now.Before(c.ExpiresAt):
		return false, ErrCodeExpired
	case !equalHash(c.CodeHash, guessHash):
		return false, ErrInvalidCode
	}
	return true, nil
}

// sendAllowed applies the send rate limit: sendCooldown between sends and at
// most sendsPerHour per (purpose, email). lastSent is zero when none.
func sendAllowed(lastSent time.Time, sentLastHour int, now time.Time) (bool, time.Duration) {
	if sentLastHour >= sendsPerHour {
		return false, time.Hour
	}
	if !lastSent.IsZero() && now.Sub(lastSent) < sendCooldown {
		return false, sendCooldown - now.Sub(lastSent)
	}
	return true, 0
}

// riskInput is everything the step-up decision looks at.
type riskInput struct {
	TOTPEnabled      bool
	Email2FAEnabled  bool
	DeviceKnown      bool
	DeviceTrusted    bool // trusted_until > now
	IPSeenRecently   bool // IP prefix had a successful sign-in in ipHistoryWindow
	HasPriorSignIn   bool // any successful sign-in ever (false = first sign-in)
	RecentFailures   int  // failed password attempts for this email in lockoutWindow
	EmailFirstFactor bool
}

type riskDecision struct {
	Challenge bool
	Reason    string
	Methods   []string
}

// decideRisk implements "Risk: when to ask for a second factor".
func decideRisk(in riskInput) riskDecision {
	var methods []string
	if in.TOTPEnabled {
		methods = append(methods, MethodTOTP)
	}
	if !in.EmailFirstFactor {
		methods = append(methods, MethodEmail)
	}
	if in.TOTPEnabled {
		methods = append(methods, MethodRecovery)
	}

	if in.TOTPEnabled || in.Email2FAEnabled {
		if in.DeviceTrusted {
			return riskDecision{}
		}
		if in.EmailFirstFactor && !in.TOTPEnabled {
			// The email code already proved the second factor.
			return riskDecision{}
		}
		return riskDecision{Challenge: true, Reason: ReasonTwoFactor, Methods: methods}
	}
	if len(methods) == 0 {
		return riskDecision{} // email-code sign-in without TOTP is complete
	}
	if in.RecentFailures >= riskyFailures {
		return riskDecision{Challenge: true, Reason: ReasonFailedAttempts, Methods: methods}
	}
	if in.HasPriorSignIn && !in.DeviceKnown && !in.IPSeenRecently {
		return riskDecision{Challenge: true, Reason: ReasonNewDevice, Methods: methods}
	}
	return riskDecision{}
}

// ipPrefix returns the /24 (IPv4) or /48 (IPv6) network of ip, or ip itself
// when it does not parse.
func ipPrefix(ip string) string {
	p := net.ParseIP(strings.TrimSpace(ip))
	if p == nil {
		return ip
	}
	if v4 := p.To4(); v4 != nil {
		return v4.Mask(net.CIDRMask(24, 32)).String() + "/24"
	}
	return p.Mask(net.CIDRMask(48, 128)).String() + "/48"
}

// deviceLabel turns a User-Agent into "Chrome on macOS".
func deviceLabel(ua string) string {
	browser := "Unknown browser"
	switch {
	case strings.Contains(ua, "Edg/"):
		browser = "Edge"
	case strings.Contains(ua, "OPR/") || strings.Contains(ua, "Opera"):
		browser = "Opera"
	case strings.Contains(ua, "Firefox/") || strings.Contains(ua, "FxiOS/"):
		browser = "Firefox"
	case strings.Contains(ua, "Chrome/") || strings.Contains(ua, "CriOS/"):
		browser = "Chrome"
	case strings.Contains(ua, "Safari/"):
		browser = "Safari"
	case strings.HasPrefix(ua, "curl/"):
		browser = "curl"
	}
	os := ""
	switch {
	case strings.Contains(ua, "iPhone") || strings.Contains(ua, "iPad"):
		os = "iOS"
	case strings.Contains(ua, "Android"):
		os = "Android"
	case strings.Contains(ua, "Mac OS X") || strings.Contains(ua, "Macintosh"):
		os = "macOS"
	case strings.Contains(ua, "Windows"):
		os = "Windows"
	case strings.Contains(ua, "CrOS"):
		os = "ChromeOS"
	case strings.Contains(ua, "Linux"):
		os = "Linux"
	}
	if os == "" {
		return browser
	}
	return browser + " on " + os
}

// maskEmail renders v***@gmail.com.
func maskEmail(email string) string {
	local, domain, ok := strings.Cut(email, "@")
	if !ok || local == "" {
		return "***"
	}
	return local[:1] + "***@" + domain
}

var e164 = regexp.MustCompile(`^\+[1-9][0-9]{7,14}$`)

// normalizePhone strips formatting and validates E.164.
func normalizePhone(s string) (string, error) {
	s = strings.Map(func(r rune) rune {
		if r == ' ' || r == '-' || r == '(' || r == ')' || r == '.' {
			return -1
		}
		return r
	}, strings.TrimSpace(s))
	if !e164.MatchString(s) {
		return "", ErrInvalidPhone
	}
	return s, nil
}

var commonPasswords = map[string]bool{
	"password123": true, "password1234": true, "1234567890": true, "qwertyuiop": true, "0123456789": true,
	"iloveyou123": true, "passw0rd123": true, "adwise1234": true, "letmein1234": true, "welcome123": true,
}

// checkPasswordStrength enforces the minimum policy for new passwords.
func checkPasswordStrength(password, email string) error {
	if len(password) < minPasswordLength || len(password) > maxPasswordLength {
		return ErrWeakPassword
	}
	lower := strings.ToLower(password)
	if commonPasswords[lower] || strings.Count(lower, lower[:1]) == len(lower) {
		return ErrWeakPassword
	}
	if local, _, _ := strings.Cut(strings.ToLower(email), "@"); local != "" && lower == local {
		return ErrWeakPassword
	}
	return nil
}
