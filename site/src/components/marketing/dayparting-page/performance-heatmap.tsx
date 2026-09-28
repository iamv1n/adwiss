"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CELLS, DAY_NAMES, DAYS, HEAT_BG, hourLabel } from "../heatmap-data";

type M = "roas" | "cpa" | "conversions";

const METRICS: { id: M; label: string; hint: string }[] = [
  { id: "roas", label: "ROAS", hint: "Darker is higher ROAS" },
  { id: "cpa", label: "CPA", hint: "Darker is cheaper (scale inverted)" },
  { id: "conversions", label: "Conversions", hint: "Darker is more conversions" },
];

/** Demo data is stored in rupee-scale totals; convert to a plausible dollar scale. */
const USD_RATE = 1 / 84;

function value(metric: M, i: number) {
  const c = CELLS[i];
  if (metric === "roas") return c.roas;
  if (metric === "cpa") return c.cpa * USD_RATE;
  return c.conversions;
}

function format(metric: M, v: number) {
  if (metric === "roas") return `${v.toFixed(2)}×`;
  if (metric === "cpa") return `$${v.toFixed(2)}`;
  return Math.round(v).toLocaleString("en-US");
}

function levelsFor(metric: M) {
  const values = CELLS.map((_, i) => value(metric, i));
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const level = Math.min(6, Math.floor((sorted.indexOf(v) / (sorted.length - 1)) * 7));
    return metric === "cpa" ? 6 - level : level;
  });
}

export function PerformanceHeatmap() {
  const [metric, setMetric] = useState<M>("roas");
  const [active, setActive] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const levels = useMemo(() => levelsFor(metric), [metric]);
  const bestIdx = levels.indexOf(6);
  const worstIdx = levels.indexOf(0);
  const shown = active ?? bestIdx;
  const cell = CELLS[shown];
  const hint = METRICS.find((m) => m.id === metric)?.hint;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Heatmap metric" className="inline-flex rounded-lg border border-border bg-bg-subtle p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={metric === m.id}
              onClick={() => setMetric(m.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                metric === m.id ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-subtle">{hint} · last 12 weeks</span>
      </div>

      <div className="mt-5 grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-1.5 gap-y-0.5 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:gap-y-1">
        {DAYS.map((d, di) => (
          <div key={d} className="contents">
            <span className="self-center text-[0.625rem] text-fg-subtle sm:text-xs">{d}</span>
            <div className="grid grid-cols-24 gap-px sm:gap-0.5">
              {Array.from({ length: 24 }, (_, h) => {
                const i = di * 24 + h;
                return (
                  <motion.button
                    key={`${metric}-${h}`}
                    type="button"
                    aria-label={`${DAY_NAMES[di]} ${hourLabel(h)}: ${format(metric, value(metric, i))}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      "aspect-square w-full rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring sm:rounded-[3px]",
                      HEAT_BG[levels[i]],
                      shown === i && "ring-2 ring-fg",
                    )}
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.35, delay: (h + di) * 0.012 }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <span />
        <div className="grid grid-cols-24 font-mono text-[0.5625rem] text-fg-subtle" aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center">{h % 6 === 0 ? String(h).padStart(2, "0") : ""}</span>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg-subtle p-3" aria-live="polite">
          <p className="text-fg-subtle">{active === null ? "Best slot" : "Selected"}</p>
          <p className="mt-1 font-medium text-fg">{DAY_NAMES[cell.day]} {hourLabel(cell.hour)}</p>
          <p className="font-mono text-fg-muted">{format(metric, value(metric, shown))}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg-subtle p-3">
          <p className="text-fg-subtle">Weakest slot</p>
          <p className="mt-1 font-medium text-fg">{DAY_NAMES[CELLS[worstIdx].day]} {hourLabel(CELLS[worstIdx].hour)}</p>
          <p className="font-mono text-fg-muted">{format(metric, value(metric, worstIdx))}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-subtle p-3" aria-hidden="true">
          {HEAT_BG.map((c) => <span key={c} className={cn("h-3 flex-1 rounded-[2px]", c)} />)}
        </div>
      </div>
    </div>
  );
}
