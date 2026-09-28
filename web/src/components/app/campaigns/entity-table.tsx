"use client";

/**
 * Dense Ads Manager-style table shared by campaigns, ad sets and ads.
 * The scroll container owns both axes so the header and the first column
 * (checkbox, on/off, name) stay sticky; a totals row pins to the bottom.
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ImageOff, Power, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { COLUMNS, type ColumnKey } from "@/components/app/campaigns/columns";
import { type AnyRow, useManage } from "@/components/app/campaigns/manage-context";
import { BudgetCell, DeliveryCell, RowMenu, StatusSwitch, toTarget } from "@/components/app/campaigns/row-controls";
import { Sparkline, SparklinePlaceholder } from "@/components/app/campaigns/sparkline";
import { ProviderMark } from "@/components/app/campaigns/entity-bits";
import { formatMoney } from "@/components/app/campaigns/format";
import type { EntityMetrics } from "@/lib/entities-api";
import type { Level, SeriesPoint } from "@/lib/manage-api";
import { cn } from "@/lib/utils";

type SortKey = ColumnKey | "name";
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

export interface SeriesState {
  byId: Record<string, SeriesPoint[]> | undefined;
  isPending: boolean;
  isError: boolean;
}

export interface QueryState {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  isPlaceholderData?: boolean;
  refetch: () => unknown;
}

function budgetSort(r: AnyRow): number | null {
  const b = r as { daily_budget?: number | null; lifetime_budget?: number | null };
  return b.daily_budget ?? b.lifetime_budget ?? null;
}

const STATUS_ORDER: Record<string, number> = { active: 0, paused: 1, unknown: 2, archived: 3, deleted: 4 };

function sortValue(r: AnyRow, key: SortKey, series?: Record<string, SeriesPoint[]>): number | string | null {
  if (key === "name") return r.name.toLowerCase();
  if (key === "delivery") return STATUS_ORDER[r.status] ?? 9;
  if (key === "budget") return budgetSort(r);
  if (key === "trend") return series?.[r.id]?.reduce((a, p) => a + p.spend, 0) ?? null;
  return COLUMNS[key].sort?.(r.metrics) ?? null;
}

function parentName(level: Level, r: AnyRow): string | undefined {
  if (level === "ad_group") return (r as { campaign_name?: string }).campaign_name;
  if (level === "ad") return (r as { ad_group_name?: string }).ad_group_name;
  return undefined;
}

/** Sum a page of rows' metrics; ratios are recomputed from the sums. */
function totals(rows: AnyRow[]): { metrics: EntityMetrics; currency: string | null } {
  const currencies = new Set(rows.map((r) => r.currency));
  const one = currencies.size === 1 ? [...currencies][0] : null;
  let impressions = 0,
    clicks = 0,
    spend = 0,
    conversions = 0,
    value = 0;
  for (const r of rows) {
    const m = r.metrics;
    if (!m) continue;
    impressions += m.impressions;
    clicks += m.clicks;
    spend += m.spend ?? 0;
    conversions += m.conversions;
    value += m.conversion_value ?? 0;
  }
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    currency: one,
    metrics: {
      currency: one,
      impressions,
      clicks,
      spend: one ? spend : null,
      conversions,
      conversion_value: one ? value : null,
      ctr: div(clicks, impressions),
      cpc: one ? div(spend, clicks) : null,
      cpm: one ? (impressions > 0 ? (spend / impressions) * 1000 : null) : null,
      cpa: one ? div(spend, conversions) : null,
      cvr: div(conversions, clicks),
      roas: one ? div(value, spend) : null,
      acos: one ? div(spend, value) : null,
    },
  };
}

