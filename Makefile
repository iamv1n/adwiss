SHELL := /bin/bash
-include .env
export

.PHONY: up down migrate migrate-down seed sqlc api worker web site dev-api dev-worker build test lint admin-create admin-grant admin-revoke admin-list

up: ## Start Postgres, Redis and Mailpit (inbox: http://localhost:8025)
	docker compose up -d --wait

down:
	docker compose down

migrate: ## Apply all migrations
	go run ./cmd/migrate up

migrate-down: ## Roll back the last migration
	go run ./cmd/migrate down

seed: ## Load idempotent demo data (demo@adwise.dev / demopassword1)
	go run ./cmd/seed

admin-create: ## Create a platform admin: make admin-create EMAIL=you@x.com NAME="You" [ADMIN_PASSWORD=...]
	go run ./cmd/admin create "$(EMAIL)" "$(NAME)"

admin-grant: ## Make an existing user a platform admin: make admin-grant EMAIL=you@x.com
	go run ./cmd/admin grant "$(EMAIL)"

admin-revoke: ## Remove platform admin rights: make admin-revoke EMAIL=you@x.com
	go run ./cmd/admin revoke "$(EMAIL)"

admin-list:
	go run ./cmd/admin list

sqlc: ## Regenerate type-safe query code
	sqlc generate -f db/sqlc.yaml

api:
	go run ./cmd/api

worker:
	go run ./cmd/worker

web:
	cd web && pnpm dev

site:
	cd site && pnpm dev

AIR := $(shell go env GOPATH)/bin/air
AIR_FLAGS = --build.exclude_dir "web,site,tmp,bin,plan,deployments" --build.include_ext "go,sql" --build.include_file ".env" --build.delay 500

dev-api: ## API with live reload (go install github.com/air-verse/air@latest)
	$(AIR) $(AIR_FLAGS) --build.cmd "go build -o tmp/api ./cmd/api" --build.entrypoint "tmp/api"

dev-worker: ## Worker with live reload
	$(AIR) $(AIR_FLAGS) --build.cmd "go build -o tmp/worker ./cmd/worker" --build.entrypoint "tmp/worker" --tmp_dir tmp/air-worker

build:
	go build -o bin/ ./cmd/...

test:
	go test ./...

lint:
	go vet ./...
