package mailer

import (
	"bufio"
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"io"
	"math/big"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSMTP is a minimal SMTP server that records the session.
type fakeSMTP struct {
	ln       net.Listener
	tlsCfg   *tls.Config
	implicit bool   // TLS from the first byte
	startTLS bool   // advertise STARTTLS
	authMech string // advertised AUTH mechanisms ("" = none)
	rcptCode int    // reply to RCPT (default 250)

	mu       sync.Mutex
	cmds     []string
	data     string
	authUser string
	authPass string
	sawTLS   bool
}

func newFake(t *testing.T, f *fakeSMTP) *fakeSMTP {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	f.ln = ln
	if f.tlsCfg == nil {
		f.tlsCfg = selfSigned(t)
	}
	if f.rcptCode == 0 {
		f.rcptCode = 250
	}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go f.serve(c)
		}
	}()
	t.Cleanup(func() { ln.Close() })
	return f
}

func (f *fakeSMTP) port() int { return f.ln.Addr().(*net.TCPAddr).Port }

func (f *fakeSMTP) serve(c net.Conn) {
	defer c.Close()
	isTLS := false
	if f.implicit {
		c = tls.Server(c, f.tlsCfg)
		isTLS = true
	}
	r, w := bufio.NewReader(c), bufio.NewWriter(c)
	reply := func(s string) { w.WriteString(s + "\r\n"); w.Flush() }
	reply("220 fake ESMTP")
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		f.mu.Lock()
		f.cmds = append(f.cmds, strings.SplitN(line, " ", 2)[0])
		if isTLS {
			f.sawTLS = true
		}
		f.mu.Unlock()
		up := strings.ToUpper(line)
		switch {
		case strings.HasPrefix(up, "EHLO"):
			w.WriteString("250-fake\r\n")
			if f.startTLS && !isTLS {
				w.WriteString("250-STARTTLS\r\n")
			}
			if f.authMech != "" {
				w.WriteString("250-AUTH " + f.authMech + "\r\n")
			}
			reply("250 8BITMIME")
		case up == "STARTTLS":
			reply("220 go ahead")
			tc := tls.Server(c, f.tlsCfg)
			if err := tc.Handshake(); err != nil {
				return
			}
			c, isTLS = tc, true
			r, w = bufio.NewReader(c), bufio.NewWriter(c)
		case strings.HasPrefix(up, "AUTH PLAIN"):
			raw, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(line[len("AUTH PLAIN"):]))
			parts := strings.Split(string(raw), "\x00")
			f.mu.Lock()
			f.authUser, f.authPass = parts[1], parts[2]
			f.mu.Unlock()
			reply("235 ok")
		case strings.HasPrefix(up, "AUTH LOGIN"):
			reply("334 " + base64.StdEncoding.EncodeToString([]byte("Username:")))
			u, _ := r.ReadString('\n')
			reply("334 " + base64.StdEncoding.EncodeToString([]byte("Password:")))
			p, _ := r.ReadString('\n')
			du, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(u))
			dp, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(p))
			f.mu.Lock()
			f.authUser, f.authPass = string(du), string(dp)
			f.mu.Unlock()
			reply("235 ok")
		case strings.HasPrefix(up, "MAIL FROM"):
			reply("250 ok")
		case strings.HasPrefix(up, "RCPT TO"):
			reply(strconv.Itoa(f.rcptCode) + " rcpt")
		case up == "DATA":
			reply("354 send")
			var b strings.Builder
			for {
				l, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if l == ".\r\n" {
					break
				}
				b.WriteString(strings.TrimPrefix(l, "."))
			}
			f.mu.Lock()
			f.data = b.String()
			f.mu.Unlock()
			reply("250 queued")
		case up == "QUIT":
			reply("221 bye")
			return
		default:
			reply("250 ok")
		}
	}
}

func selfSigned(t *testing.T) *tls.Config {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "127.0.0.1"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	return &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}}
}

func client(t *testing.T, f *fakeSMTP, mode, user string) *SMTP {
	t.Helper()
	s, err := NewSMTP(Config{Host: "127.0.0.1", Port: f.port(), TLS: mode, Username: user, Password: "s3cret", From: "Adwise Alerts <alerts@adwise.test>", Timeout: 5 * time.Second})
	require.NoError(t, err)
	s.TLSConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // test server
	return s
}

var msg = Message{
	To:      []string{"Zoë <zoe@example.com>", "ops@example.com"},
	Subject: "Spend spike: Été campaign ✓",
	Text:    "Hello Zoë,\nyour campaign spent ₹5,000.\n",
	HTML:    "<p>Hello Zoë</p>",
	ReplyTo: "support@adwise.test",
	Headers: map[string]string{"X-Adwise-Kind": "alerts"},
}

