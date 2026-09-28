/** Shared demo schedule for the dayparting page. `0` = off (paused), otherwise a budget multiplier. */

export type Slot = number;

export type Stroke = { days: [number, number]; hours: [number, number]; value: Slot };

/** Brush strokes applied in order over an all-1× base. */
export const STROKES: Stroke[] = [
  { days: [0, 6], hours: [0, 5], value: 0 },
  { days: [0, 6], hours: [23, 23], value: 0 },
  { days: [0, 4], hours: [6, 8], value: 0.5 },
  { days: [0, 4], hours: [9, 12], value: 1.2 },
  { days: [0, 4], hours: [18, 21], value: 1.5 },
  { days: [3, 4], hours: [19, 21], value: 2 },
  { days: [5, 6], hours: [10, 20], value: 0.8 },
  { days: [4, 4], hours: [20, 20], value: 5 },
];

export function buildSchedule(strokeCount = STROKES.length): Slot[][] {
  const grid: Slot[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 1));
  for (const s of STROKES.slice(0, strokeCount)) {
    for (let d = s.days[0]; d <= s.days[1]; d++) {
      for (let h = s.hours[0]; h <= s.hours[1]; h++) grid[d][h] = s.value;
    }
  }
  return grid;
}

export function slotClass(v: Slot) {
  if (v === 0) return "bg-danger/20";
  if (v < 1) return "bg-heat-1";
  if (v === 1) return "bg-heat-2";
  if (v < 1.5) return "bg-heat-3";
  if (v < 2) return "bg-heat-4";
  if (v < 5) return "bg-heat-5";
  return "bg-heat-6";
}

export function slotLabel(v: Slot) {
  return v === 0 ? "Off" : `${v}×`;
}

export const LEGEND: Slot[] = [0, 0.5, 1, 1.2, 1.5, 2, 5];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const formatUSD = (n: number) => usd.format(n);
