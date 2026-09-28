/**
 * Sensible defaults from the org's "kinds of ads you run" answer
 * (lead setup `ad_types`). Pure functions only, so they can be unit tested.
 */

import type { AdType } from "@/lib/leads-api";

/* ------------------------------------------------------------------ */
/* Dashboard KPIs                                                      */
/* ------------------------------------------------------------------ */

/**
 * Headline tiles the dashboard can show. Several ids share one metric with a
 * different label (e.g. `leads`, `purchases` and `conversions` all read
 * `conversions`), so a list never contains two ids for the same metric.
 */
export type KpiId =
  | "spend"
  | "revenue"
  | "roas"
  | "cpa"
  | "conversions"
  | "purchases"
  | "leads"
  | "results"
  | "installs"
  | "cost_per_lead"
  | "cost_per_result"
  | "cost_per_install"
  | "ctr"
  | "cpc"
  | "cpm"
  | "impressions";

/** Which metric each tile reads; tiles sharing a metric are exclusive. */
export const KPI_METRIC: Record<KpiId, string> = {
  spend: "spend",
  revenue: "conversion_value",
  roas: "roas",
  cpa: "cpa",
  conversions: "conversions",
  purchases: "conversions",
  leads: "conversions",
  results: "conversions",
  installs: "conversions",
  cost_per_lead: "cpa",
  cost_per_result: "cpa",
  cost_per_install: "cpa",
  ctr: "ctr",
  cpc: "cpc",
  cpm: "cpm",
  impressions: "impressions",
};

/** The dashboard's tiles before the org answered (and its slot count). */
export const DEFAULT_DASHBOARD_KPIS: KpiId[] = ["spend", "revenue", "roas", "cpa"];
export const DASHBOARD_SLOTS = 4;

type Family = "sales" | "leads" | "installs" | "visits" | "awareness";

const FAMILY: Record<AdType, Family> = {
  online_sales: "sales",
  lead_forms: "leads",
  website_leads: "leads",
  messages: "leads",
  app_installs: "installs",
  store_visits: "visits",
  awareness: "awareness",
};

const FAMILY_ORDER: Family[] = ["sales", "leads", "installs", "visits", "awareness"];

/** "conv" and "cost" are resolved to a labelled tile once the mix is known. */
type Slot = KpiId | "conv" | "cost";

const FAMILY_KPIS: Record<Family, Slot[]> = {
  sales: ["revenue", "roas", "conv", "cost"],
  leads: ["conv", "cost", "spend", "ctr"],
  installs: ["conv", "cost", "spend", "ctr"],
  visits: ["conv", "cost", "spend", "cpc"],
  awareness: ["impressions", "cpm", "ctr", "spend"],
};

function families(adTypes: readonly AdType[]): Family[] {
  const set = new Set(adTypes.map((t) => FAMILY[t]).filter(Boolean));
  return FAMILY_ORDER.filter((f) => set.has(f));
}

/**
 * Headline tiles for the dashboard. `null` (not answered) or an empty answer
 * keeps the current dashboard. Several kinds of ads take turns filling the
 * slots, most important metric of each first.
 */
export function dashboardKpis(adTypes: readonly AdType[] | null | undefined, slots = DASHBOARD_SLOTS): KpiId[] {
  if (!adTypes || adTypes.length === 0) return DEFAULT_DASHBOARD_KPIS.slice(0, slots);
  const fams = families(adTypes);
  if (fams.length === 0) return DEFAULT_DASHBOARD_KPIS.slice(0, slots);

  // Labels for conversions / cost per conversion depend on the mix.
  const convFams = fams.filter((f) => f !== "awareness");
  let conv: KpiId = "conversions";
  let cost: KpiId = "cpa";
  if (convFams.length === 1) {
    const f = convFams[0];
    const leadTypes = adTypes.filter((t) => FAMILY[t] === "leads");
    const onlyMessages = leadTypes.length > 0 && leadTypes.every((t) => t === "messages");
    if (f === "sales") [conv, cost] = ["purchases", "cpa"];
    else if (f === "leads" && !onlyMessages) [conv, cost] = ["leads", "cost_per_lead"];
    else if (f === "installs") [conv, cost] = ["installs", "cost_per_install"];
    else [conv, cost] = ["results", "cost_per_result"];
  }
  const resolve = (s: Slot): KpiId => (s === "conv" ? conv : s === "cost" ? cost : s);

  const out: KpiId[] = [];
  const metrics = new Set<string>();
  const add = (id: KpiId) => {
    if (out.length >= slots || metrics.has(KPI_METRIC[id])) return;
    metrics.add(KPI_METRIC[id]);
    out.push(id);
  };
  const lists = fams.map((f) => FAMILY_KPIS[f]);
  const depth = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < depth; i++) for (const l of lists) if (l[i]) add(resolve(l[i]));
  for (const id of ["spend", "ctr", "cpc"] as KpiId[]) add(id);
  return out;
}

