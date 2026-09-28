import { isTrendOp, type Condition, type ConditionMetric, type ConditionOp, type RuleInput } from "@/lib/automation-api";

export type TemplateGroup = "waste" | "scale" | "fresh" | "safety";

export const TEMPLATE_GROUPS: { id: TemplateGroup; label: string }[] = [
  { id: "waste", label: "Stop wasting money" },
  { id: "scale", label: "Put more behind what works" },
  { id: "fresh", label: "Keep ads fresh" },
  { id: "safety", label: "Safety nets" },
];

/** The user's goals; templates derive their thresholds from them. */
export interface Targets {
  /** Target cost per conversion, in the account currency. */
  cpa: number;
  /** Target return on ad spend (3 = ₹3 back per ₹1). */
  roas: number;
}

export const DEFAULT_TARGETS: Targets = { cpa: 500, roas: 2 };

export interface RuleTemplate {
  id: string;
  group: TemplateGroup;
  title: string;
  /** What the rule does, with the thresholds filled in. */
  blurb: (t: Targets) => string;
  /** Why it is worth having. */
  why: string;
  input: (t: Targets) => RuleInput;
  /** Opens the dayparting editor instead of the rule builder. */
  href?: string;
}

const base: Omit<RuleInput, "name" | "conditions" | "action"> = {
  scope_type: "org",
  scope_ids: [],
  lookback_days: 3,
  check_interval_minutes: 60,
  cooldown_minutes: 1440,
  max_changes_per_run: 10,
  enabled: false,
  dry_run: true,
};

const money = (v: number) => `₹${Math.round(v).toLocaleString()}`;
const round = (v: number) => Math.round(v * 100) / 100;

