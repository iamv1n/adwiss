package entities

import "github.com/iamv1n/adwise/internal/ads"

// Labels maps canonical entity types to each platform's own terms (plan §7),
// so the UI can say "Ad set" for Meta and "Ad group" for Google. Included as
// "labels" in the /accounts and entity list responses.
var Labels = map[ads.Provider]map[ads.EntityType]string{
	ads.ProviderMeta: {
		ads.EntityAccount:  "Ad account",
		ads.EntityCampaign: "Campaign",
		ads.EntityAdGroup:  "Ad set",
		ads.EntityAd:       "Ad",
		ads.EntityCreative: "Creative",
	},
	ads.ProviderGoogle: {
		ads.EntityAccount:  "Account",
		ads.EntityCampaign: "Campaign",
		ads.EntityAdGroup:  "Ad group",
		ads.EntityAd:       "Ad",
		ads.EntityCreative: "Asset",
	},
}
