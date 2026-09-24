"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { useMounted } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  CELLS,
  DAY_NAMES,
  DAYS,
  HEAT_BG,
  HOURS,
  formatINR,
  heatLevels,
  hourLabel,
  type Metric,
} from "./heatmap-data";

const METRICS: { id: Metric; label: string; hint: string }[] = [
  { id: "roas", label: "ROAS", hint: "Higher is better" },
  { id: "spend", label: "Spend", hint: "Darker means more spend" },
  { id: "cpa", label: "CPA", hint: "Lower is better (scale inverted)" },
];

function formatMetric(metric: Metric, v: number) {
  return metric === "roas" ? `${v.toFixed(2)}×` : formatINR(v);
}

/** True when a cell falls inside the demo rule: Mon–Fri 22:00–06:00. */
export function inNightRule(day: number, hour: number) {
  return (day <= 4 && hour >= 22) || (day >= 1 && day <= 5 && hour < 6);
}

export function DaypartingHeatmap({ showOverlay }: { showOverlay: boolean }) {
  const [metric, setMetric] = useState<Metric>("roas");
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);
  const [focusPos, setFocusPos] = useState({ day: 0, hour: 9 });
  const [now, setNow] = useState(9);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { margin: "-20% 0px" });
  const prefersReduced = useReducedMotion();
  const mounted = useMounted();
  // Treat the server render and first client render as "no motion" so markup matches.
  const reduce = !mounted || !!prefersReduced;

  const levels = useMemo(() => heatLevels(metric), [metric]);
  const { best, worst } = useMemo(() => {
    const bestIdx = levels.indexOf(6);
    const worstIdx = levels.indexOf(0);
    return { best: CELLS[bestIdx], worst: CELLS[worstIdx] };
  }, [levels]);

  // Gently sweep a "now" marker across the hours while the section is visible.
  useEffect(() => {
    if (reduce || !inView || active) return;
    const id = window.setInterval(() => setNow((h) => (h + 1) % 24), 1400);
    return () => window.clearInterval(id);
  }, [reduce, inView, active]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let { day, hour } = focusPos;
    switch (e.key) {
      case "ArrowRight": hour = Math.min(23, hour + 1); break;
      case "ArrowLeft": hour = Math.max(0, hour - 1); break;
      case "ArrowDown": day = Math.min(6, day + 1); break;
      case "ArrowUp": day = Math.max(0, day - 1); break;
      case "Home": hour = 0; break;
      case "End": hour = 23; break;
      case "Escape": setActive(null); return;
      default: return;
    }
    e.preventDefault();
    setFocusPos({ day, hour });
    setActive({ day, hour });
    cellRefs.current[day * 24 + hour]?.focus();
  };

  const metricInfo = METRICS.find((m) => m.id === metric)!;

  return (
    <div ref={wrapRef} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">Performance by hour × weekday</h3>
          <p className="text-xs text-fg-subtle">Saffron Home · last 12 weeks · Asia/Kolkata</p>
        </div>
        <div role="radiogroup" aria-label="Heatmap metric" className="inline-flex rounded-lg border border-border bg-bg-subtle p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={metric === m.id}
              onClick={() => setMetric(m.id)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                metric === m.id ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* Hour axis */}
        <div aria-hidden="true" className="mb-1 grid grid-cols-[2rem_1fr] gap-1 sm:grid-cols-[2.5rem_1fr]">
          <span />
          <div className="grid grid-cols-24 font-mono text-[0.5625rem] text-fg-subtle sm:text-[0.625rem]">
            {HOURS.map((h) => (
              <span key={h} className={cn("text-center", h % 3 !== 0 && "invisible", now === h && !reduce && "text-primary")}>
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>

        <div
          role="grid"
          aria-label={`Hour by weekday heatmap of ${metricInfo.label}. ${metricInfo.hint}. Use arrow keys to move between hours and days.`}
          aria-describedby="heatmap-legend"
          onKeyDown={onKeyDown}
          onMouseLeave={() => setActive(null)}
          className="flex flex-col gap-0.5 sm:gap-1"
        >
          {DAYS.map((d, day) => (
            <div role="row" key={d} className="grid grid-cols-[2rem_1fr] items-center gap-1 sm:grid-cols-[2.5rem_1fr]">
              <div role="rowheader" className="text-[0.6875rem] font-medium text-fg-muted">
                <abbr title={DAY_NAMES[day]} className="no-underline">{d}</abbr>
              </div>
              <div className="grid grid-cols-24 gap-0.5 sm:gap-1">
                {HOURS.map((hour) => {
                  const i = day * 24 + hour;
                  const c = CELLS[i];
                  const isActive = active?.day === day && active?.hour === hour;
                  const isFocusable = focusPos.day === day && focusPos.hour === hour;
                  const covered = showOverlay && inNightRule(day, hour);
                  return (
                    <div
                      role="gridcell"
                      key={hour}
                      ref={(el) => {
                        cellRefs.current[i] = el;
                      }}
                      tabIndex={isFocusable ? 0 : -1}
                      aria-label={`${DAY_NAMES[day]} ${hourLabel(hour)} to ${hourLabel((hour + 1) % 24)}: ${metricInfo.label} ${formatMetric(metric, c[metric])}${covered ? ", paused by night rule" : ""}`}
                      onMouseEnter={() => setActive({ day, hour })}
                      onFocus={() => {
                        setFocusPos({ day, hour });
                        setActive({ day, hour });
                      }}
                      onBlur={() => setActive(null)}
                      style={{ transitionDelay: reduce ? undefined : `${hour * 12 + day * 20}ms` }}
                      className={cn(
                        "relative aspect-square rounded-[3px] outline-none transition-[background-color,box-shadow] duration-500 motion-reduce:transition-none sm:rounded-[4px]",
                        HEAT_BG[levels[i]],
                        "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
                        isActive && "z-10 ring-2 ring-fg/70",
                        !reduce && now === hour && !active && "ring-1 ring-primary/60",
                      )}
                    >
                      {covered ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-[inherit] bg-[repeating-linear-gradient(135deg,var(--color-fg)_0_1px,transparent_1px_4px)] opacity-20"
                        />
                      ) : null}
                      {isActive ? <CellTooltip day={day} hour={hour} metric={metric} /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-xs">
        <div id="heatmap-legend" className="flex items-center gap-2 text-fg-subtle">
          <span>{metric === "cpa" ? "High CPA" : metric === "spend" ? "Low" : "Worse"}</span>
          <span aria-hidden="true" className="flex gap-0.5">
            {HEAT_BG.map((bg) => (
              <span key={bg} className={cn("size-3 rounded-[3px]", bg)} />
            ))}
          </span>
          <span>{metric === "cpa" ? "Low CPA" : metric === "spend" ? "High" : "Better"}</span>
          <span className="sr-only">{metricInfo.hint}</span>
          {showOverlay ? (
            <span className="ml-2 inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-3 rounded-[3px] bg-heat-3 bg-[repeating-linear-gradient(135deg,var(--color-fg)_0_1px,transparent_1px_4px)]"
              />
              Night rule
            </span>
          ) : null}
        </div>
        <p className="text-fg-muted" aria-live="polite">
          {metric === "spend" ? "Heaviest" : "Best"}:{" "}
          <span className="font-medium text-fg">
            {DAYS[best.day]} {hourLabel(best.hour)}
          </span>{" "}
          · {metric === "spend" ? "Lightest" : "Worst"}:{" "}
          <span className="font-medium text-fg">
            {DAYS[worst.day]} {hourLabel(worst.hour)}
          </span>
        </p>
      </div>
    </div>
  );
}

function CellTooltip({ day, hour, metric }: { day: number; hour: number; metric: Metric }) {
  const c = CELLS[day * 24 + hour];
  const align = hour < 5 ? "left-0" : hour > 18 ? "right-0" : "left-1/2 -translate-x-1/2";
  const vertical = day < 2 ? "top-full mt-2" : "bottom-full mb-2";
  const rows: [string, string, Metric | null][] = [
    ["ROAS", `${c.roas.toFixed(2)}×`, "roas"],
    ["Spend", formatINR(c.spend), "spend"],
    ["Revenue", formatINR(c.revenue), null],
    ["CPA", formatINR(c.cpa), "cpa"],
    ["Conversions", String(c.conversions), null],
  ];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-20 w-44 rounded-lg border border-border bg-surface-raised p-2.5 text-left shadow-lg",
        align,
        vertical,
      )}
    >
      <p className="mb-1.5 text-[0.6875rem] font-semibold text-fg">
        {DAY_NAMES[day]} · {hourLabel(hour)}–{hourLabel((hour + 1) % 24)}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[0.6875rem]">
        {rows.map(([k, v, m]) => (
          <div key={k} className="contents">
            <dt className={cn(m === metric ? "font-medium text-fg" : "text-fg-subtle")}>{k}</dt>
            <dd className={cn("text-right font-mono tabular-nums", m === metric ? "font-semibold text-fg" : "text-fg-muted")}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
