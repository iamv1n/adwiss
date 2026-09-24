package reports

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/ads"
)

func TestRegistry(t *testing.T) {
	want := []string{CampaignDaily, CampaignHourly, CampaignCountryDaily, CampaignDeviceDaily,
		CampaignPlacementDaily, AdDaily, CreativeDaily, KeywordDaily, SearchTermDaily}
	assert.Equal(t, want, Names())

	d, ok := Get(CampaignHourly)
	require.True(t, ok)
	assert.Equal(t, ads.GrainHour, d.Grain)
	assert.True(t, HasDimension(d, ads.DimCampaign))

	for _, d := range All() {
		if d.Name == CampaignHourly {
			assert.Equal(t, ads.GrainHour, d.Grain)
		} else {
			assert.Equal(t, ads.GrainDay, d.Grain, d.Name)
		}
		assert.True(t, HasDimension(d, ads.DimCampaign), "%s is keyed by campaign", d.Name)
	}

	_, ok = Get("nope")
	assert.False(t, ok)

	// Lookups return copies: mutating one cannot corrupt the registry.
	d.Dimensions[0] = "mutated"
	again, _ := Get(CampaignHourly)
	assert.Equal(t, ads.DimCampaign, again.Dimensions[0])
}
