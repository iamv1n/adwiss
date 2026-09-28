"use client";

import { useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { StatusPill, type PillTone } from "@/components/app/integrations/status-pill";
import { formatMoney, niceTicks } from "@/components/app/analytics/format";
import { isoDate } from "@/components/app/campaigns/format";
import type { Curve, PlanStatus, PlanSummary } from "@/lib/budget-api";
import { cn } from "@/lib/utils";

// --- Labels ---

export const CURVES: { id: Curve; label: string; hint: string }[] = [
  { id: "even", label: "Even", hint: "Same amount every day" },
  { id: "front_loaded", label: "Front-loaded", hint: "Spend more early, taper off" },
  { id: "back_loaded", label: "Back-loaded", hint: "Build up towards the end" },
  { id: "custom", label: "Custom", hint: "Drag any day's bar to shape it" },
];

const STATUS: Record<PlanStatus, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "muted" },
  scheduled: { label: "Scheduled", tone: "info" },
  active: { label: "Active", tone: "success" },
  completed: { label: "Completed", tone: "muted" },
};

export function PlanBadges({ plan }: { plan: Pick<PlanSummary, "status" | "enabled" | "dry_run"> }) {
  const s = STATUS[plan.status] ?? STATUS.draft;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusPill tone={plan.enabled ? s.tone : "muted"}>{plan.enabled ? s.label : "Off"}</StatusPill>
      {plan.dry_run ? <StatusPill tone="info">Dry run</StatusPill> : null}
    </span>
  );
}

// --- Dates ---

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export type PeriodPreset = "this_month" | "rest_of_month" | "next_7" | "custom";

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "rest_of_month", label: "Rest of this month" },
  { id: "next_7", label: "Next 7 days" },
  { id: "custom", label: "Custom range" },
];

export function presetPeriod(p: Exclude<PeriodPreset, "custom">, now = new Date()): { start: string; end: string } {
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (p === "this_month") return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(endOfMonth) };
  if (p === "rest_of_month") return { start: isoDate(now), end: isoDate(endOfMonth) };
  return { start: isoDate(now), end: isoDate(addDays(now, 6)) };
}

export function matchPreset(start: string, end: string): PeriodPreset {
  for (const p of ["this_month", "rest_of_month", "next_7"] as const) {
    const r = presetPeriod(p);
    if (r.start === start && r.end === end) return p;
  }
  return "custom";
}

/** All YYYY-MM-DD days from start to end inclusive (empty when invalid). */
export function daysBetween(start: string, end: string, max = 92): string[] {
  const out: string[] = [];
  const [y, m, d] = start.split("-").map(Number);
  if (!y || !m || !d) return out;
  let cur = new Date(y, m - 1, d);
  while (out.length <= max) {
    const s = isoDate(cur);
    if (s > end) break;
    out.push(s);
    cur = addDays(cur, 1);
  }
  return out;
}

export function formatDayShort(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
}

export function formatPeriod(start: string, end: string) {
  return `${formatDayShort(start)} – ${formatDayShort(end)}`;
}

// --- Pacing math (client mirror, used until the server preview arrives) ---

export function curveWeights(curve: Curve, n: number, custom?: number[] | null): number[] {
  if (curve === "custom" && custom && custom.length === n) return custom;
  return Array.from({ length: n }, (_, i) => {
    const t = n <= 1 ? 0 : i / (n - 1);
    return curve === "front_loaded" ? 1.5 - t : curve === "back_loaded" ? 0.5 + t : 1;
  });
}

export function spread(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => (total * w) / sum);
}

// --- Delivery ring ---

