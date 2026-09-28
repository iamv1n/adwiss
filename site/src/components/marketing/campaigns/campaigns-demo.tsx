"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTicker } from "../automation/use-ticker";
import { Provider, WindowFrame } from "../primitives";

const ROWS = [
  { name: "Prospecting · Broad US", provider: "Meta" as const, spend: 312, budget: 400, results: "41 purchases", roas: "3.4×" },
  { name: "Search · Brand", provider: "Google" as const, spend: 88, budget: 150, results: "63 conversions", roas: "7.9×" },
  { name: "Lookalike 2% · Video", provider: "Meta" as const, spend: 247, budget: 250, results: "2 purchases", roas: "0.6×" },
  { name: "PMax · Catalog", provider: "Google" as const, spend: 176, budget: 300, results: "22 conversions", roas: "2.8×" },
];

export function Toggle({ on }: { on: boolean }) {
  return (
    <span
      role="img"
      aria-label={on ? "Active" : "Paused"}
      className={cn("relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-300", on ? "bg-success" : "bg-border-strong")}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn("absolute top-0.5 size-3 rounded-full bg-surface shadow-sm", on ? "right-0.5" : "left-0.5")}
      />
    </span>
  );
}

export function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => `$${Math.round(v).toLocaleString("en-US")}`);
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>;
}

// 0-1 fill, 2 lookalike paused, 3 budget raised, 4-5 hold
export function CampaignsDemo() {
  const { ref, step, reduce } = useTicker(6, 1600);
  const paused = step >= 2;
  const raised = step >= 3;

  return (
    <div ref={ref}>
      <WindowFrame title="app.adwise / campaigns">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs">
          <p className="font-medium text-fg">Campaigns · Today</p>
          <p className="text-fg-subtle">
            Spend <span className="font-mono text-fg">$823</span> of <AnimatedMoney className="font-mono text-fg" value={raised ? 1180 : 1100} /> daily
          </p>
        </div>
        <ul className="divide-y divide-border">
          {ROWS.map((r, i) => {
            const isLal = i === 2;
            const isRaise = i === 0;
            const on = !(isLal && paused);
            const budget = isRaise && raised ? 480 : r.budget;
            const pct = Math.min(100, (r.spend / budget) * 100);
            return (
              <li key={r.name} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 text-xs sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                <Toggle on={on} />
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className={cn("truncate font-medium transition-colors", on ? "text-fg" : "text-fg-subtle")}>{r.name}</span>
                    <Provider name={r.provider} className="shrink-0" />
                  </p>
                  <p className="mt-0.5 truncate text-fg-subtle">{r.results} · ROAS {r.roas}</p>
                </div>
                <div className="col-start-2 min-w-0 sm:col-start-3">
                  <div className="flex justify-between font-mono text-[0.6875rem] text-fg-subtle">
                    <span>${r.spend}</span>
                    <AnimatedMoney value={budget} className={cn(isRaise && raised && "text-success-fg")} />
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                    <motion.div
                      className={cn("h-full rounded-full", pct > 95 ? "bg-warning" : "bg-primary")}
                      initial={{ width: reduce ? `${pct}%` : "0%" }}
                      animate={{ width: step === 0 && !reduce ? "0%" : `${pct}%` }}
                      transition={{ duration: reduce ? 0 : 1.2, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
                    />
                  </div>
                </div>
                <span
                  className={cn(
                    "hidden rounded-full px-2 py-0.5 text-[0.6875rem] font-medium sm:inline",
                    on ? "bg-success-subtle text-success-fg" : "bg-bg-subtle text-fg-subtle",
                  )}
                >
                  {on ? "Active" : "Paused"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border bg-bg-subtle px-4 py-2.5 text-[0.6875rem] text-fg-subtle">
          {raised ? "Budget $400 → $480 · by Maya R. · logged" : paused ? "Status Active → Paused · by Maya R. · logged" : "Pacing against daily budget"}
        </p>
      </WindowFrame>
    </div>
  );
}
