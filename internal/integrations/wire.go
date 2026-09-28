package integrations

import (
	"log/slog"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/config"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/secrets"
	"github.com/iamv1n/adwise/internal/queue"
)

// MustKeyring builds the token keyring. config.Load already validated the
// key, so failure here is a programming error.
func MustKeyring(cfg config.Integrations) *secrets.Keyring {
	kr, err := secrets.Parse(cfg.TokenEncryptionKey)
	if err != nil {
		panic("integrations: invalid TOKEN_ENCRYPTION_KEY: " + err.Error())
	}
	if cfg.TokenEncryptionKey == secrets.DevKeySpec {
		slog.Warn("using the public development token encryption key; set TOKEN_ENCRYPTION_KEY")
	}
	return kr
}

// NewFromConfig wires a Service for cmd/api and cmd/worker. st is the
// ads.Store (entities.NewStore). It also returns the asynq client used to
// enqueue sync tasks; callers close it on shutdown.
func NewFromConfig(cfg config.Config, db *database.DB, rdb *redis.Client, st ads.Store) (*Service, *asynq.Client) {
	var enq *asynq.Client
	if opt, err := queue.RedisOpt(cfg.RedisURL); err == nil {
		enq = asynq.NewClient(opt)
	} else {
		slog.Error("integrations: sync disabled, invalid REDIS_URL", "err", err)
	}
	svc := NewService(Options{
		DB: db, Redis: rdb, Keys: MustKeyring(cfg.Integrations), Store: st,
		Apps:       NewApps(cfg.Integrations, nil, slog.Default()),
		WebBaseURL: cfg.WebBaseURL, Logger: slog.Default(),
		MetaAppSecret: cfg.Integrations.MetaAppSecret, MetaWebhookVerifyToken: cfg.Integrations.MetaWebhookVerifyToken,
	})
	if enq != nil {
		svc.enqueuer = enq
	}
	return svc, enq
}
