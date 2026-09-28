"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Grid } from "@/lib/automation-api";
import { cn } from "@/lib/utils";
import { DAY_SHORT, cellClass, cloneGrid, valueLabel, valueSentence } from "./grid";

const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Click-drag painter for a 7×24 schedule grid. Drag across cells to paint
 * them with `brush`; click a day or hour header to paint the whole row or
 * column. Keyboard: arrows move, Space/Enter paints.
 */
export function GridPainter({
  value,
  onChange,
  brush,
  disabled,
  nowCell,
}: {
  value: Grid;
  onChange: (g: Grid) => void;
  brush: number;
  disabled?: boolean;
  /** Highlights the current hour (weekday 0 = Mon). */
  nowCell?: { day: number; hour: number } | null;
}) {
  const painting = useRef(false);
  const draft = useRef<Grid | null>(null);
  const [focus, setFocus] = useState({ day: 0, hour: 9 });
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [draftGrid, setDraftGrid] = useState<Grid | null>(null);

  useEffect(() => {
    const stop = () => {
      if (painting.current && draft.current) onChange(draft.current);
      painting.current = false;
      draft.current = null;
      setDraftGrid(null);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [onChange]);

  const grid = draftGrid ?? value;

  const paint = (cells: [number, number][]) => {
    const g = cloneGrid(draft.current ?? value);
    let changed = false;
    for (const [d, h] of cells) {
      if (g[d][h] !== brush) {
        g[d][h] = brush;
        changed = true;
      }
    }
    if (!changed) return;
    if (painting.current) {
      draft.current = g;
      setDraftGrid(g);
    } else {
      onChange(g);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let { day, hour } = focus;
    switch (e.key) {
      case "ArrowRight": hour = Math.min(23, hour + 1); break;
      case "ArrowLeft": hour = Math.max(0, hour - 1); break;
      case "ArrowDown": day = Math.min(6, day + 1); break;
      case "ArrowUp": day = Math.max(0, day - 1); break;
      case " ":
      case "Enter":
        e.preventDefault();
        if (!disabled) paint([[day, hour]]);
        return;
      default: return;
    }
    e.preventDefault();
    setFocus({ day, hour });
    refs.current[day * 24 + hour]?.focus();
  };

  return (
    <div className={cn("select-none", disabled && "pointer-events-none opacity-70")}>
      <div className="mb-1 grid grid-cols-[2.25rem_1fr] gap-1">
        <span />
        <div className="grid grid-cols-24 gap-[2px]">
          {HOURS.map((h) => (
            <button
              key={h}
              type="button"
              tabIndex={-1}
              title={`Paint ${hh(h)} on every day`}
              onClick={() => paint(DAY_SHORT.map((_, d) => [d, h]))}
              className="rounded-sm text-center font-mono text-[0.625rem] text-fg-subtle tabular-nums hover:bg-bg-subtle hover:text-fg"
            >
              {String(h).padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>
      <div
        role="grid"
        aria-label="Weekly schedule. Arrow keys move; Space paints the focused hour with the selected brush."
        onKeyDown={onKeyDown}
        onPointerLeave={() => setHover(null)}
        className="flex flex-col gap-[2px]"
      >
        {DAY_SHORT.map((d, day) => (
          <div role="row" key={d} className="grid grid-cols-[2.25rem_1fr] items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              role="rowheader"
              title={`Paint all of ${DAYS_LONG[day]}`}
              onClick={() => paint(HOURS.map((h) => [day, h]))}
              className="rounded-sm text-left text-xs font-medium text-fg-muted hover:text-fg"
            >
              {d}
            </button>
            <div className="grid grid-cols-24 gap-[2px]">
              {HOURS.map((hour) => {
                const v = grid[day]?.[hour] ?? 1;
                const isNow = nowCell?.day === day && nowCell?.hour === hour;
                return (
                  <div
                    key={hour}
                    role="gridcell"
                    ref={(el) => {
                      refs.current[day * 24 + hour] = el;
                    }}
                    tabIndex={focus.day === day && focus.hour === hour ? 0 : -1}
                    aria-label={`${DAYS_LONG[day]} ${hh(hour)}: ${valueSentence(v)}${isNow ? " (now)" : ""}`}
                    onPointerDown={(e) => {
                      if (disabled) return;
                      e.preventDefault();
                      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                      painting.current = true;
                      draft.current = cloneGrid(value);
                      setFocus({ day, hour });
                      paint([[day, hour]]);
                    }}
                    onPointerEnter={() => {
                      setHover({ day, hour });
                      if (painting.current) paint([[day, hour]]);
                    }}
                    onFocus={() => setFocus({ day, hour })}
                    className={cn(
                      "relative flex h-7 cursor-crosshair items-center justify-center rounded-[3px] text-[0.5625rem] font-medium tabular-nums outline-none",
                      cellClass(v),
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      isNow && "ring-2 ring-primary ring-offset-1 ring-offset-surface",
                    )}
                  >
                    {v !== 0 && v !== 1 ? valueLabel(v).replace("%", "") : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 h-4 text-xs text-fg-muted" aria-live="polite">
        {hover ? `${DAYS_LONG[hover.day]} ${hh(hover.hour)}–${hh((hover.hour + 1) % 24)}: ${valueSentence(grid[hover.day][hover.hour])}` : "Drag to paint. Click a day or hour label to paint a whole row or column."}
      </p>
    </div>
  );
}
