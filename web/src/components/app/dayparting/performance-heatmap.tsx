"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorState } from "@/components/app/analytics/states";
import { formatMoney, formatNumber, formatRoas, formatHour } from "@/components/app/analytics/format";
import type { Dayparting, DaypartingCell, DaypartingMetric } from "@/lib/analytics-api";
import { cn } from "@/lib/utils";

export const HEAT_BG = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
  "bg-heat-6",
] as const;

export const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const HOURS = Array.from({ length: 24 }, (_, h) => h);

export type HeatMetric = Extract<DaypartingMetric, "roas" | "cpa" | "spend" | "conversions">;

export const HEAT_METRICS: { id: HeatMetric; label: string; lowerIsBetter?: boolean }[] = [
  { id: "roas", label: "ROAS" },
  { id: "cpa", label: "CPA", lowerIsBetter: true },
  { id: "spend", label: "Spend" },
  { id: "conversions", label: "Conversions" },
];

function formatValue(metric: HeatMetric, v: number | null, currency: string | null) {
  if (v == null) return "—";
  switch (metric) {
    case "roas":
      return formatRoas(v);
    case "cpa":
    case "spend":
      return formatMoney(v, currency);
    default:
      return formatNumber(Math.round(v * 10) / 10);
  }
}

interface Ranked {
  day: number;
  hour: number;
  value: number;
}

/**
 * Picks the best and worst hours, ignoring cells too thin to trust: ratio
 * metrics need spend (ROAS) or conversions (CPA) behind them.
 */
function rankCells(data: Dayparting, metric: HeatMetric, n = 3) {
  const spends: number[] = [];
  data.days.forEach((d) => d.cells.forEach((c) => c.spend && spends.push(c.spend)));
  spends.sort((a, b) => a - b);
  const minSpend = spends.length ? spends[Math.floor(spends.length * 0.25)] : 0;
  const eligible = (c: DaypartingCell) => {
    if (c.value == null) return false;
    if (metric === "roas") return (c.spend ?? 0) >= minSpend && (c.spend ?? 0) > 0;
    if (metric === "cpa") return c.conversions >= 1;
    return true;
  };
  const cells: Ranked[] = [];
  data.days.forEach((d, day) =>
    d.cells.forEach((c) => {
      if (eligible(c)) cells.push({ day, hour: c.hour, value: c.value! });
    }),
  );
  const lower = HEAT_METRICS.find((m) => m.id === metric)?.lowerIsBetter;
  cells.sort((a, b) => (lower ? a.value - b.value : b.value - a.value));
  return { best: cells.slice(0, n), worst: cells.slice(-n).reverse() };
}

function level(v: number | null, min: number | null, max: number | null, invert: boolean) {
  if (v == null || min == null || max == null) return -1;
  if (max === min) return 3;
  let t = (v - min) / (max - min);
  if (invert) t = 1 - t;
  return Math.min(6, Math.max(1, 1 + Math.floor(t * 6)));
}

