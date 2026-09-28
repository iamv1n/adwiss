package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // RFC 6238 TOTP as implemented by authenticator apps uses HMAC-SHA1.
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// TOTP parameters (RFC 6238 defaults understood by every authenticator app).
const (
	totpPeriod = 30
	totpDigits = 6
	totpSkew   = 1 // accept one step either side for clock drift
	totpIssuer = "Adwise"
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// newTOTPSecret returns a random 160-bit secret, base32 encoded without padding.
func newTOTPSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return b32.EncodeToString(b), nil
}

func totpURL(secret, account string) string {
	v := url.Values{}
	v.Set("secret", secret)
	v.Set("issuer", totpIssuer)
	v.Set("algorithm", "SHA1")
	v.Set("digits", fmt.Sprint(totpDigits))
	v.Set("period", fmt.Sprint(totpPeriod))
	label := url.PathEscape(totpIssuer + ":" + account)
	return "otpauth://totp/" + label + "?" + v.Encode()
}

// hotp computes the RFC 4226 value for counter with the given number of digits.
func hotp(key []byte, counter uint64, digits int) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], counter)
	m := hmac.New(sha1.New, key)
	m.Write(msg[:])
	sum := m.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	bin := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	mod := uint32(1)
	for range digits {
		mod *= 10
	}
	return fmt.Sprintf("%0*d", digits, bin%mod)
}

func totpStep(t time.Time) int64 { return t.Unix() / totpPeriod }

// verifyTOTP checks code against secret at now (±totpSkew steps). It returns
// the matched time step, which must be greater than lastStep so a code can
// never be used twice (replay guard). Comparisons are constant time.
func verifyTOTP(secret, code string, now time.Time, lastStep int64) (int64, bool) {
	key, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil || len(key) == 0 {
		return 0, false
	}
	code = normalizeDigits(code)
	if len(code) != totpDigits {
		return 0, false
	}
	cur := totpStep(now)
	matched := int64(-1)
	for d := int64(-totpSkew); d <= totpSkew; d++ {
		step := cur + d
		if step < 0 {
			continue
		}
		if subtle.ConstantTimeCompare([]byte(hotp(key, uint64(step), totpDigits)), []byte(code)) == 1 && matched < 0 {
			matched = step
		}
	}
	if matched < 0 || matched <= lastStep {
		return 0, false
	}
	return matched, true
}

// normalizeDigits strips spaces and dashes users paste with codes.
func normalizeDigits(s string) string {
	return strings.Map(func(r rune) rune {
		if r == ' ' || r == '-' {
			return -1
		}
		return r
	}, strings.TrimSpace(s))
}
