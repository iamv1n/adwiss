// Package providers holds what the Meta and Google adapters share: typed
// errors, the standard report catalog and money helpers. Adapters live in
// the meta and google subpackages and implement ads.Client.
package providers

import (
	"errors"
	"fmt"
	"time"

	"github.com/iamv1n/adwise/internal/ads"
)

// Sentinel error kinds. Adapters return *Error values that wrap one of these,
// so callers use errors.Is.
var (
	// ErrUnauthorized means the token is invalid, expired or revoked. The
	// integration must be re-authorized by a user.
	ErrUnauthorized = errors.New("provider: unauthorized")
	// ErrPermissionDenied means the token is valid but lacks access to the
	// object or a required permission. Re-authorizing does not always help.
	ErrPermissionDenied = errors.New("provider: permission denied")
	// ErrRateLimited means a provider quota or throttle was hit. Use RetryAfter.
	ErrRateLimited = errors.New("provider: rate limited")
	ErrNotFound    = errors.New("provider: not found")
	// ErrUnsupported means the operation or report is not supported for this
	// provider or this entity (for example a shared Google budget).
	ErrUnsupported = errors.New("provider: unsupported")
	// ErrInvalidRequest means the provider rejected the request as invalid.
	ErrInvalidRequest = errors.New("provider: invalid request")
	// ErrTemporary means a transient provider-side failure (5xx, timeouts).
	ErrTemporary = errors.New("provider: temporary failure")
)

// Error is a provider error with enough context to decide what to do next.
type Error struct {
	Provider   ads.Provider
	Kind       error         // one of the sentinels above
	HTTPStatus int           // 0 if not an HTTP error
	Code       string        // provider error code, e.g. "190" or "QUOTA_ERROR.RESOURCE_EXHAUSTED"
	Message    string        // provider message, safe to show to admins
	RetryAfter time.Duration // set for ErrRateLimited (and sometimes ErrTemporary)
	RequestID  string        // provider trace ID for support tickets
}

func (e *Error) Error() string {
	msg := fmt.Sprintf("%s: %v", e.Provider, e.Kind)
	if e.Code != "" {
		msg += " (" + e.Code + ")"
	}
	if e.Message != "" {
		msg += ": " + e.Message
	}
	if e.RetryAfter > 0 {
		msg += fmt.Sprintf(" [retry after %s]", e.RetryAfter)
	}
	return msg
}

func (e *Error) Unwrap() error { return e.Kind }

// RetryAfter returns the provider-suggested delay for a rate-limited or
// temporary error.
func RetryAfter(err error) (time.Duration, bool) {
	var pe *Error
	if errors.As(err, &pe) && pe.RetryAfter > 0 {
		return pe.RetryAfter, true
	}
	return 0, false
}

// Unsupported builds an ErrUnsupported error with a reason.
func Unsupported(p ads.Provider, format string, args ...any) error {
	return &Error{Provider: p, Kind: ErrUnsupported, Message: fmt.Sprintf(format, args...)}
}

// IsRetryable reports whether the job that got err should be retried later
// without user intervention.
func IsRetryable(err error) bool {
	return errors.Is(err, ErrRateLimited) || errors.Is(err, ErrTemporary)
}