export function EntityTable({
  level,
  rows,
  columns,
  query,
  series,
  selected,
  onSelect,
  totalsNoun,
  emptyText,
  emptyAction,
  quickLinks,
  chartsHref,
  thumbnails,
  nameBadge,
  showParent = true,
  className,
}: {
  /** Extra marker after a row's name, e.g. the "Fatigued" badge on ads. */
  nameBadge?: (row: AnyRow) => React.ReactNode;
  /** Show the parent's name (campaign for ad sets, ad set for ads) after each name. */
  showParent?: boolean;
  level: Level;
  rows: AnyRow[];
  columns: ColumnKey[];
  query: QueryState;
  series?: SeriesState;
  selected?: ReadonlyMap<string, AnyRow>;
  onSelect?: (rows: AnyRow[], on: boolean) => void;
  /** Plural noun for the totals row: "campaigns", "ad sets". */
  totalsNoun: string;
  emptyText: string;
  emptyAction?: React.ReactNode;
  /** Links revealed under the pointer, e.g. "View ad sets · Charts · Edit". */
  quickLinks?: (row: AnyRow) => React.ReactNode;
  chartsHref?: (row: AnyRow) => string | undefined;
  /** creative id → thumbnail URL (ads only). */
  thumbnails?: Map<string, string>;
  className?: string;
}) {
  const m = useManage();
  const [sort, setSort] = useState<Sort>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const out = [...rows];
    out.sort((a, b) => {
      const va = sortValue(a, sort.key, series?.byId);
      const vb = sortValue(b, sort.key, series?.byId);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
      return sort.dir === "asc" ? c : -c;
    });
    return out;
  }, [rows, sort, series?.byId]);

  const total = useMemo(() => totals(rows), [rows]);
  const selectable = !!onSelect && !!selected;
  const selectedHere = selectable ? rows.filter((r) => selected!.has(r.id)).length : 0;
  const allState = selectedHere === 0 ? false : selectedHere === rows.length ? true : "indeterminate";

  function toggleSort(key: SortKey) {
    setSort((s) =>
      !s || s.key !== key
        ? { key, dir: key === "name" ? "asc" : "desc" }
        : s.dir === (key === "name" ? "asc" : "desc")
          ? { key, dir: key === "name" ? "desc" : "asc" }
          : null,
    );
  }

  const header = (key: SortKey, label: string, align: "left" | "right", extra?: string) => {
    const active = sort?.key === key;
    const Icon = sort?.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm font-medium whitespace-nowrap hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          align === "right" && "flex-row-reverse",
          active ? "text-fg" : "text-fg-muted",
          extra,
        )}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon aria-hidden="true" className={cn("size-3", active ? "opacity-100" : "opacity-0")} />
      </button>
    );
  };

  if (query.isPending) return <TableSkeleton className={className} />;
  if (query.isError) {
    return (
      <div className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm", className)}>
        <p className="text-danger-fg">{query.error?.message ?? "Couldn't load this list."}</p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RefreshCw aria-hidden="true" /> Retry
        </Button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className={cn("grid justify-items-center gap-3 px-4 py-14 text-center text-sm", className)}>
        <p className="text-fg-muted">{emptyText}</p>
        {emptyAction}
      </div>
    );
  }

  const stickyBg = "bg-surface group-hover/row:bg-bg-subtle group-data-[selected=true]/row:bg-accent";
  const cell = "h-9 border-b border-border px-3 py-0 align-middle";

  return (
    <div
      className={cn(
        "relative overflow-auto transition-opacity",
        query.isPlaceholderData && "opacity-60",
        className,
      )}
    >
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-30 h-9 min-w-[18rem] border-r border-b border-border bg-bg-subtle px-3 text-left text-xs sm:min-w-[22rem] lg:w-[26rem]"
            >
              <div className="flex items-center gap-3">
                {selectable && (
                  <Checkbox
                    checked={allState}
                    onCheckedChange={(v) => onSelect!(rows, v === true)}
                    aria-label="Select all rows on this page"
                  />
                )}
                <span className="flex w-6 justify-center text-fg-subtle" title="On/off">
                  <Power aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">On/off</span>
                </span>
                {header("name", m.levelLabel(rows[0].provider, level), "left")}
              </div>
            </th>
            {columns.map((k) => (
              <th
                key={k}
                scope="col"
                className={cn(
                  "sticky top-0 z-20 h-9 border-b border-border bg-bg-subtle px-3 text-xs",
                  COLUMNS[k].width,
                  k === "delivery" || k === "trend" ? "text-left" : "text-right",
                )}
              >
                {header(k, COLUMNS[k].label, k === "delivery" || k === "trend" ? "left" : "right")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isSel = selectable && selected!.has(r.id);
            const pts = series?.byId?.[r.id];
            const thumb = level === "ad" ? thumbnails?.get((r as { creative_id?: string | null }).creative_id ?? "") : undefined;
            return (
              <tr key={r.id} className="group/row" data-selected={isSel || undefined}>
                <td className={cn(cell, "sticky left-0 z-10 max-w-[26rem] border-r pr-1", stickyBg)}>
                  <div className="flex min-w-0 items-center gap-3">
                    {selectable && (
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={(v) => onSelect!([r], v === true)}
                        aria-label={`Select ${r.name}`}
                      />
                    )}
                    <span className="flex w-6 justify-center">
                      <StatusSwitch level={level} row={r} />
                    </span>
                    {level === "ad" && <Thumb url={thumb} />}
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <ProviderMark provider={r.provider} className="size-4 text-[0.5625rem]" />
                      <button
                        type="button"
                        onClick={() => m.openEdit(toTarget(level, r))}
                        className="min-w-0 shrink truncate text-left font-medium text-fg hover:underline focus-visible:underline focus-visible:outline-none"
                        title={r.name}
                      >
                        {r.name}
                      </button>
                      {nameBadge?.(r)}
                      {showParent && parentName(level, r) && (
                        <span className="min-w-8 flex-1 truncate text-xs text-fg-subtle" title={parentName(level, r)}>
                          {parentName(level, r)}
                        </span>
                      )}
                    </div>
                    {quickLinks && (
                      <div className="hidden shrink-0 items-center gap-2 text-xs group-focus-within/row:flex group-hover/row:flex">
                        {quickLinks(r)}
                      </div>
                    )}
                    <RowMenu level={level} row={r} chartsHref={chartsHref?.(r)} />
                  </div>
                </td>
                {columns.map((k) => (
                  <td
                    key={k}
                    className={cn(
                      cell,
                      "whitespace-nowrap group-hover/row:bg-bg-subtle group-data-[selected=true]/row:bg-accent",
                      k === "delivery" || k === "trend" ? "text-left" : "text-right tabular-nums",
                      k === "spend" && "font-medium text-fg",
                    )}
                  >
                    {k === "delivery" ? (
                      <DeliveryCell row={r} />
                    ) : k === "budget" ? (
                      <BudgetCell level={level} row={r} />
                    ) : k === "trend" ? (
                      pts && pts.length > 0 ? (
                        <Sparkline
                          dates={pts.map((p) => p.date)}
                          values={pts.map((p) => p.spend)}
                          format={(v) => formatMoney(v, r.currency, true)}
                          label={`${r.name} spend, last ${pts.length} days`}
                        />
                      ) : (
                        <SparklinePlaceholder loading={series?.isPending && !series.isError} />
                      )
                    ) : (
                      COLUMNS[k].cell!(r.metrics, r.currency)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky bottom-0 left-0 z-30 h-9 border-t border-r border-border bg-bg-subtle px-3 text-xs">
              <span className="font-medium text-fg">
                Results from {rows.length} {totalsNoun}
              </span>
              {!total.currency && <span className="text-fg-muted"> · mixed currencies, money not totalled</span>}
            </td>
            {columns.map((k) => (
              <td
                key={k}
                className={cn(
                  "sticky bottom-0 z-20 h-9 border-t border-border bg-bg-subtle px-3 text-xs whitespace-nowrap",
                  k === "delivery" || k === "trend" ? "text-left" : "text-right font-medium text-fg tabular-nums",
                )}
              >
                {k === "delivery" || k === "trend" || k === "budget"
                  ? null
                  : COLUMNS[k].cell!(total.metrics, total.currency ?? "USD")}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      {selectable && selectedHere > 0 && <span className="sr-only">{selectedHere} selected</span>}
    </div>
  );
}

function Thumb({ url }: { url: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed)
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-bg-subtle text-fg-subtle">
        <ImageOff aria-hidden="true" className="size-3.5" />
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote provider thumbnails, not optimisable
    <img
      src={url}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-7 shrink-0 rounded-sm border border-border object-cover"
    />
  );
}

export function TableSkeleton({ rows = 12, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("grid", className)} aria-busy="true" aria-label="Loading">
      <div className="h-9 border-b border-border bg-bg-subtle" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-9 items-center gap-4 border-b border-border px-3">
          <Skeleton className="size-4" />
          <Skeleton className="h-3.5 w-6 rounded-full" />
          <Skeleton className="h-3.5 w-64 max-w-[40%]" />
          <Skeleton className="ml-auto h-3.5 w-16" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="hidden h-3.5 w-16 sm:block" />
          <Skeleton className="hidden h-3.5 w-16 md:block" />
        </div>
      ))}
    </div>
  );
}
