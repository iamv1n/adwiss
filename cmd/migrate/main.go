// Command migrate applies the embedded database migrations.
//
// Usage: migrate [up|down|status|version]
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/iamv1n/adwise/db/migrations"
)

func main() {
	if err := run(); err != nil {
		slog.Error("migrate failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	command := "up"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	// Out-of-order is allowed because parallel workstreams reserve separate
	// version ranges (see db/migrations/README.md).
	provider, err := goose.NewProvider(goose.DialectPostgres, db, migrations.FS, goose.WithAllowOutofOrder(true))
	if err != nil {
		return err
	}
	ctx := context.Background()

	switch command {
	case "up":
		results, err := provider.Up(ctx)
		for _, r := range results {
			slog.Info("applied", "migration", r.Source.Path, "duration", r.Duration)
		}
		return err
	case "down":
		r, err := provider.Down(ctx)
		if r != nil {
			slog.Info("rolled back", "migration", r.Source.Path)
		}
		return err
	case "status":
		statuses, err := provider.Status(ctx)
		if err != nil {
			return err
		}
		for _, s := range statuses {
			fmt.Printf("%-40s %s\n", s.Source.Path, s.State)
		}
		return nil
	case "version":
		v, err := provider.GetDBVersion(ctx)
		if err != nil {
			return err
		}
		fmt.Println(v)
		return nil
	default:
		return fmt.Errorf("unknown command %q (want up|down|status|version)", command)
	}
}
