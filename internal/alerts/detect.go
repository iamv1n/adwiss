package alerts

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// SeriesDays is how many days of campaign history detection needs:
// yesterday plus the 9 days before (3-day recent vs 7-day prior ROAS window).
const SeriesDays = 10

// Thresholds tune the detectors. Money amounts are in the account currency's
// major units; they are deliberately conservative so a small account does not
// get paged about noise.
type Thresholds struct {
	SpikeRatio         float64 // yesterday ≥ ratio × 7-day average
	SpikeCriticalRatio float64
	SpikeMinSpend      float64 // yesterday's spend must be at least this
	SpikeMinActiveDays int     // days with spend in the prior 7 (skips launches)

	ROASDropRatio      float64 // fire when recent ROAS ≤ (1-ratio) × prior ROAS
	ROASCriticalRatio  float64
	ROASClearRatio     float64 // resolve when the drop is below this
	ROASMinRecentSpend float64 // last 3 days
	ROASMinPriorSpend  float64 // previous 7 days
	ROASMinPriorConv   float64 // conversions in the previous 7 days

	StoppedMinPriorImpr int64 // impressions over the 3 days before yesterday
	StoppedMinPriorDays int   // of those 3 days, how many had impressions

	ActionFailedCritical int // failures of one rule/schedule per day
}

var DefaultThresholds = Thresholds{
	SpikeRatio: 2, SpikeCriticalRatio: 4, SpikeMinSpend: 50, SpikeMinActiveDays: 4,
	ROASDropRatio: 0.4, ROASCriticalRatio: 0.7, ROASClearRatio: 0.2,
	ROASMinRecentSpend: 100, ROASMinPriorSpend: 200, ROASMinPriorConv: 5,
	StoppedMinPriorImpr: 300, StoppedMinPriorDays: 2,
	ActionFailedCritical: 5,
}

// Day is one day of campaign_daily totals (money in major units).
type Day struct {
	Spend       float64
	Impressions int64
	Conversions float64
	Value       float64
}

// CampaignSeries is a campaign's recent history. Days[0] is yesterday in the
// account timezone, Days[i] is i days before that; missing days are zero.
type CampaignSeries struct {
	CampaignID uuid.UUID
	Name       string
	Status     string // ad_entity_status
	Currency   string
	Yesterday  time.Time
	// Fresh: the account's daily metrics synced after yesterday ended, so a
	// zero for yesterday is real and not a sync lag.
	Fresh bool
	Days  [SeriesDays]Day
}

// DetectCampaign runs the campaign detectors. It returns the conditions that
// hold and the dedupe keys of stateful conditions that were evaluated and no
// longer hold (to resolve).
func DetectCampaign(s CampaignSeries, th Thresholds) (fires []Detected, clears []string) {
	roasKey := KindROASDrop + ":" + s.CampaignID.String()
	stoppedKey := KindStoppedDelivering + ":" + s.CampaignID.String()
	if s.Status != "active" {
		// Paused/archived campaigns neither spike nor deliver; close open states.
		return nil, []string{roasKey, stoppedKey}
	}
	id := s.CampaignID
	base := func(kind, severity, title, body string, data map[string]any, key string) Detected {
		data["currency"] = s.Currency
		data["date"] = s.Yesterday.Format(time.DateOnly)
		return Detected{Kind: kind, Severity: severity, EntityType: "campaign", EntityID: &id, EntityName: s.Name,
			Title: title, Body: body, Data: data, DedupeKey: key}
	}
	day := s.Yesterday.Format("Jan 2")

	// Spend spike: yesterday vs the 7 days before it.
	y := s.Days[0].Spend
	var prior float64
	active := 0
	for _, d := range s.Days[1:8] {
		prior += d.Spend
		if d.Spend > 0 {
			active++
		}
	}
	avg := prior / 7
	if active >= th.SpikeMinActiveDays && avg > 0 && y >= th.SpikeMinSpend && y >= th.SpikeRatio*avg {
		ratio := y / avg
		sev := SeverityWarning
		if ratio >= th.SpikeCriticalRatio {
			sev = SeverityCritical
		}
		fires = append(fires, base(KindSpendSpike, sev,
			"Spend spike: "+s.Name,
			fmt.Sprintf("Spent %s on %s, %.1f× its 7-day average of %s.", Money(s.Currency, y), day, ratio, Money(s.Currency, avg)),
			map[string]any{"spend": round2(y), "avg_7d": round2(avg), "ratio": round2(ratio)},
			KindSpendSpike+":"+s.CampaignID.String()+":"+s.Yesterday.Format(time.DateOnly)))
	}

	// ROAS drop: last 3 days vs the 7 before.
	var rs, rv, ps, pv, pc, rc float64
	for i, d := range s.Days {
		if i < 3 {
			rs, rv, rc = rs+d.Spend, rv+d.Value, rc+d.Conversions
		} else {
			ps, pv, pc = ps+d.Spend, pv+d.Value, pc+d.Conversions
		}
	}
	if rs >= th.ROASMinRecentSpend && ps >= th.ROASMinPriorSpend && pc >= th.ROASMinPriorConv && pv > 0 {
		recent, before := rv/rs, pv/ps
		drop := 1 - recent/before
		switch {
		case drop >= th.ROASDropRatio:
			sev := SeverityWarning
			if drop >= th.ROASCriticalRatio {
				sev = SeverityCritical
			}
			fires = append(fires, base(KindROASDrop, sev,
				"ROAS down "+strconv.Itoa(int(math.Round(drop*100)))+"%: "+s.Name,
				fmt.Sprintf("ROAS over the last 3 days is %.2f× vs %.2f× the 7 days before, on %s spend.", recent, before, Money(s.Currency, rs)),
				map[string]any{"roas_recent": round2(recent), "roas_prior": round2(before), "drop": round2(drop),
					"spend_recent": round2(rs), "spend_prior": round2(ps), "conversions_recent": round2(rc), "conversions_prior": round2(pc)},
				roasKey))
		case drop < th.ROASClearRatio:
			clears = append(clears, roasKey)
		}
	}

	// Stopped delivering: impressions on most of the 3 prior days, none yesterday.
	if s.Fresh {
		var impr int64
		var spend float64
		days := 0
		for _, d := range s.Days[1:4] {
			impr += d.Impressions
			spend += d.Spend
			if d.Impressions > 0 {
				days++
			}
		}
		switch {
		case s.Days[0].Impressions == 0 && days >= th.StoppedMinPriorDays && impr >= th.StoppedMinPriorImpr && spend > 0:
			fires = append(fires, base(KindStoppedDelivering, SeverityCritical,
				"Stopped delivering: "+s.Name,
				fmt.Sprintf("Active but got 0 impressions on %s after %s impressions over the 3 days before. Check budget, billing, approvals and schedule.", day, thousands(impr)),
				map[string]any{"impressions_prior_3d": impr, "spend_prior_3d": round2(spend)},
				stoppedKey))
		case s.Days[0].Impressions > 0:
			clears = append(clears, stoppedKey)
		}
	}
	return fires, clears
}

