import type { Dayparting } from "@/lib/analytics-api";
import type { Grid } from "@/lib/automation-api";

/** grid[weekday 0=Mon][hour]: 0 = off (pause), 1 = on, else budget multiplier. */
export function fillGrid(v: number): Grid {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => v));
}

export function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.slice());
}

export const BRUSHES: { value: number; label: string; hint: string }[] = [
  { value: 0, label: "Off", hint: "Pause" },
  { value: 1, label: "On", hint: "Normal budget" },
  { value: 0.5, label: "50%", hint: "Half budget" },
  { value: 0.75, label: "75%", hint: "Budget −25%" },
  { value: 1.25, label: "125%", hint: "Budget +25%" },
  { value: 1.5, label: "150%", hint: "Budget +50%" },
  { value: 2, label: "200%", hint: "Double budget" },
];

export function valueLabel(v: number) {
  if (v === 0) return "Off";
  if (v === 1) return "On";
  return `${Math.round(v * 100)}%`;
}

export function valueSentence(v: number) {
  if (v === 0) return "paused";
  if (v === 1) return "on (normal budget)";
  return v > 1 ? `on, budget +${Math.round((v - 1) * 100)}%` : `on, budget −${Math.round((1 - v) * 100)}%`;
}

/** Tailwind classes for a painted cell. Off is hatched so it never relies on colour alone. */
export function cellClass(v: number) {
  if (v === 0) return "bg-bg-subtle bg-[repeating-linear-gradient(135deg,var(--color-fg)_0_1px,transparent_1px_5px)] [background-blend-mode:normal] text-fg-subtle";
  if (v === 1) return "bg-heat-3 text-fg";
  if (v < 1) return "bg-heat-2 text-fg";
  return v >= 1.75 ? "bg-heat-6 text-bg" : "bg-heat-5 text-bg";
}

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);

export const PRESETS: { id: string; label: string; build: () => Grid }[] = [
  {
    id: "business",
    label: "Business hours",
    build: () => fillGrid(0).map((row, d) => row.map((_, h) => (d < 5 && h >= 9 && h < 18 ? 1 : 0))),
  },
  {
    id: "evenings",
    label: "Evenings + weekends",
    build: () => fillGrid(0).map((row, d) => row.map((_, h) => (d >= 5 ? (h >= 8 ? 1 : 0) : h >= 18 && h < 23 ? 1.5 : h >= 8 && h < 18 ? 1 : 0))),
  },
  {
    id: "overnight",
    label: "Pause overnight",
    build: () => fillGrid(1).map((row) => row.map((_, h) => (h >= 23 || h < 6 ? 0 : 1))),
  },
  { id: "all", label: "All on", build: () => fillGrid(1) },
];

/**
 * Paints the top `share` of hours by the heatmap's metric (ratio metrics
 * need spend behind them) as on, boosts the top tenth to 150%, and turns the
 * rest off.
 */
export function gridFromHeatmap(data: Dayparting, share = 0.5, lowerIsBetter = false): Grid | null {
  const cells: { d: number; h: number; v: number }[] = [];
  data.days.forEach((day, d) =>
    day.cells.forEach((c) => {
      if (c.value != null && (c.spend ?? 0) > 0) cells.push({ d, h: c.hour, v: c.value });
    }),
  );
  if (cells.length < 24) return null;
  cells.sort((a, b) => (lowerIsBetter ? a.v - b.v : b.v - a.v));
  const g = fillGrid(0);
  const n = Math.round(cells.length * share);
  const top = Math.round(cells.length * 0.1);
  cells.slice(0, n).forEach((c, i) => {
    g[c.d][c.h] = i < top ? 1.5 : 1;
  });
  return g;
}

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon–Fri 09:00–18:00 on" style summary of a grid's non-default blocks (at most `max`). */
export function describeGrid(g: Grid, max = 3): string {
  const counts = new Map<number, number>();
  g.forEach((row) => row.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1)));
  const parts = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `${n}h ${valueLabel(v).toLowerCase()}`);
  return parts.slice(0, max).join(" · ") + " / week";
}

export function countDiff(a: Grid, b: Grid) {
  let n = 0;
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (a[d]?.[h] !== b[d]?.[h]) n++;
  return n;
}

export { range };
