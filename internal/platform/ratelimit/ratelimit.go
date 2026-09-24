// Package ratelimit provides a Redis fixed-window rate limiter, shared across API replicas.
package ratelimit

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/iamv1n/adwise/internal/platform/httpx"
)

var ErrTooManyRequests = httpx.NewError(http.StatusTooManyRequests, "rate_limited", "too many requests, try again later")

var incrScript = redis.NewScript(`
local n = redis.call("INCR", KEYS[1])
if n == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return {n, redis.call("PTTL", KEYS[1])}
`)

type Limiter struct {
	rdb    *redis.Client
	prefix string
	limit  int
	window time.Duration
}

func New(rdb *redis.Client, name string, limit int, window time.Duration) *Limiter {
	return &Limiter{rdb: rdb, prefix: "ratelimit:" + name + ":", limit: limit, window: window}
}

// Allow counts one hit for key and reports whether it is within the limit.
func (l *Limiter) Allow(ctx context.Context, key string) (bool, time.Duration, error) {
	res, err := incrScript.Run(ctx, l.rdb, []string{l.prefix + key}, l.window.Milliseconds()).Int64Slice()
	if err != nil {
		return false, 0, err
	}
	return res[0] <= int64(l.limit), time.Duration(res[1]) * time.Millisecond, nil
}

// ByIP limits requests per client IP. It fails open if Redis is unavailable, so
// a Redis outage does not lock everyone out.
func (l *Limiter) ByIP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if host, _, err := net.SplitHostPort(ip); err == nil {
			ip = host
		}
		ok, retryAfter, err := l.Allow(r.Context(), ip)
		if err != nil {
			slog.WarnContext(r.Context(), "rate limiter unavailable", "err", err)
		} else if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())+1))
			httpx.WriteError(w, r, ErrTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
