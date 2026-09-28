package auth

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/iamv1n/adwise/internal/platform/mailer"
)

const securityReason = "You received this security email because of activity on your Adwise account."

// sendEmail renders and hands the email to the configured sender. Failures
// are logged (without the body) and never surface to the client, so they
// cannot be used to probe accounts.
func (s *Service) sendEmail(ctx context.Context, to, subject string, e mailer.Email) {
	if e.Reason == "" {
		e.Reason = securityReason
	}
	html, text, err := e.Render()
	if err == nil {
		if s.sec.SendMail == nil {
			slog.WarnContext(ctx, "auth: no mail sender configured, security email dropped", "subject", subject)
			return
		}
		err = s.sec.SendMail(ctx, mailer.Message{To: []string{to}, Subject: subject, Text: text, HTML: html})
	}
	if err != nil {
		slog.ErrorContext(ctx, "auth: security email not queued", "subject", subject, "err", err)
	}
}

func (s *Service) link(path string) string {
	return strings.TrimRight(s.sec.WebBaseURL, "/") + path
}

func codeEmail(heading, intro, code, ttl string) mailer.Email {
	return mailer.Email{
		Preheader:  "Your code is " + code,
		Heading:    heading,
		Paragraphs: []string{intro},
		Code:       code,
		CodeNote:   "Expires in " + ttl,
		After:      []string{"If you didn't request this code, you can safely ignore this email. Never share it with anyone."},
	}
}

func (s *Service) mailVerifyEmail(ctx context.Context, to, code string) {
	s.sendEmail(ctx, to, "Confirm your email: "+code, codeEmail("Confirm your email address",
		"Enter this code in Adwise to confirm your email address.", code, "24 hours"))
}

func (s *Service) mailLoginCode(ctx context.Context, to, code string) {
	s.sendEmail(ctx, to, "Your Adwise sign-in code: "+code, codeEmail("Sign in to Adwise",
		"Use this code to finish signing in.", code, "10 minutes"))
}

func (s *Service) mailTwoFactorCode(ctx context.Context, to, code string) {
	s.sendEmail(ctx, to, "Your Adwise verification code: "+code, codeEmail("Confirm it's you",
		"Someone (hopefully you) is signing in to your Adwise account. Enter this code to continue.", code, "10 minutes"))
}

func (s *Service) mailResetLink(ctx context.Context, to, token string) {
	url := s.link("/reset-password?token=" + token)
	s.sendEmail(ctx, to, "Reset your Adwise password", mailer.Email{
		Preheader: "Reset your password",
		Heading:   "Reset your password",
		Paragraphs: []string{
			"We received a request to reset the password for your Adwise account. The link works once and expires in 1 hour.",
			"If you didn't ask for this, ignore this email; your password stays the same.",
		},
		Button: &mailer.Link{Label: "Choose a new password", URL: url},
	})
}

func (s *Service) mailNewSignIn(ctx context.Context, to string, client ClientInfo, at time.Time) {
	s.sendEmail(ctx, to, "New sign-in to your Adwise account", mailer.Email{
		Preheader: "New sign-in from " + deviceLabel(client.UserAgent),
		Heading:   "New sign-in to your account",
		Paragraphs: []string{
			"Your Adwise account was just signed in to from a new device.",
			fmt.Sprintf("When: %s", at.UTC().Format("Mon, 2 Jan 2006 15:04 MST")),
			fmt.Sprintf("Device: %s", deviceLabel(client.UserAgent)),
			fmt.Sprintf("Approximate location: IP address %s", client.IPAddress),
			"If this was you, there's nothing to do. Wasn't you? Reset your password now and review your devices.",
		},
		Button: &mailer.Link{Label: "Reset your password", URL: s.link("/forgot-password")},
	})
}

func (s *Service) mailNotice(ctx context.Context, to, subject, heading string, paragraphs ...string) {
	paragraphs = append(paragraphs, "If this wasn't you, reset your password immediately and review your account security.")
	s.sendEmail(ctx, to, subject, mailer.Email{
		Heading: heading, Paragraphs: paragraphs,
		Button: &mailer.Link{Label: "Review security settings", URL: s.link("/app/settings/security")},
	})
}

func (s *Service) mailPasswordChanged(ctx context.Context, to string) {
	s.mailNotice(ctx, to, "Your Adwise password was changed", "Your password was changed",
		"The password for your Adwise account was just changed and other sessions were signed out.")
}

func (s *Service) mailTwoFactorChanged(ctx context.Context, to, method string, on bool) {
	state := "turned off"
	if on {
		state = "turned on"
	}
	s.mailNotice(ctx, to, "Two-step verification "+state, "Two-step verification "+state,
		fmt.Sprintf("%s for two-step verification was %s on your Adwise account.", method, state))
}

func (s *Service) mailRecoveryCodes(ctx context.Context, to string) {
	s.mailNotice(ctx, to, "New recovery codes generated", "Your recovery codes were regenerated",
		"New two-step verification recovery codes were generated. Your old codes no longer work.")
}

func (s *Service) mailFailedAttempts(ctx context.Context, to string) {
	s.sendEmail(ctx, to, "Someone is trying to sign in to your Adwise account", mailer.Email{
		Heading: "Several failed sign-in attempts",
		Paragraphs: []string{
			"There were several failed attempts to sign in to your Adwise account, so sign-in with a password is paused for 15 minutes.",
			"If this was you, wait a few minutes or reset your password. If not, we recommend turning on two-step verification.",
		},
		Button: &mailer.Link{Label: "Reset your password", URL: s.link("/forgot-password")},
	})
}
