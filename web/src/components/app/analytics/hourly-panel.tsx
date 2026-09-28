"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHourly, type AnalyticsScope, type HourRow } from "@/lib/analytics-api";
import { cn } from "@/lib/utils";
import { ChartTable, ColumnChart } from "./charts";
import { formatHour, formatMoney, formatNumber, formatRoas } from "./format";
import { ErrorState, InlineEmpty, Panel } from "./states";

type HourMetric = "spend" | "conversions" | "roas" | "cpa";

const METRICS: { value: HourMetric; label: string }[] = [
  { value: "spend", label: "Spend" },
  { value: "conversions", label: "Conversions" },
  { value: "roas", label: "ROAS" },
  { value: "cpa", label: "CPA" },
];

/** Hours with less than this share of spend are too thin to call best/worst. */
const MIN_SHARE = 0.01;

export function HourlyPanel({
  orgId,
  scope,
  enabled,
}: {
  orgId: string | undefined;
  scope: AnalyticsScope;
  enabled: boolean;
}) {
  const [metric, setMetric] = useState<HourMetric>("spend");
  const q = useHourly(orgId, scope, { enabled });
  const d = q.data;
  const currency = d?.currency ?? null;

  const value = (h: HourRow): number | null => h[metric];
  const fmt = (v: number | null) => {
    if (metric === "roas") return formatRoas(v);
    if (metric === "conversions") return formatNumber(v == null ? null : Math.round(v * 10) / 10);
    return formatMoney(v, currency);
  };
  const fmtAxis = (v: number) => {
    if (metric === "roas") return `${v}×`;
    if (metric === "conversions") return formatNumber(v, { compact: true });
    return formatMoney(v, currency, { compact: true });
  };

  const hours = d?.hours ?? [];
  const hasData = hours.some((h) => h.impressions > 0 || (h.spend ?? 0) > 0);

  // One actionable line: the best and worst hour for the chosen metric.
  let insight: string | null = null;
  if (hasData) {
    const totalSpend = hours.reduce((a, h) => a + (h.spend ?? 0), 0);
    const eligible = hours.filter((h) => value(h) != null && (totalSpend === 0 || (h.spend ?? 0) / totalSpend >= MIN_SHARE));
    if (eligible.length > 1) {
      const sorted = [...eligible].sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0));
      const hi = sorted[0];
      const lo = sorted[sorted.length - 1];
      const lowerIsBetter = metric === "cpa";
      const best = lowerIsBetter ? lo : hi;
      const worst = lowerIsBetter ? hi : lo;
      insight =
        metric === "spend" || metric === "conversions"
          ? `Peak at ${formatHour(hi.hour)} (${fmt(value(hi))}), quietest at ${formatHour(lo.hour)} (${fmt(value(lo))}).`
          : `Best at ${formatHour(best.hour)} (${fmt(value(best))}), worst at ${formatHour(worst.hour)} (${fmt(value(worst))}).`;
    }
  }

  const tz = d?.timezones.length ? d.timezones.join(", ") : "account time";

  return (
    <Panel
      titleId="hourly-heading"
      title="Hour of day"
      description={`Summed over the period, in each account's local time (${tz}).`}
      actions={
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={metric}
          onValueChange={(v) => v && setMetric(v as HourMetric)}
          aria-label="Hour of day metric"
        >
          {METRICS.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="text-xs">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-48 w-full" />
      ) : !hasData ? (
        <InlineEmpty>No hourly data for this period.</InlineEmpty>
      ) : (
        <div className={cn("transition-opacity", q.isPlaceholderData && "opacity-60")}>
          {insight && <p className="mb-4 text-sm text-fg">{insight}</p>}
          <ColumnChart
            ariaLabel={`${METRICS.find((m) => m.value === metric)?.label} by hour of day`}
            columns={hours.map((h) => ({ key: String(h.hour).padStart(2, "0"), label: formatHour(h.hour), value: value(h) }))}
            formatValue={fmt}
            formatAxis={fmtAxis}
            renderTip={(_, i) => {
              const h = hours[i];
              return (
                <>
                  <p className="text-fg-muted">
                    {formatHour(h.hour)}–{formatHour((h.hour + 1) % 24)}
                  </p>
                  <p className="mt-0.5 font-semibold text-fg tabular-nums">
                    {fmt(value(h))}{" "}
                    <span className="font-normal text-fg-muted">{METRICS.find((m) => m.value === metric)?.label}</span>
                  </p>
                  {metric !== "spend" && (
                    <p className="text-fg-muted tabular-nums">Spend {formatMoney(h.spend, currency)}</p>
                  )}
                  {metric !== "conversions" && (
                    <p className="text-fg-muted tabular-nums">{formatNumber(Math.round(h.conversions * 10) / 10)} conversions</p>
                  )}
                </>
              );
            }}
          />
          <ChartTable
            caption="Performance by hour of day"
            headers={["Hour", "Spend", "Conversions", "CPA", "ROAS"]}
            rows={hours.map((h) => [
              formatHour(h.hour),
              formatMoney(h.spend, currency),
              formatNumber(Math.round(h.conversions * 10) / 10),
              formatMoney(h.cpa, currency),
              formatRoas(h.roas),
            ])}
          />
        </div>
      )}
    </Panel>
  );
}
