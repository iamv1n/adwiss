// Package sms sends text messages. The Log sender (default) writes the
// message to the log for development; the Twilio sender is used when
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are all set.
package sms

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Sender delivers one SMS to an E.164 number.
type Sender interface {
	Send(ctx context.Context, to, body string) error
}

// Config holds the Twilio credentials; empty means the log sender.
type Config struct {
	TwilioAccountSID string
	TwilioAuthToken  string
	TwilioFrom       string
}

// Enabled reports whether a real provider is configured.
func (c Config) Enabled() bool {
	return c.TwilioAccountSID != "" && c.TwilioAuthToken != "" && c.TwilioFrom != ""
}

// New returns the Twilio sender when configured, otherwise the log sender.
func New(cfg Config, log *slog.Logger) Sender {
	if log == nil {
		log = slog.Default()
	}
	if cfg.Enabled() {
		return &Twilio{AccountSID: cfg.TwilioAccountSID, AuthToken: cfg.TwilioAuthToken, From: cfg.TwilioFrom,
			Client: &http.Client{Timeout: 15 * time.Second}}
	}
	return &Log{log: log.With("component", "sms.log")}
}

// Log records messages instead of sending them (development only: the body
// contains the verification code).
type Log struct{ log *slog.Logger }

func NewLog(log *slog.Logger) *Log { return &Log{log: log.With("component", "sms.log")} }

func (l *Log) Send(ctx context.Context, to, body string) error {
	l.log.InfoContext(ctx, "sms not sent (set TWILIO_* to deliver)", "to", to, "body", body)
	return nil
}

// Twilio sends through the Twilio Messages REST API with plain net/http.
type Twilio struct {
	AccountSID string
	AuthToken  string
	From       string
	BaseURL    string // default https://api.twilio.com
	Client     *http.Client
}

func (t *Twilio) Send(ctx context.Context, to, body string) error {
	base := t.BaseURL
	if base == "" {
		base = "https://api.twilio.com"
	}
	form := url.Values{"To": {to}, "From": {t.From}, "Body": {body}}
	endpoint := fmt.Sprintf("%s/2010-04-01/Accounts/%s/Messages.json", strings.TrimRight(base, "/"), url.PathEscape(t.AccountSID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(t.AccountSID, t.AuthToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := t.Client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("twilio: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("twilio: status %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}
