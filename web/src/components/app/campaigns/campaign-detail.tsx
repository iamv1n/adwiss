"use client";

/**
 * Full campaign page: header with live controls, KPI tiles with sparklines,
 * daily spend and results charts (small multiples, never a dual axis), and
 * the campaign's ad sets and ads with the same inline controls as the table.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft, Building2, Pencil, Plus, RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChartTable, LineChart } from "@/components/app/analytics/charts";
import { formatDay } from "@/components/app/analytics/format";
import { FALLBACK_LABELS, PROVIDERS } from "@/components/app/integrations/providers";
import type { ColumnKey } from "@/components/app/campaigns/columns";
import { CreateSheet } from "@/components/app/campaigns/create-sheet";
import { EditSheet } from "@/components/app/campaigns/edit-sheet";
import { EntityTable } from "@/components/app/campaigns/entity-table";
import { ProviderMark } from "@/components/app/campaigns/entity-bits";
import {
  formatCompact,
  formatCount,
  formatMoney,
  formatPercent,
  formatRatio,
  isoDate,
  objectiveLabel,
  plural,
} from "@/components/app/campaigns/format";
import { type AnyRow, ManageProvider, useFreshRow, useManage } from "@/components/app/campaigns/manage-context";
import { BudgetCell, DeliveryCell, RowMenu, StatusSwitch, WhyDisabled, toTarget } from "@/components/app/campaigns/row-controls";
import { Sparkline, SparklinePlaceholder } from "@/components/app/campaigns/sparkline";
import { WidePage } from "@/components/app/campaigns/wide-page";
import { isApiError, type Organization } from "@/lib/api";
import { presetRange } from "@/lib/analytics-api";
import { type Campaign, entitiesApi, useAdGroups, useAds, useCreatives } from "@/lib/entities-api";
import { type ManagedExtras, type SeriesPoint, useCampaign, useSeries } from "@/lib/manage-api";
import { useActiveOrg, useAdAccounts, useMe } from "@/lib/queries";
import { useActiveOrgStore } from "@/lib/stores/org";
import { type AdFatigue, useCampaignFatigue } from "@/lib/recommendations-api";

const RANGES = [7, 14, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];

function daysAgo(today: Date, n: number) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

/** What counts as a "result" depends on the objective (Ads Manager does the same). */
interface ResultDef {
  label: string;
  costLabel: string;
  count: (p: { impressions: number; clicks: number; conversions: number }) => number;
  /** Cost multiplier: 1000 for CPM-style costs. */
  per: number;
}

function resultDef(objective: string): ResultDef {
  if (objective === "OUTCOME_AWARENESS" || objective === "BRAND_AWARENESS" || objective === "REACH")
    return { label: "Impressions", costLabel: "Cost per 1,000 impressions", count: (p) => p.impressions, per: 1000 };
  if (objective === "OUTCOME_TRAFFIC" || objective === "LINK_CLICKS")
    return { label: "Clicks", costLabel: "Cost per click", count: (p) => p.clicks, per: 1 };
  if (objective === "OUTCOME_ENGAGEMENT")
    return { label: "Clicks", costLabel: "Cost per click", count: (p) => p.clicks, per: 1 };
  return { label: "Results", costLabel: "Cost per result", count: (p) => p.conversions, per: 1 };
}

export function CampaignDetailView({ id }: { id: string }) {
  const org = useActiveOrg();
  if (!org) return null;
  return <ForOrg key={org.id} org={org} id={id} />;
}

function ForOrg({ org, id }: { org: Organization; id: string }) {
  const accounts = useAdAccounts(org.id);
  return (
    <ManageProvider
      orgId={org.id}
      labels={accounts.data?.labels ?? FALLBACK_LABELS}
      renderEdit={(t, close) => <EditSheet target={t} onClose={close} />}
      renderCreate={(r, close) => <CreateSheet req={r} onClose={close} />}
    >
      <WidePage>
        <Detail orgId={org.id} id={id} />
      </WidePage>
    </ManageProvider>
  );
}

