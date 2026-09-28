package mailer

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"slices"
	"strconv"
	"strings"
	"time"
)

// SMTP sends through an SMTP server with the standard library. Each Send opens
// one connection (transactional volume does not warrant pooling).
type SMTP struct {
	host     string
	port     int
	tlsMode  string
	username string
	password string
	from     *mail.Address
	timeout  time.Duration

	// TLSConfig is used for implicit TLS and STARTTLS; tests override it.
	TLSConfig *tls.Config
	now       func() time.Time
}

// NewSMTP validates cfg and resolves the port/TLS defaults.
func NewSMTP(cfg Config) (*SMTP, error) {
	if cfg.Host == "" {
		return nil, errors.New("mailer: SMTP_HOST is required for MAIL_DRIVER=smtp")
	}
	if cfg.From == "" {
		return nil, errors.New("mailer: MAIL_FROM is required for MAIL_DRIVER=smtp")
	}
	from, err := mail.ParseAddress(cfg.From)
	if err != nil {
		return nil, fmt.Errorf("mailer: invalid MAIL_FROM: %w", err)
	}
	mode, port, err := resolveTLS(strings.ToLower(strings.TrimSpace(cfg.TLS)), cfg.Port)
	if err != nil {
		return nil, err
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &SMTP{
		host: cfg.Host, port: port, tlsMode: mode,
		username: cfg.Username, password: cfg.Password,
		from: from, timeout: timeout,
		TLSConfig: &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12},
		now:       time.Now,
	}, nil
}

// resolveTLS fills in whichever of mode/port is missing from the other.
func resolveTLS(mode string, port int) (string, int, error) {
	switch mode {
	case "":
		switch port {
		case 465:
			mode = TLSImplicit
		case 25, 1025:
			mode = TLSNone
		default:
			mode = TLSStartTLS
		}
	case TLSImplicit, TLSStartTLS, TLSNone:
	case "tls", "ssl":
		mode = TLSImplicit
	default:
		return "", 0, fmt.Errorf("mailer: invalid SMTP_TLS %q (want implicit, starttls or none)", mode)
	}
	if port == 0 {
		port = map[string]int{TLSImplicit: 465, TLSStartTLS: 587, TLSNone: 25}[mode]
	}
	return mode, port, nil
}

// Mode reports the resolved TLS mode and port.
func (s *SMTP) Mode() (string, int) { return s.tlsMode, s.port }

func (s *SMTP) Send(ctx context.Context, m Message) error {
	if err := m.Validate(); err != nil {
		return Permanent(err)
	}
	raw, err := buildMessage(s.from, m, s.now())
	if err != nil {
		return Permanent(err)
	}

	deadline := time.Now().Add(s.timeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	addr := net.JoinHostPort(s.host, strconv.Itoa(s.port))
	dialer := &net.Dialer{Deadline: deadline}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp dial %s: %w", addr, err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(deadline)
	if s.tlsMode == TLSImplicit {
		tc := tls.Client(conn, s.TLSConfig)
		if err := tc.HandshakeContext(ctx); err != nil {
			return fmt.Errorf("smtp tls handshake: %w", err)
		}
		conn = tc
	}

	c, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return fmt.Errorf("smtp greeting: %w", classify(err))
	}
	defer c.Close()
	if err := c.Hello("localhost"); err != nil {
		return fmt.Errorf("smtp ehlo: %w", classify(err))
	}
	if s.tlsMode == TLSStartTLS {
		if ok, _ := c.Extension("STARTTLS"); !ok {
			return Permanent(errors.New("smtp: server does not support STARTTLS (set SMTP_TLS=none only for local catchers)"))
		}
		if err := c.StartTLS(s.TLSConfig); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if s.username != "" {
		auth, err := s.auth(c)
		if err != nil {
			return Permanent(err)
		}
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", classify(err))
		}
	}
	if err := c.Mail(s.from.Address); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", classify(err))
	}
	for _, to := range m.To {
		a, _ := mail.ParseAddress(to) // validated above
		if err := c.Rcpt(a.Address); err != nil {
			return fmt.Errorf("smtp RCPT TO: %w", classify(err))
		}
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", classify(err))
	}
	if _, err := w.Write(raw); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp end of data: %w", classify(err))
	}
	return c.Quit()
}

// auth picks PLAIN or LOGIN from the server's advertised mechanisms.
func (s *SMTP) auth(c *smtp.Client) (smtp.Auth, error) {
	ok, mechs := c.Extension("AUTH")
	if !ok {
		return nil, errors.New("smtp: SMTP_USERNAME is set but the server does not offer AUTH")
	}
	list := strings.Fields(strings.ToUpper(mechs))
	switch {
	case slices.Contains(list, "PLAIN"):
		return &plainAuth{user: s.username, pass: s.password, host: s.host}, nil
	case slices.Contains(list, "LOGIN"):
		return &loginAuth{user: s.username, pass: s.password, host: s.host}, nil
	}
	return nil, fmt.Errorf("smtp: no supported AUTH mechanism in %q (want PLAIN or LOGIN)", mechs)
}

// credentialsAllowed refuses to send a password over an unencrypted
// connection except to a loopback server.
func credentialsAllowed(server *smtp.ServerInfo, host string) error {
	if server.TLS || host == "localhost" || net.ParseIP(host).IsLoopback() {
		return nil
	}
	return errors.New("smtp: refusing to send credentials over an unencrypted connection (use SMTP_TLS=starttls or implicit)")
}

type plainAuth struct{ user, pass, host string }

func (a *plainAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if err := credentialsAllowed(server, a.host); err != nil {
		return "", nil, err
	}
	return "PLAIN", []byte("\x00" + a.user + "\x00" + a.pass), nil
}

func (a *plainAuth) Next(_ []byte, more bool) ([]byte, error) {
	if more {
		return nil, errors.New("smtp: unexpected PLAIN challenge")
	}
	return nil, nil
}

type loginAuth struct{ user, pass, host string }

func (a *loginAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if err := credentialsAllowed(server, a.host); err != nil {
		return "", nil, err
	}
	return "LOGIN", nil, nil
}

func (a *loginAuth) Next(challenge []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(string(challenge))) {
	case "username:", "user name", "username":
		return []byte(a.user), nil
	case "password:", "password":
		return []byte(a.pass), nil
	}
	return nil, fmt.Errorf("smtp: unexpected LOGIN challenge %q", challenge)
}

// permanentError marks failures that retrying cannot fix (5xx replies,
// invalid messages); the worker skips retries for them.
type permanentError struct{ err error }

func (e *permanentError) Error() string { return e.err.Error() }
func (e *permanentError) Unwrap() error { return e.err }

// Permanent wraps err so IsPermanent reports true.
func Permanent(err error) error {
	if err == nil {
		return nil
	}
	return &permanentError{err}
}

// IsPermanent reports whether err should not be retried.
func IsPermanent(err error) bool {
	var p *permanentError
	return errors.As(err, &p)
}

func classify(err error) error {
	var te *textproto.Error
	if errors.As(err, &te) && te.Code >= 500 {
		return Permanent(err)
	}
	return err
}