func TestSendModes(t *testing.T) {
	cases := []struct {
		name, mode, auth, user string
		implicit, startTLS     bool
		wantTLS                bool
	}{
		{name: "plain no auth (mailpit)", mode: TLSNone},
		{name: "plain auth on loopback", mode: TLSNone, auth: "PLAIN", user: "u"},
		{name: "starttls plain auth", mode: TLSStartTLS, startTLS: true, auth: "PLAIN LOGIN", user: "u", wantTLS: true},
		{name: "starttls login auth", mode: TLSStartTLS, startTLS: true, auth: "LOGIN", user: "u", wantTLS: true},
		{name: "implicit tls", mode: TLSImplicit, implicit: true, auth: "PLAIN", user: "u", wantTLS: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFake(t, &fakeSMTP{implicit: tc.implicit, startTLS: tc.startTLS, authMech: tc.auth})
			require.NoError(t, client(t, f, tc.mode, tc.user).Send(context.Background(), msg))
			f.mu.Lock()
			defer f.mu.Unlock()
			assert.Equal(t, tc.wantTLS, f.sawTLS)
			if tc.user != "" {
				assert.Equal(t, "u", f.authUser)
				assert.Equal(t, "s3cret", f.authPass)
				assert.Contains(t, f.cmds, "AUTH")
			} else {
				assert.NotContains(t, f.cmds, "AUTH")
			}
			if tc.mode == TLSStartTLS {
				assert.Contains(t, f.cmds, "STARTTLS")
			}
			assert.NotEmpty(t, f.data)
		})
	}
}

func TestStartTLSRequired(t *testing.T) {
	f := newFake(t, &fakeSMTP{})
	err := client(t, f, TLSStartTLS, "").Send(context.Background(), msg)
	require.Error(t, err)
	assert.True(t, IsPermanent(err))
}

func TestRejectedRecipientIsPermanent(t *testing.T) {
	f := newFake(t, &fakeSMTP{rcptCode: 550})
	err := client(t, f, TLSNone, "").Send(context.Background(), msg)
	require.Error(t, err)
	assert.True(t, IsPermanent(err))
}

func TestCredentialsNotSentInClear(t *testing.T) {
	a := &plainAuth{user: "u", pass: "p", host: "smtp.example.com"}
	_, _, err := a.Start(&smtp.ServerInfo{Name: "smtp.example.com", TLS: false})
	require.Error(t, err)
	_, _, err = a.Start(&smtp.ServerInfo{Name: "smtp.example.com", TLS: true})
	require.NoError(t, err)
}

func TestMIMEOutput(t *testing.T) {
	f := newFake(t, &fakeSMTP{})
	require.NoError(t, client(t, f, TLSNone, "").Send(context.Background(), msg))
	f.mu.Lock()
	raw := f.data
	f.mu.Unlock()

	for _, line := range strings.Split(strings.TrimSuffix(raw, "\r\n"), "\r\n") {
		assert.LessOrEqual(t, len(line), 998)
	}
	m, err := mail.ReadMessage(strings.NewReader(raw))
	require.NoError(t, err)
	dec := new(mime.WordDecoder)
	subj, err := dec.DecodeHeader(m.Header.Get("Subject"))
	require.NoError(t, err)
	assert.Equal(t, msg.Subject, subj)
	to, err := m.Header.AddressList("To")
	require.NoError(t, err)
	require.Len(t, to, 2)
	assert.Equal(t, "Zoë", to[0].Name)
	from, err := m.Header.AddressList("From")
	require.NoError(t, err)
	assert.Equal(t, "alerts@adwise.test", from[0].Address)
	assert.Equal(t, "support@adwise.test", strings.Trim(m.Header.Get("Reply-To"), "<>"))
	assert.Regexp(t, `^<[0-9a-f]{32}@adwise\.test>$`, m.Header.Get("Message-Id"))
	_, err = m.Header.Date()
	require.NoError(t, err)
	assert.Equal(t, "1.0", m.Header.Get("Mime-Version"))
	assert.Equal(t, "alerts", m.Header.Get("X-Adwise-Kind"))

	mt, params, err := mime.ParseMediaType(m.Header.Get("Content-Type"))
	require.NoError(t, err)
	assert.Equal(t, "multipart/alternative", mt)
	mr := multipart.NewReader(m.Body, params["boundary"])
	var types, bodies []string
	for {
		p, err := mr.NextRawPart()
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		assert.Equal(t, "quoted-printable", p.Header.Get("Content-Transfer-Encoding"))
		b, err := io.ReadAll(quotedprintable.NewReader(p))
		require.NoError(t, err)
		types = append(types, p.Header.Get("Content-Type"))
		bodies = append(bodies, string(b))
	}
	assert.Equal(t, []string{"text/plain; charset=utf-8", "text/html; charset=utf-8"}, types)
	assert.Equal(t, "Hello Zoë,\r\nyour campaign spent ₹5,000.\r\n", bodies[0])
	assert.Equal(t, msg.HTML, bodies[1])
}

