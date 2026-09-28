"use client";

import { motion } from "motion/react";
import { useTicker } from "../automation/use-ticker";
import { hourLabel } from "../heatmap-data";
import { cn } from "@/lib/utils";
import { formatUSD } from "./schedule-data";

/** Share of the day's conversions landing in each hour (sums to ~1). */
const CONV = [
  0.004, 0.003, 0.002, 0.002, 0.003, 0.006, 0.015, 0.03, 0.045, 0.055, 0.058, 0.056, 0.05, 0.045,
  0.042, 0.044, 0.05, 0.062, 0.08, 0.09, 0.092, 0.078, 0.045, 0.043,
];
const TOTAL = CONV.reduce((a, b) => a + b, 0);
const SHARE = CONV.map((c) => c / TOTAL);
const MAX = Math.max(...SHARE);
const DAILY = 2400;
const EVEN = 1 / 24;
/** Hours where spend's share is well above conversions' share. */
const WEAK = SHARE.map((s) => s < EVEN * 0.5);
const WASTED = SHARE.reduce((sum, s) => sum + (s < EVEN * 0.5 ? DAILY * (EVEN - s) : 0), 0);

export function SpendVsConversions() {
  const { ref, step, reduce } = useTicker(2, 3200);
  const highlight = step === 1;
  const t = reduce ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div ref={ref} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-border-strong" /> Spend ({formatUSD(DAILY)}/day, spread evenly)</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-primary" /> Conversions</span>
      </div>

      <div
        role="img"
        aria-label="Spend is flat across all 24 hours while conversions peak from 09:00 to 12:00 and 17:00 to 21:00 and nearly vanish overnight."
        className="relative mt-5 grid h-44 grid-cols-24 items-end gap-0.5 sm:h-56 sm:gap-1"
      >
        {SHARE.map((s, h) => (
          <div key={h} className="relative flex h-full items-end justify-center">
            <motion.div
              className={cn("absolute inset-x-0 bottom-0 rounded-t-[2px]", highlight && WEAK[h] ? "bg-danger/35" : "bg-border-strong/70")}
              initial={{ height: "0%" }}
              whileInView={{ height: `${(EVEN / MAX) * 100}%` }}
              viewport={{ once: true }}
              transition={{ ...t, delay: reduce ? 0 : h * 0.015 }}
            />
            <motion.div
              className="relative w-1/2 rounded-t-[2px] bg-primary"
              initial={{ height: "0%" }}
              whileInView={{ height: `${(s / MAX) * 100}%` }}
              viewport={{ once: true }}
              transition={{ ...t, delay: reduce ? 0 : 0.3 + h * 0.02 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-24 font-mono text-[0.5625rem] text-fg-subtle" aria-hidden="true">
        {SHARE.map((_, h) => (
          <span key={h} className="text-center">{h % 6 === 0 ? String(h).padStart(2, "0") : ""}</span>
        ))}
      </div>

      <motion.div
        animate={{ opacity: highlight ? 1 : 0.55 }}
        transition={t}
        className="mt-5 flex flex-col gap-1 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger-fg sm:flex-row sm:items-center sm:justify-between"
      >
        <span>
          {hourLabel(22)}–{hourLabel(7)}: {Math.round(SHARE.filter((_, h) => WEAK[h]).reduce((a, b) => a + b, 0) * 100)}% of conversions,{" "}
          {Math.round((WEAK.filter(Boolean).length / 24) * 100)}% of spend
        </span>
        <span className="font-mono font-medium">≈ {formatUSD(WASTED)}/day in weak hours</span>
      </motion.div>
    </div>
  );
}
