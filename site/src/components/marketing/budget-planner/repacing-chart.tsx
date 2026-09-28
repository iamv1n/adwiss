"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useTicker } from "../automation/use-ticker";
import { DAYS, TOTAL, formatUSD, weight } from "./plan-data";

const TODAY = 12;
const BASE = TOTAL / DAYS;

/** Three scenarios: spend so far on plan, over, under. Remaining budget is re-spread over the days left. */
const SCENARIOS = [
  { label: "On plan", spent: BASE * TODAY, tone: "text-fg" },
  { label: "Overspent so far", spent: BASE * TODAY * 1.12, tone: "text-danger-fg" },
  { label: "Underspent so far", spent: BASE * TODAY * 0.86, tone: "text-success-fg" },
];

function build(spent: number) {
  const past = Array.from({ length: TODAY }, () => spent / TODAY);
  const w = Array.from({ length: DAYS - TODAY }, () => weight("even", 0, 1));
  const sum = w.reduce((a, b) => a + b, 0);
  const remaining = TOTAL - spent;
  return { past, future: w.map((x) => (remaining * x) / sum), remaining };
}

const BUILT = SCENARIOS.map((s) => build(s.spent));
const MAX = Math.max(...BUILT.flatMap((b) => [...b.past, ...b.future]));

export function RepacingChart() {
  const { ref, step, reduce } = useTicker(SCENARIOS.length, 3200);
  const s = SCENARIOS[step];
  const b = BUILT[step];
  const bars = [...b.past, ...b.future];

  return (
    <div ref={ref} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-fg-subtle">Spent to date</p>
          <p className={cn("font-mono text-sm font-semibold tabular-nums transition-colors", s.tone)}>{formatUSD(s.spent)}</p>
        </div>
        <div>
          <p className="text-fg-subtle">Remaining</p>
          <p className="font-mono text-sm font-semibold text-fg tabular-nums">{formatUSD(b.remaining)}</p>
        </div>
        <div className="text-right">
          <p className="text-fg-subtle">Today onward</p>
          <p className="font-mono text-sm font-semibold text-primary tabular-nums">{formatUSD(b.future[0])}/day</p>
        </div>
      </div>
      <div aria-hidden="true" className="relative mt-5 flex h-32 items-end gap-[2px]">
        <span className="absolute inset-x-0 border-t border-dashed border-border-strong" style={{ bottom: `${(BASE / MAX) * 100}%` }} />
        {bars.map((v, i) => (
          <motion.span
            key={i}
            className={cn("flex-1 rounded-t-[2px]", i < TODAY ? "bg-fg-subtle/40" : "bg-primary/75")}
            initial={false}
            animate={{ height: `${(v / MAX) * 100}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] text-fg-subtle">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-fg-subtle/40" /> Spent</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-primary/75" /> Re-paced plan</span>
          <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-border-strong" /> Original</span>
        </span>
        <span className="font-medium text-fg">{s.label}</span>
      </div>
    </div>
  );
}
