"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { WindowFrame } from "../primitives";
import { useTicker } from "./use-ticker";

type Status = "dry-run" | "pending" | "running" | "succeeded" | "failed" | "skipped";

const ENTRIES: { time: string; source: string; target: string; before: string; after: string; status: Status; reason: string }[] = [
  { time: "18:00:03", source: "Rule · Scale winners", target: "Prospecting · Broad US", before: "$400/day", after: "$480/day", status: "succeeded", reason: "ROAS ≥ 3.0 over 7d (3.4)" },
  { time: "18:00:03", source: "Rule · Trim CPA", target: "Search · Generic", before: "$220/day", after: "$220/day", status: "skipped", reason: "Schedule “Evening boost” owns this hour" },
  { time: "17:45:10", source: "Rule · Stop bleeders", target: "Lookalike 2% · Video", before: "Active", after: "Paused", status: "dry-run", reason: "Spend > $250, conversions < 3 (3d)" },
  { time: "17:30:00", source: "Schedule · Evening boost", target: "Search · Generic", before: "$200/day", after: "$220/day", status: "succeeded", reason: "Mon 17:00 · 1.1× budget" },
  { time: "16:12:44", source: "Manual · Maya R.", target: "Retargeting · 14d", before: "Paused", after: "Active", status: "succeeded", reason: "Edited in campaigns" },
  { time: "15:00:01", source: "Revert", target: "PMax · Catalog", before: "$300/day", after: "$250/day", status: "succeeded", reason: "Reverted rule change from 14:00" },
];

const TONE: Record<Status, string> = {
  "dry-run": "bg-warning-subtle text-warning-fg",
  pending: "bg-bg-subtle text-fg-subtle",
  running: "bg-info-subtle text-info-fg",
  succeeded: "bg-success-subtle text-success-fg",
  failed: "bg-danger-subtle text-danger-fg",
  skipped: "bg-bg-subtle text-fg-subtle",
};

export function ActionLog() {
  const { ref, step } = useTicker(ENTRIES.length, 2400);
  const rows = [0, 1, 2, 3].map((i) => ENTRIES[(ENTRIES.length - step + i) % ENTRIES.length]);

  return (
    <div ref={ref}>
      <WindowFrame title="Action log · Today">
        <ol aria-label="Example action log entries" className="divide-y divide-border">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((e) => (
              <motion.li
                layout
                key={e.time + e.target + e.source}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3 text-xs sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
              >
                <time className="font-mono text-fg-subtle tabular-nums">{e.time}</time>
                <div className="min-w-0">
                  <p className="truncate text-fg">
                    <span className="font-medium">{e.target}</span>
                    <span className="text-fg-subtle"> · </span>
                    <span className="font-mono">{e.before} → {e.after}</span>
                  </p>
                  <p className="truncate text-fg-subtle">{e.source} — {e.reason}</p>
                </div>
                <span className={cn("col-start-2 justify-self-start rounded-full px-2 py-0.5 text-[0.6875rem] font-medium sm:col-start-3 sm:justify-self-end", TONE[e.status])}>
                  {e.status}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        <p className="flex items-center justify-between border-t border-border bg-bg-subtle px-4 py-2.5 text-[0.6875rem] text-fg-subtle">
          <span>Source: manual · schedule · rule · revert</span>
          <span className="hidden font-mono sm:inline">before/after · reason</span>
        </p>
      </WindowFrame>
    </div>
  );
}
