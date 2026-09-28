"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUpRight, Pause, Play, type LucideIcon } from "lucide-react";
import { useTicker } from "../automation/use-ticker";
import { Provider } from "../primitives";
import { cn } from "@/lib/utils";

type Event = {
  time: string;
  icon: LucideIcon;
  label: string;
  target: string;
  provider: "Meta" | "Google";
  before: string;
  after: string;
  tone: "up" | "off" | "on";
};

const EVENTS: Event[] = [
  { time: "18:00", icon: ArrowUpRight, label: "Budget ×1.5", target: "Spring sale – prospecting", provider: "Meta", before: "Active · $400/day", after: "Active · $600/day", tone: "up" },
  { time: "23:00", icon: Pause, label: "Pause", target: "Spring sale – prospecting", provider: "Meta", before: "Active · $600/day", after: "Paused", tone: "off" },
  { time: "07:00", icon: Play, label: "Resume", target: "Spring sale – prospecting", provider: "Meta", before: "Paused", after: "Active · $400/day", tone: "on" },
];

const TONE = {
  up: "bg-accent text-accent-fg",
  off: "bg-danger-subtle text-danger-fg",
  on: "bg-success-subtle text-success-fg",
} as const;

export function HourlyTimeline() {
  const { ref, step, reduce } = useTicker(EVENTS.length + 1, 2200);
  const shown = reduce ? EVENTS.length : step;
  const rows = EVENTS.slice(0, shown).reverse();

  return (
    <div ref={ref} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <ol className="relative flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <span aria-hidden="true" className="absolute top-8 bottom-8 left-[2.125rem] w-px bg-border sm:left-[2.625rem]" />
        {EVENTS.map((e, i) => {
          const done = i < shown;
          const current = i === shown - 1;
          return (
            <li key={e.time} className="relative flex items-center gap-3">
              <span
                className={cn(
                  "relative z-10 grid size-9 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                  done ? cn("border-transparent", TONE[e.tone]) : "border-border bg-bg-subtle text-fg-subtle",
                  current && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                )}
              >
                <e.icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-fg tabular-nums">{e.time}</p>
                <p className="text-xs text-fg-muted">{e.label}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-bg-subtle px-4 py-2 text-xs">
          <span className="font-medium text-fg">Action log</span>
          <span className="text-fg-subtle">Source: schedule</span>
        </div>
        <ul className="min-h-60 divide-y divide-border" aria-live="polite">
          <AnimatePresence initial={false}>
            {rows.map((e) => (
              <motion.li
                key={e.time}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.35 }}
                className="flex flex-col gap-2 px-4 py-3 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-fg-subtle">{e.time}</span>
                  <span className={cn("rounded-md px-1.5 py-0.5 font-medium", TONE[e.tone])}>{e.label}</span>
                  <span className="min-w-0 truncate text-fg">{e.target}</span>
                  <Provider name={e.provider} />
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-fg-muted">
                  <span className="rounded bg-bg-subtle px-1.5 py-0.5">{e.before}</span>
                  <ArrowRight className="size-3 text-fg-subtle" aria-hidden="true" />
                  <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-fg">{e.after}</span>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
