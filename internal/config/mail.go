package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/iamv1n/adwise/internal/platform/mailer"
)

// loadMail reads the outgoing email settings (see .env.example). With nothing
// set, the log driver is used and emails are only logged.
func loadMail() (mailer.Config, error) {
	cfg := mailer.Config{
		Driver:   os.Getenv("MAIL_DRIVER"),
		Host:     os.Getenv("SMTP_HOST"),
		Username: os.Getenv("SMTP_USERNAME"),
		Password: os.Getenv("SMTP_PASSWORD"),
		TLS:      os.Getenv("SMTP_TLS"),
		From:     getenv("MAIL_FROM", "Adwise <alerts@localhost>"),
	}
	if v := os.Getenv("SMTP_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil || p <= 0 || p > 65535 {
			return cfg, fmt.Errorf("SMTP_PORT: invalid port %q", v)
		}
		cfg.Port = p
	}
	var err error
	if cfg.Timeout, err = getDuration("SMTP_TIMEOUT", 0); err != nil {
		return cfg, err
	}
	return cfg, nil
}
