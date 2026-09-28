"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Clock, FlaskConical, Pause, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowFrame } from "../primitives";
import { useTicker } from "./use-ticker";

const CONDITIONS = [
  { metric: "Spend", op: ">", value: "$250", actual: "$312.40" },
  { metric: "Conversions", op: "<", value: "3", actual: "1" },
  { metric: "CPA", op: "changed by >", value: "40% up", actual: "+62% vs prev. 3d" },
];

const LOG = [
  { time: "14:05", target: "Prospecting · Broad US", note: "Would pause · dry-run" },
  { time: "14:00", target: "Retargeting · 14d", note: "No match · CPA $18.20" },
  { time: "13:55", target: "Lookalike 2% · Video", note: "Would pause · dry-run" },
  { time: "13:50", target: "Search · Brand", note: "No match · spend $41" },
  { time: "13:45", target: "PMax · Catalog", note: "Skipped · cooldown 60 min" },
];

// steps: 0 idle, 1-3 conditions, 4 action, 5 hold
const STEPS = 7;

export function RuleDemo() {
  const { ref, step } = useTicker(STEPS, 1100);
  const matched = step >= 4;
  const logStart = step % LOG.length;
  const visibleLog = [0, 1, 2].map((i) => LOG[(logStart + i) % LOG.length]);

  return (
    <div ref={ref}>
      <WindowFrame title="app.adwise / automation / rules">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="border-b border-border p-4 sm:p-6 md:border-r md:border-b-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
                  <Zap className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-fg">Pause spenders that stopped converting</p>
                  <p className="text-xs text-fg-subtle">Campaign level · 12 selected campaigns · lookback 3 days</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-[0.6875rem] font-medium text-warning-fg">
                <FlaskConical className="size-3" aria-hidden="true" /> Dry-run
              </span>
            </div>

            <p className="mt-5 font-mono text-[0.6875rem] tracking-wider text-fg-subtle uppercase">When all match</p>
            <ul className="mt-2 space-y-2">
              {CONDITIONS.map((c, i) => {
                const on = step >= i + 1;
                return (
                  <li
                    key={c.metric}
                    className={cn(
                      "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs transition-colors duration-500",
                      on ? "border-success/40 bg-success-subtle" : "border-border bg-bg-subtle",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded-full transition-colors duration-500",
                        on ? "bg-success text-on-status" : "bg-border-strong/50",
                      )}
                    >
                      {on ? <Check className="size-3" aria-hidden="true" /> : null}
                    </span>
                    <span className="font-medium text-fg">{c.metric}</span>
                    <span className="font-mono text-fg-muted">{c.op}</span>
                    <span className="font-mono text-fg">{c.value}</span>
                    <span className={cn("ml-auto font-mono tabular-nums transition-opacity duration-500", on ? "text-success-fg opacity-100" : "opacity-0")}>
                      {c.actual}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-5 font-mono text-[0.6875rem] tracking-wider text-fg-subtle uppercase">Then</p>
            <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
              <Pause className="size-3.5 text-fg-muted" aria-hidden="true" />
              <span className="font-medium text-fg">Pause campaign</span>
              <AnimatePresence>
                {matched ? (
                  <motion.span
                    key="res"
                    initial={{ opacity: 0, scale: 0.9, x: -6 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="ml-auto rounded-full bg-warning-subtle px-2 py-0.5 text-[0.6875rem] font-medium text-warning-fg"
                  >
                    Paused · dry-run
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-[0.6875rem] text-fg-subtle">
              <Clock className="size-3" aria-hidden="true" /> Checks every 15 min · cooldown 60 min · max 5 changes per run
            </p>
          </div>

          <div className="flex flex-col p-4 sm:p-6">
            <p className="font-mono text-[0.6875rem] tracking-wider text-fg-subtle uppercase">Run log</p>
            <ol aria-label="Example rule run log" className="relative mt-3 flex-1 space-y-2 overflow-hidden">
              <AnimatePresence initial={false} mode="popLayout">
                {visibleLog.map((e) => (
                  <motion.li
                    layout
                    key={e.time + e.target}
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-lg border border-border bg-bg-subtle px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-fg">{e.target}</span>
                      <time className="shrink-0 font-mono text-fg-subtle tabular-nums">{e.time}</time>
                    </div>
                    <p className="mt-0.5 truncate text-fg-muted">{e.note}</p>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs">
              <div>
                <dt className="text-fg-subtle">Matches · 7d</dt>
                <dd className="font-mono text-base font-semibold text-fg tabular-nums">14</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Changes · 7d</dt>
                <dd className="font-mono text-base font-semibold text-fg tabular-nums">0 <span className="text-xs font-normal text-fg-subtle">(dry-run)</span></dd>
              </div>
            </dl>
          </div>
        </div>
      </WindowFrame>
    </div>
  );
}
