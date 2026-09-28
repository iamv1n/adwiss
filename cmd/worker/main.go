// Command worker processes background jobs from the Redis queues and runs
// periodic schedules.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/hibiken/asynq"

	"github.com/iamv1n/adwise/internal/alerts"
	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/automation"
	"github.com/iamv1n/adwise/internal/config"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/integrations"
	"github.com/iamv1n/adwise/internal/leads"
	"github.com/iamv1n/adwise/internal/manage"
	"github.com/iamv1n/adwise/internal/metrics"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/logging"
	"github.com/iamv1n/adwise/internal/platform/mailer"
	"github.com/iamv1n/adwise/internal/platform/redisx"
	"github.com/iamv1n/adwise/internal/queue"
	"github.com/iamv1n/adwise/internal/recommendations"
)

func main() {
	if err := run(); err != nil {
		slog.Error("worker exited", "err", err)
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

	redisOpt, err := queue.RedisOpt(cfg.RedisURL)
	if err != nil {
		return err
	}

	srv := asynq.NewServer(redisOpt, asynq.Config{
		Concurrency: 20,
		Queues:      queue.Weights,
		Logger:      slogAdapter{logger.With("component", "asynq")},
		ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, t *asynq.Task, err error) {
			slog.ErrorContext(ctx, "task failed", "type", t.Type(), "err", err)
		}),
		// Honours provider Retry-After on rate limits; exponential otherwise.
		RetryDelayFunc: integrations.RetryDelay,
		IsFailure:      integrations.IsFailure,
	})

	mux := asynq.NewServeMux()

	// Provider sync jobs (internal/integrations), writing through the entities store.
	rdb, err := redisx.Connect(ctx, cfg.RedisURL)
	if err != nil {
		return err
	}
	defer rdb.Close()
	adsStore := entities.NewStore(db)
	integrationSvc, syncEnqueuer := integrations.NewFromConfig(cfg, db, rdb, adsStore)
	if syncEnqueuer != nil {
		defer syncEnqueuer.Close()
		integrations.NewWorker(integrationSvc, adsStore, rdb, syncEnqueuer).WithLeads(leads.NewStore(db.Pool)).Register(mux)
	}

	// Dayparting schedules and automation rules: evaluation and execution
	// through internal/manage (internal/automation).
	if syncEnqueuer != nil {
		manageSvc := manage.NewService(db, integrationSvc, entities.NewService(db, metrics.NewPostgresRepository(db.Pool)), adsStore)
		automationSvc := automation.NewService(db, automation.ManageMutator{Svc: manageSvc})
		automation.NewWorker(automationSvc, syncEnqueuer).Register(mux)
		recommendations.NewWorker(recommendations.NewService(db, automationSvc)).Register(mux)
	}
	// Email delivery (mail:send) and hourly alert detection (internal/alerts).
	mail, err := mailer.New(cfg.Mail, logger)
	if err != nil {
		return err
	}
	mailer.Register(mux, mail)
	mailEnqueuer := asynq.NewClient(redisOpt)
	defer mailEnqueuer.Close()
	alerts.NewService(db, mailEnqueuer, cfg.WebBaseURL).Register(mux)
	mux.HandleFunc(queue.TaskCleanupSessions, func(ctx context.Context, _ *asynq.Task) error {
		n, err := db.DeleteExpiredSessions(ctx)
		if err != nil {
			return err
		}
		slog.InfoContext(ctx, "expired sessions cleaned up", "deleted", n)
		if n, err := auth.CleanupSecurityData(ctx, db.Pool); err != nil {
			return err
		} else if n > 0 {
			slog.InfoContext(ctx, "expired auth codes/challenges/events cleaned up", "deleted", n)
		}
		return nil
	})

	// The scheduler enqueues periodic tasks. Running it in every worker replica
	// would enqueue duplicates, so production should run exactly one instance.
	scheduler := asynq.NewScheduler(redisOpt, &asynq.SchedulerOpts{Logger: slogAdapter{logger.With("component", "scheduler")}})
	if _, err := scheduler.Register("@hourly", asynq.NewTask(queue.TaskCleanupSessions, nil), asynq.Queue(queue.QueueMaintenance)); err != nil {
		return fmt.Errorf("register schedule: %w", err)
	}
	// Evaluate enabled dayparting schedules and due automation rules.
	if _, err := scheduler.Register(automation.TickSpec, asynq.NewTask(automation.TaskTick, nil), asynq.Queue(queue.QueueDaypartingEvaluation)); err != nil {
		return fmt.Errorf("register schedule: %w", err)
	}
	// Regenerate the recommendations inbox (internal/recommendations).
	if _, err := scheduler.Register(recommendations.GenerateSpec, asynq.NewTask(recommendations.TaskGenerate, nil), asynq.Queue(queue.QueueAutomationEvaluation)); err != nil {
		return fmt.Errorf("register schedule: %w", err)
	}
	// Detect alerts (spend spikes, ROAS drops, stopped delivery, reconnects, failed actions).
	if _, err := scheduler.Register(alerts.RunSpec, alerts.NewRunTask(), asynq.Queue(queue.QueueNotifications)); err != nil {
		return fmt.Errorf("register schedule: %w", err)
	}
	// Refresh accounts, entities and recent metrics for every active integration.
	if _, err := scheduler.Register("@hourly", asynq.NewTask(queue.TaskIntegrationSyncAll, nil), asynq.Queue(queue.QueueAccountSync)); err != nil {
		return fmt.Errorf("register schedule: %w", err)
	}

	if err := scheduler.Start(); err != nil {
		return fmt.Errorf("start scheduler: %w", err)
	}
	defer scheduler.Shutdown()

	if err := srv.Start(mux); err != nil {
		return fmt.Errorf("start worker: %w", err)
	}
	slog.Info("worker started", "queues", len(queue.Weights))

	<-ctx.Done()
	slog.Info("shutting down")
	srv.Shutdown()
	return nil
}

// slogAdapter routes asynq's internal logs through slog.
type slogAdapter struct{ l *slog.Logger }

func (a slogAdapter) Debug(args ...any) { a.l.Debug(fmt.Sprint(args...)) }
func (a slogAdapter) Info(args ...any)  { a.l.Info(fmt.Sprint(args...)) }
func (a slogAdapter) Warn(args ...any)  { a.l.Warn(fmt.Sprint(args...)) }
func (a slogAdapter) Error(args ...any) { a.l.Error(fmt.Sprint(args...)) }
func (a slogAdapter) Fatal(args ...any) { a.l.Error(fmt.Sprint(args...)); os.Exit(1) }
