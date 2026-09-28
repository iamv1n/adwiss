"use client";

/**
 * Client for the analytics endpoints (/v1/orgs/{orgID}/analytics/...).
 *
 * Money rules (enforced by the API, respected here): money is never summed
 * across currencies. When the facts in scope span several currencies the
 * response sets `mixed_currency: true`, `currency: null` and every money field
 * to null; `by_currency` still carries complete per-currency totals. Pass
 * `currency` to get money in one currency.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { request, type Provider } from "@/lib/api";

// --- Types (mirror internal/analytics and internal/metrics JSON) ---

/** metrics.Values. Money fields and ratios are null when not computable. */
export interface MetricValues {
  currency: string | null;
  impressions: number;
  clicks: number;
  spend: number | null;
  conversions: number;
  conversion_value: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  cvr: number | null;
  roas: number | null;
  acos: number | null;
}

export type MetricKey =
  | "impressions"
  | "clicks"
  | "spend"
  | "conversions"
  | "conversion_value"
  | "ctr"
  | "cpc"
  | "cpm"
  | "cpa"
  | "cvr"
  | "roas"
  | "acos";

/** Relative change (0.25 = +25%); null when either side is null or previous is 0. */
export type Deltas = Partial<Record<MetricKey, number | null>>;

export interface RangeInfo {
  from: string;
  to: string;
  days: number;
}

export type CompareMode = "none" | "previous_period" | "previous_year";

export interface ComparisonInfo extends RangeInfo {
  type: CompareMode;
}

export interface CurrencyInfo {
  currency: string | null;
  currencies: string[];
  mixed_currency: boolean;
}

export interface ProviderSummary extends CurrencyInfo {
  totals: MetricValues;
  by_currency: Record<string, MetricValues>;
  previous?: MetricValues;
  deltas?: Deltas;
}

/** Embedded in every analytics response. `by_provider` is absent when filtered by provider. */
export interface Summary extends CurrencyInfo {
  totals: MetricValues;
  by_currency: Record<string, MetricValues>;
  by_provider?: Partial<Record<Provider, ProviderSummary>>;
}

export interface TimePoint extends MetricValues {
  date: string;
}

export interface Overview extends Summary {
  range: RangeInfo;
  comparison: ComparisonInfo | null;
  previous: MetricValues | null;
  deltas: Deltas | null;
  timeseries: TimePoint[];
  previous_timeseries: TimePoint[] | null;
}

export interface Pacing {
  date: string;
  spend_today: number;
  daily_budget: number | null;
  spent_fraction: number | null;
  day_elapsed_fraction: number;
  expected_fraction: number;
  projected_spend: number | null;
  status: string;
}

export interface CampaignPerformance {
  id: string;
  account_id: string;
  account_name: string;
  provider: Provider;
  external_id: string;
  name: string;
  status: string;
  objective: string;
  currency: string;
  daily_budget: number | null;
  pacing: Pacing | null;
  metrics: MetricValues;
  previous?: MetricValues;
  deltas?: Deltas;
}

export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
}

export type CampaignSort =
  | "name"
  | "status"
  | "daily_budget"
  | "impressions"
  | "clicks"
  | "spend"
  | "conversions"
  | "conversion_value"
  | "ctr"
  | "cpc"
  | "cpm"
  | "cpa"
  | "cvr"
  | "roas"
  | "acos";

export interface CampaignPerformanceTable extends Summary {
  range: RangeInfo;
  comparison: ComparisonInfo | null;
  sort: CampaignSort;
  order: "asc" | "desc";
  campaigns: CampaignPerformance[];
  page: PageInfo;
}

export interface HourRow extends MetricValues {
  hour: number;
}

export interface Hourly extends Summary {
  range: RangeInfo;
  time_basis: "account_local";
  timezones: string[];
  hours: HourRow[];
}

export type DaypartingMetric = "roas" | "spend" | "revenue" | "cpa" | "conversions" | "ctr" | "cpc";

