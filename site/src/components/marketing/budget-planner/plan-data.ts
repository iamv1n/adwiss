export type Curve = "even" | "front_loaded" | "back_loaded";

export const TOTAL = 20000;
export const DAYS = 30;

export const CURVES: { id: Curve; label: string; hint: string }[] = [
  { id: "even", label: "Even", hint: "Same budget every day" },
  { id: "front_loaded", label: "Front-loaded", hint: "More early, tapering off" },
  { id: "back_loaded", label: "Back-loaded", hint: "Builds toward the end" },
];

/** Raw curve weight for day i of n: even = 1, front = 1.5 − t, back = 0.5 + t. */
export function weight(curve: Curve, i: number, n: number) {
  const t = n > 1 ? i / (n - 1) : 0;
  return curve === "even" ? 1 : curve === "front_loaded" ? 1.5 - t : 0.5 + t;
}

/** Daily budgets for `total` spread across `n` days by the curve. */
export function dailyBudgets(curve: Curve, total = TOTAL, n = DAYS) {
  const w = Array.from({ length: n }, (_, i) => weight(curve, i, n));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (total * x) / sum);
}

export const CAMPAIGNS: { name: string; provider: "Meta" | "Google"; share: number; color: string }[] = [
  { name: "Prospecting · Broad US", provider: "Meta", share: 40, color: "bg-chart-1" },
  { name: "Search · Brand", provider: "Google", share: 25, color: "bg-chart-2" },
  { name: "PMax · Catalog", provider: "Google", share: 20, color: "bg-chart-3" },
  { name: "Retargeting · 14d", provider: "Meta", share: 15, color: "bg-chart-5" },
];

export function formatUSD(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
