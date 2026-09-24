package metrics

import "math"

// Measures are the additive measures of one or more facts. Money is in micros
// of a single currency; callers must never add Measures of different
// currencies (see Totals).
type Measures struct {
	Impressions           int64   `json:"impressions"`
	Clicks                int64   `json:"clicks"`
	SpendMicros           int64   `json:"spend_micros"`
	Conversions           float64 `json:"conversions"`
	ConversionValueMicros int64   `json:"conversion_value_micros"`
}

// Add returns m + o. Only valid when both are in the same currency.
func (m Measures) Add(o Measures) Measures {
	return Measures{
		Impressions:           m.Impressions + o.Impressions,
		Clicks:                m.Clicks + o.Clicks,
		SpendMicros:           m.SpendMicros + o.SpendMicros,
		Conversions:           m.Conversions + o.Conversions,
		ConversionValueMicros: m.ConversionValueMicros + o.ConversionValueMicros,
	}
}

// IsZero reports whether no activity was recorded.
func (m Measures) IsZero() bool { return m == Measures{} }

// Values is the API representation of summed measures and the metrics derived
// from them. Money is a decimal amount in Currency.
//
// Derived metrics are always computed from the summed measures (never averaged
// from per-row ratios) and are null when their denominator is zero. Ratios are
// fractions, not percentages: CTR 0.0213 means 2.13%.
//
// When the underlying rows span several currencies, Currency is null and every
// money-based field (spend, conversion_value, cpc, cpm, cpa, roas, acos) is
// null: amounts in different currencies are never summed.
type Values struct {
	Currency        *string  `json:"currency"`
	Impressions     int64    `json:"impressions"`
	Clicks          int64    `json:"clicks"`
	Spend           *float64 `json:"spend"`
	Conversions     float64  `json:"conversions"`
	ConversionValue *float64 `json:"conversion_value"`

	CTR  *float64 `json:"ctr"`  // clicks / impressions
	CPC  *float64 `json:"cpc"`  // spend / clicks
	CPM  *float64 `json:"cpm"`  // spend / impressions × 1000
	CPA  *float64 `json:"cpa"`  // spend / conversions
	CVR  *float64 `json:"cvr"`  // conversions / clicks
	ROAS *float64 `json:"roas"` // conversion_value / spend
	ACOS *float64 `json:"acos"` // spend / conversion_value
}

// MicrosToUnits converts micros to a decimal amount.
func MicrosToUnits(micros int64) float64 { return round(float64(micros) / 1e6) }

// Compute returns the Values for measures in a single currency.
func Compute(m Measures, currency string) Values {
	v := computeCounts(m)
	cur := currency
	v.Currency = &cur
	spend := float64(m.SpendMicros) / 1e6
	value := float64(m.ConversionValueMicros) / 1e6
	v.Spend = ptr(round(spend))
	v.ConversionValue = ptr(round(value))
	v.CPC = ratio(spend, float64(m.Clicks))
	v.CPM = ratio(spend*1000, float64(m.Impressions))
	v.CPA = ratio(spend, m.Conversions)
	v.ROAS = ratio(value, spend)
	v.ACOS = ratio(spend, value)
	return v
}

// ComputeMixed returns Values for measures summed across currencies: counts
// and count-based ratios only, with every money field null.
func ComputeMixed(m Measures) Values { return computeCounts(m) }

func computeCounts(m Measures) Values {
	return Values{
		Impressions: m.Impressions,
		Clicks:      m.Clicks,
		Conversions: round(m.Conversions),
		CTR:         ratio(float64(m.Clicks), float64(m.Impressions)),
		CVR:         ratio(m.Conversions, float64(m.Clicks)),
	}
}

// Totals accumulates measures per currency so that money is never summed
// across currencies.
type Totals map[string]Measures

func (t Totals) Add(currency string, m Measures) { t[currency] = t[currency].Add(m) }

// Currencies returns the currencies present, in no particular order.
func (t Totals) Currencies() []string {
	out := make([]string, 0, len(t))
	for c := range t {
		out = append(out, c)
	}
	return out
}

// Sum returns the measures summed across currencies. Only the count fields
// are meaningful when more than one currency is present.
func (t Totals) Sum() Measures {
	var s Measures
	for _, m := range t {
		s = s.Add(m)
	}
	return s
}

// Values computes the API values: full values for a single currency, counts
// only for mixed currencies. With no data, currency is fallback (may be "").
func (t Totals) Values(fallbackCurrency string) Values {
	switch len(t) {
	case 0:
		if fallbackCurrency == "" {
			return ComputeMixed(Measures{})
		}
		return Compute(Measures{}, fallbackCurrency)
	case 1:
		for c, m := range t {
			return Compute(m, c)
		}
	}
	return ComputeMixed(t.Sum())
}

func ratio(num, den float64) *float64 {
	if den == 0 {
		return nil
	}
	return ptr(round(num / den))
}

// round keeps 6 decimal places, enough for micros and ratios, and removes
// float noise such as 0.30000000000000004 from API output.
func round(f float64) float64 { return math.Round(f*1e6) / 1e6 }

func ptr[T any](v T) *T { return &v }
