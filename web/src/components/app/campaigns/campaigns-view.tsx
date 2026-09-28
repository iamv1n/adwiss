"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { ChartsIllustration } from "@/components/app/illustrations";
import { FALLBACK_LABELS } from "@/components/app/integrations/providers";
import { ALL_COLUMNS, COLUMNS, PRESETS, type ColumnKey, useColumns } from "@/components/app/campaigns/columns";
import { CreateSheet } from "@/components/app/campaigns/create-sheet";
import { EditSheet } from "@/components/app/campaigns/edit-sheet";
import { EntityTable } from "@/components/app/campaigns/entity-table";
import { AccountLimitsControl } from "@/components/app/campaigns/account-limits";
import { useLevelRows } from "@/components/app/campaigns/level-data";
import { type AnyRow, ManageProvider, useManage } from "@/components/app/campaigns/manage-context";
import { toTarget, WhyDisabled } from "@/components/app/campaigns/row-controls";
import { ProviderMark } from "@/components/app/campaigns/entity-bits";
import { MEMBER_HINT } from "@/components/app/campaigns/capabilities";
import { STATUS_LABEL, plural } from "@/components/app/campaigns/format";
import { presetRange } from "@/lib/analytics-api";
import { WidePage } from "@/components/app/campaigns/wide-page";
import type { Provider, ProviderLabels } from "@/lib/api";
import type { Ad, AdGroup, Campaign, EntityFilter, EntityStatus } from "@/lib/entities-api";
import { useCreatives } from "@/lib/entities-api";
import { type Level, useSeries } from "@/lib/manage-api";
import { useActiveOrg, useAdAccounts } from "@/lib/queries";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;
const RANGES = [7, 14, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];
const FILTER_STATUSES: EntityStatus[] = ["active", "paused", "archived", "deleted"];
const TREND_DAYS = 14;

export function CampaignsView() {
  const org = useActiveOrg();
  if (!org) return null;
  return <CampaignsForOrg key={org.id} orgId={org.id} />;
}

function CampaignsForOrg({ orgId }: { orgId: string }) {
  const accounts = useAdAccounts(orgId);
  const labels: ProviderLabels = accounts.data?.labels ?? FALLBACK_LABELS;
  return (
    <ManageProvider
      orgId={orgId}
      labels={labels}
      renderEdit={(t, close) => <EditSheet target={t} onClose={close} />}
      renderCreate={(r, close) => <CreateSheet req={r} onClose={close} />}
    >
      <WidePage>
        <Manager orgId={orgId} />
      </WidePage>
    </ManageProvider>
  );
}

