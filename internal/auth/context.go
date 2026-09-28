package auth

import "context"

// WithPrincipal returns ctx carrying p, as RequireUser does. For tests and
// in-process callers that authenticate some other way.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}
