"use client";

/**
 * Hand-built charts (no chart library). Follows the dataviz rules: one y-axis,
 * 2px lines, hairline solid grid, ≤24px columns with 4px rounded data ends,
 * surface-ringed hover dots, a crosshair/per-mark tooltip that also works with
 * the keyboard, and a table view so no value is tooltip-only. Colors come from
 * the design tokens (chart-1…8), so charts re-theme with the brand and dark mode.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { niceTicks } from "./format";

function useElementWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

export interface LineSeries {
  key: string;
  label: string;
  /** A CSS color, normally `var(--color-chart-N)`. */
  color: string;
  values: (number | null)[];
}

function LineKey({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} />;
}

export function ChartLegend({ series }: { series: { key: string; label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <LineKey color={s.color} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

const M = { top: 8, right: 76, bottom: 24, left: 60 };

/**
 * Multi-series line chart over dates sharing one unit (e.g. spend and revenue
 * in one currency). Never pass series with different units: that would need a
 * second axis, which this chart deliberately doesn't support.
 */
export function LineChart({
  dates,
  series,
  formatValue,
  formatAxis,
  formatX,
  height = 200,
  ariaLabel,
}: {
  dates: string[];
  series: LineSeries[];
  formatValue: (v: number | null) => string;
  formatAxis: (v: number) => string;
  formatX: (d: string) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = dates.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height;
  const svgH = plotH + M.top + M.bottom;

  let max = 0;
  for (const s of series) for (const v of s.values) if (v != null && v > max) max = v;
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;

  const x = useCallback(
    (i: number) => M.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1)),
    [n, plotW],
  );
  const y = (v: number) => M.top + plotH - (v / top) * plotH;

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  // Direct end labels, dropped when they would collide (the legend still carries identity).
  const ends = series
    .map((s) => {
      for (let i = s.values.length - 1; i >= 0; i--) {
        const v = s.values[i];
        if (v != null) return { key: s.key, label: s.label, x: x(i), y: y(v) };
      }
      return null;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.y - b.y);
  const endsFit = ends.every((e, i) => i === 0 || e.y - ends[i - 1].y >= 14);

  const maxXLabels = Math.max(2, Math.min(6, Math.floor(plotW / 84)));
  const xIdx =
    n <= maxXLabels
      ? dates.map((_, i) => i)
      : Array.from({ length: maxXLabels }, (_, k) => Math.round((k * (n - 1)) / (maxXLabels - 1)));

  const indexAt = (clientX: number, rectLeft: number) => {
    if (n === 0) return null;
    const px = clientX - rectLeft - M.left;
    const i = n <= 1 ? 0 : Math.round((px / plotW) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const d = e.key === "ArrowLeft" ? -1 : 1;
      setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + d)));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
  };

  const tipW = 176;
  // Beside the crosshair (right of it, or left near the right edge) so it never hides the lines at X.
  const tipLeft =
    active == null
      ? 0
      : x(active) + 12 + tipW <= width
        ? x(active) + 12
        : Math.max(0, x(active) - 12 - tipW);

  return (
    <div ref={ref} className="relative w-full" style={{ height: svgH }}>
      {width > 0 && (
        <svg
          width={width}
          height={svgH}
          role="img"
          aria-label={`${ariaLabel}. Use the left and right arrow keys to read values by date.`}
          tabIndex={0}
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onKeyDown={onKey}
          onFocus={() => setActive((a) => a ?? n - 1)}
          onBlur={() => setActive(null)}
          onPointerMove={(e) => setActive(indexAt(e.clientX, e.currentTarget.getBoundingClientRect().left))}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "var(--color-border-strong)" : "var(--color-border)"}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={M.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-fg-subtle text-[11px] tabular-nums"
              >
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {xIdx.map((i, k) => (
            <text
              key={i}
              x={x(i)}
              y={M.top + plotH + 16}
              textAnchor={k === 0 && xIdx.length > 1 ? "start" : k === xIdx.length - 1 && xIdx.length > 1 ? "end" : "middle"}
              className="fill-fg-subtle text-[11px] tabular-nums"
            >
              {formatX(dates[i])}
            </text>
          ))}
          {active != null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={M.top}
              y2={M.top + plotH}
              stroke="var(--color-border-strong)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          )}
          {series.map((s, si) => (
            <path
              key={s.key}
              d={paths[si]}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {active != null &&
            series.map((s) => {
              const v = s.values[active];
              return v == null ? null : (
                <circle
                  key={s.key}
                  cx={x(active)}
                  cy={y(v)}
                  r={4}
                  fill={s.color}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              );
            })}
          {endsFit &&
            ends.map((e) => (
              <text key={e.key} x={e.x + 8} y={e.y} dy="0.32em" className="fill-fg-muted text-[11px]">
                {e.label}
              </text>
            ))}
        </svg>
      )}
      {active != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-md"
          style={{ left: tipLeft, width: tipW }}
          aria-live="polite"
        >
          <p className="text-fg-muted">{formatX(dates[active])}</p>
          <ul className="mt-1 grid gap-0.5">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <LineKey color={s.color} />
                <span className="font-semibold text-fg tabular-nums">{formatValue(s.values[active])}</span>
                <span className="ml-auto text-fg-muted">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export interface Column {
  key: string;
  label: string;
  value: number | null;
}

/**
 * Single-series column chart (e.g. 24 hours). One color for every column;
 * each column is its own hover/focus target with a tooltip.
 */
export function ColumnChart({
  columns,
  formatValue,
  formatAxis,
  tickEvery = 3,
  height = 160,
  ariaLabel,
  renderTip,
}: {
  columns: Column[];
  formatValue: (v: number | null) => string;
  formatAxis: (v: number) => string;
  tickEvery?: number;
  height?: number;
  ariaLabel: string;
  renderTip?: (c: Column, i: number) => React.ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  let max = 0;
  for (const c of columns) if (c.value != null && c.value > max) max = c.value;
  const ticks = niceTicks(max, 3);
  const top = ticks[ticks.length - 1] || 1;
  const pct = (v: number) => `${(v / top) * 100}%`;
  const n = columns.length;

  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      {/* y-axis labels */}
      <div className="relative w-12 shrink-0" style={{ height }} aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 translate-y-1/2 text-[11px] text-fg-subtle tabular-nums"
            style={{ bottom: pct(t) }}
          >
            {formatAxis(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden="true"
              className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-border-strong" : "bg-border")}
              style={{ bottom: pct(t) }}
            />
          ))}
          <div className="absolute inset-0 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {columns.map((c, i) => (
              <button
                key={c.key}
                type="button"
                aria-label={`${c.label}: ${formatValue(c.value)}`}
                aria-describedby={active === i ? `${id}-tip` : undefined}
                className="group flex h-full items-end justify-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
              >
                {c.value != null && c.value > 0 && (
                  <span
                    className={cn(
                      "block w-full max-w-6 rounded-t-[4px] bg-chart-1 transition-opacity",
                      active != null && active !== i && "opacity-60",
                    )}
                    style={{ height: pct(c.value) }}
                  />
                )}
              </button>
            ))}
          </div>
          {active != null && (
            <div
              id={`${id}-tip`}
              role="tooltip"
              className="pointer-events-none absolute -top-2 z-10 w-44 -translate-y-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-md"
              style={{
                left: `clamp(0px, calc(${((active + 0.5) / n) * 100}% - 5.5rem), calc(100% - 11rem))`,
              }}
            >
              {renderTip ? (
                renderTip(columns[active], active)
              ) : (
                <>
                  <p className="text-fg-muted">{columns[active].label}</p>
                  <p className="mt-0.5 font-semibold text-fg tabular-nums">{formatValue(columns[active].value)}</p>
                </>
              )}
            </div>
          )}
        </div>
        <div
          className="mt-1.5 grid gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {columns.map((c, i) => (
            <span key={c.key} className="text-center text-[11px] text-fg-subtle tabular-nums">
              {i % tickEvery === 0 ? c.key : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Collapsible table twin of a chart, so values are never tooltip-only. */
export function ChartTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-fg-muted select-none hover:text-fg">View as table</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-bg-subtle">
            <tr>
              {headers.map((h, i) => (
                <th key={h} scope="col" className={cn("px-3 py-2 font-medium text-fg-muted", i === 0 ? "text-left" : "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-border">
                {r.map((cell, ci) => (
                  <td key={ci} className={cn("px-3 py-1.5 tabular-nums", ci === 0 ? "text-left text-fg" : "text-right text-fg")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
