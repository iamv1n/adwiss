"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTicker } from "../automation/use-ticker";
import { Provider } from "../primitives";

const FROM = { name: "Prospecting · Broad US", provider: "Meta" as const, budget: 300, spentPct: 52 };
const MOVED = 144;
const TO = [
  { name: "Search · Brand", provider: "Google" as const, budget: 200, spentPct: 100, roas: 4.2 },
  { name: "PMax · Catalog", provider: "Google" as const, budget: 160, spentPct: 97, roas: 2.8 },
];
const ROAS_SUM = TO.reduce((a, t) => a + t.roas, 0);

export function ReallocationFlow() {
  const { ref, step, reduce } = useTicker(3, 2600);
  const moved = step >= 1;
  const done = step === 2;

  return (
    <div ref={ref} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <p className="text-xs text-fg-subtle">Yesterday → today</p>
      <div className="mt-3 grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]">
        <div className="rounded-xl border border-border bg-bg-subtle p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-fg">{FROM.name}</span>
            <Provider name={FROM.provider} />
          </div>
          <p className="mt-1 text-fg-subtle">Spent {FROM.spentPct}% of ${FROM.budget} · underspent</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
            <span className="block h-full rounded-full bg-chart-1" style={{ width: `${FROM.spentPct}%` }} />
          </div>
          <p className="mt-2 font-mono text-fg tabular-nums">
            ${FROM.budget}/day{" "}
            <span className={cn("transition-opacity", moved ? "opacity-100" : "opacity-0")}>→ ${FROM.budget - MOVED}/day</span>
          </p>
        </div>

        <div aria-hidden="true" className="relative mx-auto flex h-10 w-full items-center justify-center overflow-hidden sm:h-24">
          <ArrowRight className="size-5 rotate-90 text-fg-subtle sm:rotate-0" />
          {!reduce && moved && !done
            ? [0, 1, 2].map((i) => (
                <motion.span
                  key={`${step}-${i}`}
                  className="absolute size-2 rounded-full bg-primary"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: [0, 1, 0], x: 20 }}
                  transition={{ duration: 0.9, delay: i * 0.25, repeat: 1 }}
                />
              ))
            : null}
        </div>

        <ul className="flex flex-col gap-2">
          {TO.map((t) => {
            const share = Math.round((MOVED * t.roas) / ROAS_SUM);
            return (
              <li key={t.name} className="rounded-xl border border-border bg-bg-subtle p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-fg">{t.name}</span>
                  <Provider name={t.provider} />
                </div>
                <p className="mt-1 text-fg-subtle">Spent {t.spentPct}% · hit its cap · ROAS {t.roas}</p>
                <p className="mt-1 font-mono text-fg tabular-nums">
                  ${t.budget}/day{" "}
                  <span className={cn("text-success-fg transition-opacity", moved ? "opacity-100" : "opacity-0")}>
                    +${share} → ${t.budget + share}/day
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-4 min-h-10">
        <AnimatePresence>
          {done ? (
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-xs text-fg-muted"
            >
              <ScrollText className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="font-medium text-fg">Budget plan</span> — reallocated ${MOVED} from Prospecting · spent{" "}
                {FROM.spentPct}% yesterday, split by 7-day ROAS
              </span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