export const RULE_TEMPLATES: RuleTemplate[] = [
  // Stop wasting money
  {
    id: "wasted",
    group: "waste",
    title: "Spend with no results",
    blurb: (t) => `Pause campaigns that spent ${money(t.cpa * 3)} in 3 days with no conversions.`,
    why: "The most common leak. Waiting for 3× your target CPA gives new campaigns a fair chance before cutting them.",
    input: (t) => ({
      ...base,
      name: "Spend with no results",
      conditions: [
        { metric: "spend", op: "gte", value: t.cpa * 3 },
        { metric: "conversions", op: "eq", value: 0 },
      ],
      action: { type: "pause" },
    }),
  },
  {
    id: "high-cpa",
    group: "waste",
    title: "CPA far over target",
    blurb: (t) => `Pause when CPA is above ${money(t.cpa * 2)} over 7 days (after ${money(t.cpa * 3)} spent).`,
    why: "Catches campaigns that convert, but at a loss. The spend floor stops one unlucky day from triggering it.",
    input: (t) => ({
      ...base,
      name: "CPA far over target",
      lookback_days: 7,
      conditions: [
        { metric: "cpa", op: "gt", value: t.cpa * 2 },
        { metric: "spend", op: "gte", value: t.cpa * 3 },
      ],
      action: { type: "pause" },
    }),
  },
  {
    id: "unprofitable",
    group: "waste",
    title: "Losing money",
    blurb: (t) => `Cut the budget 30% when ROAS is below 1× over 7 days (after ${money(t.cpa * 10)} spent).`,
    why: "Returns less than it costs. Trimming instead of pausing keeps borderline campaigns alive while limiting the loss.",
    input: (t) => ({
      ...base,
      name: "Losing money: budget −30%",
      lookback_days: 7,
      cooldown_minutes: 4320,
      conditions: [
        { metric: "roas", op: "lt", value: 1 },
        { metric: "spend", op: "gte", value: t.cpa * 10 },
      ],
      action: { type: "decrease_budget", value: 30 },
    }),
  },
  {
    id: "clicks-no-sales",
    group: "waste",
    title: "Clicks but no sales",
    blurb: () => "Notify when 150+ clicks in 7 days produced no conversions.",
    why: "People click but don't buy. That usually points to the landing page, pixel or offer, which a human has to fix.",
    input: () => ({
      ...base,
      name: "Clicks but no sales",
      lookback_days: 7,
      conditions: [
        { metric: "clicks", op: "gte", value: 150 },
        { metric: "conversions", op: "eq", value: 0 },
      ],
      action: { type: "notify" },
    }),
  },

  // Put more behind what works
  {
    id: "scale-roas",
    group: "scale",
    title: "Scale winners +20%",
    blurb: (t) => `Raise the budget 20% when ROAS is above ${round(t.roas * 1.5)}× with 10+ conversions over 7 days.`,
    why: "Small steps with a 3-day cooldown scale without resetting Meta's learning phase. 10 conversions rules out luck.",
    input: (t) => ({
      ...base,
      name: "Scale winners +20%",
      lookback_days: 7,
      cooldown_minutes: 4320,
      max_changes_per_run: 5,
      conditions: [
        { metric: "roas", op: "gte", value: round(t.roas * 1.5) },
        { metric: "conversions", op: "gte", value: 10 },
      ],
      action: { type: "increase_budget", value: 20 },
    }),
  },
  {
    id: "scale-cpa",
    group: "scale",
    title: "Cheap conversions +15%",
    blurb: (t) => `Raise the budget 15% when CPA is under ${money(t.cpa * 0.7)} with 5+ conversions over 3 days.`,
    why: "The same idea for lead-gen and app businesses that judge by cost per result rather than revenue.",
    input: (t) => ({
      ...base,
      name: "Cheap conversions +15%",
      cooldown_minutes: 4320,
      max_changes_per_run: 5,
      conditions: [
        { metric: "cpa", op: "lte", value: t.cpa * 0.7 },
        { metric: "conversions", op: "gte", value: 5 },
      ],
      action: { type: "increase_budget", value: 15 },
    }),
  },
  {
    id: "revive",
    group: "scale",
    title: "Revive paused winners",
    blurb: (t) => `Activate campaigns with ROAS of ${t.roas}× or more and 5+ conversions over 14 days.`,
    why: "Campaigns paused during a bad week often get forgotten. Stays in dry run until you trust it.",
    input: (t) => ({
      ...base,
      name: "Revive paused winners",
      lookback_days: 14,
      check_interval_minutes: 1440,
      cooldown_minutes: 10080,
      max_changes_per_run: 3,
      conditions: [
        { metric: "roas", op: "gte", value: t.roas },
        { metric: "conversions", op: "gte", value: 5 },
      ],
      action: { type: "activate" },
    }),
  },

  // Keep ads fresh
  {
    id: "fatigue",
    group: "fresh",
    title: "Audience fatigue",
    blurb: () => "Notify when frequency is 3.5+ and CTR is under 0.8% over 7 days.",
    why: "The same people keep seeing the ad and have stopped clicking. Time for a new creative.",
    input: () => ({
      ...base,
      name: "Audience fatigue",
      lookback_days: 7,
      check_interval_minutes: 1440,
      cooldown_minutes: 10080,
      conditions: [
        { metric: "frequency", op: "gte", value: 3.5 },
        { metric: "ctr", op: "lt", value: 0.008 },
      ],
      action: { type: "notify" },
    }),
  },
  {
    id: "creative-fatigue-ad",
    group: "fresh",
    title: "Creative fatigue (per ad)",
    blurb: () =>
      "Pause single ads whose frequency rose 20%+ (to 2.5 or more) while CTR fell 20%+ vs the week before, with 3,000+ impressions.",
    why: "Catches the one tired ad inside a healthy campaign. Needs Meta reach data; stays in dry run until you trust it.",
    input: () => ({
      ...base,
      name: "Creative fatigue (per ad)",
      level: "ad",
      lookback_days: 7,
      check_interval_minutes: 1440,
      cooldown_minutes: 10080,
      max_changes_per_run: 5,
      conditions: [
        { metric: "frequency", op: "change_gt", value: 0.2 },
        { metric: "frequency", op: "gte", value: 2.5 },
        { metric: "ctr", op: "change_lt", value: -0.2 },
        { metric: "impressions", op: "gte", value: 3000 },
      ],
      action: { type: "pause" },
    }),
  },
  {
    id: "cpm-rising",
    group: "fresh",
    title: "Costly, unloved ads",
    blurb: () => "Cut the budget 20% when CPM is above ₹400 and CTR is under 0.5% over 3 days.",
    why: "Meta charges more to show ads people ignore. High CPM with low CTR means the ad is the problem, not the season.",
    input: () => ({
      ...base,
      name: "High CPM, low CTR: budget −20%",
      cooldown_minutes: 4320,
      conditions: [
        { metric: "cpm", op: "gt", value: 400 },
        { metric: "ctr", op: "lt", value: 0.005 },
      ],
      action: { type: "decrease_budget", value: 20 },
    }),
  },
  {
    id: "cpc",
    group: "fresh",
    title: "Expensive clicks",
    blurb: () => "Notify when CPC is above ₹40 with 50+ clicks over 7 days.",
    why: "For traffic campaigns without conversion tracking, cost per click is the only efficiency signal.",
    input: () => ({
      ...base,
      name: "Expensive clicks",
      lookback_days: 7,
      conditions: [
        { metric: "cpc", op: "gt", value: 40 },
        { metric: "clicks", op: "gte", value: 50 },
      ],
      action: { type: "notify" },
    }),
  },

  // Safety nets
  {
    id: "daily-cap",
    group: "safety",
    title: "Daily spend cap",
    blurb: (t) => `Pause any campaign that spends ${money(t.cpa * 20)} in a day.`,
    why: "A hard stop for the day someone types an extra zero into a budget. Complements the account spend limit.",
    input: (t) => ({
      ...base,
      name: "Daily spend cap",
      lookback_days: 1,
      check_interval_minutes: 15,
      conditions: [{ metric: "spend", op: "gte", value: t.cpa * 20 }],
      action: { type: "pause" },
    }),
  },
  {
    id: "night",
    group: "safety",
    title: "Night-time pause",
    blurb: () => "A dayparting schedule: off 23:00–06:00 every day, on the rest.",
    why: "Late-night clicks rarely convert for most businesses. Check your hourly report first.",
    href: "/app/dayparting?template=night",
    input: () => ({ ...base, name: "Night-time pause", conditions: [], action: { type: "pause" } }),
  },
];