// IntegrationState is one connection's status.
type IntegrationState struct {
	ID          uuid.UUID
	Provider    string
	DisplayName string
	Status      string
	LastError   string
}

// DetectIntegrations fires for connections that need reauthorisation and
// clears every other connection (so reconnecting resolves the alert).
func DetectIntegrations(list []IntegrationState) (fires []Detected, clears []string) {
	for _, in := range list {
		key := KindNeedsReauth + ":" + in.ID.String()
		if in.Status != "needs_reauth" {
			clears = append(clears, key)
			continue
		}
		name := providerLabel(in.Provider)
		if in.DisplayName != "" {
			name += " (" + in.DisplayName + ")"
		}
		id := in.ID
		fires = append(fires, Detected{
			Kind: KindNeedsReauth, Severity: SeverityCritical, EntityType: "integration", EntityID: &id, EntityName: name,
			Title: "Reconnect " + name,
			Body:  "Adwise lost access to this connection, so syncing, rules and schedules for its accounts are paused until you reconnect.",
			Data:  map[string]any{"provider": in.Provider, "last_error": in.LastError}, DedupeKey: key,
		})
	}
	return fires, clears
}

// FailedGroup is the failed actions of one source (rule, schedule, manual)
// on one UTC day.
type FailedGroup struct {
	Source     string // manual | schedule | rule | revert
	SourceID   *uuid.UUID
	SourceName string
	Day        time.Time
	Count      int
	LastError  string
	Entities   []string // a few affected entity names
	LastAt     time.Time
}

// DetectFailedActions produces one alert per source per day; later failures
// the same day update that alert instead of adding more.
func DetectFailedActions(groups []FailedGroup, th Thresholds) []Detected {
	out := make([]Detected, 0, len(groups))
	for _, g := range groups {
		src := "manual"
		if g.SourceID != nil {
			src = g.SourceID.String()
		}
		what := "Manual changes"
		entityType := ""
		switch g.Source {
		case "rule":
			what, entityType = "Rule “"+g.SourceName+"”", "rule"
		case "schedule":
			what, entityType = "Schedule “"+g.SourceName+"”", "schedule"
		case "revert":
			what = "Reverts"
		}
		noun := "action"
		if g.Count != 1 {
			noun = "actions"
		}
		sev := SeverityWarning
		if g.Count >= th.ActionFailedCritical {
			sev = SeverityCritical
		}
		body := fmt.Sprintf("%d %s failed", g.Count, noun)
		if len(g.Entities) > 0 {
			body += " on " + strings.Join(g.Entities, ", ")
		}
		body += "."
		if g.LastError != "" {
			body += " Last error: " + truncate(g.LastError, 200)
		}
		d := Detected{
			Kind: KindActionFailed, Severity: sev, EntityType: entityType, EntityName: g.SourceName,
			Title: what + " failed", Body: body,
			Data:      map[string]any{"count": g.Count, "source": g.Source, "last_error": truncate(g.LastError, 500), "last_at": g.LastAt},
			DedupeKey: KindActionFailed + ":" + g.Source + ":" + src + ":" + g.Day.Format(time.DateOnly),
		}
		if entityType != "" {
			d.EntityID = g.SourceID
		} else {
			d.EntityName = ""
		}
		out = append(out, d)
	}
	return out
}

func providerLabel(p string) string {
	switch p {
	case "meta":
		return "Meta Ads"
	case "google":
		return "Google Ads"
	}
	return p
}

var currencySymbols = map[string]string{"USD": "$", "INR": "₹", "EUR": "€", "GBP": "£", "JPY": "¥", "AUD": "A$", "CAD": "C$"}

// Money formats a major-unit amount with a symbol and thousands separators,
// rounded to whole units (alerts are about magnitudes).
func Money(currency string, v float64) string {
	s := thousands(int64(math.Round(v)))
	if sym, ok := currencySymbols[currency]; ok {
		return sym + s
	}
	return s + " " + currency
}

func thousands(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := strconv.FormatInt(n, 10)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
