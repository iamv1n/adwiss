"use client";

import type { Overview } from "@/lib/analytics-api";
import { ChartLegend, ChartTable, LineChart, type LineSeries } from "./charts";
import { formatDay, formatMoney, formatRoas } from "./format";
import { InlineEmpty, Panel } from "./states";

/** Daily spend vs revenue for one currency, on one money axis. */
export function SpendRevenueTrend({
  overview,
  height = 200,
  title = "Spend and revenue",
}: {
  overview: Overview;
  height?: number;
  title?: string;
}) {
  const currency = overview.currency;
  const points = overview.timeseries ?? [];
  const series: LineSeries[] = [
    { key: "spend", label: "Spend", color: "var(--color-chart-1)", values: points.map((p) => p.spend) },
    { key: "revenue", label: "Revenue", color: "var(--color-chart-2)", values: points.map((p) => p.conversion_value) },
  ];
  const hasData = points.some((p) => (p.spend ?? 0) > 0 || (p.conversion_value ?? 0) > 0);

  return (
    <Panel
      titleId="trend-heading"
      title={title}
      description={currency ? `Per day, in ${currency}` : "Per day"}
      actions={hasData && currency ? <ChartLegend series={series} /> : undefined}
    >
      {!currency ? (
        <InlineEmpty>Pick a currency to see money over time.</InlineEmpty>
      ) : !hasData ? (
        <InlineEmpty>No spend in this period.</InlineEmpty>
      ) : (
        <>
          <LineChart
            dates={points.map((p) => p.date)}
            series={series}
            height={height}
            formatValue={(v) => formatMoney(v, currency)}
            formatAxis={(v) => formatMoney(v, currency, { compact: true })}
            formatX={(d) => formatDay(d)}
            ariaLabel={`Daily spend and revenue in ${currency}, ${formatDay(points[0].date)} to ${formatDay(points[points.length - 1].date)}`}
          />
          <ChartTable
            caption={`Daily spend and revenue in ${currency}`}
            headers={["Date", "Spend", "Revenue", "ROAS"]}
            rows={points.map((p) => [
              formatDay(p.date, { month: "short", day: "numeric", weekday: "short" }),
              formatMoney(p.spend, currency),
              formatMoney(p.conversion_value, currency),
              formatRoas(p.roas),
            ])}
          />
        </>
      )}
    </Panel>
  );
}
