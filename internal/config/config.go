// Package config loads runtime configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Env         string
	LogLevel    string
	APIAddr     string
	DatabaseURL string
	RedisURL    string
	WebBaseURL  string

	SessionTTL    time.Duration
	InvitationTTL time.Duration
	CookieSecure  bool

	Integrations Integrations // provider OAuth + token encryption (integrations.go)
}

func (c Config) IsDevelopment() bool { return c.Env == "development" }

func Load() (Config, error) {
	// In development, .env is re-read on every start and wins over the inherited
	// environment, so editing it and restarting (air watches it) applies changes.
	if getenv("APP_ENV", "development") == "development" {
		if err := godotenv.Overload(); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return Config{}, fmt.Errorf("load .env: %w", err)
		}
	}

	cfg := Config{
		Env:         getenv("APP_ENV", "development"),
		LogLevel:    getenv("LOG_LEVEL", "info"),
		APIAddr:     getenv("API_ADDR", ":8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		RedisURL:    getenv("REDIS_URL", "redis://localhost:6379/0"),
		WebBaseURL:  getenv("WEB_BASE_URL", "http://localhost:3000"),
	}

	var err error
	if cfg.SessionTTL, err = getDuration("SESSION_TTL", 30*24*time.Hour); err != nil {
		return Config{}, err
	}
	if cfg.InvitationTTL, err = getDuration("INVITATION_TTL", 7*24*time.Hour); err != nil {
		return Config{}, err
	}
	if cfg.CookieSecure, err = getBool("COOKIE_SECURE", cfg.Env != "development"); err != nil {
		return Config{}, err
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.Integrations, err = loadIntegrations(cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	return d, nil
}

func getBool(key string, fallback bool) (bool, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s: %w", key, err)
	}
	return b, nil
}
