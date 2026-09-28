package leads

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLeadName(t *testing.T) {
	require.Equal(t, "Rahul Sharma", leadName(map[string]string{"full_name": " Rahul Sharma "}))
	require.Equal(t, "Asha Rao", leadName(map[string]string{"first_name": "Asha", "last_name": "Rao"}))
	require.Equal(t, "", leadName(map[string]string{"city": "Pune"}))
}

func TestSummaryDerive(t *testing.T) {
	spend := 10000.0
	r := SummaryRow{Leads: 50, Won: 2, WonValue: 40000, Spend: &spend}
	r.derive()
	require.InDelta(t, 200, *r.CostPerLead, 1e-9)
	require.InDelta(t, 5000, *r.CostPerWon, 1e-9)
	require.InDelta(t, 0.04, *r.WinRate, 1e-9)
	require.InDelta(t, 4, *r.ROAS, 1e-9)

	none := SummaryRow{}
	none.derive()
	require.Nil(t, none.CostPerLead)
	require.Nil(t, none.WinRate)
	require.Nil(t, none.ROAS)
}
