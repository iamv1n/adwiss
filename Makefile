SHELL := /bin/bash
-include .env
export

.PHONY: up down migrate migrate-down seed sqlc api worker web dev-api dev-worker build test lint

up: ## Start Postgres and Redis
	docker compose up -d --wait

down:
	docker compose down

migrate: ## Apply all migrations
	go run ./cmd/migrate up

migrate-down: ## Roll back the last migration
	go run ./cmd/migrate down

seed: ## Load idempotent demo data (demo@adwise.dev / demopassword1)
	go run ./cmd/seed

sqlc: ## Regenerate type-safe query code
	sqlc generate -f db/sqlc.yaml

api:
	go run ./cmd/api

worker:
	go run ./cmd/worker

web:
	cd web && pnpm dev

AIR := $(shell go env GOPATH)/bin/air
AIR_FLAGS = --build.exclude_dir "web,tmp,bin,plan,deployments" --build.include_ext "go,sql" --build.include_file ".env" --build.delay 500

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