/* ------------------------------------------------------------------ */
/* Rule templates                                                      */
/* ------------------------------------------------------------------ */

const TEMPLATES_BY_TYPE: Record<AdType, string[]> = {
  online_sales: ["wasted", "unprofitable", "scale-roas"],
  lead_forms: ["clicks-no-sales", "high-cpa", "wasted", "scale-cpa"],
  website_leads: ["clicks-no-sales", "high-cpa", "wasted", "scale-cpa"],
  messages: ["high-cpa", "wasted", "scale-cpa"],
  app_installs: ["high-cpa", "wasted", "scale-cpa"],
  store_visits: ["high-cpa", "wasted", "night"],
  awareness: ["cpm-rising", "fatigue", "daily-cap"],
};

/** Always worth having, whatever the ads. */
const ALWAYS_TEMPLATES = ["daily-cap"];

/**
 * Template ids recommended for these kinds of ads, most relevant first.
 * Empty when the org hasn't answered, so nothing is marked.
 */
export function recommendedTemplateIds(adTypes: readonly AdType[] | null | undefined): string[] {
  if (!adTypes || adTypes.length === 0) return [];
  const picks = interleave(adTypes.map((t) => TEMPLATES_BY_TYPE[t] ?? []));
  return [...picks, ...ALWAYS_TEMPLATES.filter((id) => !picks.includes(id))];
}

/** Stable sort: recommended ids first in recommendation order, the rest as given. */
export function orderByRecommendation<T extends { id: string }>(items: readonly T[], recommended: readonly string[]): T[] {
  const rank = (id: string) => {
    const i = recommended.indexOf(id);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return items
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t.id) - rank(b.t.id) || a.i - b.i)
    .map((x) => x.t);
}

/* ------------------------------------------------------------------ */
/* Suggested lessons                                                   */
/* ------------------------------------------------------------------ */

/** Lesson keys (`module.lesson`) per kind of ad, most relevant first. */
const LESSONS_BY_TYPE: Record<AdType, string[]> = {
  online_sales: [
    "meta-setup.pixel-and-conversions-api",
    "reading-results.metrics-by-goal",
    "meta-optimize.scaling-and-pausing",
    "meta-optimize.advantage-plus-sales",
  ],
  lead_forms: [
    "meta-first-ad.lead-form-ads",
    "adwise-automate.leads-and-real-roas",
    "reading-results.metrics-by-goal",
  ],
  website_leads: [
    "meta-setup.pixel-and-conversions-api",
    "adwise-automate.leads-and-real-roas",
    "reading-results.metrics-by-goal",
  ],
  messages: [
    "adwise-automate.leads-and-real-roas",
    "meta-first-ad.structure-and-objectives",
    "reading-results.metrics-by-goal",
  ],
  app_installs: [
    "ad-fundamentals.funnel-and-goals",
    "reading-results.metrics-by-goal",
    "meta-optimize.learning-phase",
  ],
  store_visits: [
    "ad-fundamentals.funnel-and-goals",
    "google-setup.offline-and-linking",
    "reading-results.metrics-by-goal",
  ],
  awareness: [
    "ad-fundamentals.funnel-and-goals",
    "ad-fundamentals.key-metrics",
    "meta-optimize.delivery-and-creative-testing",
  ],
};

/** Extra lessons when the org has a Google Ads connection. */
const GOOGLE_LESSONS = [
  "google-setup.conversion-tracking",
  "google-optimize.search-terms-and-smart-bidding",
  "google-optimize.scaling-and-waste",
];

export interface SuggestLessonsInput {
  adTypes: readonly AdType[] | null | undefined;
  hasGoogle: boolean;
  /** Completed lesson keys. */
  done: ReadonlySet<string>;
  /** Every lesson key in course order (valid keys and the fallback order). */
  allKeys: readonly string[];
  max?: number;
  min?: number;
}

/**
 * Lessons to suggest, not yet completed: picks for the org's kinds of ads
 * (and Google if connected) take turns, then the course order fills up to `min`.
 */
export function suggestLessons({ adTypes, hasGoogle, done, allKeys, max = 5, min = 3 }: SuggestLessonsInput): string[] {
  const valid = new Set(allKeys);
  const lists = (adTypes ?? []).map((t) => LESSONS_BY_TYPE[t] ?? []);
  if (hasGoogle) lists.push(GOOGLE_LESSONS);
  const out = interleave(lists)
    .filter((k) => valid.has(k) && !done.has(k))
    .slice(0, max);
  for (const k of allKeys) {
    if (out.length >= Math.min(min, max)) break;
    if (!done.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/** Round-robin merge, first occurrence wins. */
function interleave(lists: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth; i++) for (const l of lists) if (l[i] && !out.includes(l[i])) out.push(l[i]);
  return out;
}
