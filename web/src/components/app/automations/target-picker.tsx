"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatMoney, PROVIDER_NAMES } from "@/components/app/analytics/format";
import { useAdGroups, useCampaigns } from "@/lib/entities-api";
import { useAdAccounts } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Dense multi-select of campaigns (or accounts), with search and select-all. */
export function TargetPicker({
  orgId,
  kind,
  value,
  onChange,
  disabled,
  maxHeight = "16rem",
}: {
  orgId: string | undefined;
  kind: "campaigns" | "ad_groups" | "accounts";
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  maxHeight?: string;
}) {
  const [search, setSearch] = useState("");
  const campaigns = useCampaigns(orgId, { limit: 200 }, kind === "campaigns");
  const adGroups = useAdGroups(orgId, { limit: 200 }, kind === "ad_groups");
  const noun = kind === "ad_groups" ? "ad sets" : kind;
  const accounts = useAdAccounts(orgId);
  const selected = useMemo(() => new Set(value), [value]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (kind === "accounts") {
      return (accounts.data?.accounts ?? [])
        .filter((a) => !s || a.name.toLowerCase().includes(s))
        .map((a) => ({
          id: a.id,
          name: a.name,
          meta: `${PROVIDER_NAMES[a.provider]} · ${a.currency} · ${a.timezone}`,
          status: a.status,
          extra: "",
        }));
    }
    if (kind === "ad_groups") {
      return (adGroups.data?.rows ?? [])
        .filter((g) => g.status !== "archived" && g.status !== "deleted")
        .filter((g) => !s || g.name.toLowerCase().includes(s) || g.campaign_name.toLowerCase().includes(s))
        .map((g) => ({
          id: g.id,
          name: g.name,
          meta: `${PROVIDER_NAMES[g.provider]} · ${g.campaign_name}`,
          status: g.status,
          extra: g.daily_budget != null ? `${formatMoney(g.daily_budget, g.currency)}/day` : "campaign budget",
        }));
    }
    return (campaigns.data?.rows ?? [])
      .filter((c) => c.status !== "archived" && c.status !== "deleted")
      .filter((c) => !s || c.name.toLowerCase().includes(s) || c.account_name.toLowerCase().includes(s))
      .map((c) => ({
        id: c.id,
        name: c.name,
        meta: `${PROVIDER_NAMES[c.provider]} · ${c.account_name}`,
        status: c.status,
        extra: c.daily_budget != null ? `${formatMoney(c.daily_budget, c.currency)}/day` : "no daily budget",
      }));
  }, [kind, search, campaigns.data, adGroups.data, accounts.data]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const loading = kind === "campaigns" ? campaigns.isLoading : kind === "ad_groups" ? adGroups.isLoading : accounts.isLoading;

  return (
    <div className={cn("min-w-0 rounded-lg border border-border", disabled && "opacity-60")}>
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <Search className="size-3.5 text-fg-subtle" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${noun}`}
          aria-label={`Search ${noun}`}
          className="h-7 min-w-0 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
          disabled={disabled}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="size-3.5 accent-[var(--color-primary)]"
            checked={allSelected}
            disabled={disabled || !rows.length}
            onChange={(e) => {
              const ids = new Set(value);
              for (const r of rows) {
                if (e.target.checked) ids.add(r.id);
                else ids.delete(r.id);
              }
              onChange(Array.from(ids));
            }}
          />
          All
        </label>
        <span className="shrink-0 text-xs text-fg-subtle tabular-nums">{value.length} selected</span>
      </div>
      <ul className="overflow-y-auto" style={{ maxHeight }} aria-label={`Choose ${noun}`}>
        {loading ? (
          <li className="px-3 py-3 text-xs text-fg-muted">Loading…</li>
        ) : rows.length === 0 ? (
          <li className="px-3 py-3 text-xs text-fg-muted">No {noun} found.</li>
        ) : (
          rows.map((r) => (
            <li key={r.id}>
              <label className="flex h-8 cursor-pointer items-center gap-2 px-2 text-xs hover:bg-bg-subtle">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--color-primary)]"
                  checked={selected.has(r.id)}
                  disabled={disabled}
                  onChange={(e) => {
                    const ids = new Set(value);
                    if (e.target.checked) ids.add(r.id);
                    else ids.delete(r.id);
                    onChange(Array.from(ids));
                  }}
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-fg">{r.name}</span>
                  <span className="ml-1.5 text-fg-subtle">{r.meta}</span>
                </span>
                {r.extra ? <span className="shrink-0 text-fg-muted tabular-nums">{r.extra}</span> : null}
                <span
                  className={cn(
                    "w-12 shrink-0 text-right",
                    r.status === "active" ? "text-success-fg" : "text-fg-subtle",
                  )}
                >
                  {r.status}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
