package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// RFC 6238 Appendix B vectors (SHA1, key "12345678901234567890", 8 digits).
func TestHOTPRFC6238Vectors(t *testing.T) {
	key := []byte("12345678901234567890")
	for _, tc := range []struct {
		unix int64
		want string
	}{
		{59, "94287082"},
		{1111111109, "07081804"},
		{1111111111, "14050471"},
		{1234567890, "89005924"},
		{2000000000, "69279037"},
		{20000000000, "65353130"},
	} {
		assert.Equal(t, tc.want, hotp(key, uint64(tc.unix/30), 8), tc.unix)
		// 6-digit codes are the last six digits of the 8-digit value.
		assert.Equal(t, tc.want[2:], hotp(key, uint64(tc.unix/30), 6), tc.unix)
	}
}

func TestVerifyTOTP(t *testing.T) {
	secret := b32.EncodeToString([]byte("12345678901234567890"))
	now := time.Unix(1111111111, 0)
	key := []byte("12345678901234567890")
	cur := totpStep(now)

	step, ok := verifyTOTP(secret, "050471", now, 0)
	require.True(t, ok)
	assert.Equal(t, cur, step)

	// Replay of the same step is refused.
	_, ok = verifyTOTP(secret, "050471", now, step)
	assert.False(t, ok)

	// ±1 step accepted, ±2 refused.
	_, ok = verifyTOTP(secret, hotp(key, uint64(cur-1), 6), now, 0)
	assert.True(t, ok)
	_, ok = verifyTOTP(secret, hotp(key, uint64(cur+1), 6), now, 0)
	assert.True(t, ok)
	_, ok = verifyTOTP(secret, hotp(key, uint64(cur-2), 6), now, 0)
	assert.False(t, ok)

	// Formatting tolerated; garbage refused.
	_, ok = verifyTOTP(secret, "050 471", now, 0)
	assert.True(t, ok)
	for _, bad := range []string{"", "12345", "abcdef", "0504711"} {
		_, ok = verifyTOTP(secret, bad, now, 0)
		assert.False(t, ok, bad)
	}
	_, ok = verifyTOTP("not base32!", "050471", now, 0)
	assert.False(t, ok)
}

func TestTOTPSecretAndURL(t *testing.T) {
	s, err := newTOTPSecret()
	require.NoError(t, err)
	assert.Len(t, s, 32)
	u := totpURL(s, "a@b.com")
	assert.True(t, strings.HasPrefix(u, "otpauth://totp/Adwise:a@b.com?"), u)
	assert.Contains(t, u, "secret="+s)
	assert.Contains(t, u, "issuer=Adwise")
}
