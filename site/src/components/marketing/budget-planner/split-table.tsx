"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useTicker } from "../automation/use-ticker";
import { Provider, WindowFrame } from "../primitives";
import { CAMPAIGNS, formatUSD } from "./plan-data";

const TODAY = 680;
const MIN = 60;

const MODES = [
  { id: "Past spend", shares: [40, 25, 20, 15] },
  { id: "ROAS", shares: [30, 38, 26, 6] },
];

/** share × today, then raise any below the minimum, taking the difference proportionally from the rest. */
function split(shares: number[]) {
  const raw = shares.map((s) => (TODAY * s) / 100);
  const short = raw.reduce((a, v) => a + Math.max(0, MIN - v), 0);
  const above = raw.filter((v) => v > MIN).reduce((a, v) => a + (v - MIN), 0);
  return raw.map((v) => (v < MIN ? MIN : v - (short * (v - MIN)) / above));
}

export function SplitTable() {
  const { ref, step, reduce } = useTicker(MODES.length, 3400);
  const mode = MODES[step];
  const budgets = split(mode.shares);

  return (
    <div ref={ref}>
      <WindowFrame title="Split · today’s budget $680">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs">
          <span className="text-fg-subtle">Auto-fill from</span>
          <div className="flex rounded-lg border border-border bg-bg-subtle p-0.5 text-[0.6875rem]">
            {MODES.map((m, i) => (
              <span key={m.id} className={cn("rounded-md px-2 py-0.5 font-medium transition-colors", i === step ? "bg-surface text-fg shadow-xs" : "text-fg-subtle")}>
                {m.id}
              </span>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-border">
          {CAMPAIGNS.map((c, i) => {
            const raised = (TODAY * mode.shares[i]) / 100 < MIN;
            return (
              <li key={c.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-fg">{c.name}</span>
                  <Provider name={c.provider} />
                </span>
                <span className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="w-9 text-right text-fg-subtle">{mode.shares[i]}%</span>
                  <span className="w-12 text-right text-fg">{formatUSD(budgets[i])}</span>
                </span>
                <div className="relative col-span-2 h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                  <motion.span
                    className={cn("absolute inset-y-0 left-0 rounded-full", c.color)}
                    initial={false}
                    animate={{ width: `${mode.shares[i]}%` }}
                    transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <span className="absolute inset-y-0 w-px bg-fg/50" style={{ left: `${(MIN / TODAY) * 100}%` }} aria-hidden="true" />
                </div>
                <span className={cn("col-span-2 text-[0.6875rem] transition-opacity", raised ? "text-warning-fg opacity-100" : "opacity-0")} aria-hidden={!raised}>
                  Raised to the {formatUSD(MIN)}/day minimum
                </span>
              </li>
            );
          })}
        </ul>
        <p className="flex items-center justify-between border-t border-border bg-bg-subtle px-4 py-2.5 text-[0.6875rem] text-fg-subtle">
          <span>Total 100% · minimum {formatUSD(MIN)}/day each</span>
          <span className="font-mono">{formatUSD(budgets.reduce((a, b) => a + b, 0))}</span>
        </p>
      </WindowFrame>
    </div>
  );
}