export function DeliveryRing({ pct, size = 56, label }: { pct: number | null; size?: number; label?: string }) {
  const reduce = useReducedMotion();
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const tone =
    pct == null ? "var(--color-border-strong)" : pct < 85 ? "var(--color-warning)" : pct > 110 ? "var(--color-danger)" : "var(--color-success)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `Delivery ${pct == null ? "not started" : `${pct.toFixed(1)}%`}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - v / 100) : c }}
          animate={{ strokeDashoffset: c * (1 - v / 100) }}
          transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-semibold text-fg tabular-nums" aria-hidden="true">
        {pct == null ? "—" : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

// --- Daily bars (optionally editable) ---

export interface DayBar {
  day: string;
  planned: number;
  spent?: number | null;
}

/**
 * One column per day. When `onEdit` is set each bar can be dragged (pointer) or
 * nudged with ↑/↓ (keyboard) to a new amount.
 */
export function DailyBars({
  bars,
  currency,
  height = 160,
  onEdit,
  ariaLabel,
  today,
}: {
  bars: DayBar[];
  currency: string;
  height?: number;
  onEdit?: (index: number, amount: number) => void;
  ariaLabel: string;
  today?: string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ i: number; top: number } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  let max = 0;
  for (const b of bars) max = Math.max(max, b.planned, b.spent ?? 0);
  // While dragging keep the scale fixed so the bar tracks the pointer.
  const ticks = niceTicks(drag ? drag.top : max * (onEdit ? 1.25 : 1), 3);
  const top = drag?.top ?? (ticks[ticks.length - 1] || 1);
  const pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  const n = bars.length;
  const hasSpent = bars.some((b) => b.spent != null);
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  const amountAt = (clientY: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const f = 1 - (clientY - rect.top) / rect.height;
    return Math.max(top * 0.01, Math.min(1, f) * top);
  };

  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      <div className="relative w-12 shrink-0" style={{ height }} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 translate-y-1/2 text-[11px] text-fg-subtle tabular-nums" style={{ bottom: pct(t) }}>
            {formatMoney(t, currency, { compact: true })}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div ref={plotRef} className="relative touch-none select-none" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} aria-hidden="true" className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-border-strong" : "bg-border")} style={{ bottom: pct(t) }} />
          ))}
          <div className="absolute inset-0 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {bars.map((b, i) => {
              const text = `${formatDayShort(b.day)}: planned ${formatMoney(b.planned, currency)}${b.spent != null ? `, spent ${formatMoney(b.spent, currency)}` : ""}`;
              return (
                <button
                  key={b.day}
                  type="button"
                  aria-label={onEdit ? `${text}. Use up and down arrows to change.` : text}
                  aria-describedby={active === i ? `${id}-tip` : undefined}
                  className={cn(
                    "group relative flex h-full items-end justify-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    onEdit && "cursor-ns-resize",
                  )}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((a) => (a === i && !drag ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  onPointerDown={(e) => {
                    if (!onEdit) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDrag({ i, top });
                    onEdit(i, amountAt(e.clientY));
                  }}
                  onPointerMove={(e) => {
                    if (drag?.i === i && onEdit) onEdit(i, amountAt(e.clientY));
                  }}
                  onPointerUp={() => setDrag(null)}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => {
                    if (!onEdit || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                    e.preventDefault();
                    const step = e.shiftKey ? 0.25 : 0.1;
                    onEdit(i, Math.max(top * 0.01, b.planned * (e.key === "ArrowUp" ? 1 + step : 1 - step)));
                  }}
                >
                  <span
                    className={cn(
                      "block w-full max-w-6 rounded-t-[4px] transition-[height,opacity] duration-300 ease-out",
                      hasSpent ? "bg-chart-1/35" : "bg-chart-1",
                      today === b.day && "ring-2 ring-primary/40",
                      active != null && active !== i && "opacity-60",
                      drag && "duration-0",
                    )}
                    style={{ height: pct(b.planned) }}
                  />
                  {b.spent != null ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 block w-1/2 max-w-3 rounded-t-[3px] bg-chart-2 transition-[height] duration-300"
                      style={{ height: pct(b.spent) }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          {active != null && bars[active] ? (
            <div
              id={`${id}-tip`}
              role="tooltip"
              className="pointer-events-none absolute -top-2 z-10 w-44 -translate-y-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-md"
              style={{ left: `clamp(0px, calc(${((active + 0.5) / n) * 100}% - 5.5rem), calc(100% - 11rem))` }}
            >
              <p className="text-fg-muted">{formatDayShort(bars[active].day)}</p>
              <p className="mt-0.5 font-semibold text-fg tabular-nums">Planned {formatMoney(bars[active].planned, currency)}</p>
              {bars[active].spent != null ? (
                <p className="text-fg-muted tabular-nums">Spent {formatMoney(bars[active].spent, currency)}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-1.5 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
          {bars.map((b, i) => (
            <span key={b.day} className="overflow-visible text-center text-[11px] whitespace-nowrap text-fg-subtle tabular-nums">
              {i % labelEvery === 0 ? Number(b.day.slice(8)) : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
