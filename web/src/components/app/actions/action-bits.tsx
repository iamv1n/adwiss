import { ArrowRight } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/app/integrations/status-pill";
import { formatMoney } from "@/components/app/analytics/format";
import type { Action, ActionSource, ActionStatus, ActionType } from "@/lib/automation-api";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export const STATUS_LABELS: Record<ActionStatus, string> = {
  dry_run: "Dry run",
  pending: "Pending",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

const STATUS_TONES: Record<ActionStatus, PillTone> = {
  dry_run: "info",
  pending: "warning",
  running: "warning",
  succeeded: "success",
  failed: "danger",
  skipped: "muted",
};

export function ActionStatusPill({ status }: { status: ActionStatus }) {
  return <StatusPill tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</StatusPill>;
}

export const SOURCE_LABELS: Record<ActionSource, string> = {
  manual: "Manual",
  schedule: "Schedule",
  rule: "Rule",
  plan: "Budget plan",
  revert: "Revert",
};

export const TYPE_LABELS: Record<ActionType, string> = {
  pause: "Pause",
  activate: "Activate",
  set_budget: "Budget",
  notify: "Notify",
  archive: "Archive",
  update: "Update",
};

type StateLike = Record<string, unknown> | { status?: string; daily_budget?: number };

function stateValue(s: StateLike, key: "status" | "daily_budget"): unknown {
  return (s as Record<string, unknown>)[key];
}

function renderValue(key: "status" | "daily_budget", v: unknown, currency: string) {
  if (v == null) return "—";
  if (key === "daily_budget" && typeof v === "number") return `${formatMoney(v, currency || null)}/day`;
  return String(v);
}

/** "active → paused" or "₹1,800/day → ₹2,160/day", in the row's currency. */
export function ChangeSummary({
  type,
  before,
  after,
  currency,
  className,
}: {
  type: string;
  before: StateLike;
  after: StateLike;
  currency: string;
  className?: string;
}) {
  const key: "status" | "daily_budget" = type === "set_budget" ? "daily_budget" : "status";
  if (type === "notify") {
    return <span className={cn("text-fg-muted", className)}>Notification only</span>;
  }
  const b = stateValue(before, key);
  const a = stateValue(after, key);
  let pct: string | null = null;
  if (key === "daily_budget" && typeof a === "number" && typeof b === "number" && b > 0) {
    const d = (a - b) / b;
    pct = `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d * 100))}%`;
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap tabular-nums", className)}>
      <span className="text-fg-muted">{renderValue(key, b, currency)}</span>
      <ArrowRight className="size-3 shrink-0 text-fg-subtle" aria-label="to" />
      <span className="font-medium text-fg">{renderValue(key, a, currency)}</span>
      {pct ? <span className="text-xs text-fg-subtle">({pct})</span> : null}
    </span>
  );
}

/** Before/after diff of every key present on either side. */
export function StateDiff({ action }: { action: Action }) {
  const keys = Array.from(new Set([...Object.keys(action.before ?? {}), ...Object.keys(action.after ?? {})]));
  if (!keys.length) return <p className="text-xs text-fg-muted">No state recorded.</p>;
  const fmt = (k: string, v: unknown) => {
    if (v == null) return "—";
    if ((k === "daily_budget" || k === "lifetime_budget" || k === "spend_cap") && typeof v === "number")
      return formatMoney(v, action.currency || null);
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  return (
    <table className="w-full max-w-lg text-xs">
      <thead>
        <tr className="text-left text-fg-subtle">
          <th className="py-1 pr-4 font-medium">Field</th>
          <th className="py-1 pr-4 font-medium">Before</th>
          <th className="py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {keys.map((k) => {
          const b = (action.before ?? {})[k];
          const a = (action.after ?? {})[k];
          const changed = JSON.stringify(a) !== JSON.stringify(b);
          return (
            <tr key={k} className="border-t border-border">
              <td className="py-1 pr-4 font-sans text-fg-muted">{k.replace(/_/g, " ")}</td>
              <td className={cn("py-1 pr-4", changed ? "text-danger-fg line-through decoration-danger-fg/40" : "text-fg-muted")}>
                {fmt(k, b)}
              </td>
              <td className={cn("py-1", changed ? "font-semibold text-success-fg" : "text-fg-muted")}>{fmt(k, a)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** True when the endpoint is not deployed yet (older API binary). */
export function isNotLive(e: unknown) {
  return isApiError(e) && (e.status === 404 || e.status === 405);
}
