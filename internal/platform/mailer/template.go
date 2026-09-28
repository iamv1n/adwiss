package mailer

import (
	"bytes"
	"html/template"
	"strings"
)

// Email is the content of a branded email; Render lays it out as HTML and
// plain text so every Adwise email looks the same.
type Email struct {
	Preheader  string   // inbox preview line (hidden in the body)
	Heading    string   // large title at the top
	Paragraphs []string // intro text
	Code       string   // optional one-time code, shown large in a highlighted box
	CodeNote   string   // small line under the code, e.g. "Expires in 10 minutes"
	After      []string // text after the code / items (e.g. "didn't request this?")
	Items      []Item   // optional list (e.g. alerts)
	Button     *Link    // primary call to action
	Reason     string   // footer: why the recipient got this email
	Manage     *Link    // footer: manage these emails
}

// Item is one entry of Email.Items. Tone colours the left rule: info, warning
// or critical.
type Item struct {
	Title string
	Body  string
	Tone  string
	Link  *Link
}

type Link struct {
	Label string
	URL   string
}

// Render returns the HTML and text bodies for use in a Message.
func (e Email) Render() (html, text string, err error) {
	var b bytes.Buffer
	if err := layout.Execute(&b, e); err != nil {
		return "", "", err
	}
	return b.String(), e.text(), nil
}

func (e Email) text() string {
	var b strings.Builder
	if e.Heading != "" {
		b.WriteString(e.Heading + "\n" + strings.Repeat("=", min(len(e.Heading), 60)) + "\n\n")
	}
	for _, p := range e.Paragraphs {
		b.WriteString(p + "\n\n")
	}
	if e.Code != "" {
		b.WriteString("    " + e.Code + "\n\n")
		if e.CodeNote != "" {
			b.WriteString(e.CodeNote + "\n\n")
		}
	}
	for _, it := range e.Items {
		b.WriteString("- " + it.Title + "\n")
		if it.Body != "" {
			b.WriteString("  " + it.Body + "\n")
		}
		if it.Link != nil {
			b.WriteString("  " + it.Link.URL + "\n")
		}
		b.WriteString("\n")
	}
	if e.Button != nil {
		b.WriteString(e.Button.Label + ": " + e.Button.URL + "\n\n")
	}
	for _, p := range e.After {
		b.WriteString(p + "\n\n")
	}
	b.WriteString("--\nAdwise · " + contactEmail + "\n")
	if e.Reason != "" {
		b.WriteString(e.Reason + "\n")
	}
	if e.Manage != nil {
		b.WriteString(e.Manage.Label + ": " + e.Manage.URL + "\n")
	}
	return b.String()
}

// spaced renders "482913" as "482 913" for readability; other codes pass through.
func spaced(code string) string {
	if len(code) == 6 && strings.Trim(code, "0123456789") == "" {
		return code[:3] + " " + code[3:]
	}
	return code
}

var layout = template.Must(template.New("email").Funcs(template.FuncMap{
	"tone": func(t string) string {
		switch t {
		case "critical":
			return colorDanger
		case "warning":
			return colorAmber
		}
		return colorPrimary
	},
	"spaced": spaced,
	"c": func(name string) string {
		return map[string]string{
			"ink": colorInk, "midnight": colorMidnight, "blue": colorBlue, "sky": colorSky,
			"primary": colorPrimary, "mist": colorMist, "mistLine": colorMistLine,
			"text": colorText, "muted": colorMuted, "line": colorLine, "canvas": colorCanvas,
		}[name]
	},
	"font": func(name string) template.CSS {
		return template.CSS(map[string]string{"display": fontDisplay, "text": fontText, "mono": fontMono}[name])
	},
	"contact": func() string { return contactEmail },
	"logoCID": func() string { return LogoCID },
}).Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{{.Heading}}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Geist:wght@400;500;600&family=Geist+Mono:wght@600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:{{c "canvas"}};font-family:{{font "text"}};color:{{c "ink"}};-webkit-font-smoothing:antialiased;">
{{if .Preheader}}<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{.Preheader}}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>{{end}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{{c "canvas"}};"><tr><td align="center" style="padding:36px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="background:#ffffff;border:1px solid {{c "line"}};border-radius:16px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="height:4px;line-height:4px;font-size:0;background-color:{{c "blue"}};background-image:linear-gradient(90deg,{{c "midnight"}},{{c "blue"}} 60%,{{c "sky"}});">&nbsp;</td></tr>
<tr><td style="padding:26px 32px 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;padding-right:10px;"><img src="cid:{{logoCID}}" width="32" height="32" alt="" style="display:block;border:0;outline:none;width:32px;height:32px;"></td>
<td style="vertical-align:middle;font-family:{{font "display"}};font-size:21px;font-weight:600;letter-spacing:-0.02em;color:{{c "ink"}};">Adwise</td>
</tr></table>
</td></tr>
<tr><td style="padding:24px 32px 30px;">
{{if .Heading}}<h1 style="margin:0 0 12px;font-family:{{font "display"}};font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:{{c "ink"}};">{{.Heading}}</h1>{{end}}
{{range .Paragraphs}}<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:{{c "text"}};">{{.}}</p>{{end}}
{{if .Code}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr>
<td align="center" style="background:{{c "mist"}};border:1px solid {{c "mistLine"}};border-radius:12px;padding:22px 12px;">
<div style="font-family:{{font "mono"}};font-size:34px;line-height:1.1;font-weight:600;letter-spacing:6px;color:{{c "midnight"}};">{{spaced .Code}}</div>
{{if .CodeNote}}<div style="margin-top:10px;font-size:13px;color:{{c "muted"}};">{{.CodeNote}}</div>{{end}}
</td></tr></table>{{end}}
{{range .Items}}<div style="margin:0 0 12px;padding:12px 14px;border-left:3px solid {{tone .Tone}};background:{{c "mist"}};border-radius:8px;">
<div style="font-weight:600;font-size:15px;color:{{c "ink"}};">{{if .Link}}<a href="{{.Link.URL}}" style="color:{{c "ink"}};text-decoration:none;">{{.Title}}</a>{{else}}{{.Title}}{{end}}</div>
{{if .Body}}<div style="margin-top:4px;font-size:14px;line-height:1.5;color:{{c "text"}};">{{.Body}}</div>{{end}}
{{if .Link}}<div style="margin-top:6px;font-size:13px;"><a href="{{.Link.URL}}" style="color:{{c "primary"}};font-weight:600;text-decoration:none;">{{.Link.Label}} &rarr;</a></div>{{end}}
</div>{{end}}
{{if .Button}}<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr>
<td style="border-radius:10px;background:{{c "primary"}};"><a href="{{.Button.URL}}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">{{.Button.Label}}</a></td>
</tr></table>
<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:{{c "muted"}};word-break:break-all;">Or paste this link into your browser:<br><a href="{{.Button.URL}}" style="color:{{c "primary"}};">{{.Button.URL}}</a></p>{{end}}
{{range .After}}<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:{{c "muted"}};">{{.}}</p>{{end}}
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:{{c "muted"}};text-align:center;">
{{if .Reason}}<div>{{.Reason}}{{if .Manage}} <a href="{{.Manage.URL}}" style="color:{{c "muted"}};">{{.Manage.Label}}</a>{{end}}</div>{{end}}
<div style="margin-top:6px;"><span style="font-family:{{font "display"}};font-weight:600;color:{{c "ink"}};">Adwise</span> · ad performance, hour by hour · <a href="mailto:{{contact}}" style="color:{{c "muted"}};">{{contact}}</a></div>
</td></tr>
</table></td></tr></table></body></html>`))
