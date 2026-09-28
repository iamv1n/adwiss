"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const ROWS = [
  { name: "Lead gen · Demo request", leads: 64, cpl: 41.2, won: 14, value: 31200 },
  { name: "Lookalike 2% · Signup", leads: 48, cpl: 29.8, won: 9, value: 13500 },
  { name: "Broad · Video views", leads: 112, cpl: 12.4, won: 2, value: 1300 },
];
const MAX_VALUE = 31200;

export function CampaignSplit() {
  const reduce = useReducedMotion();
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="hidden grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-3 border-b border-border bg-bg-subtle px-5 py-2.5 text-[0.6875rem] font-medium text-fg-subtle sm:grid">
        <span>Campaign</span>
        <span className="text-right">Leads</span>
        <span className="text-right">Cost / lead</span>
        <span className="text-right">Win rate</span>
        <span className="text-right">Won value</span>
      </div>
      <ul className="divide-y divide-border">
        {ROWS.map((r, i) => {
          const rate = (r.won / r.leads) * 100;
          const cheapest = i === 2;
          return (
            <li key={r.name} className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-5 py-4 text-sm sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] sm:items-center">
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <p className="truncate font-medium text-fg">{r.name}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                  <motion.div
                    className={cn("h-full rounded-full", cheapest ? "bg-danger" : "bg-success")}
                    initial={{ width: reduce ? `${(r.value / MAX_VALUE) * 100}%` : 0 }}
                    whileInView={{ width: `${Math.max(3, (r.value / MAX_VALUE) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={reduce ? { duration: 0 } : { duration: 0.9, delay: 0.15 * i, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
              <Cell label="Leads">{r.leads}</Cell>
              <Cell label="Cost / lead" highlight={cheapest ? "Cheapest" : undefined}>${r.cpl.toFixed(2)}</Cell>
              <Cell label="Win rate">{rate.toFixed(1)}%</Cell>
              <Cell label="Won value" strong>${r.value.toLocaleString("en-US")}</Cell>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border bg-bg-subtle px-5 py-3 text-xs text-fg-muted">
        The cheapest leads came from <span className="font-medium text-fg">Broad · Video views</span>, and they closed
        at 1.8%. Demo requests cost 3× more per lead and brought in 24× the revenue.
      </p>
    </div>
  );
}

function Cell({
  label,
  children,
  strong,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
  highlight?: string;
}) {
  return (
    <p className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
      <span className="text-xs text-fg-subtle sm:hidden">{label}</span>
      <span className={cn("font-mono tabular-nums", strong ? "font-semibold text-fg" : "text-fg-muted")}>
        {children}
        {highlight ? (
          <span className="ml-1.5 rounded-full bg-warning-subtle px-1.5 py-px font-sans text-[0.625rem] text-warning-fg">
            {highlight}
          </span>
        ) : null}
      </span>
    </p>
  );
}
