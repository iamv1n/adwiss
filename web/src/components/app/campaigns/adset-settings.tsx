"use client";

/**
 * Ad set settings beyond the basics, for the create flow: locations and
 * languages from Meta's search, detailed targeting, custom audiences,
 * placements and bid strategy.
 */

import { useEffect, useId, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ATTRIBUTIONS, BID_STRATEGIES, PLACEMENTS } from "@/components/app/campaigns/meta-options";
import {
  type Attribution,
  type BidStrategy,
  type CustomAudience,
  type Platform,
  type TargetingKind,
  type TargetingOption,
  useAudiences,
  useTargetingSearch,
} from "@/lib/manage-api";
import { cn } from "@/lib/utils";

export interface Location extends TargetingOption {
  /** Cities only: 0 = the city itself. */
  radiusKm?: number;
}

export interface AdSetExtras {
  locations: Location[];
  languages: TargetingOption[];
  interests: TargetingOption[];
  excludedInterests: TargetingOption[];
  audiences: string[];
  excludedAudiences: string[];
  placementsMode: "auto" | "manual";
  platforms: Platform[];
  /** Chosen positions per platform; empty = all of that platform's positions. */
  positions: Partial<Record<Platform, string[]>>;
  bidStrategy: BidStrategy;
  bidAmount: string;
  roasFloor: string;
  attribution: Attribution;
}

