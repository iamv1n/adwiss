"use client";

/**
 * Tiny single-series trend line for table cells and KPI tiles.
 * Dataviz rules: one series → no legend (the column/tile names it), chart-1
 * line with a ~10% area wash, surface-ringed end dot, and a hover/focus
 * readout so no value is color- or shape-only. The aria-label carries the
 * total and the latest value for screen readers.
 */

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay } from "@/components/app/analytics/format";
import { cn } from "@/lib/utils";

export function Sparkline({
  dates,
  values,
  format,
  label,
  width = 84,
  height = 22,
  summary = "total",
  className,
}: {
  /** "total" for additive metrics (spend); "last" for ratios, where a sum is meaningless. */
  summary?: "total" | "last";
  dates: string[];
  /** null = no value that day (e.g. cost per result with no results); the line breaks there. */
  values: (number | null)[];
  format: (v: number) => string;
  /** What is plotted, e.g. "Spend, last 14 days". */
  label: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = values.length;
  if (n === 0) return <span className="text-xs text-fg-subtle">—</span>;

  const pad = 3;
  const nums = values.filter((v): v is number => v != null);
  const max = Math.max(...nums, 0);
  const top = max > 0 ? max : 1;
  const x = (i: number) => pad + (n <= 1 ? (width - 2 * pad) / 2 : (i * (width - 2 * pad)) / (n - 1));
  const y = (v: number) => pad + (height - 2 * pad) * (1 - v / top);
  let line = "";
  let pen = false;
  values.forEach((v, k) => {
    if (v == null) {
      pen = false;
      return;
    }
    line += `${pen ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const gapless = nums.length === n;
  const area = gapless ? `${line}L${x(n - 1).toFixed(1)},${height - pad}L${x(0).toFixed(1)},${height - pad}Z` : "";
  const total = nums.reduce((a, b) => a + b, 0);
  let lastIdx = n - 1;
  while (lastIdx > 0 && values[lastIdx] == null) lastIdx--;
  const i = active ?? lastIdx;
  const vi = values[i];
  const show = (v: number | null) => (v == null ? "—" : format(v));

  const pick = (clientX: number, left: number) => {
    const px = clientX - left - pad;
    const k = n <= 1 ? 0 : Math.round((px / (width - 2 * pad)) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, k)));
  };

  return (
    <span className={cn("relative inline-block align-middle", className)} style={{ width, height }}>
      <svg
        width={width}
        height={height}
        role="img"
        tabIndex={0}
        aria-label={`${label}: ${summary === "total" ? `${format(total)} in total, ` : ""}${show(values[lastIdx])} on ${formatDay(dates[lastIdx] ?? "")}`}
        className="block overflow-visible rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(lastIdx)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
          }
        }}
      >
        {area && <path d={area} fill="var(--color-chart-1)" fillOpacity={0.1} />}
        <path d={line} fill="none" stroke="var(--color-chart-1)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {active != null && (
          <line x1={x(i)} x2={x(i)} y1={0} y2={height} stroke="var(--color-border-strong)" strokeWidth={1} />
        )}
        {vi != null && <circle cx={x(i)} cy={y(vi)} r={2.5} fill="var(--color-chart-1)" stroke="var(--color-surface)" strokeWidth={1.5} />}
      </svg>
      {active != null && (
        <span
          role="tooltip"
          className="pointer-events-none absolute top-1/2 right-full z-30 mr-2 -translate-y-1/2 rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] whitespace-nowrap shadow-md"
        >
          <span className="text-fg-muted">{formatDay(dates[i])}</span>{" "}
          <span className="font-semibold text-fg tabular-nums">{show(values[i])}</span>
        </span>
      )}
    </span>
  );
}

/** Subtle stand-in while series load (or before the endpoint exists). */
export function SparklinePlaceholder({ width = 84, height = 22, loading }: { width?: number; height?: number; loading?: boolean }) {
  if (loading) return <Skeleton className="inline-block align-middle" style={{ width, height }} />;
  return (
    <span className="inline-block align-middle" style={{ width, height }} aria-label="No trend data" role="img">
      <svg width={width} height={height} aria-hidden="true">
        <line x1={3} x2={width - 3} y1={height - 4} y2={height - 4} stroke="var(--color-border)" strokeWidth={1} />
      </svg>
    </span>
  );
}
