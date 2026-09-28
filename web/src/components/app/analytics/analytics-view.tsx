"use client";

import { useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { PageHeader } from "@/components/app/page-header";
import { DataAnalysisIllustration } from "@/components/app/illustrations";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Provider } from "@/lib/api";
import type { MetricValues, RangePreset } from "@/lib/analytics-api";
import { cn } from "@/lib/utils";
import { BreakdownPanel } from "./breakdown-panel";
import { CurrencyPicker, RangePicker } from "./controls";
import { formatMoney, formatNumber, formatRange, formatRoas } from "./format";
import { HourlyPanel } from "./hourly-panel";
import { KPI, KpiTiles } from "./kpis";
import { StatTileSkeleton } from "./stat-tile";
import { ErrorState, Panel } from "./states";
import { SpendRevenueTrend } from "./trend-panel";
import { useAnalyticsScope } from "./use-analytics-scope";

const TOTALS = [KPI.spend, KPI.revenue, KPI.roas, KPI.cpa, KPI.conversions, KPI.ctr, KPI.cpc, KPI.impressions];

export function AnalyticsView() {
  const [days, setDays] = useState<RangePreset>(30);
  const [compareOn, setCompareOn] = useState(true);
  const [provider, setProvider] = useState<Provider | "all">("all");
  const s = useAnalyticsScope({
    days,
    compare: compareOn ? "previous_period" : "none",
    provider: provider === "all" ? undefined : provider,
  });
  const ov = s.overview;
  const hasData = ov.data?.timeseries.some((p) => p.impressions > 0 || (p.spend ?? 0) > 0) ?? false;

  const header = (
    <PageHeader
      title="Analytics"
      description="Compare periods and break performance down by hour, device, geography and placement."
    />
  );

  if (s.hasAccounts === false) {
    return (
      <div className="grid gap-8">
        {header}
        <EmptyState
          illustration={<DataAnalysisIllustration className="h-auto w-full" />}
          title="Connect Meta or Google to see data"
          description="Adwise normalizes spend, conversions and revenue across providers. ROAS, CPA, CTR and CPC are then calculated the same way everywhere."
          actions={<ConnectCta />}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {header}

      {/* One filter row scoping everything below it. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <RangePicker value={days} onChange={setDays} />
        <div className="flex items-center gap-2">
          <Switch id="compare-toggle" checked={compareOn} onCheckedChange={setCompareOn} />
          <Label htmlFor="compare-toggle" className="font-normal text-fg">
            Compare to previous period
          </Label>
        </div>
        <Select value={provider} onValueChange={(v) => setProvider(v as Provider | "all")}>
          <SelectTrigger size="sm" className="w-40" aria-label="Platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="meta">Meta</SelectItem>
            <SelectItem value="google">Google</SelectItem>
          </SelectContent>
        </Select>
        {s.mixed && <CurrencyPicker currencies={s.currencies} value={s.currency} onChange={s.setCurrency} />}
        {ov.data && (
          <p className="text-sm text-fg-muted sm:ml-auto">
            {formatRange(ov.data.range.from, ov.data.range.to)}
            {ov.data.comparison && (
              <> vs {formatRange(ov.data.comparison.from, ov.data.comparison.to)}</>
            )}
          </p>
        )}
      </div>

      {s.accounts.isError ? (
        <ErrorState error={s.accounts.error} onRetry={() => s.accounts.refetch()} />
      ) : ov.isError ? (
        <ErrorState error={ov.error} onRetry={() => ov.refetch()} />
      ) : !ov.data ? (
        <section aria-label="Totals" aria-busy="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {TOTALS.map((k) => (
            <StatTileSkeleton key={k.key} />
          ))}
        </section>
      ) : !hasData ? (
        <EmptyState
          illustration={<DataAnalysisIllustration className="h-auto w-full" />}
          title={`No data for the last ${days} days`}
          description={
            provider !== "all"
              ? "Nothing was imported for this platform in this period. Try another platform or a longer range."
              : "Your accounts are connected, but nothing has been imported for this period yet. A first sync can take a few minutes."
          }
        />
      ) : (
        <>
          <section
            aria-label="Totals"
            className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", ov.isPlaceholderData && "opacity-60")}
          >
            <KpiTiles
              defs={TOTALS}
              totals={ov.data.totals}
              deltas={compareOn ? ov.data.deltas : null}
              deltaSuffix="vs prev."
              hint={compareOn ? undefined : `${ov.data.range.days} days`}
            />
          </section>

          {s.mixed && s.byCurrency && <PerCurrency byCurrency={s.byCurrency} />}

          <div className={cn("transition-opacity", ov.isPlaceholderData && "opacity-60")}>
            <SpendRevenueTrend overview={ov.data} />
          </div>

          <BreakdownPanel orgId={s.orgId} scope={s.scope} enabled={s.scopeReady} />
          <HourlyPanel orgId={s.orgId} scope={s.scope} enabled={s.scopeReady} />
        </>
      )}
    </div>
  );
}

/** Totals for each currency side by side; never converted or added up. */
function PerCurrency({ byCurrency }: { byCurrency: Record<string, MetricValues> }) {
  const entries = Object.entries(byCurrency).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Panel
      titleId="per-currency-heading"
      title="By currency"
      description="Each currency's totals on their own. Amounts in different currencies are never added together."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-fg-muted">
              <th scope="col" className="py-2 pr-3 text-left font-medium">Currency</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Spend</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Revenue</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">ROAS</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">CPA</th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">Conversions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([c, v]) => (
              <tr key={c} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-mono font-medium text-fg">{c}</th>
                <td className="px-3 py-2 text-right text-fg tabular-nums">{formatMoney(v.spend, c)}</td>
                <td className="px-3 py-2 text-right text-fg tabular-nums">{formatMoney(v.conversion_value, c)}</td>
                <td className="px-3 py-2 text-right text-fg tabular-nums">{formatRoas(v.roas)}</td>
                <td className="px-3 py-2 text-right text-fg tabular-nums">{formatMoney(v.cpa, c)}</td>
                <td className="py-2 pl-3 text-right text-fg tabular-nums">{formatNumber(v.conversions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
