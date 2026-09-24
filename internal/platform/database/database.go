// Package database owns the PostgreSQL connection pool and transaction helper.
package database

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iamv1n/adwise/internal/store"
)

type DB struct {
	Pool *pgxpool.Pool
	*store.Queries
}

func Connect(ctx context.Context, url string) (*DB, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &DB{Pool: pool, Queries: store.New(pool)}, nil
}

func (db *DB) Close() { db.Pool.Close() }

// InTx runs fn inside a transaction, committing on success and rolling back on error.
func (db *DB) InTx(ctx context.Context, fn func(q *store.Queries) error) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit

	if err := fn(db.Queries.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// IsNotFound reports whether err means a query matched no rows.
func IsNotFound(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// IsUniqueViolation reports whether err is a unique constraint violation.
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
