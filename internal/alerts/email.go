package alerts

import (
	"fmt"
	"sort"
	"strings"

	"github.com/iamv1n/adwise/internal/platform/mailer"
)

// Recipient is an org member with their effective preferences.
type Recipient struct {
	Email string
	Name  string
	Role  string
	Prefs Preferences
}

// Filter returns the alerts r wants emailed.
func (r Recipient) Filter(list []Alert) []Alert {
	out := []Alert{}
	for _, a := range list {
		if r.Prefs.WantsEmail(a.Kind, a.Severity) {
			out = append(out, a)
		}
	}
	return out
}

// SettingsPath is the web page for alert email preferences.
const SettingsPath = "/app/settings/alerts"

// BuildEmail batches alerts (already filtered for the recipient) into one
// message, most severe first. ok is false when there is nothing to send.
func BuildEmail(webBaseURL, orgName string, r Recipient, list []Alert) (msg mailer.Message, ok bool, err error) {
	if len(list) == 0 {
		return msg, false, nil
	}
	list = append([]Alert(nil), list...)
	sort.SliceStable(list, func(i, j int) bool {
		if a, b := severityRank(list[i].Severity), severityRank(list[j].Severity); a != b {
			return a > b
		}
		return list[i].CreatedAt.Before(list[j].CreatedAt)
	})
	base := strings.TrimRight(webBaseURL, "/")

	var subject, heading string
	if len(list) == 1 {
		subject = list[0].Title
		heading = list[0].Title
	} else {
		subject = fmt.Sprintf("%d new alerts for %s", len(list), orgName)
		heading = fmt.Sprintf("%d new alerts", len(list))
		if c := countSeverity(list, SeverityCritical); c > 0 {
			subject = fmt.Sprintf("%d new alerts for %s (%d critical)", len(list), orgName, c)
		}
	}
	if list[0].Severity == SeverityCritical {
		subject = "[Critical] " + subject
	}

	items := make([]mailer.Item, len(list))
	for i, a := range list {
		items[i] = mailer.Item{Title: a.Title, Body: a.Body, Tone: a.Severity,
			Link: &mailer.Link{Label: linkLabel(a), URL: base + a.Link}}
	}
	intro := "Adwise spotted something in " + orgName + " that may need your attention."
	if len(list) > 1 {
		intro = "Adwise spotted a few things in " + orgName + " that may need your attention."
	}
	html, text, err := mailer.Email{
		Preheader:  list[0].Body,
		Heading:    heading,
		Paragraphs: []string{intro},
		Items:      items,
		Button:     &mailer.Link{Label: "Open Adwise", URL: base + "/app/dashboard"},
		Reason:     "You received this because you are a member of " + orgName + " and your alert emails are set to “" + levelLabel(r.Prefs.EmailLevel) + "”.",
		Manage:     &mailer.Link{Label: "Manage alert emails", URL: base + SettingsPath},
	}.Render()
	if err != nil {
		return msg, false, err
	}
	return mailer.Message{
		To: []string{r.Email}, Subject: subject, Text: text, HTML: html,
		Headers: map[string]string{"X-Adwise-Category": "alerts"},
	}, true, nil
}

func countSeverity(list []Alert, sev string) int {
	n := 0
	for _, a := range list {
		if a.Severity == sev {
			n++
		}
	}
	return n
}

func linkLabel(a Alert) string {
	switch a.Kind {
	case KindNeedsReauth:
		return "Reconnect"
	case KindActionFailed:
		return "View actions"
	}
	return "View campaign"
}

func levelLabel(l string) string {
	switch l {
	case EmailAll:
		return "all alerts"
	case EmailWarning:
		return "warnings and critical"
	case EmailCritical:
		return "critical only"
	}
	return "off"
}