export interface DaypartingCell {
  hour: number;
  value: number | null;
  impressions: number;
  clicks: number;
  spend: number | null;
  conversions: number;
  conversion_value: number | null;
}

export interface DaypartingDay {
  weekday: number;
  name: string;
  day_count: number;
  cells: DaypartingCell[];
}

export interface Dayparting extends Summary {
  range: RangeInfo;
  metric: DaypartingMetric;
  aggregation: "ratio" | "average_per_day";
  time_basis: "account_local";
  timezones: string[];
  mixed_timezones: boolean;
  weeks_covered: number;
  min: number | null;
  max: number | null;
  days: DaypartingDay[];
}

export type BreakdownDimension = "country" | "device" | "placement" | "publisher_platform";

export interface BreakdownRow extends MetricValues {
  /** "unknown" when the provider reported none. */
  value: string;
  /** Only for dimension=placement. */
  publisher_platform?: string;
  label: string;
  /** Fraction of total spend; null when mixed currency or no spend. */
  spend_share: number | null;
}

export interface Breakdown extends Summary {
  range: RangeInfo;
  dimension: BreakdownDimension;
  report: string;
  rows: BreakdownRow[];
}

export type WastedLevel = "campaign" | "ad_group" | "ad";
export type WastedReason = "no_conversions" | "low_conversions" | "low_roas";

export interface WastedCriteria {
  level: WastedLevel;
  min_spend: number;
  max_conversions: number;
  roas_below: number;
}

export interface WastedRow {
  level: WastedLevel;
  id: string;
  external_id: string;
  name: string;
  status: string;
  provider: Provider;
  account_id: string;
  account_name: string;
  campaign_id: string;
  campaign_name: string;
  currency: string;
  metrics: MetricValues;
  wasted_spend: number;
  reasons: WastedReason[];
}

export interface WastedSpend extends Summary {
  range: RangeInfo;
  criteria: WastedCriteria;
  /** Null when currencies are mixed; see wasted_by_currency. */
  wasted_spend_total: number | null;
  wasted_by_currency: Record<string, number>;
  /** Wasted spend / all spend at this level in scope (single currency only). */
  share_of_spend: number | null;
  rows: WastedRow[];
  page: PageInfo;
}

// --- Requests ---

/** Filters shared by every analytics endpoint. Dates are YYYY-MM-DD, inclusive. */
export interface AnalyticsScope {
  from?: string;
  to?: string;
  provider?: Provider;
  account_id?: string;
  campaign_id?: string;
  currency?: string;
}

type Params = Record<string, string | number | undefined>;

