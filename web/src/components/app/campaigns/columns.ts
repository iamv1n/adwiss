"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { EntityMetrics } from "@/lib/entities-api";
import {
  formatCompact,
  formatCount,
  formatMoney,
  formatPercent,
  formatRatio,
} from "@/components/app/campaigns/format";

/** Columns the user can show or hide. Name, switch and checkbox are always on. */
export type ColumnKey =
  | "delivery"
  | "budget"
  | "trend"
  | "spend"
  | "results"
  | "cpr"
  | "roas"
  | "value"
  | "impressions"
  | "cpm"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cvr";

export interface MetricColumn {
  key: ColumnKey;
  label: string;
  /** Sort value; null sorts last. */
  sort?: (m: EntityMetrics | undefined) => number | null;
  /** Cell text for a metrics object in `currency`. */
  cell?: (m: EntityMetrics | undefined, currency: string) => string;
  /** Wider columns get a min width so headers don't wrap. */
  width?: string;
}

const money = (pick: (m: EntityMetrics) => number | null, precise = false): Pick<MetricColumn, "sort" | "cell"> => ({
  sort: (m) => (m ? pick(m) : null),
  cell: (m, c) => formatMoney(m ? pick(m) : null, c, precise),
});

export const COLUMNS: Record<ColumnKey, MetricColumn> = {
  delivery: { key: "delivery", label: "Delivery", width: "w-24" },
  budget: { key: "budget", label: "Budget", width: "w-32" },
  trend: { key: "trend", label: "Spend, 14 days", width: "w-28" },
  spend: { key: "spend", label: "Amount spent", width: "w-28", ...money((m) => m.spend) },
  results: {
    key: "results",
    label: "Results",
    width: "w-20",
    sort: (m) => m?.conversions ?? null,
    cell: (m) => formatCount(m?.conversions),
  },
  cpr: { key: "cpr", label: "Cost per result", width: "w-28", ...money((m) => m.cpa, true) },
  roas: { key: "roas", label: "ROAS", width: "w-20", sort: (m) => m?.roas ?? null, cell: (m) => formatRatio(m?.roas) },
  value: { key: "value", label: "Conv. value", width: "w-28", ...money((m) => m.conversion_value) },
  impressions: {
    key: "impressions",
    label: "Impressions",
    width: "w-24",
    sort: (m) => m?.impressions ?? null,
    cell: (m) => formatCompact(m?.impressions),
  },
  cpm: { key: "cpm", label: "CPM", width: "w-24", ...money((m) => m.cpm, true) },
  clicks: { key: "clicks", label: "Clicks", width: "w-20", sort: (m) => m?.clicks ?? null, cell: (m) => formatCompact(m?.clicks) },
  ctr: { key: "ctr", label: "CTR", width: "w-20", sort: (m) => m?.ctr ?? null, cell: (m) => formatPercent(m?.ctr) },
  cpc: { key: "cpc", label: "CPC", width: "w-20", ...money((m) => m.cpc, true) },
  cvr: { key: "cvr", label: "Conv. rate", width: "w-24", sort: (m) => m?.cvr ?? null, cell: (m) => formatPercent(m?.cvr) },
};

export const ALL_COLUMNS = Object.keys(COLUMNS) as ColumnKey[];

export const PRESETS: { id: string; label: string; columns: ColumnKey[] }[] = [
  { id: "performance", label: "Performance", columns: ["delivery", "budget", "trend", "spend", "results", "cpr", "roas"] },
  { id: "delivery", label: "Delivery", columns: ["delivery", "budget", "trend", "spend", "impressions", "cpm"] },
  { id: "engagement", label: "Engagement", columns: ["delivery", "spend", "impressions", "clicks", "ctr", "cpc"] },
];

const STORAGE_KEY = "adwise.campaigns.columns";
const DEFAULT = PRESETS[0].columns;
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: ColumnKey[] } | null = null;

function read(): ColumnKey[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) {
      const keys = parsed.filter((k): k is ColumnKey => typeof k === "string" && k in COLUMNS);
      if (keys.length > 0) value = keys;
    }
  } catch {
    value = DEFAULT;
  }
  cache = { raw, value };
  return value;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Visible metric columns, remembered per browser (falls back to Performance). */
export function useColumns(): [ColumnKey[], (next: ColumnKey[]) => void] {
  const cols = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const set = useCallback((next: ColumnKey[]) => {
    // Keep the canonical order so columns don't jump around as they're toggled.
    const ordered = ALL_COLUMNS.filter((k) => next.includes(k));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
    } catch {
      cache = { raw: null, value: ordered };
    }
    listeners.forEach((l) => l());
  }, []);
  return [cols, set];
}
