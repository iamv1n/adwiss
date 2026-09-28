import type { PillTone } from "@/components/app/integrations/status-pill";
import type { EntityStatus, PacingStatus } from "@/lib/entities-api";

const formatters = new Map<string, Intl.NumberFormat>();

function nf(key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, opts);
    } catch {
      // Unknown currency code: fall back to a plain number.
      f = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    }
    formatters.set(key, f);
  }
  return f;
}

/** Money in the account currency. Whole units by default; `precise` keeps cents for small values. */
export function formatMoney(value: number | null | undefined, currency: string, precise = false): string {
  if (value == null) return "—";
  const digits = precise && Math.abs(value) < 1000 ? 2 : 0;
  return nf(`money:${currency}:${digits}`, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  const digits = Math.abs(value) < 100 && !Number.isInteger(value) ? 1 : 0;
  return nf(`count:${digits}`, { maximumFractionDigits: digits }).format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  return nf("compact", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction == null) return "—";
  return nf("pct", { style: "percent", maximumFractionDigits: 2 }).format(fraction);
}

export function formatRatio(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${nf("ratio", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}×`;
}

export const STATUS_LABEL: Record<EntityStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  deleted: "Deleted",
  unknown: "Unknown",
};

export const STATUS_TONE: Record<EntityStatus, PillTone> = {
  active: "success",
  paused: "muted",
  archived: "muted",
  deleted: "danger",
  unknown: "muted",
};

export const PACING: Record<PacingStatus, { label: string; tone: PillTone }> = {
  on_track: { label: "On track", tone: "success" },
  under: { label: "Underspending", tone: "warning" },
  over: { label: "Overspending", tone: "danger" },
  no_budget: { label: "No daily budget", tone: "muted" },
  inactive: { label: "Not delivering", tone: "muted" },
};

const OBJECTIVE_OVERRIDES: Record<string, string> = {
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Demand Gen",
  APP_PROMOTION: "App promotion",
  OUTCOME_APP_PROMOTION: "App promotion",
  MULTI_CHANNEL: "Multi-channel",
};

/** "OUTCOME_SALES" → "Sales", "PERFORMANCE_MAX" → "Performance Max". */
export function objectiveLabel(objective: string): string {
  if (!objective) return "";
  if (OBJECTIVE_OVERRIDES[objective]) return OBJECTIVE_OVERRIDES[objective];
  const words = objective.replace(/^OUTCOME_/, "").toLowerCase().split("_").filter(Boolean);
  const s = words.join(" ");
  return s ? s[0].toUpperCase() + s.slice(1) : objective;
}

/** "Ad set" → "Ad sets". */
export function plural(label: string): string {
  return label.endsWith("s") ? label : `${label}s`;
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "₹22,000 a day", "₹50,000 in total", or null when the row carries no budget. */
export function budgetPhrase(
  b: { daily_budget?: number | null; lifetime_budget?: number | null },
  currency: string,
): string | null {
  if (b.daily_budget != null) return `${formatMoney(b.daily_budget, currency)} a day`;
  if (b.lifetime_budget != null) return `${formatMoney(b.lifetime_budget, currency)} in total`;
  return null;
}

/** Delivery dot colour per status (Ads Manager style "● Active"). */
export const STATUS_DOT: Record<EntityStatus, string> = {
  active: "bg-success",
  paused: "bg-fg-subtle",
  archived: "bg-border-strong",
  deleted: "bg-danger",
  unknown: "bg-border-strong",
};

/** Delivery label; "Off" reads better than "Paused" next to an on/off switch. */
export const DELIVERY_LABEL: Record<EntityStatus, string> = {
  active: "Active",
  paused: "Off",
  archived: "Archived",
  deleted: "Deleted",
  unknown: "Unknown",
};
