import type { Provider } from "@/lib/api";
import type { BreakdownDimension, WastedReason } from "@/lib/analytics-api";
import { formatDate } from "@/lib/utils";

const DASH = "—";

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(undefined, opts);
    nfCache.set(key, f);
  }
  return f;
}

/** Money in one currency. `compact` gives "₹5.6M"-style values for tiles and axes. */
export function formatMoney(
  v: number | null | undefined,
  currency: string | null | undefined,
  { compact = false }: { compact?: boolean } = {},
): string {
  if (v == null || !currency) return DASH;
  try {
    if (compact) {
      return nf(`m:c:${currency}`, {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: Math.abs(v) >= 1000 ? 1 : 0,
      }).format(v);
    }
    return nf(`m:${currency}`, {
      style: "currency",
      currency,
      maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2,
    }).format(v);
  } catch {
    // Unknown currency code: fall back to "1,234 XYZ".
    return `${formatNumber(v)} ${currency}`;
  }
}

export function formatNumber(v: number | null | undefined, { compact = false }: { compact?: boolean } = {}) {
  if (v == null) return DASH;
  return compact
    ? nf("n:c", { notation: "compact", maximumFractionDigits: 1 }).format(v)
    : nf("n", { maximumFractionDigits: v % 1 === 0 ? 0 : 1 }).format(v);
}

/** A 0–1 fraction as a percentage ("1.24%"). */
export function formatPercent(v: number | null | undefined, digits = 1) {
  if (v == null) return DASH;
  return nf(`p:${digits}`, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** ROAS as a multiple ("4.91×"). */
export function formatRoas(v: number | null | undefined) {
  if (v == null) return DASH;
  return `${nf("r", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}×`;
}

/** A relative change ("+3.1%", "−12%"). */
export function formatDelta(v: number) {
  const abs = Math.abs(v);
  const s = nf(`d:${abs < 0.1 ? 1 : 0}`, {
    style: "percent",
    maximumFractionDigits: abs < 0.1 ? 1 : 0,
  }).format(abs);
  if (s === "0%" || s === "0.0%") return "0%";
  return `${v > 0 ? "+" : "−"}${s}`;
}

/** "2026-08-26" → "Aug 26" in the viewer's locale (parsed as a local date, not UTC). */
export function formatDay(isoDate: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return formatDate(`${isoDate}T00:00:00`, opts);
}

export function formatRange(from: string, to: string) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${formatDay(from, opts)} – ${formatDay(to, sameYear ? opts : { ...opts, year: "numeric" })}`;
}

export function formatHour(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

export const PROVIDER_NAMES: Record<Provider, string> = { meta: "Meta", google: "Google" };

export const REASON_LABELS: Record<WastedReason, string> = {
  no_conversions: "No conversions",
  low_conversions: "Few conversions",
  low_roas: "Low ROAS",
};

const PLATFORM_NAMES: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  google_search: "Google Search",
  google_display: "Google Display",
  search_partners: "Search Partners",
  youtube: "YouTube",
};

function titleCase(s: string) {
  return s
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

let regionNames: Intl.DisplayNames | null | undefined;
function countryName(code: string) {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(undefined, { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Human label for a breakdown row value. */
export function breakdownLabel(dimension: BreakdownDimension, value: string, platform?: string) {
  if (value === "unknown") return "Unknown";
  switch (dimension) {
    case "country":
      return countryName(value);
    case "publisher_platform":
      return PLATFORM_NAMES[value] ?? titleCase(value);
    case "placement": {
      const p = platform && platform !== "unknown" ? (PLATFORM_NAMES[platform] ?? titleCase(platform)) : null;
      return p ? `${p} · ${titleCase(value)}` : titleCase(value);
    }
    default:
      return titleCase(value);
  }
}

/** Clean axis ticks: 0 and 3–5 round steps covering max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let t = 0; t < max + step * 0.001; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** "₹", "$", "€" for an ISO currency code (narrow form, so USD is "$" not "US$"). Falls back to the code. */
export function currencySymbol(currency: string): string {
  if (!currency) return "";
  try {
    const part = new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** "Indian Rupee" for "INR"; the code itself when the runtime has no name. */
export function currencyName(currency: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "currency" }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}
