package config

import (
	"os"
	"strings"

	"github.com/iamv1n/adwise/internal/platform/sms"
)

// loadSMS reads the Twilio credentials. With any of them unset, SMS is
// written to the log instead of sent.
func loadSMS() sms.Config {
	return sms.Config{
		TwilioAccountSID: strings.TrimSpace(os.Getenv("TWILIO_ACCOUNT_SID")),
		TwilioAuthToken:  strings.TrimSpace(os.Getenv("TWILIO_AUTH_TOKEN")),
		TwilioFrom:       strings.TrimSpace(os.Getenv("TWILIO_FROM")),
	}
}