/** Weekday × hour heatmap of the /analytics/dayparting response. */
export function PerformanceHeatmap({
  data,
  metric,
  onMetricChange,
  error,
  onRetry,
  loading,
  overlay,
  overlayLabel,
}: {
  data: Dayparting | undefined;
  metric: HeatMetric;
  onMetricChange: (m: HeatMetric) => void;
  error?: unknown;
  onRetry?: () => void;
  loading?: boolean;
  /** Optional 7×24 mask drawn as hatching (e.g. the hours a schedule turns off). */
  overlay?: boolean[][];
  overlayLabel?: string;
}) {
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);
  const [focus, setFocus] = useState({ day: 0, hour: 9 });
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const info = HEAT_METRICS.find((m) => m.id === metric)!;
  const currency = data?.currency ?? null;

  const ranked = useMemo(() => (data ? rankCells(data, metric) : { best: [], worst: [] }), [data, metric]);
  const bestSet = useMemo(() => new Set(ranked.best.map((c) => c.day * 24 + c.hour)), [ranked]);
  const worstSet = useMemo(() => new Set(ranked.worst.map((c) => c.day * 24 + c.hour)), [ranked]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let { day, hour } = focus;
    switch (e.key) {
      case "ArrowRight": hour = Math.min(23, hour + 1); break;
      case "ArrowLeft": hour = Math.max(0, hour - 1); break;
      case "ArrowDown": day = Math.min(6, day + 1); break;
      case "ArrowUp": day = Math.max(0, day - 1); break;
      case "Escape": setActive(null); return;
      default: return;
    }
    e.preventDefault();
    setFocus({ day, hour });
    setActive({ day, hour });
    refs.current[day * 24 + hour]?.focus();
  };

  const moneyMixed = data?.mixed_currency && (metric === "roas" || metric === "cpa" || metric === "spend");

  return (
    <section aria-labelledby="perf-heatmap" className="rounded-xl border border-border bg-surface p-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="perf-heatmap" className="text-sm font-semibold text-fg">
            Performance by hour × weekday
          </h2>
          <p className="text-xs text-fg-muted">
            {info.label}
            {data?.aggregation === "average_per_day" && metric !== "roas" && metric !== "cpa" ? " (average per day)" : ""}
            {data ? ` · ${data.timezones.join(", ") || "account time"}` : ""}
            {data?.mixed_timezones ? " (each account's own clock)" : ""}
          </p>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={metric}
          onValueChange={(v) => v && onMetricChange(v as HeatMetric)}
          aria-label="Heatmap metric"
        >
          {HEAT_METRICS.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id} className="h-7 px-2.5 text-xs">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={onRetry} className="mt-3" />
      ) : (
        <div className={cn("mt-3 transition-opacity", loading && "opacity-60")}>
          <div aria-hidden="true" className="mb-1 grid grid-cols-[2.25rem_1fr] gap-1">
            <span />
            <div className="grid grid-cols-24 gap-[3px] font-mono text-[0.625rem] text-fg-subtle">
              {HOURS.map((h) => (
                <span key={h} className="text-center tabular-nums">
                  {h % 2 === 0 ? String(h).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
          </div>
          <div
            role="grid"
            aria-label={`${info.label} by weekday and hour. ${info.lowerIsBetter ? "Lower is better; the scale is inverted." : ""} Use arrow keys to move between cells.`}
            onKeyDown={onKeyDown}
            onMouseLeave={() => setActive(null)}
            className="flex flex-col gap-[3px]"
          >
            {DAYS_SHORT.map((d, day) => {
              const row = data?.days[day];
              return (
                <div role="row" key={d} className="grid grid-cols-[2.25rem_1fr] items-center gap-1">
                  <div role="rowheader" className="text-xs font-medium text-fg-muted">
                    <abbr title={DAYS_LONG[day]} className="no-underline">
                      {d}
                    </abbr>
                  </div>
                  <div className="grid grid-cols-24 gap-[3px]">
                    {HOURS.map((hour) => {
                      const i = day * 24 + hour;
                      const cell = row?.cells[hour];
                      const v = cell?.value ?? null;
                      const lv = moneyMixed ? -1 : level(v, data?.min ?? null, data?.max ?? null, !!info.lowerIsBetter);
                      const isBest = bestSet.has(i);
                      const isWorst = worstSet.has(i);
                      const covered = overlay?.[day]?.[hour];
                      return (
                        <div
                          role="gridcell"
                          key={hour}
                          ref={(el) => {
                            refs.current[i] = el;
                          }}
                          tabIndex={focus.day === day && focus.hour === hour ? 0 : -1}
                          aria-label={`${DAYS_LONG[day]} ${formatHour(hour)}: ${info.label} ${formatValue(metric, v, currency)}${isBest ? ", among the best hours" : ""}${isWorst ? ", among the worst hours" : ""}${covered ? `, ${overlayLabel ?? "covered by schedule"}` : ""}`}
                          onMouseEnter={() => setActive({ day, hour })}
                          onFocus={() => {
                            setFocus({ day, hour });
                            setActive({ day, hour });
                          }}
                          onBlur={() => setActive(null)}
                          className={cn(
                            "relative h-6 rounded-[3px] outline-none",
                            lv < 0 ? "bg-bg-subtle" : HEAT_BG[lv],
                            "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
                            isBest && "ring-2 ring-fg ring-offset-1 ring-offset-surface",
                            isWorst && "outline-dashed outline-2 -outline-offset-2 outline-fg/70",
                            active?.day === day && active?.hour === hour && "z-10 ring-2 ring-fg/60",
                          )}
                        >
                          {covered ? (
                            <span
                              aria-hidden="true"
                              className="absolute inset-0 rounded-[inherit] bg-[repeating-linear-gradient(135deg,var(--color-fg)_0_1px,transparent_1px_4px)] opacity-30"
                            />
                          ) : null}
                          {active?.day === day && active?.hour === hour && cell ? (
                            <CellTooltip day={day} cell={cell} currency={currency} metric={metric} />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-subtle">
              <span className="inline-flex items-center gap-1.5">
                <span>{info.lowerIsBetter ? "High" : "Low"}</span>
                <span aria-hidden="true" className="flex gap-0.5">
                  {HEAT_BG.slice(1).map((bg) => (
                    <span key={bg} className={cn("size-3 rounded-[2px]", bg)} />
                  ))}
                </span>
                <span>{info.lowerIsBetter ? "Low (better)" : "High"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-[2px] bg-heat-4 ring-2 ring-fg ring-offset-1 ring-offset-surface" />
                Best
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-[2px] bg-heat-1 outline-dashed outline-2 -outline-offset-2 outline-fg/70" />
                Worst
              </span>
              {overlay ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-[2px] bg-heat-2 bg-[repeating-linear-gradient(135deg,var(--color-fg)_0_1px,transparent_1px_4px)]"
                  />
                  {overlayLabel ?? "Schedule off"}
                </span>
              ) : null}
            </div>
            {moneyMixed ? (
              <p className="text-fg-muted">Accounts use several currencies; pick one to see money metrics.</p>
            ) : ranked.best.length ? (
              <p className="text-fg-muted" aria-live="polite">
                Best:{" "}
                <span className="font-medium text-fg">
                  {ranked.best.map((c) => `${DAYS_SHORT[c.day]} ${formatHour(c.hour)}`).join(", ")}
                </span>{" "}
                · Worst:{" "}
                <span className="font-medium text-fg">
                  {ranked.worst.map((c) => `${DAYS_SHORT[c.day]} ${formatHour(c.hour)}`).join(", ")}
                </span>
              </p>
            ) : data ? (
              <p className="text-fg-muted">No hourly data in this range yet.</p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function CellTooltip({
  day,
  cell,
  currency,
  metric,
}: {
  day: number;
  cell: DaypartingCell;
  currency: string | null;
  metric: HeatMetric;
}) {
  const hour = cell.hour;
  const align = hour < 4 ? "left-0" : hour > 19 ? "right-0" : "left-1/2 -translate-x-1/2";
  const vertical = day < 3 ? "top-full mt-1.5" : "bottom-full mb-1.5";
  const spend = cell.spend;
  const rows: [string, string, boolean][] = [
    ["ROAS", formatRoas(spend && cell.conversion_value != null ? cell.conversion_value / spend : null), metric === "roas"],
    ["CPA", formatMoney(spend != null && cell.conversions ? spend / cell.conversions : null, currency), metric === "cpa"],
    ["Spend", formatMoney(spend, currency), metric === "spend"],
    ["Revenue", formatMoney(cell.conversion_value, currency), false],
    ["Conversions", formatNumber(Math.round(cell.conversions * 10) / 10), metric === "conversions"],
    ["Clicks", formatNumber(cell.clicks), false],
  ];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-30 w-48 rounded-lg border border-border bg-surface-raised p-2.5 text-left shadow-lg",
        align,
        vertical,
      )}
    >
      <p className="mb-1 text-[0.6875rem] font-semibold text-fg">
        {DAYS_LONG[day]} · {formatHour(hour)}–{formatHour((hour + 1) % 24)}
      </p>
      <p className="mb-1.5 text-[0.625rem] text-fg-subtle">Totals over the range</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[0.6875rem]">
        {rows.map(([k, v, on]) => (
          <div key={k} className="contents">
            <dt className={on ? "font-medium text-fg" : "text-fg-subtle"}>{k}</dt>
            <dd className={cn("text-right font-mono tabular-nums", on ? "font-semibold text-fg" : "text-fg-muted")}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