function qs(params: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const base = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}/analytics`;

export interface CampaignQuery extends AnalyticsScope {
  compare?: CompareMode;
  status?: string;
  search?: string;
  sort?: CampaignSort;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface WastedQuery extends AnalyticsScope {
  level?: WastedLevel;
  min_spend?: number;
  max_conversions?: number;
  roas_below?: number;
  limit?: number;
  offset?: number;
}

export const analyticsApi = {
  overview: (orgId: string, p: AnalyticsScope & { compare?: CompareMode }) =>
    request<Overview>("GET", `${base(orgId)}/overview${qs({ ...p })}`),
  campaigns: (orgId: string, p: CampaignQuery) =>
    request<CampaignPerformanceTable>("GET", `${base(orgId)}/campaigns${qs({ ...p })}`),
  hourly: (orgId: string, p: AnalyticsScope) => request<Hourly>("GET", `${base(orgId)}/hourly${qs({ ...p })}`),
  dayparting: (orgId: string, p: AnalyticsScope & { metric?: DaypartingMetric }) =>
    request<Dayparting>("GET", `${base(orgId)}/dayparting${qs({ ...p })}`),
  breakdowns: (orgId: string, p: AnalyticsScope & { dimension: BreakdownDimension }) =>
    request<Breakdown>("GET", `${base(orgId)}/breakdowns${qs({ ...p })}`),
  wastedSpend: (orgId: string, p: WastedQuery) =>
    request<WastedSpend>("GET", `${base(orgId)}/wasted-spend${qs({ ...p })}`),
};

// --- Hooks ---

export const analyticsKeys = {
  all: (orgId: string) => ["orgs", orgId, "analytics"] as const,
  overview: (orgId: string, p: object) => ["orgs", orgId, "analytics", "overview", p] as const,
  campaigns: (orgId: string, p: object) => ["orgs", orgId, "analytics", "campaigns", p] as const,
  hourly: (orgId: string, p: object) => ["orgs", orgId, "analytics", "hourly", p] as const,
  dayparting: (orgId: string, p: object) => ["orgs", orgId, "analytics", "dayparting", p] as const,
  breakdowns: (orgId: string, p: object) => ["orgs", orgId, "analytics", "breakdowns", p] as const,
  wasted: (orgId: string, p: object) => ["orgs", orgId, "analytics", "wasted-spend", p] as const,
};

/** Analytics data changes at most with each sync; avoid refetching on every focus. */
const STALE = 60_000;

interface HookOpts {
  enabled?: boolean;
}

export function useOverview(orgId: string | undefined, p: AnalyticsScope & { compare?: CompareMode }, o: HookOpts = {}) {
  return useQuery({
    queryKey: analyticsKeys.overview(orgId ?? "", p),
    queryFn: () => analyticsApi.overview(orgId!, p),
    enabled: !!orgId && (o.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

export function useCampaignPerformance(orgId: string | undefined, p: CampaignQuery, o: HookOpts = {}) {
  return useQuery({
    queryKey: analyticsKeys.campaigns(orgId ?? "", p),
    queryFn: () => analyticsApi.campaigns(orgId!, p),
    enabled: !!orgId && (o.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

export function useHourly(orgId: string | undefined, p: AnalyticsScope, o: HookOpts = {}) {
  return useQuery({
    queryKey: analyticsKeys.hourly(orgId ?? "", p),
    queryFn: () => analyticsApi.hourly(orgId!, p),
    enabled: !!orgId && (o.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

export function useDayparting(
  orgId: string | undefined,
  p: AnalyticsScope & { metric?: DaypartingMetric },
  o: HookOpts = {},
) {
  return useQuery({
    queryKey: analyticsKeys.dayparting(orgId ?? "", p),
    queryFn: () => analyticsApi.dayparting(orgId!, p),
    enabled: !!orgId && (o.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

export function useBreakdown(
  orgId: string | undefined,
  p: AnalyticsScope & { dimension: BreakdownDimension },
  o: HookOpts = {},
) {
  return useQuery({
    queryKey: analyticsKeys.breakdowns(orgId ?? "", p),
    queryFn: () => analyticsApi.breakdowns(orgId!, p),
    enabled: !!orgId && (o.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

export function useWastedSpend(orgId: string | undefined, p: WastedQuery, o: HookOpts = {}) {
  return useQuery({
    queryKey: analyticsKeys.wasted(orgId ?? "", p),
    queryFn: () => analyticsApi.wastedSpend(orgId!, p),
    enabled: !!orgId && (o.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

// --- Date ranges ---

export type RangePreset = 7 | 30 | 90;
export const RANGE_PRESETS: RangePreset[] = [7, 30, 90];

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * The last `days` complete days, ending yesterday (browser-local), like the
 * ad platforms' "Last N days" presets. Excluding today keeps period-over-period
 * deltas from comparing a partial day with a full one.
 */
export function presetRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  return { from: isoDate(from), to: isoDate(to) };
}

/**
 * The currency to show money in when the org's data spans several currencies.
 * Picks the one with the most impressions (a count, so comparable across
 * currencies) unless the user chose one.
 */
export function pickCurrency(summary: Summary | undefined, chosen: string | null): string | undefined {
  if (!summary?.mixed_currency) return undefined;
  if (chosen && summary.currencies.includes(chosen)) return chosen;
  let best: string | undefined;
  let bestImpr = -1;
  for (const c of summary.currencies) {
    const impr = summary.by_currency[c]?.impressions ?? 0;
    if (impr > bestImpr) {
      best = c;
      bestImpr = impr;
    }
  }
  return best;
}