export const METRIC_OPTIONS: { id: ConditionMetric; label: string; kind: "money" | "count" | "ratio" | "percent" }[] = [
  { id: "spend", label: "Spend", kind: "money" },
  { id: "conversions", label: "Conversions", kind: "count" },
  { id: "revenue", label: "Revenue", kind: "money" },
  { id: "cpa", label: "CPA", kind: "money" },
  { id: "roas", label: "ROAS", kind: "ratio" },
  { id: "ctr", label: "CTR", kind: "percent" },
  { id: "cpc", label: "CPC", kind: "money" },
  { id: "cpm", label: "CPM", kind: "money" },
  { id: "impressions", label: "Impressions", kind: "count" },
  { id: "clicks", label: "Clicks", kind: "count" },
  { id: "frequency", label: "Frequency", kind: "ratio" },
];

export const OP_OPTIONS: { id: ConditionOp; label: string; symbol: string }[] = [
  { id: "gt", label: "is more than", symbol: ">" },
  { id: "gte", label: "is at least", symbol: "≥" },
  { id: "lt", label: "is less than", symbol: "<" },
  { id: "lte", label: "is at most", symbol: "≤" },
  { id: "eq", label: "equals", symbol: "=" },
  { id: "change_lt", label: "fell by more than", symbol: "↓ >" },
  { id: "change_gt", label: "rose by more than", symbol: "↑ >" },
];

export function metricKind(m: ConditionMetric) {
  return METRIC_OPTIONS.find((o) => o.id === m)?.kind ?? "count";
}

/** "spend > ₹500" (or "CTR ↓ > 25% vs prev.") style chip text. */
export function conditionText(c: Condition, currencySymbol = "₹") {
  const m = METRIC_OPTIONS.find((o) => o.id === c.metric)?.label ?? c.metric;
  if (isTrendOp(c.op)) {
    const arrow = c.op === "change_lt" ? "↓" : "↑";
    return `${m} ${arrow} > ${+(Math.abs(c.value) * 100).toFixed(1)}% vs prev.`;
  }
  const op = OP_OPTIONS.find((o) => o.id === c.op)?.symbol ?? c.op;
  const kind = metricKind(c.metric);
  const v =
    kind === "money"
      ? `${currencySymbol}${c.value.toLocaleString()}`
      : kind === "percent"
        ? `${+(c.value * 100).toFixed(2)}%`
        : kind === "ratio" && c.metric === "roas"
          ? `${c.value}×`
          : c.value.toLocaleString();
  return `${m} ${op} ${v}`;
}

export function intervalLabel(min: number) {
  if (min < 60) return `every ${min} min`;
  if (min === 60) return "hourly";
  if (min % 1440 === 0) return min === 1440 ? "daily" : `every ${min / 1440} days`;
  return `every ${min / 60} h`;
}

export function cooldownLabel(min: number) {
  if (min === 0) return "no cooldown";
  if (min < 60) return `${min} min`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  return `${min / 60} h`;
}
