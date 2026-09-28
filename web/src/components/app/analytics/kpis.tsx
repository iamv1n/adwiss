import type { KpiId } from "@/lib/ad-profile";
import type { Deltas, MetricKey, MetricValues } from "@/lib/analytics-api";
import { formatMoney, formatNumber, formatPercent, formatRoas } from "./format";
import { StatTile, type Polarity } from "./stat-tile";

export interface KpiDef {
  key: MetricKey;
  label: string;
  polarity: Polarity;
  format: (v: MetricValues) => string;
}

const money = (k: "spend" | "conversion_value" | "cpa" | "cpc" | "cpm", compact: boolean) => (v: MetricValues) =>
  formatMoney(v[k], v.currency, { compact });

export const KPI: Record<string, KpiDef> = {
  spend: { key: "spend", label: "Spend", polarity: "neutral", format: money("spend", true) },
  revenue: { key: "conversion_value", label: "Revenue", polarity: "up-good", format: money("conversion_value", true) },
  roas: { key: "roas", label: "ROAS", polarity: "up-good", format: (v) => formatRoas(v.roas) },
  cpa: { key: "cpa", label: "CPA", polarity: "down-good", format: money("cpa", false) },
  conversions: { key: "conversions", label: "Conversions", polarity: "up-good", format: (v) => formatNumber(v.conversions) },
  ctr: { key: "ctr", label: "CTR", polarity: "up-good", format: (v) => formatPercent(v.ctr, 2) },
  cpc: { key: "cpc", label: "CPC", polarity: "down-good", format: money("cpc", false) },
  impressions: {
    key: "impressions",
    label: "Impressions",
    polarity: "neutral",
    format: (v) => formatNumber(v.impressions, { compact: true }),
  },
  cpm: { key: "cpm", label: "CPM", polarity: "down-good", format: money("cpm", false) },
};

const relabel = (d: KpiDef, label: string): KpiDef => ({ ...d, label });

/** Dashboard tiles by id (see `KpiId` in lib/ad-profile), relabelled for the kind of ads. */
export const KPI_BY_ID: Record<KpiId, KpiDef> = {
  spend: KPI.spend,
  revenue: KPI.revenue,
  roas: KPI.roas,
  cpa: KPI.cpa,
  conversions: KPI.conversions,
  purchases: relabel(KPI.conversions, "Purchases"),
  leads: relabel(KPI.conversions, "Leads"),
  results: relabel(KPI.conversions, "Results"),
  installs: relabel(KPI.conversions, "Installs"),
  cost_per_lead: relabel(KPI.cpa, "Cost per lead"),
  cost_per_result: relabel(KPI.cpa, "Cost per result"),
  cost_per_install: relabel(KPI.cpa, "Cost per install"),
  ctr: KPI.ctr,
  cpc: KPI.cpc,
  cpm: KPI.cpm,
  impressions: KPI.impressions,
};

export function KpiTiles({
  defs,
  totals,
  deltas,
  deltaSuffix,
  hint,
  dimmed,
}: {
  defs: KpiDef[];
  totals: MetricValues;
  deltas?: Deltas | null;
  deltaSuffix?: string;
  hint?: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <>
      {defs.map((d) => (
        <StatTile
          key={d.key}
          label={d.label}
          value={d.format(totals)}
          delta={deltas?.[d.key] ?? null}
          polarity={d.polarity}
          deltaSuffix={deltaSuffix}
          hint={deltas ? "No comparison" : hint}
          dimmed={dimmed}
        />
      ))}
    </>
  );
}
