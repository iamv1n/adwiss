// Command api serves the Adwise HTTP API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/redis/go-redis/v9"

	"github.com/iamv1n/adwise/internal/analytics"
	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/config"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/integrations"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/platform/logging"
	"github.com/iamv1n/adwise/internal/platform/ratelimit"
	"github.com/iamv1n/adwise/internal/platform/redisx"
)

func main() {
	if err := run(); err != nil {
		slog.Error("api exited", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := logging.New(cfg.Env, cfg.LogLevel)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	rdb, err := redisx.Connect(ctx, cfg.RedisURL)
	if err != nil {
		return err
	}
	defer rdb.Close()

	srv := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           newRouter(cfg, db, rdb),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("api listening", "addr", cfg.APIAddr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

func newRouter(cfg config.Config, db *database.DB, rdb *redis.Client) http.Handler {
	authSvc := auth.NewService(db, cfg.SessionTTL)
	orgSvc := organizations.NewService(db, cfg.InvitationTTL)
	orgHandlers := organizations.NewHandlers(orgSvc, db, cfg.WebBaseURL)
	credentialLimit := ratelimit.New(rdb, "auth_credentials", 20, 15*time.Minute)
	authHandlers := auth.NewHandlers(authSvc, cfg.CookieSecure, orgHandlers.ListForMe, credentialLimit.ByIP)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	// RealIP trusts X-Forwarded-For; the API must only be reachable through the load balancer.
	r.Use(middleware.RealIP)
	r.Use(requestLogger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		checks := map[string]string{"postgres": "ok", "redis": "ok"}
		status := http.StatusOK
		if err := db.Pool.Ping(ctx); err != nil {
			checks["postgres"], status = err.Error(), http.StatusServiceUnavailable
		}
		if err := rdb.Ping(ctx).Err(); err != nil {
			checks["redis"], status = err.Error(), http.StatusServiceUnavailable
		}
		httpx.JSON(w, status, checks)
	})

	// Provider OAuth, account discovery and sync requests (internal/integrations).
	// The asynq client lives for the life of the process.
	integrationSvc, _ := integrations.NewFromConfig(cfg, db, rdb, entities.NewStore(db))
	integrationHandlers := integrations.NewHandlers(integrationSvc)

	r.Route("/v1", func(r chi.Router) {
		r.Mount("/auth", authHandlers.Routes())
		// OAuth callback: a provider browser redirect; the one-time state
		// authenticates it, so it sits outside RequireUser.
		integrationHandlers.RegisterPublic(r)
		r.Group(func(r chi.Router) {
			r.Use(authSvc.RequireUser)
			r.Mount("/orgs", orgHandlers.OrgRoutes())
			r.Mount("/invitations", orgHandlers.InvitationRoutes())

			// Canonical entities and analytics, registered as explicit
			// /orgs/{orgID}/... routes beside the /orgs mount (chi prefers them
			// and falls back to the mount for everything else).
			metricsRepo := metrics.NewPostgresRepository(db.Pool)
			r.Group(func(r chi.Router) {
				r.Use(organizations.RequireMember(db))
				entities.NewHandlers(entities.NewService(db, metricsRepo)).Register(r)
				analytics.NewHandlers(analytics.NewService(db, metricsRepo)).Register(r)
				integrationHandlers.Register(r)
			})
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) { httpx.WriteError(w, r, httpx.ErrNotFound) })
	return r
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		if r.URL.Path == "/healthz" {
			return
		}
		slog.InfoContext(r.Context(), "http request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"bytes", ww.BytesWritten(),
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", middleware.GetReqID(r.Context()),
		)
	})
}
