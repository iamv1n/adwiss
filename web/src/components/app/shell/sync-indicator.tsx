"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PROVIDERS } from "@/components/app/integrations/providers";
import { api, type AdAccount, type Integration, type SyncProgress } from "@/lib/api";
import { isSyncActive, queryKeys, useActiveOrg, useAdAccounts, useIntegrations } from "@/lib/queries";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Header badge with the org's live sync state: progress while a sync runs,
 * otherwise when data was last synced or that something needs attention.
 * Shares the Integrations page's sync-progress queries, so both stay in step.
 */
export function SyncIndicator() {
  const orgId = useActiveOrg()?.id;
  const qc = useQueryClient();
  const integrations = (useIntegrations(orgId).data?.integrations ?? []).filter((i) => i.status !== "disconnected");
  const accounts = (useAdAccounts(orgId).data?.accounts ?? []).filter((a) => a.sync_enabled);

  const progress = useQueries({
    queries: integrations.map((i) => ({
      queryKey: queryKeys.syncProgress(orgId ?? "", i.id),
      queryFn: async () => (await api.integrations.syncProgress(orgId!, i.id)).progress,
      enabled: !!orgId,
      refetchInterval: (q: { state: { data?: SyncProgress } }) => (isSyncActive(q.state.data?.state) ? 2000 : 30000),
    })),
  });
  const byId = new Map(integrations.map((i, n) => [i.id, progress[n]?.data]));
  const active = [...byId.values()].filter((p): p is SyncProgress => isSyncActive(p?.state));

  // When a sync finishes, refetch accounts so "last synced" updates.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && active.length === 0 && orgId) {
      qc.invalidateQueries({ queryKey: queryKeys.accounts(orgId) });
      qc.invalidateQueries({ queryKey: queryKeys.integrations(orgId) });
    }
    wasActive.current = active.length > 0;
  }, [active.length, orgId, qc]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!orgId || integrations.length === 0) return null;

  const needsReauth = integrations.some((i) => i.status === "needs_reauth");
  const problems = accounts.filter((a) => a.sync_status === "integration_error" || a.sync_status === "stale");
  const lastSynced = accounts
    .map((a) => a.last_synced_at)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);
  const percent = active.length
    ? Math.round(active.reduce((s, p) => s + p.percent, 0) / active.length)
    : 0;

  let label: string;
  let icon: React.ReactNode;
  let tone = "text-fg-muted";
  if (active.length) {
    label = `Syncing ${percent}%`;
    icon = <Loader2 className="animate-spin text-primary" aria-hidden="true" />;
  } else if (needsReauth || problems.length) {
    label = needsReauth ? "Reconnect needed" : "Sync issue";
    icon = <AlertTriangle aria-hidden="true" />;
    tone = "text-warning-fg";
  } else if (lastSynced) {
    label = `Synced ${timeAgo(lastSynced, now)}`;
    icon = <CheckCircle2 className="text-success" aria-hidden="true" />;
  } else {
    label = "Not synced yet";
    icon = <RefreshCw aria-hidden="true" />;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("gap-1.5 font-normal", tone)} aria-label={`Data sync: ${label}`}>
          {icon}
          <span className="hidden sm:inline" aria-live="polite">
            {label}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-fg">Data sync</p>
          <p className="text-xs text-fg-subtle">Updates live while a sync is running.</p>
        </div>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {integrations.map((i) => (
            <IntegrationRow
              key={i.id}
              integration={i}
              progress={byId.get(i.id)}
              accounts={accounts.filter((a) => a.integration_id === i.id)}
              now={now}
            />
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2.5">
          <Link href="/app/integrations" className="text-xs font-medium text-primary hover:underline">
            Manage integrations
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function IntegrationRow({
  integration: i,
  progress: p,
  accounts,
  now,
}: {
  integration: Integration;
  progress: SyncProgress | undefined;
  accounts: AdAccount[];
  now: number;
}) {
  const running = isSyncActive(p?.state);
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-fg">{i.display_name || PROVIDERS[i.provider].name}</p>
        {i.status === "needs_reauth" ? (
          <span className="shrink-0 text-xs text-warning-fg">Access expired</span>
        ) : running && p ? (
          <span className="shrink-0 font-mono text-xs text-fg-subtle tabular-nums">
            {p.state === "queued" ? "Queued" : `${p.percent}%`}
          </span>
        ) : p?.state === "failed" ? (
          <span className="shrink-0 text-xs text-danger-fg">Last sync failed</span>
        ) : null}
      </div>
      {running && p ? (
        <div
          role="progressbar"
          aria-label="Sync progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={p.percent}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-subtle"
        >
          <div
            className={cn("h-full rounded-full bg-primary transition-[width] duration-500", p.state === "queued" && "w-1/4 animate-pulse")}
            style={p.state === "queued" ? undefined : { width: `${Math.max(p.percent, 3)}%` }}
          />
        </div>
      ) : null}
      {accounts.length ? (
        <ul className="mt-1.5 grid gap-0.5">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-fg-muted">{a.name}</span>
              <span
                className={cn(
                  "shrink-0 text-fg-subtle",
                  (a.sync_status === "stale" || a.sync_status === "integration_error") && "text-warning-fg",
                )}
              >
                {a.sync_status === "integration_error"
                  ? "Error"
                  : a.last_synced_at
                    ? timeAgo(a.last_synced_at, now)
                    : "Never synced"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-fg-subtle">No accounts syncing.</p>
      )}
    </li>
  );
}
