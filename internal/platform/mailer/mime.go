package mailer

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"net/textproto"
	"sort"
	"strings"
	"time"
)

// buildMessage renders m as an RFC 5322 message with CRLF line endings.
// Header values are RFC 2047 encoded when not ASCII; bodies are UTF-8,
// quoted-printable, and multipart/alternative when both Text and HTML are set.
func buildMessage(from *mail.Address, m Message, now time.Time) ([]byte, error) {
	var buf bytes.Buffer
	header := func(k, v string) { fmt.Fprintf(&buf, "%s: %s\r\n", k, v) }

	to := make([]string, len(m.To))
	for i, addr := range m.To {
		a, err := mail.ParseAddress(addr)
		if err != nil {
			return nil, fmt.Errorf("mailer: invalid recipient %q: %w", addr, err)
		}
		to[i] = a.String()
	}

	header("From", from.String())
	header("To", strings.Join(to, ", "))
	if m.ReplyTo != "" {
		a, err := mail.ParseAddress(m.ReplyTo)
		if err != nil {
			return nil, fmt.Errorf("mailer: invalid reply-to: %w", err)
		}
		header("Reply-To", a.String())
	}
	header("Subject", mime.QEncoding.Encode("utf-8", m.Subject))
	header("Date", now.Format(time.RFC1123Z))
	header("Message-ID", messageID(from.Address))
	header("MIME-Version", "1.0")
	keys := make([]string, 0, len(m.Headers))
	for k := range m.Headers {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		header(textproto.CanonicalMIMEHeaderKey(k), mime.QEncoding.Encode("utf-8", m.Headers[k]))
	}

	inlineLogo := m.HTML != "" && strings.Contains(m.HTML, "cid:"+LogoCID)
	switch {
	case inlineLogo:
		// multipart/related { multipart/alternative { text, html }, logo.png }
		rel := multipart.NewWriter(&buf)
		header("Content-Type", mime.FormatMediaType("multipart/related", map[string]string{"boundary": rel.Boundary(), "type": "multipart/alternative"}))
		buf.WriteString("\r\n")
		alt := multipart.NewWriter(nil)
		w, err := rel.CreatePart(textproto.MIMEHeader{
			"Content-Type": {mime.FormatMediaType("multipart/alternative", map[string]string{"boundary": alt.Boundary()})},
		})
		if err != nil {
			return nil, err
		}
		if err := writeAlternative(w, alt.Boundary(), m.Text, m.HTML); err != nil {
			return nil, err
		}
		img, err := rel.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {`image/png; name="adwise-logo.png"`},
			"Content-Transfer-Encoding": {"base64"},
			"Content-Id":                {"<" + LogoCID + ">"},
			"Content-Disposition":       {`inline; filename="adwise-logo.png"`},
		})
		if err != nil {
			return nil, err
		}
		if err := writeBase64(img, logoPNG); err != nil {
			return nil, err
		}
		if err := rel.Close(); err != nil {
			return nil, err
		}
	case m.Text != "" && m.HTML != "":
		mw := multipart.NewWriter(&buf)
		header("Content-Type", mime.FormatMediaType("multipart/alternative", map[string]string{"boundary": mw.Boundary()}))
		buf.WriteString("\r\n")
		for _, p := range []struct{ typ, body string }{{"text/plain", m.Text}, {"text/html", m.HTML}} {
			w, err := mw.CreatePart(textproto.MIMEHeader{
				"Content-Type":              {p.typ + "; charset=utf-8"},
				"Content-Transfer-Encoding": {"quoted-printable"},
			})
			if err != nil {
				return nil, err
			}
			if err := writeQP(w, p.body); err != nil {
				return nil, err
			}
		}
		if err := mw.Close(); err != nil {
			return nil, err
		}
	default:
		typ, body := "text/plain", m.Text
		if m.HTML != "" {
			typ, body = "text/html", m.HTML
		}
		header("Content-Type", typ+"; charset=utf-8")
		header("Content-Transfer-Encoding", "quoted-printable")
		buf.WriteString("\r\n")
		if err := writeQP(&buf, body); err != nil {
			return nil, err
		}
	}
	return buf.Bytes(), nil
}

func writeQP(w interface{ Write([]byte) (int, error) }, body string) error {
	qp := quotedprintable.NewWriter(w)
	// Normalise to LF first; the QP writer emits CRLF for text line breaks.
	if _, err := qp.Write([]byte(strings.ReplaceAll(body, "\r\n", "\n"))); err != nil {
		return err
	}
	return qp.Close()
}

// messageID returns a unique <random@domain> using the sender's domain.
func messageID(fromAddr string) string {
	domain := "localhost"
	if i := strings.LastIndexByte(fromAddr, '@'); i >= 0 && i < len(fromAddr)-1 {
		domain = fromAddr[i+1:]
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return "<" + hex.EncodeToString(b) + "@" + domain + ">"
}

// writeAlternative writes a multipart/alternative body (text and/or html) with
// the given boundary into w.
func writeAlternative(w io.Writer, boundary, text, html string) error {
	mw := multipart.NewWriter(w)
	if err := mw.SetBoundary(boundary); err != nil {
		return err
	}
	for _, p := range []struct{ typ, body string }{{"text/plain", text}, {"text/html", html}} {
		if p.body == "" {
			continue
		}
		pw, err := mw.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {p.typ + "; charset=utf-8"},
			"Content-Transfer-Encoding": {"quoted-printable"},
		})
		if err != nil {
			return err
		}
		if err := writeQP(pw, p.body); err != nil {
			return err
		}
	}
	return mw.Close()
}

// writeBase64 writes data base64-encoded in 76-character CRLF lines.
func writeBase64(w io.Writer, data []byte) error {
	enc := base64.StdEncoding.EncodeToString(data)
	for len(enc) > 76 {
		if _, err := io.WriteString(w, enc[:76]+"\r\n"); err != nil {
			return err
		}
		enc = enc[76:]
	}
	_, err := io.WriteString(w, enc+"\r\n")
	return err
}
