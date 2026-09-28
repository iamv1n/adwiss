"use client";

import { motion } from "motion/react";
import { FlaskConical, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "../analytics/count-up";
import { useTicker } from "../automation/use-ticker";
import { Provider, WindowFrame } from "../primitives";
import { CAMPAIGNS, CURVES, DAYS, TOTAL, dailyBudgets, formatUSD } from "./plan-data";

const SERIES = CURVES.map((c) => dailyBudgets(c.id));
const MAX = Math.max(...SERIES.flat());
const TODAY = 9;

export function HeroPlan() {
  const { ref, step, reduce } = useTicker(CURVES.length, 2800);
  const idx = reduce ? 1 : step;
  const days = SERIES[idx];
  const today = days[TODAY];

  return (
    <div ref={ref}>
      <WindowFrame title="app.adwise / budget / September plan">
        <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <Wallet className="size-3.5 text-primary" aria-hidden="true" /> Total for this month
                </p>
                <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-fg tabular-nums">
                  <CountUp value={TOTAL} format={formatUSD} />
                </p>
                <p className="text-xs text-fg-subtle">Sep 1 – Sep 30 · {DAYS} days</p>
              </div>
              <div role="group" aria-label="Pacing curve" className="flex rounded-lg border border-border bg-bg-subtle p-0.5 text-[0.6875rem]">
                {CURVES.map((c, i) => (
                  <span
                    key={c.id}
                    className={cn(
                      "rounded-md px-2 py-1 font-medium transition-colors duration-300",
                      i === idx ? "bg-surface text-fg shadow-xs" : "text-fg-subtle",
                    )}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="mt-5 flex h-36 items-end gap-[2px] sm:h-44">
              {days.map((v, i) => (
                <motion.span
                  key={i}
                  className={cn("flex-1 rounded-t-[2px]", i < TODAY ? "bg-primary/35" : i === TODAY ? "bg-primary" : "bg-primary/70")}
                  initial={false}
                  animate={{ height: `${(v / MAX) * 100}%` }}
                  transition={reduce ? { duration: 0 } : { duration: 0.8, delay: i * 0.012, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[0.5625rem] text-fg-subtle">
              <span>Sep 1</span><span>Sep 10 · today</span><span>Sep 30</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle">Today’s budget</span>
              <span className="font-mono text-sm font-semibold text-fg tabular-nums">{formatUSD(today)}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full" aria-hidden="true">
              {CAMPAIGNS.map((c) => (
                <span key={c.name} className={c.color} style={{ width: `${c.share}%` }} />
              ))}
            </div>
            <ul className="flex flex-col gap-2">
              {CAMPAIGNS.map((c) => (
                <li key={c.name} className="flex items-center gap-2">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", c.color)} />
                  <span className="min-w-0 flex-1 truncate text-fg">{c.name}</span>
                  <Provider name={c.provider} className="hidden sm:inline-flex" />
                  <span className="w-8 text-right font-mono text-fg-subtle tabular-nums">{c.share}%</span>
                  <span className="w-12 text-right font-mono text-fg tabular-nums">{formatUSD((today * c.share) / 100)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning-subtle px-2 py-1 text-warning-fg">
              <FlaskConical className="size-3.5" aria-hidden="true" /> Dry-run · nothing sent yet
            </div>
          </div>
        </div>
      </WindowFrame>
    </div>
  );
}