function Detail({ orgId, id }: { orgId: string; id: string }) {
  const [today] = useState(() => new Date());
  const [days, setDays] = useState<RangeDays>(30);
  // Complete days only (ending yesterday); today's partial data would read as a crash.
  const range = useMemo(() => presetRange(days, today), [today, days]);
  const lookup = useCampaign(orgId, id, range);

  if (lookup.isPending) return <DetailSkeleton />;
  if (lookup.isError) {
    if (isApiError(lookup.error) && lookup.error.status === 404) return <NotInOrg id={id} orgId={orgId} />;
    return (
      <div className="grid justify-items-start gap-3 py-10">
        <BackLink />
        <p className="text-sm text-danger-fg">{lookup.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => lookup.refetch()}>
          <RefreshCw aria-hidden="true" /> Retry
        </Button>
      </div>
    );
  }
  return <Loaded campaign={lookup.data.campaign} range={range} days={days} setDays={setDays} dimmed={lookup.isPlaceholderData} />;
}

function BackLink() {
  return (
    <Link href="/app/campaigns" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
      <ArrowLeft className="size-3.5" aria-hidden="true" /> All campaigns
    </Link>
  );
}

function Loaded({
  campaign: initial,
  range,
  days,
  setDays,
  dimmed,
}: {
  campaign: Campaign;
  range: { from: string; to: string };
  days: RangeDays;
  setDays: (d: RangeDays) => void;
  dimmed: boolean;
}) {
  const m = useManage();
  const c = useFreshRow(initial as Campaign & ManagedExtras);
  const L = m.labelsFor(c.provider);
  const series = useSeries(m.orgId, "campaign", [c.id], range.from, range.to);
  const pts = series.data?.series?.[c.id];
  const rd = resultDef(c.objective);
  const mt = c.metrics;
  const results = mt ? rd.count(mt) : null;
  const cost = mt && results ? ((mt.spend ?? 0) / results) * rd.per : null;

  const childFilter = { ...range, campaign_id: c.id, limit: 200 };
  const adGroups = useAdGroups(m.orgId, childFilter);
  const ads = useAds(m.orgId, childFilter);
  const fatigue = useCampaignFatigue(m.orgId, c.id);
  const fatigueById = new Map((fatigue.data?.ads ?? []).map((a) => [a.ad_id, a]));
  const trendFrom = daysAgo(new Date(range.to + "T00:00:00"), 13);
  const agSeries = useSeries(m.orgId, "ad_group", (adGroups.data?.rows ?? []).map((r) => r.id), trendFrom, range.to);
  const adSeries = useSeries(m.orgId, "ad", (ads.data?.rows ?? []).map((r) => r.id), trendFrom, range.to);
  const creatives = useCreatives(m.orgId, { account_id: c.account_id, limit: 200 });
  const thumbnails = useMemo(
    () => new Map((creatives.data?.rows ?? []).map((x) => [x.id, x.thumbnail_url] as [string, string])),
    [creatives.data],
  );

  const createBlocked = m.blocked(c.provider, "ad_group", "create");
  const terminal = c.status === "archived" || c.status === "deleted";
  const detailCols: ColumnKey[] = ["delivery", "budget", "trend", "spend", "results", "cpr", "ctr"];

  return (
    <div className="grid gap-4">
      {/* Header */}
      <header className="grid gap-2">
        <BackLink />
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <StatusSwitch level="campaign" row={c} size="default" />
            <h1 className="min-w-0 truncate font-display text-xl font-semibold tracking-tight text-fg" title={c.name}>
              {c.name}
            </h1>
            <RowMenu level="campaign" row={c} />
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as RangeDays)}>
              <SelectTrigger size="sm" className="w-36 bg-surface" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Last {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => m.openEdit(toTarget("campaign", c))}>
              <Pencil aria-hidden="true" /> Edit
            </Button>
          </div>
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Delivery</dt>
            <dd>
              <DeliveryCell row={c} />
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Budget</dt>
            <dd className="text-fg">
              <BudgetCell level="campaign" row={c} />
            </dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Account</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              <ProviderMark provider={c.provider} className="size-4 text-[0.5625rem]" />
              <span className="truncate">
                {PROVIDERS[c.provider].name} · {c.account_name}
              </span>
            </dd>
          </div>
          {c.objective && (
            <div className="flex items-center gap-1.5">
              <dt>Objective</dt>
              <dd className="text-fg">{objectiveLabel(c.objective)}</dd>
            </div>
          )}
          {c.end_time && (
            <div className="flex items-center gap-1.5">
              <dt>Ends</dt>
              <dd className="text-fg">{new Date(c.end_time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
            </div>
          )}
          {c.spend_cap != null && (
            <div className="flex items-center gap-1.5">
              <dt>Spend cap</dt>
              <dd className="text-fg">{formatMoney(c.spend_cap, c.currency)}</dd>
            </div>
          )}
        </dl>
      </header>

      {/* KPI tiles */}
      <section aria-label={`Last ${days} days`} className={dimmed ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Amount spent"
            value={formatMoney(mt?.spend, c.currency)}
            series={series}
            pts={pts}
            pick={(p) => p.spend}
            format={(v) => formatMoney(v, c.currency, true)}
          />
          <Kpi
            label={rd.label}
            value={rd.per === 1000 ? formatCompact(results) : formatCount(results)}
            series={series}
            pts={pts}
            pick={(p) => rd.count(p)}
            format={(v) => formatCount(v)}
          />
          <Kpi
            label={rd.costLabel}
            value={formatMoney(cost, c.currency, true)}
            series={series}
            pts={pts}
            pick={(p) => (rd.count(p) > 0 ? (p.spend / rd.count(p)) * rd.per : null)}
            format={(v) => formatMoney(v, c.currency, true)}
            ratio
          />
          <Kpi
            label="ROAS"
            value={formatRatio(mt?.roas)}
            series={series}
            pts={pts}
            pick={(p) => (p.spend > 0 && p.conversion_value > 0 ? p.conversion_value / p.spend : null)}
            format={(v) => formatRatio(v)}
            ratio
          />
          <Kpi
            label="CTR"
            value={formatPercent(mt?.ctr)}
            series={series}
            pts={pts}
            pick={(p) => (p.impressions > 0 ? p.clicks / p.impressions : null)}
            format={(v) => formatPercent(v)}
            ratio
          />
          <Kpi
            label="CPC"
            value={formatMoney(mt?.cpc, c.currency, true)}
            series={series}
            pts={pts}
            pick={(p) => (p.clicks > 0 ? p.spend / p.clicks : null)}
            format={(v) => formatMoney(v, c.currency, true)}
            ratio
          />
        </div>
      </section>

      {/* Charts */}
      <DailyCharts series={series} pts={pts} currency={c.currency} rd={rd} />

      {/* Ad sets */}
      <ChildSection
        title={plural(L.ad_group)}
        count={adGroups.data?.page.total}
        action={
          !terminal && (
            <WhyDisabled reason={createBlocked}>
              <Button
                size="sm"
                variant="outline"
                disabled={!!createBlocked}
                onClick={() => m.openCreate({ level: "ad_group", campaign: c })}
              >
                <Plus aria-hidden="true" /> New {L.ad_group.toLowerCase()}
              </Button>
            </WhyDisabled>
          )
        }
      >
        <EntityTable
          level="ad_group"
          rows={(adGroups.data?.rows ?? []) as AnyRow[]}
          columns={detailCols}
          query={adGroups}
          series={{ byId: agSeries.data?.series, isPending: agSeries.isPending && agSeries.fetchStatus !== "idle", isError: agSeries.isError }}
          totalsNoun={plural(L.ad_group).toLowerCase()}
          emptyText={`This campaign has no ${plural(L.ad_group).toLowerCase()} yet.`}
          showParent={false}
          className="max-h-[28rem]"
        />
      </ChildSection>

      {/* Ads */}
      <ChildSection
        title={plural(L.ad)}
        count={ads.data?.page.total}
        action={
          !terminal && (
            <WhyDisabled reason={m.blocked(c.provider, "ad", "create")}>
              <Button
                size="sm"
                variant="outline"
                disabled={!!m.blocked(c.provider, "ad", "create") || (adGroups.data?.rows.length ?? 0) === 0}
                onClick={() => {
                  const groups = adGroups.data?.rows ?? [];
                  m.openCreate({ level: "ad", adGroup: groups.length === 1 ? groups[0] : null, campaign: c });
                }}
              >
                <Plus aria-hidden="true" /> New ad
              </Button>
            </WhyDisabled>
          )
        }
      >
        <EntityTable
          level="ad"
          rows={(ads.data?.rows ?? []) as AnyRow[]}
          columns={detailCols.filter((k) => k !== "budget")}
          query={ads}
          series={{ byId: adSeries.data?.series, isPending: adSeries.isPending && adSeries.fetchStatus !== "idle", isError: adSeries.isError }}
          totalsNoun="ads"
          emptyText="No ads in this campaign yet."
          thumbnails={thumbnails}
          nameBadge={(r) => <FatigueBadge fatigue={fatigueById.get(r.id)} />}
          className="max-h-[28rem]"
        />
      </ChildSection>
    </div>
  );
}

type SeriesQuery = ReturnType<typeof useSeries>;

function Kpi({
  label,
  value,
  series,
  pts,
  pick,
  format,
  ratio,
}: {
  label: string;
  value: string;
  series: SeriesQuery;
  pts: SeriesPoint[] | undefined;
  pick: (p: SeriesPoint) => number | null;
  format: (v: number) => string;
  ratio?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1 bg-surface px-3 py-2.5">
      <p className="truncate text-xs text-fg-muted">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="truncate text-lg font-semibold text-fg">{value}</p>
        {pts && pts.length > 0 ? (
          <Sparkline
            dates={pts.map((p) => p.date)}
            values={pts.map(pick)}
            format={format}
            label={`${label} by day`}
            summary={ratio ? "last" : "total"}
            width={76}
            height={24}
          />
        ) : (
          <SparklinePlaceholder width={76} height={24} loading={series.isPending} />
        )}
      </div>
    </div>
  );
}

function DailyCharts({
  series,
  pts,
  currency,
  rd,
}: {
  series: SeriesQuery;
  pts: SeriesPoint[] | undefined;
  currency: string;
  rd: ResultDef;
}) {
  const frame = "grid gap-2 rounded-lg border border-border bg-surface p-3";
  if (series.isPending)
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-60 rounded-lg" />
        <Skeleton className="h-60 rounded-lg" />
      </div>
    );
  if (series.isError)
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
        <p className="text-danger-fg">Couldn&apos;t load daily data: {series.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => series.refetch()}>
          <RefreshCw aria-hidden="true" /> Retry
        </Button>
      </div>
    );
  const points = pts ?? [];
  const dates = points.map((p) => p.date);
  const anySpend = points.some((p) => p.spend > 0);
  if (!anySpend && !points.some((p) => rd.count(p) > 0))
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
        No delivery in this period yet. Daily spend and {rd.label.toLowerCase()} appear here once the campaign runs.
      </div>
    );
  const spend = { key: "spend", label: "Spend", color: "var(--color-chart-1)", values: points.map((p) => p.spend) };
  const res = { key: "results", label: rd.label, color: "var(--color-chart-1)", values: points.map((p) => rd.count(p)) };
  return (
    <section className="grid gap-3 lg:grid-cols-2" aria-label="Daily trends">
      <div className={frame}>
        <h2 className="text-sm font-medium text-fg">Daily spend</h2>
        <LineChart
          dates={dates}
          series={[spend]}
          formatValue={(v) => formatMoney(v, currency, true)}
          formatAxis={(v) => formatMoney(v, currency)}
          formatX={(d) => formatDay(d)}
          height={150}
          ariaLabel={`Daily spend in ${currency}`}
        />
      </div>
      <div className={frame}>
        <h2 className="text-sm font-medium text-fg">Daily {rd.label.toLowerCase()}</h2>
        <LineChart
          dates={dates}
          series={[res]}
          formatValue={(v) => formatCount(v)}
          formatAxis={(v) => formatCompact(v)}
          formatX={(d) => formatDay(d)}
          height={150}
          ariaLabel={`Daily ${rd.label.toLowerCase()}`}
        />
      </div>
      <div className="lg:col-span-2">
        <ChartTable
          caption="Daily spend and results"
          headers={["Date", "Spend", rd.label]}
          rows={points.map((p) => [formatDay(p.date), formatMoney(p.spend, currency, true), formatCount(rd.count(p))])}
        />
      </div>
    </section>
  );
}

function ChildSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number | undefined;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {count != null && <span className="text-xs text-fg-muted tabular-nums">{count}</span>}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

/** Not in the active org: find which of the user's orgs has it and offer to switch. */
function NotInOrg({ id, orgId }: { id: string; orgId: string }) {
  const me = useMe();
  const setActive = useActiveOrgStore((s) => s.setActiveOrgId);
  const others = (me.data?.organizations ?? []).filter((o) => o.id !== orgId);
  const found = useQueries({
    queries: others.map((o) => ({
      queryKey: ["orgs", o.id, "entities", "campaign-owner", id],
      queryFn: async () => {
        for (let offset = 0; offset < 2000; offset += 200) {
          const res = await entitiesApi.campaigns(o.id, { limit: 200, offset });
          if (res.rows.some((r) => r.id === id)) return true;
          if (offset + res.rows.length >= res.page.total || res.rows.length === 0) return false;
        }
        return false;
      },
      staleTime: 5 * 60_000,
    })),
  });
  const searching = found.some((q) => q.isPending);
  const owner = others.find((_, i) => found[i]?.data === true);

  return (
    <div className="grid justify-items-center gap-3 py-16 text-center">
      {searching ? (
        <>
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-5 w-64" />
        </>
      ) : owner ? (
        <>
          <Building2 className="size-8 text-fg-muted" aria-hidden="true" />
          <h1 className="font-display text-lg font-semibold text-fg">This campaign is in another organization</h1>
          <p className="max-w-md text-sm text-fg-muted">
            It belongs to <span className="font-medium text-fg">{owner.name}</span>. Switch to that organization to view it.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setActive(owner.id)}>
              Switch to {owner.name}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/app/campaigns">All campaigns</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <SearchX className="size-8 text-fg-muted" aria-hidden="true" />
          <h1 className="font-display text-lg font-semibold text-fg">Campaign not found</h1>
          <p className="max-w-md text-sm text-fg-muted">
            It may have been deleted, or it belongs to an organization you&apos;re not a member of.
          </p>
          <Button size="sm" variant="outline" asChild>
            <Link href="/app/campaigns">All campaigns</Link>
          </Button>
        </>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading campaign">
      <Skeleton className="h-3 w-24" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-9 rounded-full" />
        <Skeleton className="h-6 w-80 max-w-full" />
      </div>
      <Skeleton className="h-3 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="grid gap-2 bg-surface px-3 py-2.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

/** "Fatigued" marker on an ad, with the evidence (both 7-day windows) in a tooltip. */
function FatigueBadge({ fatigue }: { fatigue: AdFatigue | undefined }) {
  if (!fatigue?.fatigued) return null;
  const { current: cur, previous: prev } = fatigue;
  const freq = (v: number | null) => (v == null ? "—" : v.toFixed(2));
  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="shrink-0 rounded-full bg-warning-subtle px-1.5 py-0.5 text-[0.6875rem] font-medium text-warning-fg"
        >
          Fatigued
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <p className="mb-1 font-medium">Creative fatigue: {fatigue.reason}.</p>
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr>
              <th />
              <th className="pr-2 font-normal opacity-80">
                {prev.from.slice(5)} – {prev.to.slice(5)}
              </th>
              <th className="font-normal opacity-80">
                {cur.from.slice(5)} – {cur.to.slice(5)}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="pr-2">Frequency</td>
              <td className="pr-2">{freq(prev.frequency)}</td>
              <td>{freq(cur.frequency)}</td>
            </tr>
            <tr>
              <td className="pr-2">CTR</td>
              <td className="pr-2">{pct(prev.ctr)}</td>
              <td>{pct(cur.ctr)}</td>
            </tr>
            <tr>
              <td className="pr-2">Impressions</td>
              <td className="pr-2">{prev.impressions.toLocaleString()}</td>
              <td>{cur.impressions.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 opacity-80">Frequency is impressions ÷ daily reach summed over the 7 days.</p>
      </TooltipContent>
    </Tooltip>
  );
}