function Manager({ orgId }: { orgId: string }) {
  const m = useManage();
  const accounts = useAdAccounts(orgId);
  const [today] = useState(() => new Date());
  const [days, setDays] = useState<RangeDays>(30);
  const [accountId, setAccountId] = useState<string>("all");
  const [status, setStatus] = useState<EntityStatus | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("campaign");
  const [offsets, setOffsets] = useState<Record<Level, number>>({ campaign: 0, ad_group: 0, ad: 0 });
  const [sel, setSel] = useState<Record<Level, Map<string, AnyRow>>>({
    campaign: new Map(),
    ad_group: new Map(),
    ad: new Map(),
  });
  const [columns, setColumns] = useColumns();

  const resetPaging = () => setOffsets({ campaign: 0, ad_group: 0, ad: 0 });

  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      if (next !== search) {
        setSearch(next);
        setOffsets({ campaign: 0, ad_group: 0, ad: 0 });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  // Complete days only (ending yesterday), as on the analytics pages; today is partial.
  const range = useMemo(() => presetRange(days, today), [today, days]);
  const trendRange = useMemo(() => presetRange(TREND_DAYS, today), [today]);

  const account = accounts.data?.accounts.find((a) => a.id === accountId);
  const base: EntityFilter = {
    ...range,
    account_id: account?.id,
    status: status === "all" ? undefined : status,
  };
  // Search applies to the level being viewed; parent filters come from ticked rows.
  const withSearch = (l: Level): EntityFilter => (l === level && search ? { ...base, search } : base);
  const page = (l: Level) => ({ limit: PAGE_SIZE, offset: offsets[l] });

  const selCampaigns = [...sel.campaign.keys()];
  const selAdGroups = [...sel.ad_group.keys()];

  const campaigns = useLevelRows<Campaign>("campaigns", orgId, withSearch("campaign"), null, page("campaign"));
  const adGroups = useLevelRows<AdGroup>(
    "ad-groups",
    orgId,
    withSearch("ad_group"),
    selCampaigns.length ? { key: "campaign_id", ids: selCampaigns } : null,
    page("ad_group"),
  );
  const ads = useLevelRows<Ad>(
    "ads",
    orgId,
    withSearch("ad"),
    selAdGroups.length
      ? { key: "ad_group_id", ids: selAdGroups }
      : selCampaigns.length
        ? { key: "campaign_id", ids: selCampaigns }
        : null,
    page("ad"),
  );
  const current = level === "campaign" ? campaigns : level === "ad_group" ? adGroups : ads;
  const rows = current.rows as AnyRow[];

  const showTrend = columns.includes("trend");
  const series = useSeries(
    orgId,
    level,
    rows.map((r) => r.id),
    trendRange.from,
    trendRange.to,
    showTrend && rows.length > 0,
  );
  const creatives = useCreatives(orgId, { account_id: account?.id, limit: 200 }, level === "ad");
  const thumbnails = useMemo(
    () => new Map((creatives.data?.rows ?? []).map((c) => [c.id, c.thumbnail_url] as [string, string])),
    [creatives.data],
  );

  // Labels follow the chosen account's provider; "All accounts" uses Meta's names.
  const provider: Provider = account?.provider ?? "meta";
  const L = m.labelsFor(provider);
  const levelNames: Record<Level, string> = { campaign: plural(L.campaign), ad_group: plural(L.ad_group), ad: plural(L.ad) };

  const selectedHere = [...sel[level].values()];
  const noun = levelNames[level].toLowerCase();

  function select(l: Level, rs: AnyRow[], on: boolean) {
    setSel((prev) => {
      const next = new Map(prev[l]);
      for (const r of rs) {
        if (on) next.set(r.id, r);
        else next.delete(r.id);
      }
      const out = { ...prev, [l]: next };
      // Changing a parent selection invalidates child selections.
      if (l === "campaign") out.ad_group = new Map();
      if (l !== "ad") out.ad = new Map();
      return out;
    });
    if (l !== "ad") setOffsets((o) => ({ ...o, ad_group: l === "campaign" ? 0 : o.ad_group, ad: 0 }));
  }

  function clearSelection(l: Level) {
    select(l, [...sel[l].values()], false);
  }

  function drill(l: Level, row: AnyRow) {
    select(l, [...sel[l].values()], false);
    select(l, [row], true);
    setLevel(l === "campaign" ? "ad_group" : "ad");
  }

  const filtered = accountId !== "all" || status !== "all" || search !== "";
  if (
    campaigns.query.isPending === false &&
    !campaigns.query.isError &&
    !filtered &&
    offsets.campaign === 0 &&
    campaigns.total === 0
  ) {
    return (
      <EmptyState
        illustration={<ChartsIllustration className="h-auto w-full" />}
        title="No campaigns yet"
        description="Connect Meta or Google to see data. Campaigns sync automatically after you pick which ad accounts to import."
        actions={<ConnectCta />}
      />
    );
  }

  const tabCount = (l: Level) => (l === "campaign" ? campaigns.total : l === "ad_group" ? adGroups.total : ads.total);
  const parentNote =
    level === "ad_group" && selCampaigns.length
      ? `in ${selCampaigns.length} selected ${selCampaigns.length === 1 ? L.campaign.toLowerCase() : plural(L.campaign).toLowerCase()}`
      : level === "ad" && (selAdGroups.length || selCampaigns.length)
        ? selAdGroups.length
          ? `in ${selAdGroups.length} selected ${selAdGroups.length === 1 ? L.ad_group.toLowerCase() : plural(L.ad_group).toLowerCase()}`
          : `in ${selCampaigns.length} selected ${selCampaigns.length === 1 ? L.campaign.toLowerCase() : plural(L.campaign).toLowerCase()}`
        : null;

  const total = current.total;
  const off = offsets[level];
  const paged = !parentNote && total != null && total > PAGE_SIZE;

  const singleCampaign = selCampaigns.length === 1 ? (sel.campaign.get(selCampaigns[0]) as Campaign) : null;
  const singleAdGroup = selAdGroups.length === 1 ? (sel.ad_group.get(selAdGroups[0]) as AdGroup) : null;
  const createDisabled = !m.canManage ? MEMBER_HINT : null;

  return (
    <div className="grid gap-3">
      {/* Top bar: title, account, date range, search */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-display text-lg font-semibold tracking-tight text-fg">Campaigns</h1>
        <Select
          value={accountId}
          onValueChange={(v) => {
            setAccountId(v);
            resetPaging();
            setSel({ campaign: new Map(), ad_group: new Map(), ad: new Map() });
          }}
        >
          <SelectTrigger size="sm" className="w-60 bg-surface" aria-label="Ad account">
            <SelectValue placeholder="All ad accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ad accounts</SelectItem>
            {(accounts.data?.accounts ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <ProviderMark provider={a.provider} className="size-4 text-[0.5625rem]" />
                <span className="truncate">{a.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(days)}
          onValueChange={(v) => {
            setDays(Number(v) as RangeDays);
          }}
        >
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
        <div className="relative w-full sm:w-64">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search ${noun}`}
            aria-label={`Search ${noun}`}
            className="h-8 bg-surface pl-8"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AccountLimitsControl accounts={accounts.data?.accounts ?? []} selected={account} />
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
        {/* Level tabs */}
        <div role="tablist" aria-label="Level" className="flex items-stretch border-b border-border bg-bg-subtle">
          {(["campaign", "ad_group", "ad"] as Level[]).map((l) => {
            const n = tabCount(l);
            const selN = sel[l].size;
            const active = level === l;
            return (
              <button
                key={l}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setLevel(l)}
                className={cn(
                  "relative flex min-w-0 items-center gap-2 border-r border-border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface/60 hover:text-fg",
                )}
              >
                {active && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
                {levelNames[l]}
                {n != null && <span className="text-xs font-normal text-fg-muted tabular-nums">{n}</span>}
                {selN > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-fg">
                    {selN} selected
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Clear ${levelNames[l].toLowerCase()} selection`}
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSelection(l);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          clearSelection(l);
                        }
                      }}
                      className="rounded-full hover:text-fg"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <WhyDisabled reason={createDisabled}>
            <Button
              size="sm"
              disabled={!!createDisabled}
              onClick={() =>
                m.openCreate({
                  level,
                  campaign: singleCampaign,
                  adGroup: singleAdGroup,
                  accountId: account?.provider === "meta" ? account.id : undefined,
                })
              }
            >
              <Plus aria-hidden="true" /> Create
            </Button>
          </WhyDisabled>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedHere.length !== 1}
            onClick={() => m.openEdit(toTarget(level, selectedHere[0]))}
            title={selectedHere.length !== 1 ? `Select one ${L[level === "ad_group" ? "ad_group" : level].toLowerCase()} to edit` : undefined}
          >
            <Pencil aria-hidden="true" /> Edit
          </Button>
          {selectedHere.length > 0 && m.canManage && (
            <div className="flex items-center gap-1 border-l border-border pl-2">
              <span className="px-1 text-xs text-fg-muted tabular-nums">{selectedHere.length} selected</span>
              <Button size="sm" variant="ghost" onClick={() => void m.bulkStatus(level, selectedHere, "active")}>
                <Power aria-hidden="true" /> On
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void m.bulkStatus(level, selectedHere, "paused")}>
                <PowerOff aria-hidden="true" /> Off
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger-fg"
                onClick={() => void m.bulkStatus(level, selectedHere, "archived")}
              >
                <Archive aria-hidden="true" /> Archive
              </Button>
            </div>
          )}
          {parentNote && (
            <span className="text-xs text-fg-muted">
              Showing {noun} {parentNote}
              {current.truncated && " (first 200 per parent)"}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as EntityStatus | "all");
                resetPaging();
              }}
            >
              <SelectTrigger size="sm" className="w-32" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {FILTER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "paused" ? "Off" : STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ColumnsMenu columns={columns} onChange={setColumns} />
          </div>
        </div>

        <EntityTable
          key={level}
          level={level}
          rows={rows}
          columns={level === "ad" ? columns.filter((c) => c !== "budget") : columns}
          query={current.query}
          series={{ byId: series.data?.series, isPending: series.isPending && series.fetchStatus !== "idle", isError: series.isError }}
          selected={sel[level]}
          onSelect={(rs, on) => select(level, rs, on)}
          totalsNoun={noun}
          emptyText={filtered || parentNote ? `No ${noun} match these filters.` : `No ${noun} yet.`}
          thumbnails={thumbnails}
          chartsHref={(r) => (level === "campaign" ? `/app/campaigns/${r.id}` : `/app/campaigns/${(r as AdGroup).campaign_id}`)}
          quickLinks={(r) => (
            <>
              {level !== "ad" && (
                <button type="button" className="text-primary hover:underline" onClick={() => drill(level, r)}>
                  {level === "campaign" ? m.levelLabel(r.provider, "ad_group") + "s" : "Ads"}
                </button>
              )}
              <Link
                href={level === "campaign" ? `/app/campaigns/${r.id}` : `/app/campaigns/${(r as AdGroup).campaign_id}`}
                className="text-primary hover:underline"
              >
                Charts
              </Link>
              <button type="button" className="text-primary hover:underline" onClick={() => m.openEdit(toTarget(level, r))}>
                Edit
              </button>
            </>
          )}
          className="max-h-[calc(100dvh-15rem)] min-h-64"
        />

        {paged && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-fg-muted">
            <span className="tabular-nums">
              {off + 1}–{Math.min(off + rows.length, total!)} of {total}
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="xs"
                disabled={off === 0}
                onClick={() => setOffsets((o) => ({ ...o, [level]: Math.max(0, off - PAGE_SIZE) }))}
              >
                <ChevronLeft aria-hidden="true" /> Previous
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={off + PAGE_SIZE >= total!}
                onClick={() => setOffsets((o) => ({ ...o, [level]: off + PAGE_SIZE }))}
              >
                Next <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ColumnsMenu({ columns, onChange }: { columns: ColumnKey[]; onChange: (c: ColumnKey[]) => void }) {
  const preset = PRESETS.find((p) => p.columns.length === columns.length && p.columns.every((c) => columns.includes(c)));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Columns3 aria-hidden="true" /> Columns: {preset?.label ?? "Custom"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-fg-muted">Presets</DropdownMenuLabel>
        {PRESETS.map((p) => (
          <DropdownMenuCheckboxItem key={p.id} checked={preset?.id === p.id} onCheckedChange={() => onChange(p.columns)}>
            {p.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-fg-muted">Columns</DropdownMenuLabel>
        {ALL_COLUMNS.map((k) => (
          <DropdownMenuCheckboxItem
            key={k}
            checked={columns.includes(k)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? [...columns, k] : columns.filter((c) => c !== k))}
          >
            {COLUMNS[k].label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(PRESETS[0].columns)}>Reset to Performance</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
