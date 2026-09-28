"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { CountUp } from "../analytics/count-up";
import { WindowFrame } from "../primitives";
import { DAYS, TOTAL, dailyBudgets } from "./plan-data";

const TODAY = 20;
const planned = dailyBudgets("even");
const noise = [0.9, 0.95, 1.02, 0.88, 0.97, 1.0, 0.93, 0.96, 0.99, 0.94];
const cumPlanned: number[] = [];
const cumSpent: number[] = [];
planned.forEach((v, i) => {
  cumPlanned.push((cumPlanned[i - 1] ?? 0) + v);
  if (i < TODAY) cumSpent.push((cumSpent[i - 1] ?? 0) + v * noise[i % noise.length]);
});
const W = 300;
const H = 120;
const toPath = (vals: number[]) =>
  vals.map((v, i) => `${i ? "L" : "M"}${((i / (DAYS - 1)) * W).toFixed(1)},${(H - (v / TOTAL) * (H - 6)).toFixed(1)}`).join(" ");

const LOG: { day: string; target: string; before: string; after: string; status: "succeeded" | "dry-run" }[] = [
  { day: "Sep 21", target: "Search · Brand", before: "$170/day", after: "$212/day", status: "succeeded" },
  { day: "Sep 21", target: "Prospecting · Broad US", before: "$300/day", after: "$268/day", status: "succeeded" },
  { day: "Sep 20", target: "PMax · Catalog", before: "$140/day", after: "$151/day", status: "succeeded" },
  { day: "Sep 1", target: "Retargeting · 14d", before: "$80/day", after: "$100/day", status: "dry-run" },
];

export function DeliveryReport() {
  const reduce = useReducedMotion();
  const draw = (delay: number) => ({
    initial: { pathLength: 0 },
    whileInView: { pathLength: 1 },
    viewport: { once: true },
    transition: reduce ? { duration: 0 } : { duration: 1.4, delay, ease: "easeInOut" as const },
  });

  return (
    <WindowFrame title="app.adwise / budget / September plan / delivery">
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="p-4 sm:p-5">
          <p className="font-display text-3xl font-semibold tracking-tight text-fg tabular-nums">
            <CountUp value={96.4} format={(n) => `${n.toFixed(1)}%`} />
          </p>
          <p className="text-xs text-fg-muted">of planned spend delivered, to date</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-36 w-full" preserveAspectRatio="none" aria-hidden="true">
            <motion.path d={toPath(cumPlanned)} fill="none" stroke="var(--color-border-strong)" strokeWidth={2} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" {...draw(0)} />
            <motion.path d={toPath(cumSpent)} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" {...draw(0.3)} />
          </svg>
          <div className="mt-2 flex gap-4 text-[0.6875rem] text-fg-subtle">
            <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-primary" /> Spent (cumulative)</span>
            <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed border-border-strong" /> Planned</span>
          </div>
        </div>
        <div className="border-t border-border lg:border-t-0 lg:border-l">
          <p className="border-b border-border bg-bg-subtle px-4 py-2 text-[0.6875rem] font-medium text-fg-subtle">Change log · source “Budget plan”</p>
          <ol className="divide-y divide-border">
            {LOG.map((e, i) => (
              <motion.li
                key={e.day + e.target}
                initial={{ opacity: 0, x: 12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={reduce ? { duration: 0 } : { duration: 0.45, delay: 0.4 + i * 0.12 }}
                className="flex items-center gap-3 px-4 py-2.5 text-xs"
              >
                <time className="w-11 shrink-0 font-mono text-fg-subtle">{e.day}</time>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{e.target}</span>
                  <span className="block font-mono text-fg-subtle">{e.before} → {e.after}</span>
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-medium", e.status === "dry-run" ? "bg-warning-subtle text-warning-fg" : "bg-success-subtle text-success-fg")}>
                  {e.status}
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </WindowFrame>
  );
}
