package auth

import (
	"regexp"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckCodeLifecycle(t *testing.T) {
	now := time.Now()
	h := hashCode(PurposeVerifyEmail, "A@b.com", "123456")
	live := codeState{CodeHash: h, ExpiresAt: now.Add(time.Minute)}

	ok, err := checkCode(live, hashCode(PurposeVerifyEmail, "a@b.com", "123 456"), now)
	assert.True(t, ok)
	assert.NoError(t, err)

	_, err = checkCode(live, hashCode(PurposeVerifyEmail, "a@b.com", "654321"), now)
	assert.ErrorIs(t, err, ErrInvalidCode)
	// Bound to purpose.
	_, err = checkCode(live, hashCode(PurposeLoginEmail, "a@b.com", "123456"), now)
	assert.ErrorIs(t, err, ErrInvalidCode)

	expired := live
	expired.ExpiresAt = now.Add(-time.Second)
	_, err = checkCode(expired, h, now)
	assert.ErrorIs(t, err, ErrCodeExpired)

	dead := live
	dead.Attempts = maxCodeAttempts
	_, err = checkCode(dead, h, now)
	assert.ErrorIs(t, err, ErrTooManyAttempts)

	used := live
	used.ConsumedAt = &now
	_, err = checkCode(used, h, now)
	assert.ErrorIs(t, err, ErrInvalidCode)
}

func TestCodeGenerators(t *testing.T) {
	c, err := newNumericCode()
	require.NoError(t, err)
	assert.Regexp(t, `^\d{6}$`, c)
	rc, err := newRecoveryCode()
	require.NoError(t, err)
	assert.Regexp(t, regexp.MustCompile(`^[a-z2-9]{4}-[a-z2-9]{4}$`), rc)
	assert.Equal(t, "abcd-efgh", normalizeRecoveryCode("ABCD EFGH"))
	assert.Equal(t, "abcd-efgh", normalizeRecoveryCode("abcdefgh"))
	assert.Equal(t, time.Hour*24, codeTTL(PurposeVerifyEmail))
	assert.Equal(t, time.Hour, codeTTL(PurposeResetPassword))
	assert.Equal(t, 10*time.Minute, codeTTL(PurposeTwoFactorEmail))
}

func TestSendAllowed(t *testing.T) {
	now := time.Now()
	ok, _ := sendAllowed(time.Time{}, 0, now)
	assert.True(t, ok)
	ok, wait := sendAllowed(now.Add(-10*time.Second), 1, now)
	assert.False(t, ok)
	assert.InDelta(t, 50, wait.Seconds(), 1)
	ok, _ = sendAllowed(now.Add(-61*time.Second), 4, now)
	assert.True(t, ok)
	ok, _ = sendAllowed(now.Add(-30*time.Minute), 5, now)
	assert.False(t, ok)
}

func TestDecideRisk(t *testing.T) {
	cases := []struct {
		name string
		in   riskInput
		want riskDecision
	}{
		{"known device", riskInput{HasPriorSignIn: true, DeviceKnown: true}, riskDecision{}},
		{"new device, known network", riskInput{HasPriorSignIn: true, IPSeenRecently: true}, riskDecision{}},
		{"first sign-in ever", riskInput{}, riskDecision{}},
		{"new device and network", riskInput{HasPriorSignIn: true},
			riskDecision{true, ReasonNewDevice, []string{MethodEmail}}},
		{"failed attempts", riskInput{HasPriorSignIn: true, DeviceKnown: true, RecentFailures: 3},
			riskDecision{true, ReasonFailedAttempts, []string{MethodEmail}}},
		{"totp", riskInput{TOTPEnabled: true, DeviceKnown: true, HasPriorSignIn: true},
			riskDecision{true, ReasonTwoFactor, []string{MethodTOTP, MethodEmail, MethodRecovery}}},
		{"email 2fa", riskInput{Email2FAEnabled: true, DeviceKnown: true},
			riskDecision{true, ReasonTwoFactor, []string{MethodEmail}}},
		{"trusted device skips 2fa", riskInput{TOTPEnabled: true, DeviceKnown: true, DeviceTrusted: true}, riskDecision{}},
		{"email code + totp", riskInput{TOTPEnabled: true, EmailFirstFactor: true},
			riskDecision{true, ReasonTwoFactor, []string{MethodTOTP, MethodRecovery}}},
		{"email code + email 2fa is complete", riskInput{Email2FAEnabled: true, EmailFirstFactor: true}, riskDecision{}},
		{"email code, unusual, no totp is complete", riskInput{HasPriorSignIn: true, EmailFirstFactor: true, RecentFailures: 5}, riskDecision{}},
	}
	for _, tc := range cases {
		assert.Equal(t, tc.want, decideRisk(tc.in), tc.name)
	}
}

func TestHelpers(t *testing.T) {
	assert.Equal(t, "203.0.113.0/24", ipPrefix("203.0.113.77"))
	assert.Equal(t, ipPrefix("2001:db8:1:2::1"), ipPrefix("2001:db8:1:ffff::9"))
	assert.NotEqual(t, ipPrefix("2001:db8:1::1"), ipPrefix("2001:db8:2::1"))
	assert.Equal(t, "Chrome on macOS", deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"))
	assert.Equal(t, "Safari on iOS", deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"))
	assert.Equal(t, "Firefox on Windows", deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0"))
	assert.Equal(t, "v***@gmail.com", maskEmail("vin@gmail.com"))
	p, err := normalizePhone("+1 (415) 555-0123")
	require.NoError(t, err)
	assert.Equal(t, "+14155550123", p)
	_, err = normalizePhone("0415 555")
	assert.ErrorIs(t, err, ErrInvalidPhone)
	assert.ErrorIs(t, checkPasswordStrength("short", "a@b.com"), ErrWeakPassword)
	assert.ErrorIs(t, checkPasswordStrength("aaaaaaaaaaaa", "a@b.com"), ErrWeakPassword)
	assert.ErrorIs(t, checkPasswordStrength("password123", "a@b.com"), ErrWeakPassword)
	assert.NoError(t, checkPasswordStrength("a long unique passphrase", "a@b.com"))
	assert.True(t, validDeviceToken("0123456789abcdefghijABCDEFGHIJ0123456789abc"))
	assert.False(t, validDeviceToken("nope"))
}
