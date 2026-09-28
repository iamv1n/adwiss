package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// AI configures the in-app analyst (internal/ai). With no API key the
// feature is off and its endpoints answer 503.
type AI struct {
	AnthropicAPIKey string
	Model           string
	// DailyTokens caps model tokens (input + output) per org per UTC day; 0 = no cap.
	DailyTokens int64
}

func (a AI) Enabled() bool { return a.AnthropicAPIKey != "" }

func loadAI() (AI, error) {
	a := AI{
		AnthropicAPIKey: strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY")),
		Model:           getenv("AI_MODEL", "claude-opus-5"),
		DailyTokens:     2_000_000,
	}
	if v := os.Getenv("AI_DAILY_TOKEN_LIMIT"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 0 {
			return AI{}, fmt.Errorf("AI_DAILY_TOKEN_LIMIT: must be a non-negative integer")
		}
		a.DailyTokens = n
	}
	return a, nil
}
