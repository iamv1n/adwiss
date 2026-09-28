package alerts

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var yday = time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC)

// series builds a campaign whose every day has the given base values, then
// applies overrides by day index (0 = yesterday).
func series(base Day, over map[int]Day) CampaignSeries {
	s := CampaignSeries{CampaignID: uuid.MustParse("11111111-1111-1111-1111-111111111111"), Name: "Brand", Status: "active",
		Currency: "INR", Yesterday: yday, Fresh: true}
	for i := range s.Days {
		s.Days[i] = base
		if d, ok := over[i]; ok {
			s.Days[i] = d
		}
	}
	return s
}

func kinds(ds []Detected) map[string]Detected {
	m := map[string]Detected{}
	for _, d := range ds {
		m[d.Kind] = d
	}
	return m
}

func TestDetectSpendSpike(t *testing.T) {
	steady := Day{Spend: 100, Impressions: 1000, Conversions: 2, Value: 400}
	cases := []struct {
		name     string
		s        CampaignSeries
		want     bool
		severity string
	}{
		{"steady", series(steady, nil), false, ""},
		{"exactly 2x", series(steady, map[int]Day{0: {Spend: 200, Impressions: 2000, Conversions: 4, Value: 800}}), true, SeverityWarning},
		{"1.9x", series(steady, map[int]Day{0: {Spend: 190, Impressions: 1900, Conversions: 4, Value: 760}}), false, ""},
		{"5x is critical", series(steady, map[int]Day{0: {Spend: 500, Impressions: 5000, Conversions: 10, Value: 2000}}), true, SeverityCritical},
		{"tiny amounts ignored", series(Day{Spend: 5, Impressions: 50}, map[int]Day{0: {Spend: 40, Impressions: 400}}), false, ""},
		{"launch (few prior days) ignored", series(Day{}, map[int]Day{0: {Spend: 500, Impressions: 5000}, 1: {Spend: 100, Impressions: 1000}, 2: {Spend: 100, Impressions: 1000}}), false, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fires, _ := DetectCampaign(tc.s, DefaultThresholds)
			d, ok := kinds(fires)[KindSpendSpike]
			require.Equal(t, tc.want, ok)
			if ok {
				assert.Equal(t, tc.severity, d.Severity)
				assert.Equal(t, "spend_spike:11111111-1111-1111-1111-111111111111:2026-09-26", d.DedupeKey)
				assert.Contains(t, d.Body, "₹")
				assert.Equal(t, "campaign", d.EntityType)
			}
		})
	}
}

func TestDetectROASDrop(t *testing.T) {
	prior := Day{Spend: 100, Impressions: 1000, Conversions: 2, Value: 400} // ROAS 4
	recent := func(value float64) map[int]Day {
		d := Day{Spend: 100, Impressions: 1000, Conversions: 1, Value: value}
		return map[int]Day{0: d, 1: d, 2: d}
	}
	key := "roas_drop:11111111-1111-1111-1111-111111111111"
	cases := []struct {
		name      string
		s         CampaignSeries
		fire      bool
		severity  string
		wantClear bool
	}{
		{"stable clears", series(prior, nil), false, "", true},
		{"-40% fires", series(prior, recent(240)), true, SeverityWarning, false},
		{"-30% neither fires nor clears (hysteresis)", series(prior, recent(280)), false, "", false},
		{"-75% critical", series(prior, recent(100)), true, SeverityCritical, false},
		{"low recent spend ignored", series(prior, map[int]Day{0: {Spend: 20}, 1: {Spend: 20}, 2: {Spend: 20}}), false, "", false},
		{"few prior conversions ignored", series(Day{Spend: 100, Impressions: 1000, Conversions: 0.5, Value: 400}, recent(50)), false, "", false},
		{"paused clears", func() CampaignSeries { s := series(prior, recent(50)); s.Status = "paused"; return s }(), false, "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fires, clears := DetectCampaign(tc.s, DefaultThresholds)
			d, ok := kinds(fires)[KindROASDrop]
			require.Equal(t, tc.fire, ok)
			if ok {
				assert.Equal(t, tc.severity, d.Severity)
				assert.Equal(t, key, d.DedupeKey)
				assert.True(t, strings.HasPrefix(d.Title, "ROAS down"))
			}
			assert.Equal(t, tc.wantClear, contains(clears, key))
		})
	}
}

