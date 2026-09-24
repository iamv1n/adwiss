"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusPill, type PillTone } from "@/components/app/integrations/status-pill";
import type { AdAccount } from "@/lib/api";
import { cn, formatDate, timeAgo } from "@/lib/utils";

function syncBadge(a: AdAccount, now: number): { tone: PillTone; label: string } {
  // While an optimistic toggle is in flight, sync_status still reflects the old value.
  if (!a.sync_enabled) return { tone: "muted", label: "Sync off" };
  switch (a.sync_status) {
    case "ok":
      return { tone: "success", label: a.last_synced_at ? `Synced ${timeAgo(a.last_synced_at, now)}` : "Synced" };
    case "stale":
      return {
        tone: "warning",
        label: a.last_synced_at ? `Last synced ${timeAgo(a.last_synced_at, now)}` : "Sync delayed",
      };
    case "integration_error":
      return { tone: "danger", label: "Connection problem" };
    case "never_synced":
    case "disabled":
    default:
      return { tone: "info", label: "Waiting for first sync" };
  }
}

const PROVIDER_STATUS_LABEL: Record<string, string> = {
  paused: "Paused",
  archived: "Archived",
  deleted: "Deleted",
  unknown: "Status unknown",
};

export function AccountRow({
  account: a,
  canManage,
  now,
  onToggle,
  onReconnect,
  reconnectDisabled = false,
}: {
  account: AdAccount;
  canManage: boolean;
  now: number;
  onToggle: (enabled: boolean) => void;
  onReconnect?: () => void;
  reconnectDisabled?: boolean;
}) {
  const switchId = useId();
  const badge = syncBadge(a, now);
  const providerStatus = PROVIDER_STATUS_LABEL[a.status];

  return (
    <li className="grid gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-fg">{a.name}</p>
          {providerStatus && (
            <span className="rounded-md border border-border px-1.5 py-px text-[0.6875rem] text-fg-muted">
              {providerStatus}
            </span>
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-subtle">
          <span className="font-mono">{a.external_id}</span>
          <span aria-hidden="true">·</span>
          <span>{a.currency}</span>
          <span aria-hidden="true">·</span>
          <span>{a.timezone}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        {a.last_synced_at ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Oldest data synced {formatDate(a.last_synced_at, { dateStyle: "medium", timeStyle: "short" })}
            </TooltipContent>
          </Tooltip>
        ) : (
          <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
        )}

        {a.sync_enabled && a.sync_status === "integration_error" && onReconnect && !reconnectDisabled && (
          <button
            type="button"
            onClick={onReconnect}
            className="text-xs font-medium text-danger-fg underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Reconnect
          </button>
        )}

        {canManage ? (
          <div className="flex items-center gap-2">
            <label htmlFor={switchId} className="text-sm text-fg-muted">
              Sync
            </label>
            <Switch
              id={switchId}
              checked={a.sync_enabled}
              onCheckedChange={onToggle}
              aria-label={`Sync ${a.name}`}
            />
          </div>
        ) : (
          <span className={cn("text-sm", a.sync_enabled ? "text-fg" : "text-fg-subtle")}>
            Sync {a.sync_enabled ? "on" : "off"}
          </span>
        )}
      </div>
    </li>
  );
}
