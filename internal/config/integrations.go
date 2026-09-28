package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/iamv1n/adwise/internal/platform/secrets"
)

// Integrations configures provider OAuth apps and token encryption (Phase 2).
// Provider credentials are optional in development; endpoints for an
// unconfigured provider return 503 provider_not_configured.
type Integrations struct {
	// APIBaseURL is the browser-facing base of the API, used to build OAuth
	// redirect URIs: {APIBaseURL}/v1/integrations/{provider}/callback.
	// Defaults to {WEB_BASE_URL}/api (the Next.js same-origin proxy).
	APIBaseURL string

	// TokenEncryptionKey: "<base64 32 bytes>" or "id:<b64>[,id:<b64>...]"
	// (first is current). Required outside development; development falls
	// back to secrets.DevKeySpec. Validated at load time.
	TokenEncryptionKey string

	MetaAppID                string
	MetaAppSecret            string
	MetaAPIVersion           string // optional override, e.g. v26.0
	MetaConversionActionType string // default purchase
	// MetaWebhookVerifyToken is the "Verify token" entered in the Meta App
	// Dashboard for the leadgen webhook (GET /v1/webhooks/meta handshake).
	MetaWebhookVerifyToken string

	GoogleClientID        string
	GoogleClientSecret    string
	GoogleDeveloperToken  string
	GoogleLoginCustomerID string // optional default manager account
	GoogleAPIVersion      string // optional override, e.g. v25
}

func (i Integrations) MetaConfigured() bool { return i.MetaAppID != "" && i.MetaAppSecret != "" }

func (i Integrations) GoogleConfigured() bool {
	return i.GoogleClientID != "" && i.GoogleClientSecret != "" && i.GoogleDeveloperToken != ""
}

func loadIntegrations(cfg Config) (Integrations, error) {
	i := Integrations{
		APIBaseURL:               strings.TrimRight(getenv("API_BASE_URL", strings.TrimRight(cfg.WebBaseURL, "/")+"/api"), "/"),
		TokenEncryptionKey:       os.Getenv("TOKEN_ENCRYPTION_KEY"),
		MetaAppID:                os.Getenv("META_APP_ID"),
		MetaAppSecret:            os.Getenv("META_APP_SECRET"),
		MetaAPIVersion:           os.Getenv("META_API_VERSION"),
		MetaConversionActionType: os.Getenv("META_CONVERSION_ACTION_TYPE"),
		MetaWebhookVerifyToken:   os.Getenv("META_WEBHOOK_VERIFY_TOKEN"),
		GoogleClientID:           os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret:       os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleDeveloperToken:     os.Getenv("GOOGLE_DEVELOPER_TOKEN"),
		GoogleLoginCustomerID:    os.Getenv("GOOGLE_LOGIN_CUSTOMER_ID"),
		GoogleAPIVersion:         os.Getenv("GOOGLE_ADS_API_VERSION"),
	}
	if i.TokenEncryptionKey == "" {
		if !cfg.IsDevelopment() {
			return Integrations{}, fmt.Errorf("TOKEN_ENCRYPTION_KEY is required outside development")
		}
		i.TokenEncryptionKey = secrets.DevKeySpec
	} else if !cfg.IsDevelopment() && strings.Contains(i.TokenEncryptionKey, secrets.DevKeySpec[strings.Index(secrets.DevKeySpec, ":")+1:]) {
		return Integrations{}, fmt.Errorf("TOKEN_ENCRYPTION_KEY must not use the public development key outside development")
	}
	if _, err := secrets.Parse(i.TokenEncryptionKey); err != nil {
		return Integrations{}, fmt.Errorf("TOKEN_ENCRYPTION_KEY: %w", err)
	}
	return i, nil
}
