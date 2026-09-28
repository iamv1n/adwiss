// Command admin manages platform admins. It is the only way to grant admin
// rights; the API never does.
//
//	go run ./cmd/admin create <email> <name>   # new admin; password from ADMIN_PASSWORD or generated
//	go run ./cmd/admin grant <email>           # make an existing user an admin
//	go run ./cmd/admin revoke <email>          # remove admin rights
//	go run ./cmd/admin list
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/config"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/store"
)

const usage = `usage:
  admin create <email> <name>   create a platform admin (password: $ADMIN_PASSWORD, or generated)
  admin grant <email>           make an existing user a platform admin
  admin revoke <email>          remove platform admin rights
  admin list                    list platform admins`

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "admin:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New(usage)
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	switch {
	case args[0] == "create" && len(args) >= 3:
		return create(ctx, db, args[1], strings.Join(args[2:], " "))
	case args[0] == "grant" && len(args) == 2:
		return setAdmin(ctx, db, args[1], true)
	case args[0] == "revoke" && len(args) == 2:
		return setAdmin(ctx, db, args[1], false)
	case args[0] == "list":
		return list(ctx, db)
	}
	return errors.New(usage)
}

func create(ctx context.Context, db *database.DB, email, name string) error {
	password, generated := os.Getenv("ADMIN_PASSWORD"), false
	if password == "" {
		b := make([]byte, 18)
		if _, err := rand.Read(b); err != nil {
			return err
		}
		password, generated = base64.RawURLEncoding.EncodeToString(b), true
	}
	if len(password) < 10 {
		return errors.New("ADMIN_PASSWORD must be at least 10 characters")
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	err = db.InTx(ctx, func(q *store.Queries) error {
		u, err := q.CreateUser(ctx, store.CreateUserParams{Email: strings.TrimSpace(email), Name: name, PasswordHash: hash})
		if database.IsUniqueViolation(err) {
			return fmt.Errorf("%s already exists; use: admin grant %s", email, email)
		}
		if err != nil {
			return err
		}
		if _, err := q.SetPlatformAdmin(ctx, store.SetPlatformAdminParams{Email: u.Email, IsPlatformAdmin: true}); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{Action: "admin.granted", EntityType: "user", EntityID: u.ID.String(),
			Metadata: map[string]any{"email": u.Email, "via": "cli"}})
	})
	if err != nil {
		return err
	}
	fmt.Printf("created platform admin %s\n", email)
	if generated {
		fmt.Printf("password: %s\n(shown once; store it somewhere safe)\n", password)
	}
	return nil
}

func setAdmin(ctx context.Context, db *database.DB, email string, on bool) error {
	return db.InTx(ctx, func(q *store.Queries) error {
		u, err := q.SetPlatformAdmin(ctx, store.SetPlatformAdminParams{Email: strings.TrimSpace(email), IsPlatformAdmin: on})
		if database.IsNotFound(err) {
			return fmt.Errorf("no user with email %s", email)
		}
		if err != nil {
			return err
		}
		action := "admin.revoked"
		if on {
			action = "admin.granted"
		}
		if err := audit.Record(ctx, q, audit.Entry{Action: action, EntityType: "user", EntityID: u.ID.String(),
			Metadata: map[string]any{"email": u.Email, "via": "cli"}}); err != nil {
			return err
		}
		fmt.Printf("%s: %s\n", action, u.Email)
		return nil
	})
}

func list(ctx context.Context, db *database.DB) error {
	rows, err := db.Pool.Query(ctx, `SELECT email, name FROM users WHERE is_platform_admin ORDER BY email`)
	if err != nil {
		return err
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var email, name string
		if err := rows.Scan(&email, &name); err != nil {
			return err
		}
		fmt.Printf("%s\t%s\n", email, name)
		n++
	}
	if n == 0 {
		fmt.Println("no platform admins")
	}
	return rows.Err()
}
