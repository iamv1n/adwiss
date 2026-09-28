/**
 * Deterministic, plausible dayparting data for the marketing page.
 * Strong on weekday working/evening hours, weak overnight, softer weekends.
 * Seeded so server and client renders match exactly.
 */

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const HOURS = Array.from({ length: 24 }, (_, h) => h);

export type Metric = "roas" | "spend" | "cpa";

export type Cell = {
  day: number;
  hour: number;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number;
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relative traffic intensity by hour (0..1). */
function hourCurve(h: number) {
  if (h < 6) return 0.12 + h * 0.01;
  if (h < 9) return 0.25 + (h - 6) * 0.15;
  if (h < 13) return 0.8 + (h - 9) * 0.03;
  if (h < 17) return 0.78;
  if (h < 22) return 0.92 + (h === 20 ? 0.08 : 0);
  return 0.45 - (h - 22) * 0.12;
}

/** Relative conversion efficiency by hour (drives ROAS). */
function efficiencyCurve(h: number) {
  if (h < 6) return 0.35;
  if (h < 9) return 0.65 + (h - 6) * 0.08;
  if (h < 13) return 1.05;
  if (h < 18) return 0.95;
  if (h < 22) return 1.15;
  return 0.6;
}

function round(n: number, d = 0) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export const CELLS: Cell[] = (() => {
  const rand = mulberry32(20260924);
  const out: Cell[] = [];
  for (let day = 0; day < 7; day++) {
    const weekend = day >= 5;
    const dayVolume = weekend ? 0.7 : 1 - (day === 4 ? 0.05 : 0);
    const dayEff = weekend ? 0.8 : 1;
    for (const hour of HOURS) {
      const noise = 0.85 + rand() * 0.3;
      // Totals over the 12-week window shown in the UI.
      const spend = round(12 * 4200 * hourCurve(hour) * dayVolume * noise);
      const roas = round(Math.max(0.35, 2.9 * efficiencyCurve(hour) * dayEff * (0.88 + rand() * 0.24)), 2);
      const revenue = round(spend * roas);
      const aov = 1850 + rand() * 250;
      const conversions = Math.max(1, Math.round(revenue / aov));
      out.push({ day, hour, spend, revenue, conversions, roas, cpa: round(spend / conversions) });
    }
  }
  return out;
})();

/** Maps each cell to a heat level 0..6 (6 = best) for the given metric. */
export function heatLevels(metric: Metric): number[] {
  const values = CELLS.map((c) => c[metric]);
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const rank = sorted.indexOf(v) / (sorted.length - 1);
    const level = Math.min(6, Math.floor(rank * 7));
    // Lower CPA is better, so the scale inverts.
    return metric === "cpa" ? 6 - level : level;
  });
}

export const HEAT_BG = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
  "bg-heat-6",
] as const;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatINR = (n: number) => inr.format(n);

export function hourLabel(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}
