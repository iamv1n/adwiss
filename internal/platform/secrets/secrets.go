// Package secrets encrypts provider tokens at rest with AES-256-GCM (plan §33).
//
// Ciphertext format (binary, stored in bytea columns):
//
//	"<keyID>" ":" nonce(12 bytes) || sealed(plaintext) || tag(16 bytes)
//
// The key ID prefix lets keys rotate: new values are always sealed with the
// current key, while values sealed with any older configured key still open.
// Re-encrypting old rows is a matter of Open + Seal.
//
// Callers pass associated data (for example "org:<id>|provider:meta") that is
// authenticated but not stored, so a ciphertext copied to another row fails to
// open.
package secrets

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// DevKeySpec is the development-only key documented in .env.example. It is
// public and must never be used outside APP_ENV=development.
const DevKeySpec = "dev1:ZGV2LW9ubHktYWR3aXNlLXRva2VuLWtleS0zMmJ5dGU="

var (
	ErrMalformed  = errors.New("secrets: malformed ciphertext")
	ErrUnknownKey = errors.New("secrets: ciphertext sealed with an unknown key")
	ErrDecrypt    = errors.New("secrets: decryption failed")
)

var keyIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

// Keyring seals with its current key and opens with any configured key.
// It is safe for concurrent use.
type Keyring struct {
	current string
	aeads   map[string]cipher.AEAD
}

// Key is one named 32-byte AES-256 key.
type Key struct {
	ID    string
	Bytes []byte
}

// New builds a keyring. The first key is the current (sealing) key.
func New(keys ...Key) (*Keyring, error) {
	if len(keys) == 0 {
		return nil, errors.New("secrets: at least one key is required")
	}
	kr := &Keyring{current: keys[0].ID, aeads: make(map[string]cipher.AEAD, len(keys))}
	for _, k := range keys {
		if !keyIDPattern.MatchString(k.ID) {
			return nil, fmt.Errorf("secrets: invalid key id %q", k.ID)
		}
		if len(k.Bytes) != 32 {
			return nil, fmt.Errorf("secrets: key %q must be 32 bytes, got %d", k.ID, len(k.Bytes))
		}
		if _, dup := kr.aeads[k.ID]; dup {
			return nil, fmt.Errorf("secrets: duplicate key id %q", k.ID)
		}
		block, err := aes.NewCipher(k.Bytes)
		if err != nil {
			return nil, err
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			return nil, err
		}
		kr.aeads[k.ID] = aead
	}
	return kr, nil
}

// Parse reads the TOKEN_ENCRYPTION_KEY format:
//
//	<base64 key>                              single key, id "k1"
//	<id>:<base64 key>[,<id>:<base64 key>...]  first entry is current; the rest only decrypt
//
// Keys are standard base64 (padding optional) of exactly 32 bytes.
func Parse(spec string) (*Keyring, error) {
	spec = strings.TrimSpace(spec)
	if spec == "" {
		return nil, errors.New("secrets: TOKEN_ENCRYPTION_KEY is empty")
	}
	var keys []Key
	for part := range strings.SplitSeq(spec, ",") {
		part = strings.TrimSpace(part)
		id, b64, ok := strings.Cut(part, ":")
		if !ok {
			id, b64 = "k1", part
		}
		raw, err := decodeBase64(b64)
		if err != nil {
			return nil, fmt.Errorf("secrets: key %q: %w", id, err)
		}
		keys = append(keys, Key{ID: id, Bytes: raw})
	}
	return New(keys...)
}

func decodeBase64(s string) ([]byte, error) {
	s = strings.TrimRight(strings.TrimSpace(s), "=")
	return base64.RawStdEncoding.DecodeString(s)
}

// CurrentKeyID returns the ID of the key used for sealing.
func (k *Keyring) CurrentKeyID() string { return k.current }

// Seal encrypts plaintext with the current key.
func (k *Keyring) Seal(plaintext, associatedData []byte) ([]byte, error) {
	aead := k.aeads[k.current]
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	out := make([]byte, 0, len(k.current)+1+len(nonce)+len(plaintext)+aead.Overhead())
	out = append(out, k.current...)
	out = append(out, ':')
	out = append(out, nonce...)
	return aead.Seal(out, nonce, plaintext, associatedData), nil
}

// Open decrypts a value produced by Seal with any configured key.
func (k *Keyring) Open(ciphertext, associatedData []byte) ([]byte, error) {
	id, body, err := split(ciphertext)
	if err != nil {
		return nil, err
	}
	aead, ok := k.aeads[id]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownKey, id)
	}
	if len(body) < aead.NonceSize()+aead.Overhead() {
		return nil, ErrMalformed
	}
	nonce, sealed := body[:aead.NonceSize()], body[aead.NonceSize():]
	pt, err := aead.Open(nil, nonce, sealed, associatedData)
	if err != nil {
		return nil, ErrDecrypt
	}
	return pt, nil
}

// SealString and OpenString are conveniences for string secrets.
func (k *Keyring) SealString(plaintext string, associatedData []byte) ([]byte, error) {
	return k.Seal([]byte(plaintext), associatedData)
}

func (k *Keyring) OpenString(ciphertext, associatedData []byte) (string, error) {
	pt, err := k.Open(ciphertext, associatedData)
	return string(pt), err
}

// NeedsRotation reports whether ciphertext was sealed with a key other than the current one.
func (k *Keyring) NeedsRotation(ciphertext []byte) bool {
	id, _, err := split(ciphertext)
	return err == nil && id != k.current
}

func split(ciphertext []byte) (string, []byte, error) {
	i := bytes.IndexByte(ciphertext, ':')
	if i <= 0 || i > 32 {
		return "", nil, ErrMalformed
	}
	id := string(ciphertext[:i])
	if !keyIDPattern.MatchString(id) {
		return "", nil, ErrMalformed
	}
	return id, ciphertext[i+1:], nil
}