func TestSinglePartAndDotStuffing(t *testing.T) {
	f := newFake(t, &fakeSMTP{})
	m := Message{To: []string{"a@example.com"}, Subject: "Plain", Text: "line\n.starts with dot\n"}
	require.NoError(t, client(t, f, TLSNone, "").Send(context.Background(), m))
	f.mu.Lock()
	defer f.mu.Unlock()
	parsed, err := mail.ReadMessage(strings.NewReader(f.data))
	require.NoError(t, err)
	assert.Equal(t, "text/plain; charset=utf-8", parsed.Header.Get("Content-Type"))
	b, _ := io.ReadAll(quotedprintable.NewReader(parsed.Body))
	assert.Equal(t, "line\r\n.starts with dot\r\n", string(b))
}

func TestResolveTLSAndDriver(t *testing.T) {
	cases := []struct {
		mode      string
		port      int
		wantMode  string
		wantPort  int
		wantError bool
	}{
		{"", 465, TLSImplicit, 465, false},
		{"", 587, TLSStartTLS, 587, false},
		{"", 1025, TLSNone, 1025, false},
		{"", 0, TLSStartTLS, 587, false},
		{TLSImplicit, 0, TLSImplicit, 465, false},
		{"ssl", 0, TLSImplicit, 465, false},
		{TLSNone, 2525, TLSNone, 2525, false},
		{"bogus", 25, "", 0, true},
	}
	for _, tc := range cases {
		mode, port, err := resolveTLS(tc.mode, tc.port)
		if tc.wantError {
			assert.Error(t, err)
			continue
		}
		require.NoError(t, err)
		assert.Equal(t, tc.wantMode, mode, tc)
		assert.Equal(t, tc.wantPort, port, tc)
	}

	m, err := New(Config{}, nil)
	require.NoError(t, err)
	assert.IsType(t, &Log{}, m)
	m, err = New(Config{Host: "localhost", Port: 1025, From: "a@b.c"}, nil)
	require.NoError(t, err)
	assert.IsType(t, &SMTP{}, m)
	_, err = New(Config{Driver: "smtp"}, nil)
	assert.Error(t, err)
	_, err = New(Config{Driver: "carrier-pigeon"}, nil)
	assert.Error(t, err)
}

func TestValidate(t *testing.T) {
	assert.Error(t, Message{Subject: "x", Text: "y"}.Validate())
	assert.Error(t, Message{To: []string{"nope"}, Subject: "x", Text: "y"}.Validate())
	assert.Error(t, Message{To: []string{"a@b.c"}, Text: "y"}.Validate())
	assert.Error(t, Message{To: []string{"a@b.c"}, Subject: "x"}.Validate())
	assert.Error(t, Message{To: []string{"a@b.c"}, Subject: "x", Text: "y", Headers: map[string]string{"X-A": "b\r\nBcc: evil@x"}}.Validate())
	assert.NoError(t, Message{To: []string{"a@b.c"}, Subject: "x", Text: "y"}.Validate())
}

func TestTemplate(t *testing.T) {
	html, text, err := Email{
		Heading:    "2 new alerts",
		Paragraphs: []string{"Hi <there>"},
		Items:      []Item{{Title: "Spend spike", Body: "₹5,000", Tone: "critical", Link: &Link{Label: "View", URL: "https://app/x?a=1&b=2"}}},
		Button:     &Link{Label: "Open Adwise", URL: "https://app"},
		Reason:     "You get this because you are an admin.",
		Manage:     &Link{Label: "Manage alerts", URL: "https://app/settings/alerts"},
	}.Render()
	require.NoError(t, err)
	assert.Contains(t, html, "Hi &lt;there&gt;")
	assert.Contains(t, html, "https://app/x?a=1&amp;b=2")
	assert.Contains(t, html, "#dc2626")
	assert.Contains(t, text, "- Spend spike\n  ₹5,000\n  https://app/x?a=1&b=2")
	assert.Contains(t, text, "Manage alerts: https://app/settings/alerts")
}

func TestBuildMessageInlinesLogo(t *testing.T) {
	html, text, err := Email{Heading: "Sign in", Code: "482913", CodeNote: "Expires in 10 minutes"}.Render()
	require.NoError(t, err)
	assert.Contains(t, html, "cid:"+LogoCID)
	assert.Contains(t, html, "482 913")
	assert.Contains(t, text, "482913")

	raw, err := buildMessage(&mail.Address{Address: "from@example.com"}, Message{To: []string{"a@example.com"}, Subject: "Code", Text: text, HTML: html}, time.Now())
	require.NoError(t, err)
	msg, err := mail.ReadMessage(bytes.NewReader(raw))
	require.NoError(t, err)
	mt, params, err := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	require.NoError(t, err)
	assert.Equal(t, "multipart/related", mt)

	r := multipart.NewReader(msg.Body, params["boundary"])
	first, err := r.NextPart()
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(first.Header.Get("Content-Type"), "multipart/alternative"))
	_, _ = io.Copy(io.Discard, first)
	img, err := r.NextPart()
	require.NoError(t, err)
	assert.Equal(t, "<"+LogoCID+">", img.Header.Get("Content-Id"))
	data, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, img))
	require.NoError(t, err)
	assert.Equal(t, logoPNG, data)
}
