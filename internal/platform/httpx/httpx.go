// Package httpx holds JSON request/response helpers and the API error type.
package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-playground/validator/v10"
)

const maxBodyBytes = 1 << 20

var validate = validator.New(validator.WithRequiredStructEnabled())

// Error is an error that maps to a specific HTTP response.
type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func (e *Error) Error() string { return e.Message }

func NewError(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

var (
	ErrUnauthorized = NewError(http.StatusUnauthorized, "unauthorized", "authentication required")
	ErrForbidden    = NewError(http.StatusForbidden, "forbidden", "you do not have permission to perform this action")
	ErrNotFound     = NewError(http.StatusNotFound, "not_found", "resource not found")
)

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// WriteError renders err as JSON. Errors that are not *Error become a 500 and are logged.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		slog.ErrorContext(r.Context(), "unhandled error", "err", err, "method", r.Method, "path", r.URL.Path)
		apiErr = NewError(http.StatusInternalServerError, "internal", "internal server error")
	}
	JSON(w, apiErr.Status, map[string]*Error{"error": apiErr})
}

// Handler adapts a handler that returns an error into an http.HandlerFunc.
func Handler(fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			WriteError(w, r, err)
		}
	}
}

// Decode reads a JSON body into dst and validates it using `validate` struct tags.
// Requiring application/json also means a plain cross-site HTML form cannot submit.
func Decode(r *http.Request, dst any) error {
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		return NewError(http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json")
	}
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return NewError(http.StatusBadRequest, "invalid_json", fmt.Sprintf("invalid request body: %v", err))
	}

	if err := validate.Struct(dst); err != nil {
		var verrs validator.ValidationErrors
		if errors.As(err, &verrs) {
			fields := make(map[string]string, len(verrs))
			for _, fe := range verrs {
				fields[jsonFieldName(fe)] = fe.Tag()
			}
			e := NewError(http.StatusUnprocessableEntity, "validation_failed", "request validation failed")
			e.Fields = fields
			return e
		}
		return err
	}
	return nil
}

// jsonFieldName converts a validator field (Go struct name) to snake_case for the client.
func jsonFieldName(fe validator.FieldError) string {
	var b strings.Builder
	for i, r := range fe.Field() {
		if i > 0 && r >= 'A' && r <= 'Z' {
			b.WriteByte('_')
		}
		b.WriteRune(r)
	}
	return strings.ToLower(b.String())
}
