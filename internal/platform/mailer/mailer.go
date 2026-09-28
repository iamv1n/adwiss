// Package mailer sends transactional email. Callers build a Message and either
// send it directly (Mailer.Send) or, from request paths, hand it to the worker
// with Enqueue so HTTP requests never wait on an SMTP server.
//
// Two drivers exist: SMTP (standard library only; implicit TLS, STARTTLS or
// plain, PLAIN/LOGIN auth) and Log, which is used until SMTP is configured and
// records only the recipients and subject.
package mailer

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/mail"
	"strings"
	"time"
)

// Message is one email. To needs at least one address; at least one of Text
// and HTML must be set (sending both produces multipart/alternative).
type Message struct {
	To      []string          `json:"to"`
	Subject string            `json:"subject"`
	Text    string            `json:"text,omitempty"`
	HTML    string            `json:"html,omitempty"`
	ReplyTo string            `json:"reply_to,omitempty"`
	Headers map[string]string `json:"headers,omitempty"` // extra headers, e.g. List-Unsubscribe
}

// Mailer delivers a message.
type Mailer interface {
	Send(ctx context.Context, m Message) error
}

// Validate checks the message is sendable.
func (m Message) Validate() error {
	if len(m.To) == 0 {
		return errors.New("mailer: no recipients")
	}
	for _, to := range m.To {
		if _, err := mail.ParseAddress(to); err != nil {
			return fmt.Errorf("mailer: invalid recipient %q: %w", to, err)
		}
	}
	if m.ReplyTo != "" {
		if _, err := mail.ParseAddress(m.ReplyTo); err != nil {
			return fmt.Errorf("mailer: invalid reply-to: %w", err)
		}
	}
	if strings.TrimSpace(m.Subject) == "" {
		return errors.New("mailer: empty subject")
	}
	if m.Text == "" && m.HTML == "" {
		return errors.New("mailer: empty body")
	}
	for k, v := range m.Headers {
		if strings.ContainsAny(k, "\r\n: ") || strings.ContainsAny(v, "\r\n") {
			return fmt.Errorf("mailer: invalid header %q", k)
		}
	}
	return nil
}

// TLS modes for SMTP.
const (
	TLSImplicit = "implicit" // TLS from the first byte (usually port 465)
	TLSStartTLS = "starttls" // plain connect, then STARTTLS (usually 587); required
	TLSNone     = "none"     // no encryption (local catchers such as Mailpit on 1025)
)

// Drivers.
const (
	DriverSMTP = "smtp"
	DriverLog  = "log"
)

// Config selects and configures the driver (see internal/config and .env.example).
type Config struct {
	Driver   string // smtp | log; empty = smtp when Host is set, else log
	Host     string
	Port     int // 0 = derived from TLS (465 implicit, 587 starttls, 25 none)
	Username string
	Password string
	TLS      string // implicit | starttls | none; empty = implicit on 465, none on 1025/25, else starttls
	From     string // "Adwise <alerts@example.com>"
	Timeout  time.Duration
}

// New builds the configured Mailer.
func New(cfg Config, log *slog.Logger) (Mailer, error) {
	if log == nil {
		log = slog.Default()
	}
	driver := strings.ToLower(strings.TrimSpace(cfg.Driver))
	if driver == "" {
		driver = DriverLog
		if cfg.Host != "" {
			driver = DriverSMTP
		}
	}
	switch driver {
	case DriverLog:
		return NewLog(log), nil
	case DriverSMTP:
		return NewSMTP(cfg)
	default:
		return nil, fmt.Errorf("mailer: unknown MAIL_DRIVER %q (want smtp or log)", cfg.Driver)
	}
}

// Log writes a line per message instead of sending. Bodies are only logged at
// debug level; info shows recipients and subject.
type Log struct{ log *slog.Logger }

func NewLog(log *slog.Logger) *Log { return &Log{log: log.With("component", "mailer.log")} }

func (l *Log) Send(ctx context.Context, m Message) error {
	if err := m.Validate(); err != nil {
		return err
	}
	l.log.InfoContext(ctx, "email not sent (MAIL_DRIVER=log; set SMTP_HOST to deliver)", "to", m.To, "subject", m.Subject)
	l.log.DebugContext(ctx, "email body", "text", m.Text)
	return nil
}