export const DEFAULT_EXTRAS: AdSetExtras = {
  locations: [],
  languages: [],
  interests: [],
  excludedInterests: [],
  audiences: [],
  excludedAudiences: [],
  placementsMode: "auto",
  platforms: ["facebook", "instagram"],
  positions: {},
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  bidAmount: "",
  roasFloor: "",
  attribution: "7d_click_1d_view",
};

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/** Search-as-you-type picker for Meta targeting options, shown as removable chips. */
export function TargetingSearch({
  orgId,
  accountId,
  kind,
  value,
  onChange,
  placeholder,
  label,
  chipExtra,
  tone = "include",
}: {
  orgId: string;
  accountId: string | undefined;
  kind: TargetingKind;
  value: TargetingOption[];
  onChange: (v: TargetingOption[]) => void;
  placeholder: string;
  label: string;
  chipExtra?: (o: TargetingOption) => React.ReactNode;
  tone?: "include" | "exclude";
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q, 300);
  const res = useTargetingSearch(orgId, accountId, kind, debounced);
  const chosen = new Set(value.map((v) => v.id));
  const results = (res.data ?? []).filter((r) => !chosen.has(r.id));

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((o) => (
            <li
              key={o.id}
              className={cn(
                "flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs",
                tone === "exclude" ? "border-danger/30 bg-danger-subtle text-danger-fg" : "border-border bg-bg-subtle text-fg",
              )}
            >
              <span className="max-w-[16rem] truncate">{o.name}</span>
              {chipExtra?.(o)}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.id !== o.id))}
                className="grid size-4 place-items-center rounded-full hover:bg-border"
                aria-label={`Remove ${o.name}`}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <Input
          id={id}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={accountId ? placeholder : "Choose the account first"}
          disabled={!accountId}
          className="h-8 pl-8"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && debounced.trim().length >= 2}
          aria-controls={`${id}-list`}
        />
        {open && debounced.trim().length >= 2 && (
          <ul
            id={`${id}-list`}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-md"
          >
            {res.isFetching ? (
              <li className="flex items-center gap-2 px-3 py-2 text-xs text-fg-subtle">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Searching…
              </li>
            ) : res.isError ? (
              <li className="px-3 py-2 text-xs text-danger-fg">{res.error.message}</li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2 text-xs text-fg-subtle">No matches</li>
            ) : (
              results.map((r) => (
                <li key={r.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange([...value, r]);
                      setQ("");
                    }}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-fg">{r.name}</span>
                      {(r.description || r.type) && (
                        <span className="block truncate text-xs text-fg-subtle">
                          {r.description || r.type.replaceAll("_", " ")}
                        </span>
                      )}
                    </span>
                    {r.audience_size ? (
                      <span className="shrink-0 text-xs text-fg-subtle tabular-nums">{compact.format(r.audience_size)}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

const RADII = [0, 17, 25, 40, 50, 80];

/** Regions and cities, with a radius per city. */
export function LocationSearch({
  orgId,
  accountId,
  value,
  onChange,
}: {
  orgId: string;
  accountId: string | undefined;
  value: Location[];
  onChange: (v: Location[]) => void;
}) {
  return (
    <TargetingSearch
      orgId={orgId}
      accountId={accountId}
      kind="locations"
      label="Regions and cities (optional)"
      placeholder="Search a state, region or city…"
      value={value}
      onChange={(v) => onChange(v.map((o) => ({ ...o, radiusKm: (o as Location).radiusKm ?? (o.type === "city" ? 25 : undefined) })))}
      chipExtra={(o) =>
        o.type === "city" ? (
          <select
            aria-label={`Radius around ${o.name}`}
            value={(o as Location).radiusKm ?? 0}
            onChange={(e) =>
              onChange(value.map((v) => (v.id === o.id ? { ...v, radiusKm: Number(e.target.value) } : v)))
            }
            className="rounded bg-transparent text-xs text-fg-muted outline-none"
          >
            {RADII.map((r) => (
              <option key={r} value={r}>
                {r === 0 ? "city only" : `+${r} km`}
              </option>
            ))}
          </select>
        ) : null
      }
    />
  );
}

/** Custom and lookalike audiences to include or exclude. */
export function AudiencePicker({
  orgId,
  accountId,
  include,
  exclude,
  onChange,
}: {
  orgId: string;
  accountId: string | undefined;
  include: string[];
  exclude: string[];
  onChange: (include: string[], exclude: string[]) => void;
}) {
  const list = useAudiences(orgId, accountId);
  if (!accountId) return null;
  if (list.isPending)
    return (
      <p className="flex items-center gap-2 text-xs text-fg-subtle">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Loading audiences…
      </p>
    );
  if (list.isError) return <p className="text-xs text-danger-fg">Couldn&apos;t load audiences: {list.error.message}</p>;
  if (!list.data.length)
    return <p className="text-xs text-fg-subtle">No custom or lookalike audiences in this ad account yet.</p>;

  const mode = (a: CustomAudience) => (include.includes(a.id) ? "include" : exclude.includes(a.id) ? "exclude" : "off");
  const setMode = (a: CustomAudience, m: string) => {
    const inc = include.filter((x) => x !== a.id);
    const exc = exclude.filter((x) => x !== a.id);
    if (m === "include") inc.push(a.id);
    if (m === "exclude") exc.push(a.id);
    onChange(inc, exc);
  };
  return (
    <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-border p-1">
      {list.data.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-bg-subtle">
          <span className="min-w-0">
            <span className="block truncate text-sm text-fg">{a.name}</span>
            <span className="block text-xs text-fg-subtle">
              {a.subtype.toLowerCase().replaceAll("_", " ")}
              {a.approx_count ? ` · ~${compact.format(a.approx_count)}` : ""}
            </span>
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode(a)}
            onValueChange={(v) => v && setMode(a, v)}
            aria-label={`Use ${a.name}`}
          >
            <ToggleGroupItem value="off" className="px-2 text-xs">
              Off
            </ToggleGroupItem>
            <ToggleGroupItem value="include" className="px-2 text-xs">
              Include
            </ToggleGroupItem>
            <ToggleGroupItem value="exclude" className="px-2 text-xs">
              Exclude
            </ToggleGroupItem>
          </ToggleGroup>
        </li>
      ))}
    </ul>
  );
}

/** Automatic (Advantage+) or manual placements. */
export function PlacementsPicker({
  d,
  up,
}: {
  d: AdSetExtras;
  up: (p: Partial<AdSetExtras>) => void;
}) {
  const togglePlatform = (p: Platform, on: boolean) =>
    up({ platforms: on ? [...d.platforms, p] : d.platforms.filter((x) => x !== p) });
  const togglePosition = (p: Platform, pos: string, on: boolean, all: string[]) => {
    const cur = d.positions[p]?.length ? d.positions[p]! : all;
    const next = on ? [...cur, pos] : cur.filter((x) => x !== pos);
    up({ positions: { ...d.positions, [p]: next.length === all.length ? [] : next } });
  };
  return (
    <div className="grid gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={d.placementsMode}
        onValueChange={(v) => v && up({ placementsMode: v as AdSetExtras["placementsMode"] })}
        aria-label="Placements"
        className="w-full"
      >
        <ToggleGroupItem value="auto" className="flex-1 text-xs">
          Advantage+ (automatic)
        </ToggleGroupItem>
        <ToggleGroupItem value="manual" className="flex-1 text-xs">
          Manual
        </ToggleGroupItem>
      </ToggleGroup>
      {d.placementsMode === "auto" ? (
        <p className="text-xs text-fg-muted">
          Meta shows ads wherever they are likely to perform best. Usually the cheapest option.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {PLACEMENTS.map((pl) => {
            const on = d.platforms.includes(pl.platform);
            const all = pl.positions.map((x) => x.value);
            const chosen = d.positions[pl.platform]?.length ? d.positions[pl.platform]! : all;
            return (
              <fieldset key={pl.platform} className="grid content-start gap-1.5 rounded-md border border-border p-2.5">
                <label className="flex items-center gap-2 text-sm font-medium text-fg">
                  <Checkbox checked={on} onCheckedChange={(v) => togglePlatform(pl.platform, v === true)} />
                  {pl.label}
                </label>
                {on && (
                  <div className="grid gap-1 pl-6">
                    {pl.positions.map((pos) => (
                      <label key={pos.value} className="flex items-center gap-2 text-xs text-fg-muted">
                        <Checkbox
                          checked={chosen.includes(pos.value)}
                          onCheckedChange={(v) => togglePosition(pl.platform, pos.value, v === true, all)}
                        />
                        {pos.label}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Bid strategy and attribution. With a campaign budget the campaign's
 * strategy applies, so only the cap or ROAS goal it needs is asked for.
 */
export function BiddingFields({
  d,
  up,
  currency,
  campaignStrategy,
}: {
  d: AdSetExtras;
  up: (p: Partial<AdSetExtras>) => void;
  currency: string;
  /**
   * Set when the campaign carries the budget and so the strategy; "unknown"
   * for an existing campaign (synced campaigns don't carry it).
   */
  campaignStrategy: BidStrategy | "unknown" | null;
}) {
  const unknown = campaignStrategy === "unknown";
  const strategy = unknown ? null : (campaignStrategy ?? d.bidStrategy);
  const needsAmount = unknown || strategy === "COST_CAP" || strategy === "LOWEST_COST_WITH_BID_CAP";
  const info = BID_STRATEGIES.find((b) => b.value === strategy);
  return (
    <div className="grid gap-3">
      {unknown ? (
        <p className="text-xs text-fg-muted">Bidding follows the campaign&apos;s strategy.</p>
      ) : campaignStrategy ? (
        <p className="text-xs text-fg-muted">
          The campaign budget uses <span className="font-medium text-fg">{info?.label}</span>.
        </p>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="g-bid" className="text-xs">
            Bid strategy
          </Label>
          <Select value={d.bidStrategy} onValueChange={(v) => up({ bidStrategy: v as BidStrategy })}>
            <SelectTrigger id="g-bid" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BID_STRATEGIES.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {info && <p className="text-xs text-fg-subtle">{info.hint}</p>}
        </div>
      )}
      {needsAmount && (
        <div className="grid gap-1.5">
          <Label htmlFor="g-bidamt" className="text-xs">
            {unknown
              ? "Cost goal or bid cap (only if the campaign uses one)"
              : strategy === "COST_CAP"
                ? "Cost per result goal"
                : "Bid cap"}
            {currency ? ` (${currency})` : ""}
          </Label>
          <Input
            id="g-bidamt"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={d.bidAmount}
            onChange={(e) => up({ bidAmount: e.target.value })}
            className="h-8 w-40 tabular-nums"
          />
        </div>
      )}
      {strategy === "LOWEST_COST_WITH_MIN_ROAS" && (
        <div className="grid gap-1.5">
          <Label htmlFor="g-roas" className="text-xs">
            Minimum ROAS
          </Label>
          <Input
            id="g-roas"
            type="number"
            inputMode="decimal"
            min={0.01}
            step="0.1"
            value={d.roasFloor}
            onChange={(e) => up({ roasFloor: e.target.value })}
            placeholder="2.0"
            className="h-8 w-40 tabular-nums"
          />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="g-attr" className="text-xs">
          Attribution
        </Label>
        <Select value={d.attribution} onValueChange={(v) => up({ attribution: v as Attribution })}>
          <SelectTrigger id="g-attr" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATTRIBUTIONS.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-fg-subtle">Which conversions Meta counts and optimises for.</p>
      </div>
    </div>
  );
}
