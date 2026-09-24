// Package testdb gives each test package its own migrated PostgreSQL database.
//
// Usage:
//
//	func TestMain(m *testing.M) { os.Exit(testdb.Run(m)) }
//
//	func TestX(t *testing.T) {
//		db := testdb.New(t) // skips the test if Postgres is unreachable
//		...
//	}
//
// Run creates adwise_test_<random> on the server named by TEST_DATABASE_URL,
// DATABASE_URL (from the environment or the repository's .env), or the local
// docker-compose default, applies the embedded goose migrations, runs the
// tests and drops the database. Tests share the database within a package, so
// each test should create its own organization (see Fixture).
package testdb

import (
	"bufio"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver for goose
	"github.com/pressly/goose/v3"

	"github.com/iamv1n/adwise/db/migrations"
	"github.com/iamv1n/adwise/internal/platform/database"
)

const defaultURL = "postgres://adwise:adwise@localhost:5432/adwise?sslmode=disable"

var (
	shared     *database.DB
	skipReason string
)

// Run sets up the package database, runs the tests and tears it down.
func Run(m *testing.M) int {
	ctx := context.Background()
	baseURL := serverURL()
	admin, err := pgx.Connect(ctx, baseURL)
	if err != nil {
		skipReason = fmt.Sprintf("postgres unreachable (%v)", err)
		return m.Run()
	}
	defer admin.Close(ctx)

	name := "adwise_test_" + randomHex(6)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		skipReason = fmt.Sprintf("cannot create test database (%v)", err)
		return m.Run()
	}
	defer func() {
		_, _ = admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)")
	}()

	dbURL, err := withDatabase(baseURL, name)
	if err != nil {
		fmt.Fprintln(os.Stderr, "testdb:", err)
		return 1
	}
	if err := migrate(ctx, dbURL); err != nil {
		fmt.Fprintln(os.Stderr, "testdb: migrate:", err)
		return 1
	}
	shared, err = database.Connect(ctx, dbURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "testdb: connect:", err)
		return 1
	}
	defer shared.Close()
	return m.Run()
}

// New returns the package database, skipping t if it is unavailable. Run
// must be called from TestMain.
func New(t testing.TB) *database.DB {
	t.Helper()
	if shared == nil {
		if skipReason == "" {
			skipReason = "testdb.Run was not called from TestMain"
		}
		t.Skip("testdb: " + skipReason)
	}
	return shared
}

func migrate(ctx context.Context, dsn string) error {
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	p, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations.FS, goose.WithAllowOutofOrder(true))
	if err != nil {
		return err
	}
	_, err = p.Up(ctx)
	return err
}

func serverURL() string {
	for _, k := range []string{"TEST_DATABASE_URL", "DATABASE_URL"} {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	if v := dotenv("DATABASE_URL"); v != "" {
		return v
	}
	return defaultURL
}

// dotenv reads key from the nearest .env walking up from the working
// directory (go test runs in the package directory).
func dotenv(key string) string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		if f, err := os.Open(filepath.Join(dir, ".env")); err == nil {
			defer f.Close()
			sc := bufio.NewScanner(f)
			for sc.Scan() {
				line := strings.TrimSpace(sc.Text())
				if k, v, ok := strings.Cut(line, "="); ok && strings.TrimSpace(k) == key {
					return strings.Trim(strings.TrimSpace(v), `"'`)
				}
			}
			return ""
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func withDatabase(raw, name string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("parse database url: %w", err)
	}
	u.Path = "/" + name
	return u.String(), nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Fixture is an isolated tenant: a user, an organization owned by the user
// and one active integration per provider (with placeholder token bytes).
type Fixture struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID
	Integrations   map[string]uuid.UUID // provider → integration id
}

// NewFixture creates a fresh tenant so tests sharing the package database do
// not see each other's data.
func NewFixture(t testing.TB, db *database.DB) Fixture {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	suffix := randomHex(6)
	f := Fixture{Integrations: map[string]uuid.UUID{}}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users (email, name, password_hash) VALUES ($1, 'Test', 'x') RETURNING id`,
		"user-"+suffix+"@test.local").Scan(&f.UserID); err != nil {
		t.Fatalf("fixture user: %v", err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`,
		"org-"+suffix).Scan(&f.OrganizationID); err != nil {
		t.Fatalf("fixture org: %v", err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
		f.OrganizationID, f.UserID); err != nil {
		t.Fatalf("fixture membership: %v", err)
	}
	for _, p := range []string{"meta", "google"} {
		var id uuid.UUID
		if err := db.Pool.QueryRow(ctx, `
INSERT INTO integrations (organization_id, provider, external_user_id, access_token_encrypted)
VALUES ($1, $2::ad_provider, $3, '\x00') RETURNING id`, f.OrganizationID, p, "u-"+suffix).Scan(&id); err != nil {
			t.Fatalf("fixture integration: %v", err)
		}
		f.Integrations[p] = id
	}
	return f
}