func TestDetectStoppedDelivering(t *testing.T) {
	on := Day{Spend: 100, Impressions: 1000, Conversions: 2, Value: 400}
	key := "stopped_delivering:11111111-1111-1111-1111-111111111111"
	cases := []struct {
		name      string
		s         CampaignSeries
		fire      bool
		wantClear bool
	}{
		{"delivering clears", series(on, nil), false, true},
		{"zero yesterday fires", series(on, map[int]Day{0: {}}), true, false},
		{"stale sync ignored", func() CampaignSeries { s := series(on, map[int]Day{0: {}}); s.Fresh = false; return s }(), false, false},
		{"low prior volume ignored", series(Day{Spend: 1, Impressions: 50}, map[int]Day{0: {}}), false, false},
		{"only one prior day ignored", series(Day{}, map[int]Day{1: {Spend: 500, Impressions: 5000}}), false, false},
		{"paused ignored", func() CampaignSeries { s := series(on, map[int]Day{0: {}}); s.Status = "paused"; return s }(), false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fires, clears := DetectCampaign(tc.s, DefaultThresholds)
			d, ok := kinds(fires)[KindStoppedDelivering]
			require.Equal(t, tc.fire, ok)
			if ok {
				assert.Equal(t, SeverityCritical, d.Severity)
				assert.Equal(t, key, d.DedupeKey)
			}
			assert.Equal(t, tc.wantClear, contains(clears, key))
		})
	}
}

func TestDetectIntegrations(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fires, clears := DetectIntegrations([]IntegrationState{
		{ID: a, Provider: "meta", DisplayName: "Jane", Status: "needs_reauth", LastError: "token expired"},
		{ID: b, Provider: "google", Status: "active"},
	})
	require.Len(t, fires, 1)
	assert.Equal(t, "needs_reauth:"+a.String(), fires[0].DedupeKey)
	assert.Equal(t, "Reconnect Meta Ads (Jane)", fires[0].Title)
	assert.Equal(t, []string{"needs_reauth:" + b.String()}, clears)

	assert.Equal(t, []string{"needs_reauth:gone"}, staleKeys([]string{"needs_reauth:" + a.String(), "needs_reauth:gone"}, fires))
}

func TestDetectFailedActions(t *testing.T) {
	rule := uuid.New()
	out := DetectFailedActions([]FailedGroup{
		{Source: "rule", SourceID: &rule, SourceName: "Pause losers", Day: yday, Count: 2, LastError: "permission denied", Entities: []string{"A", "B"}},
		{Source: "manual", Day: yday, Count: 7},
	}, DefaultThresholds)
	require.Len(t, out, 2)
	assert.Equal(t, "action_failed:rule:"+rule.String()+":2026-09-26", out[0].DedupeKey)
	assert.Equal(t, "Rule “Pause losers” failed", out[0].Title)
	assert.Equal(t, "2 actions failed on A, B. Last error: permission denied", out[0].Body)
	assert.Equal(t, SeverityWarning, out[0].Severity)
	assert.Equal(t, &rule, out[0].EntityID)
	assert.Equal(t, "action_failed:manual:manual:2026-09-26", out[1].DedupeKey)
	assert.Equal(t, SeverityCritical, out[1].Severity)
	assert.Nil(t, out[1].EntityID)
}

