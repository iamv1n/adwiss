"use client";

import { motion, useReducedMotion } from "motion/react";
import { Clock, Globe, LayoutGrid, Smartphone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = { label: string; spend: number; roas: number };

const GROUPS: { title: string; icon: LucideIcon; rows: Row[] }[] = [
  {
    title: "Country",
    icon: Globe,
    rows: [
      { label: "United States", spend: 12400, roas: 3.9 },
      { label: "United Kingdom", spend: 5100, roas: 3.1 },
      { label: "Canada", spend: 4200, roas: 2.6 },
      { label: "Australia", spend: 2900, roas: 1.2 },
    ],
  },
  {
    title: "Device",
    icon: Smartphone,
    rows: [
      { label: "Mobile", spend: 16800, roas: 3.1 },
      { label: "Desktop", spend: 6400, roas: 4.4 },
      { label: "Tablet", spend: 1400, roas: 1.6 },
    ],
  },
  {
    title: "Placement",
    icon: LayoutGrid,
    rows: [
      { label: "Feed", spend: 11200, roas: 3.8 },
      { label: "Search", spend: 7300, roas: 4.1 },
      { label: "Stories", spend: 3900, roas: 2.2 },
      { label: "Audience Network", spend: 2200, roas: 0.7 },
    ],
  },
];

// ROAS by hour of day, 00..23
const HOURS = [0.6, 0.5, 0.4, 0.4, 0.5, 0.8, 1.4, 2.1, 2.6, 2.9, 3.0, 3.1, 3.3, 3.0, 2.8, 2.9, 3.2, 3.6, 3.9, 4.2, 4.3, 3.7, 2.2, 1.1];
const HEAT = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4", "bg-heat-5", "bg-heat-6"];

const ease = [0.22, 1, 0.36, 1] as const;

export function Breakdowns() {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {GROUPS.map((g, gi) => {
        const max = Math.max(...g.rows.map((r) => r.spend));
        return (
          <article key={g.title} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <g.icon className="size-4 text-primary" aria-hidden="true" /> {g.title}
              <span className="ml-auto text-[0.6875rem] font-normal text-fg-subtle">Spend · ROAS</span>
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              {g.rows.map((r, i) => (
                <li key={r.label} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-fg">{r.label}</span>
                    <span className="shrink-0 font-mono text-fg-muted tabular-nums">
                      ${r.spend.toLocaleString("en-US")} ·{" "}
                      <span className={cn(r.roas < 1.5 ? "text-danger-fg" : "text-fg")}>{r.roas.toFixed(1)}×</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg-subtle">
                    <motion.div
                      className={cn("h-full rounded-full", r.roas < 1.5 ? "bg-danger/70" : "bg-primary")}
                      initial={{ width: reduce ? `${(r.spend / max) * 100}%` : 0 }}
                      whileInView={{ width: `${(r.spend / max) * 100}%` }}
                      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                      transition={reduce ? { duration: 0 } : { duration: 0.9, delay: 0.1 * gi + 0.07 * i, ease }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
      <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Clock className="size-4 text-primary" aria-hidden="true" /> Hour of day
          <span className="ml-auto text-[0.6875rem] font-normal text-fg-subtle">ROAS</span>
        </h3>
        <div className="mt-4 flex h-28 items-end gap-0.5" role="img" aria-label="ROAS by hour of day, peaking at 3.9–4.3× between 18:00 and 21:00 and below 1× overnight">
          {HOURS.map((v, h) => (
            <motion.span
              key={h}
              className={cn("flex-1 rounded-t-sm", HEAT[Math.min(6, Math.round((v / 4.3) * 6))])}
              style={{ originY: 1 }}
              initial={{ scaleY: reduce ? 1 : 0, height: `${(v / 4.3) * 100}%` }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.3 + h * 0.025, ease }}
            />
          ))}
        </div>
        <div aria-hidden="true" className="mt-1.5 flex justify-between font-mono text-[0.625rem] text-fg-subtle">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>
        <p className="mt-3 text-xs text-fg-muted">
          18:00–21:00 returns <span className="font-mono text-fg">4.1×</span>; 00:00–05:00 returns{" "}
          <span className="font-mono text-danger-fg">0.5×</span>.
        </p>
      </article>
    </div>
  );
}
