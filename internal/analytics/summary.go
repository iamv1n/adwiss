package analytics

import (
	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/metrics"
)

// Summary is embedded in every analytics response:
//
//   - currency / currencies / mixed_currency: the currency of the response's
//     money fields (null when mixed)
//   - totals: measures and derived metrics over the whole scope; money is null
//     when currencies are mixed
//   - by_currency: totals per currency (always complete, never blended)
//   - by_provider: the same per provider; only present when the request has
//     no provider filter, so the UI can show blended or per-platform numbers
type Summary struct {
	CurrencyInfo
	Totals     metrics.Values                   `json:"totals"`
	ByCurrency map[string]metrics.Values        `json:"by_currency"`
	ByProvider map[ads.Provider]ProviderSummary `json:"by_provider,omitempty"`
}

type ProviderSummary struct {
	CurrencyInfo
	Totals     metrics.Values            `json:"totals"`
	ByCurrency map[string]metrics.Values `json:"by_currency"`
	Previous   *metrics.Values           `json:"previous,omitempty"`
	Deltas     Deltas                    `json:"deltas,omitempty"`
}

// accum collects measures per currency, overall and per provider.
type accum struct {
	all        metrics.Totals
	byProvider map[ads.Provider]metrics.Totals
}

func newAccum() *accum {
	return &accum{all: metrics.Totals{}, byProvider: map[ads.Provider]metrics.Totals{}}
}

func (a *accum) add(p ads.Provider, currency string, m metrics.Measures) {
	a.all.Add(currency, m)
	if a.byProvider[p] == nil {
		a.byProvider[p] = metrics.Totals{}
	}
	a.byProvider[p].Add(currency, m)
}

func byCurrency(t metrics.Totals) map[string]metrics.Values {
	out := make(map[string]metrics.Values, len(t))
	for c, m := range t {
		out[c] = metrics.Compute(m, c)
	}
	return out
}

// summarize builds the Summary for cur. ci is the response-level currency
// decision. prev (optional) adds previous/deltas to each provider entry.
func summarize(res resolved, ci CurrencyInfo, cur, prev *accum) Summary {
	s := Summary{CurrencyInfo: ci, Totals: ci.values(cur.all), ByCurrency: byCurrency(cur.all)}
	if res.filter.Provider != "" {
		return s
	}
	s.ByProvider = map[ads.Provider]ProviderSummary{}
	for _, p := range res.providers() {
		t := cur.byProvider[p]
		if t == nil {
			t = metrics.Totals{}
		}
		totals := []metrics.Totals{t}
		if prev != nil && prev.byProvider[p] != nil {
			totals = append(totals, prev.byProvider[p])
		}
		pci := currencyInfo(res.fallbackFor(p), totals...)
		ps := ProviderSummary{CurrencyInfo: pci, Totals: pci.values(t), ByCurrency: byCurrency(t)}
		if prev != nil {
			pt := prev.byProvider[p]
			if pt == nil {
				pt = metrics.Totals{}
			}
			pv := pci.values(pt)
			ps.Previous = &pv
			ps.Deltas = ComputeDeltas(ps.Totals, pv)
		}
		s.ByProvider[p] = ps
	}
	return s
}

// providers lists the providers of the accounts in scope.
func (r resolved) providers() []ads.Provider {
	seen := map[ads.Provider]bool{}
	var out []ads.Provider
	for _, a := range r.accounts {
		p := ads.Provider(a.Provider)
		if !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}

// fallbackFor is the single currency of the provider's scoped accounts, if any.
func (r resolved) fallbackFor(p ads.Provider) string {
	cur := ""
	for _, a := range r.accounts {
		if ads.Provider(a.Provider) != p {
			continue
		}
		if cur != "" && cur != a.Currency {
			return ""
		}
		cur = a.Currency
	}
	return cur
}