func TestPreferencesFilter(t *testing.T) {
	cases := []struct {
		p        Preferences
		kind     string
		severity string
		want     bool
	}{
		{DefaultPreferences("owner"), KindSpendSpike, SeverityWarning, true},
		{DefaultPreferences("admin"), KindSpendSpike, SeverityInfo, false},
		{DefaultPreferences("member"), KindNeedsReauth, SeverityCritical, false},
		{Preferences{EmailLevel: EmailAll}, KindSpendSpike, SeverityInfo, true},
		{Preferences{EmailLevel: EmailCritical}, KindSpendSpike, SeverityWarning, false},
		{Preferences{EmailLevel: EmailCritical}, KindSpendSpike, SeverityCritical, true},
		{Preferences{EmailLevel: EmailAll, EmailMutedKinds: []string{KindSpendSpike}}, KindSpendSpike, SeverityCritical, false},
		{Preferences{EmailLevel: EmailNone}, KindNeedsReauth, SeverityCritical, false},
	}
	for i, tc := range cases {
		assert.Equal(t, tc.want, tc.p.WantsEmail(tc.kind, tc.severity), i)
	}
}

func TestPlanEmailsBatching(t *testing.T) {
	cid := uuid.New()
	ct := "campaign"
	now := time.Now()
	list := []Alert{
		{ID: uuid.New(), Kind: KindSpendSpike, Severity: SeverityWarning, Title: "Spend spike: Brand", Body: "Spent ₹500", EntityType: &ct, EntityID: &cid, Link: "/app/campaigns/" + cid.String(), CreatedAt: now},
		{ID: uuid.New(), Kind: KindNeedsReauth, Severity: SeverityCritical, Title: "Reconnect Meta Ads", Body: "Lost access", Link: "/app/integrations", CreatedAt: now.Add(time.Second)},
		{ID: uuid.New(), Kind: KindActionFailed, Severity: SeverityInfo, Title: "Info only", Link: "/app/actions", CreatedAt: now},
	}
	recips := []Recipient{
		{Email: "owner@x.test", Role: "owner", Prefs: DefaultPreferences("owner")},
		{Email: "member@x.test", Role: "member", Prefs: DefaultPreferences("member")},
		{Email: "crit@x.test", Role: "admin", Prefs: Preferences{EmailLevel: EmailCritical}},
		{Email: "muted@x.test", Role: "admin", Prefs: Preferences{EmailLevel: EmailAll, EmailMutedKinds: []string{KindNeedsReauth, KindSpendSpike}}},
	}
	out, err := PlanEmails("https://app.adwise.test/", "Demo Co", recips, list)
	require.NoError(t, err)
	require.Len(t, out, 3) // member gets nothing

	owner := out[0].Message
	assert.Equal(t, []string{"owner@x.test"}, owner.To)
	assert.Equal(t, "[Critical] 2 new alerts for Demo Co (1 critical)", owner.Subject)
	// Most severe first, with absolute links.
	assert.Less(t, strings.Index(owner.Text, "Reconnect Meta Ads"), strings.Index(owner.Text, "Spend spike: Brand"))
	assert.Contains(t, owner.Text, "https://app.adwise.test/app/campaigns/"+cid.String())
	assert.Contains(t, owner.Text, "https://app.adwise.test/app/integrations")
	assert.Contains(t, owner.Text, "Manage alert emails: https://app.adwise.test/app/settings/alerts")
	assert.NotContains(t, owner.Text, "Info only")
	assert.Contains(t, owner.HTML, "https://app.adwise.test/app/settings/alerts")

	assert.Equal(t, "[Critical] Reconnect Meta Ads", out[1].Message.Subject)
	assert.Equal(t, "Info only", out[2].Message.Subject)
	require.NoError(t, out[2].Message.Validate())

	again, _ := PlanEmails("https://app.adwise.test", "Demo Co", recips, list)
	assert.Equal(t, out[0].Key, again[0].Key, "keys are stable for idempotent enqueue")
}

func TestMoney(t *testing.T) {
	assert.Equal(t, "₹123,457", Money("INR", 123456.7))
	assert.Equal(t, "$0", Money("USD", 0.2))
	assert.Equal(t, "1,000 SEK", Money("SEK", 1000))
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
