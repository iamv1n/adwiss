"use client";

import { motion } from "motion/react";
import { Paintbrush } from "lucide-react";
import { useMemo } from "react";
import { useTicker } from "../automation/use-ticker";
import { DAYS } from "../heatmap-data";
import { cn } from "@/lib/utils";
import { STROKES, buildSchedule, slotClass, slotLabel } from "./schedule-data";
import { ScheduleLegend } from "./schedule-legend";

/** One tick per stroke, plus two ticks holding the finished schedule. */
const STEPS = STROKES.length + 3;

export function SchedulePainter() {
  const { ref, step, reduce } = useTicker(STEPS, 1100);
  const painted = Math.min(step, STROKES.length);
  const grid = useMemo(() => buildSchedule(painted), [painted]);
  const stroke = painted > 0 && step <= STROKES.length ? STROKES[painted - 1] : null;

  return (
    <div ref={ref} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 font-medium text-accent-fg">
          <Paintbrush className="size-3.5" aria-hidden="true" />
          Brush: <span className="font-mono">{stroke ? slotLabel(stroke.value) : "done"}</span>
        </span>
        <span className="text-fg-subtle">Drag across cells to set off, on, or 0.1×–5×</span>
      </div>

      <div
        role="img"
        aria-label="A weekly schedule: overnight hours off, weekday mornings at 0.5×, late mornings 1.2×, weekday evenings 1.5× to 2×, weekends 0.8×, and Friday 20:00 at 5×."
        className="relative mt-5 grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-1.5 gap-y-0.5 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:gap-y-1"
      >
        {DAYS.map((d, di) => (
          <div key={d} className="contents">
            <span className="self-center text-[0.625rem] text-fg-subtle sm:text-xs">{d}</span>
            <div className="grid grid-cols-24 gap-px sm:gap-0.5">
              {grid[di].map((v, h) => {
                const inStroke = stroke && di >= stroke.days[0] && di <= stroke.days[1] && h >= stroke.hours[0] && h <= stroke.hours[1];
                return (
                  <motion.span
                    key={h}
                    className={cn(
                      "grid aspect-square place-items-center rounded-[2px] transition-colors duration-500 sm:rounded-[3px]",
                      slotClass(v),
                      inStroke && "ring-1 ring-primary",
                    )}
                    animate={inStroke && !reduce ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                    transition={{ duration: 0.4, delay: inStroke ? (h - (stroke?.hours[0] ?? 0)) * 0.03 : 0 }}
                  >
                    {v === 0 ? <span className="hidden h-px w-1/2 rotate-45 bg-danger/60 sm:block" /> : null}
                  </motion.span>
                );
              })}
            </div>
          </div>
        ))}
        <span />
        <div className="grid grid-cols-24 font-mono text-[0.5625rem] text-fg-subtle" aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center">{h % 6 === 0 ? String(h).padStart(2, "0") : ""}</span>
          ))}
        </div>
      </div>

      <ScheduleLegend className="mt-5" />
    </div>
  );
}
