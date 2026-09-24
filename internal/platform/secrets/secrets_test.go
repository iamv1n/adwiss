package secrets

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

func randomKey(t *testing.T, id string) Key {
	t.Helper()
	b := make([]byte, 32)
	_, err := rand.Read(b)
	require.NoError(t, err)
	return Key{ID: id, Bytes: b}
}

func TestSealOpenRoundTrip(t *testing.T) {
	kr, err := New(randomKey(t, "k1"))
	require.NoError(t, err)
	ad := []byte("org:1|provider:meta")

	ct, err := kr.SealString("secret-token", ad)
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(ct, []byte("k1:")))
	require.NotContains(t, string(ct), "secret-token")

	pt, err := kr.OpenString(ct, ad)
	require.NoError(t, err)
	require.Equal(t, "secret-token", pt)

	// Nonces are random, so sealing twice differs.
	ct2, _ := kr.SealString("secret-token", ad)
	require.NotEqual(t, ct, ct2)
}

func TestOpenRejectsWrongAssociatedDataAndTampering(t *testing.T) {
	kr, err := New(randomKey(t, "k1"))
	require.NoError(t, err)
	ct, err := kr.SealString("x", []byte("a"))
	require.NoError(t, err)

	_, err = kr.Open(ct, []byte("b"))
	require.ErrorIs(t, err, ErrDecrypt)

	tampered := bytes.Clone(ct)
	tampered[len(tampered)-1] ^= 1
	_, err = kr.Open(tampered, []byte("a"))
	require.ErrorIs(t, err, ErrDecrypt)

	for _, bad := range [][]byte{nil, []byte("nokeyid"), []byte("k1:short"), []byte(":abc")} {
		_, err = kr.Open(bad, nil)
		require.True(t, errors.Is(err, ErrMalformed), "%q: %v", bad, err)
	}
}

func TestRotation(t *testing.T) {
	oldKey, newKey := randomKey(t, "k1"), randomKey(t, "k2")
	oldRing, err := New(oldKey)
	require.NoError(t, err)
	ct, err := oldRing.SealString("tok", nil)
	require.NoError(t, err)

	rotated, err := New(newKey, oldKey)
	require.NoError(t, err)
	require.True(t, rotated.NeedsRotation(ct))
	pt, err := rotated.OpenString(ct, nil)
	require.NoError(t, err)
	require.Equal(t, "tok", pt)

	fresh, err := rotated.SealString("tok", nil)
	require.NoError(t, err)
	require.False(t, rotated.NeedsRotation(fresh))
	require.True(t, bytes.HasPrefix(fresh, []byte("k2:")))

	// A keyring without the old key cannot open old values.
	onlyNew, err := New(newKey)
	require.NoError(t, err)
	_, err = onlyNew.Open(ct, nil)
	require.ErrorIs(t, err, ErrUnknownKey)
}

func TestParse(t *testing.T) {
	kr, err := Parse(DevKeySpec)
	require.NoError(t, err)
	require.Equal(t, "dev1", kr.CurrentKeyID())

	b := make([]byte, 32)
	bare := base64.StdEncoding.EncodeToString(b)
	kr, err = Parse(bare)
	require.NoError(t, err)
	require.Equal(t, "k1", kr.CurrentKeyID())

	kr, err = Parse("k2:" + bare + ", k1:" + base64.RawStdEncoding.EncodeToString(b))
	require.NoError(t, err)
	require.Equal(t, "k2", kr.CurrentKeyID())

	for _, bad := range []string{"", "k1:not-base64!", "k1:" + base64.StdEncoding.EncodeToString(make([]byte, 16)), "bad id:" + bare, "k1:" + bare + ",k1:" + bare} {
		_, err := Parse(bad)
		require.Error(t, err, bad)
	}
}
