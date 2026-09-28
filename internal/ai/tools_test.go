package ai

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/analytics"
	"github.com/iamv1n/adwise/internal/organizations"
)

func TestToolsAreWellFormed(t *testing.T) {
	seen := map[string]bool{}
	for _, tool := range NewTools(Services{}) {
		require.False(t, seen[tool.Name], "duplicate tool %q", tool.Name)
		seen[tool.Name] = true
		require.NotEmpty(t, tool.Description, tool.Name)
		for _, req := range tool.Required {
			require.Contains(t, tool.Properties, req, "%s: required %q has no property", tool.Name, req)
		}
		_, err := json.Marshal(tool.Properties)
		require.NoError(t, err, tool.Name)
	}
}

func TestScopeUsesMembershipOrg(t *testing.T) {
	m := organizations.Membership{OrganizationID: uuid.New()}
	sc, err := scopeInput{From: "2026-09-01", To: "2026-09-07", Compare: analytics.ComparePreviousPeriod}.scope(m)
	require.NoError(t, err)
	require.Equal(t, m.OrganizationID, sc.OrganizationID)
	require.Equal(t, 7, sc.Range.Days())
	require.Equal(t, analytics.ComparePreviousPeriod, sc.Compare)

	_, err = scopeInput{From: "2026-09-07", To: "2026-09-01"}.scope(m)
	require.Error(t, err)
	_, err = scopeInput{Compare: "yesterday"}.scope(m)
	require.Error(t, err)
	_, err = scopeInput{AccountID: "not-a-uuid"}.scope(m)
	require.Error(t, err)
}

func TestEncodeResultTruncates(t *testing.T) {
	out := encodeResult(strings.Repeat("x", maxResultBytes*2))
	require.Contains(t, out, "[truncated")
	require.Less(t, len(out), maxResultBytes+200)
}
