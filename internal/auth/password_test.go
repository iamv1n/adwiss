package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	require.NoError(t, err)
	assert.Contains(t, hash, "$argon2id$")

	ok, err := VerifyPassword("correct horse battery staple", hash)
	require.NoError(t, err)
	assert.True(t, ok)

	ok, err = VerifyPassword("wrong password", hash)
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestHashPasswordUsesUniqueSalt(t *testing.T) {
	a, err := HashPassword("same")
	require.NoError(t, err)
	b, err := HashPassword("same")
	require.NoError(t, err)
	assert.NotEqual(t, a, b)
}

func TestVerifyPasswordRejectsMalformedHash(t *testing.T) {
	for _, h := range []string{"", "plain", "$argon2i$v=19$m=1,t=1,p=1$c2FsdA$a2V5", "$argon2id$v=19$bad$c2FsdA$a2V5"} {
		_, err := VerifyPassword("x", h)
		assert.ErrorIs(t, err, errInvalidHash, h)
	}
}

func TestNewToken(t *testing.T) {
	tok, hash, err := NewToken()
	require.NoError(t, err)
	assert.Len(t, tok, 43)
	assert.Equal(t, HashToken(tok), hash)
}
