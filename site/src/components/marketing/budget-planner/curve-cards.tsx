"use client";

import { motion, useReducedMotion } from "motion/react";
import { CURVES, dailyBudgets, formatUSD } from "./plan-data";

const W = 120;
const H = 40;

function path(values: number[], max: number) {
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * W).toFixed(1)},${(H - (v / max) * (H - 4)).toFixed(1)}`)
    .join(" ");
}

export function CurveCards() {
  const reduce = useReducedMotion();
  const all = CURVES.map((c) => dailyBudgets(c.id));
  const max = Math.max(...all.flat());
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {CURVES.map((c, i) => (
        <li key={c.id} className="rounded-xl border border-border bg-surface p-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" aria-hidden="true">
            <motion.path
              d={path(all[i], max)}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={reduce ? { duration: 0 } : { duration: 1, delay: i * 0.15, ease: "easeInOut" }}
            />
          </svg>
          <p className="mt-2 text-sm font-semibold text-fg">{c.label}</p>
          <p className="text-xs text-fg-muted">{c.hint}</p>
          <p className="mt-2 font-mono text-[0.6875rem] text-fg-subtle">
            Day 1 {formatUSD(all[i][0])} · Day 30 {formatUSD(all[i][29])}
          </p>
        </li>
      ))}
    </ul>
  );
}
