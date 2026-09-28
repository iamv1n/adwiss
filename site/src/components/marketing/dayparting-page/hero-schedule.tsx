"use client";

import { CalendarClock, FlaskConical } from "lucide-react";
import { useTicker } from "../automation/use-ticker";
import { DAYS } from "../heatmap-data";
import { Provider, WindowFrame } from "../primitives";
import { cn } from "@/lib/utils";
import { buildSchedule, formatUSD, slotClass, slotLabel } from "./schedule-data";
import { ScheduleLegend } from "./schedule-legend";

const GRID = buildSchedule();
const BASE_BUDGET = 400;
const DAY = 3; // Thursday

export function HeroSchedule() {
  const { ref, step, reduce } = useTicker(24, 900);
  const hour = reduce ? 19 : step;
  const value = GRID[DAY][hour];

  return (
    <div ref={ref}>
      <WindowFrame title="app.adwise / dayparting / Spring sale – prospecting">
        <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <CalendarClock className="size-4 text-primary" aria-hidden="true" />
              <span className="font-medium text-fg">Weekday evenings</span>
              <Provider name="Meta" />
              <span className="ml-auto font-mono text-fg-subtle">America/New_York</span>
            </div>
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1.5 gap-y-px" aria-hidden="true">
              {DAYS.map((d, di) => (
                <div key={d} className="contents">
                  <span className={cn("text-[0.625rem] leading-3.5 text-fg-subtle", di === DAY && "font-semibold text-fg")}>{d}</span>
                  <div className="relative grid grid-cols-24 gap-px">
                    {GRID[di].map((v, h) => (
                      <span key={h} className={cn("h-3.5 rounded-[2px] transition-shadow duration-300", slotClass(v), h === hour && "ring-2 ring-primary", h === hour && di === DAY && "ring-offset-1 ring-offset-surface")} />
                    ))}
                  </div>
                </div>
              ))}
              <span />
              <div className="mt-1 flex justify-between font-mono text-[0.5625rem] text-fg-subtle">
                <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
              </div>
            </div>
            <ScheduleLegend className="mt-4" />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle">Now · Thu</span>
              <span className="font-mono text-sm font-semibold text-fg tabular-nums">{String(hour).padStart(2, "0")}:00</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle">This hour</span>
              <span className={cn("rounded-md px-2 py-0.5 font-mono font-medium", value === 0 ? "bg-danger-subtle text-danger-fg" : "bg-accent text-accent-fg")}>
                {value === 0 ? "Paused" : slotLabel(value)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle">Daily budget</span>
              <span className="font-mono text-fg tabular-nums">{value === 0 ? "—" : formatUSD(BASE_BUDGET * value)}</span>
            </div>
            <div className="mt-auto flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning-subtle px-2 py-1 text-warning-fg">
              <FlaskConical className="size-3.5" aria-hidden="true" /> Dry-run · nothing sent yet
            </div>
          </div>
        </div>
      </WindowFrame>
    </div>
  );
}
