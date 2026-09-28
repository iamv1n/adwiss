"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Provider } from "../primitives";

const ROWS = [
  { name: "Broad · Interest stack", level: "Campaign", provider: "Meta", spend: 1840, results: 0 },
  { name: "Display · Remarketing 90d", level: "Ad group", provider: "Google", spend: 1215, results: 1 },
  { name: "UGC video v3 · 15s", level: "Ad", provider: "Meta", spend: 962, results: 0 },
  { name: "PMax · Accessories", level: "Campaign", provider: "Google", spend: 744, results: 1 },
  { name: "Carousel · Winter promo", level: "Ad", provider: "Meta", spend: 518, results: 0 },
] as const;

const TOTAL = ROWS.reduce((s, r) => s + r.spend, 0);

export function WastedSpend() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => setActive((i) => (i + 1) % ROWS.length), 1800);
    return () => clearInterval(t);
  }, [inView, reduce]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-danger-subtle text-danger-fg">
            <Flame className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-fg">Spending without results</h3>
            <p className="text-xs text-fg-subtle">Last 14 days</p>
          </div>
        </div>
        <p className="font-mono text-lg font-semibold text-danger-fg tabular-nums">${TOTAL.toLocaleString("en-US")}</p>
      </header>
      <ul className="relative p-2">
        {ROWS.map((r, i) => (
          <li key={r.name} className="relative">
            {i === active && !reduce ? (
              <motion.span
                layoutId="waste-highlight"
                aria-hidden="true"
                className="absolute inset-0 rounded-lg bg-danger-subtle"
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
              />
            ) : null}
            <div className="relative flex items-center gap-3 rounded-lg px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-fg-subtle">
                  {r.level} <Provider name={r.provider} />
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm text-fg tabular-nums">${r.spend.toLocaleString("en-US")}</p>
                <p className={cn("font-mono text-[0.6875rem] tabular-nums", r.results === 0 ? "text-danger-fg" : "text-warning-fg")}>
                  {r.results} {r.results === 1 ? "result" : "results"}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
