"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Loader2, MoreHorizontal, Plug, RefreshCw, Sparkles, Unplug, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountRow } from "@/components/app/integrations/account-row";
import { FALLBACK_LABELS, PROVIDERS } from "@/components/app/integrations/providers";
import { StatusPill } from "@/components/app/integrations/status-pill";
import {
  isApiError,
  type AdAccount,
  type EntityLabels,
  type Integration,
  type IntegrationStatus,
  type Provider,
  type SyncProgress,
} from "@/lib/api";
import { isSyncActive, useSyncProgress } from "@/lib/queries";
import { cn, formatDate, timeAgo } from "@/lib/utils";

export interface ProviderCardActions {
  onConnect: () => void;
  onDiscover: (integration: Integration) => void;
  onSyncNow: (integration: Integration) => void;
  onDisconnect: (integration: Integration) => void;
  onToggleSync: (accountId: string, name: string, syncEnabled: boolean) => void;
}

interface ProviderCardProps extends ProviderCardActions {
  orgId: string;
  provider: Provider;
  labels: EntityLabels | undefined;
  integrations: Integration[];
  /** False when the integrations endpoint couldn't be loaded. */
  integrationsKnown: boolean;
  /** From the server's provider list; undefined when unknown. */
  configured: boolean | undefined;
  accounts: AdAccount[];
  canManage: boolean;
  now: number;
  connectState: { pending: boolean; redirecting: boolean; error: Error | null };
  discoveringId: string | undefined;
  syncingId: string | undefined;
  highlightId: string | null;
}

function plural(label: string) {
  return label.endsWith("s") ? label : `${label}s`;
}

function overallStatus(statuses: (IntegrationStatus | null | undefined)[]): IntegrationStatus | null {
  if (statuses.includes("active")) return "active";
  if (statuses.includes("needs_reauth")) return "needs_reauth";
  if (statuses.includes("disconnected")) return "disconnected";
  return null;
}

const OVERALL_PILL: Record<IntegrationStatus, { tone: "success" | "warning" | "muted"; label: string }> = {
  active: { tone: "success", label: "Connected" },
  needs_reauth: { tone: "warning", label: "Needs reconnection" },
  disconnected: { tone: "muted", label: "Disconnected" },
};

function connectErrorMessage(err: Error, providerName: string) {
  if (isApiError(err)) {
    if (err.code === "provider_not_configured") return `${providerName} isn't configured on this server yet.`;
    if (err.status === 403) return `Only owners and admins can connect ${providerName}.`;
    if (err.status === 404) return `Connecting ${providerName} isn't available on this server yet.`;
  }
  return `Couldn't start connecting ${providerName}. ${err.message}`;
}

export function ProviderCard(props: ProviderCardProps) {
  const { provider, labels, integrations, integrationsKnown, configured, accounts, canManage, connectState, onConnect } =
    props;
  const meta = PROVIDERS[provider];
  const l = labels ?? FALLBACK_LABELS[provider];
  const notConfigured = configured === false;
  const status = integrationsKnown
    ? overallStatus(integrations.map((i) => i.status))
    : overallStatus(accounts.map((a) => a.integration_status));
  const hasLiveConnection = status === "active" || status === "needs_reauth";
  const busy = connectState.pending || connectState.redirecting;

  // Group accounts under their integration; anything unmatched goes in a trailing group.
  const shownIntegrations = integrationsKnown
    ? integrations.filter((i) => i.status !== "disconnected" || accounts.some((a) => a.integration_id === i.id))
    : [];
  const knownIds = new Set(shownIntegrations.map((i) => i.id));
  const orphanAccounts = accounts.filter((a) => !a.integration_id || !knownIds.has(a.integration_id));

  return (
    <article
      aria-labelledby={`${provider}-heading`}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl font-display text-lg font-bold",
            meta.tone,
          )}
        >
          {meta.monogram}
        </span>
        <div className="min-w-[12rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${provider}-heading`} className="font-display text-lg font-semibold text-fg">
              {meta.name}
            </h2>
            <StatusPill tone={status ? OVERALL_PILL[status].tone : "muted"}>
              {status ? OVERALL_PILL[status].label : "Not connected"}
            </StatusPill>
          </div>
          <p className="mt-1 text-sm text-fg-muted">{meta.description}</p>
        </div>
        {canManage && !hasLiveConnection && (
          <div className="flex w-full shrink-0 flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
            <Button onClick={onConnect} disabled={busy || notConfigured}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plug aria-hidden="true" />}
              {connectState.redirecting ? "Redirecting…" : `Connect ${meta.name}`}
            </Button>
            {notConfigured && <p className="text-xs text-fg-subtle">Not configured on this server</p>}
          </div>
        )}
      </div>

      {connectState.error && (
        <div
          role="alert"
          className="mx-5 mb-5 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2.5 text-sm text-warning-fg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{connectErrorMessage(connectState.error, meta.name)}</p>
        </div>
      )}

      {shownIntegrations.map((integ) => (
        <IntegrationSection
          key={integ.id}
          {...props}
          integration={integ}
          accounts={accounts.filter((a) => a.integration_id === integ.id)}
          accountLabel={l.account}
          notConfigured={notConfigured}
        />
      ))}

      {orphanAccounts.length > 0 && (
        <AccountsBlock
          title={shownIntegrations.length > 0 ? `Other ${plural(l.account).toLowerCase()}` : plural(l.account)}
          accounts={orphanAccounts}
          canManage={canManage}
          now={props.now}
          onToggleSync={props.onToggleSync}
          onReconnect={canManage && !notConfigured ? onConnect : undefined}
          bordered
        />
      )}
    </article>
  );
}

function AccountsBlock({
  title,
  accounts,
  canManage,
  now,
  onToggleSync,
  onReconnect,
  bordered = false,
}: {
  title: string;
  accounts: AdAccount[];
  canManage: boolean;
  now: number;
  onToggleSync: ProviderCardActions["onToggleSync"];
  onReconnect?: () => void;
  bordered?: boolean;
}) {
  const syncing = accounts.filter((a) => a.sync_enabled).length;
  return (
    <div className={cn(bordered && "border-t border-border")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
        <h3 className="text-sm font-medium text-fg">
          {title}{" "}
          <span className="font-normal text-fg-subtle">
            · {accounts.length} total, {syncing} syncing
          </span>
        </h3>
        <p className="text-xs text-fg-subtle">Syncing starts once enabled.</p>
      </div>
      <ul className="divide-y divide-border">
        {accounts.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            canManage={canManage}
            now={now}
            onToggle={(enabled) => onToggleSync(a.id, a.name, enabled)}
            onReconnect={onReconnect}
          />
        ))}
      </ul>
    </div>
  );
}

function IntegrationSection({
  orgId,
  provider,
  integration: integ,
  accounts,
  accountLabel,
  canManage,
  now,
  notConfigured,
  connectState,
  discoveringId,
  syncingId,
  highlightId,
  onConnect,
  onDiscover,
  onSyncNow,
  onDisconnect,
  onToggleSync,
}: ProviderCardProps & {
  integration: Integration;
  accountLabel: string;
  notConfigured: boolean;
}) {
  const meta = PROVIDERS[provider];
  const ref = useRef<HTMLElement>(null);
  const highlighted = highlightId === integ.id;
  const needsReauth = integ.status === "needs_reauth";
  const disconnected = integ.status === "disconnected";
  const syncEnabledCount = accounts.length
    ? accounts.filter((a) => a.sync_enabled).length
    : (integ.sync_enabled_count ?? 0);
  const busyConnect = connectState.pending || connectState.redirecting;
  const name = integ.display_name || `${meta.name} connection`;
  const progress = useSyncProgress(orgId, integ.id, !disconnected).data;
  const syncActive = isSyncActive(progress?.state);
  const starting = syncingId === integ.id;

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <section
      ref={ref}
      aria-label={name}
      className={cn(
        "border-t border-border pb-1 transition-colors duration-700",
        highlighted && "bg-accent/50 ring-2 ring-primary ring-inset",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4">
        <div className="min-w-[12rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-fg">{name}</p>
            {needsReauth && <StatusPill tone="warning">Access expired</StatusPill>}
            {disconnected && <StatusPill tone="muted">Disconnected</StatusPill>}
          </div>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Connected {formatDate(integ.created_at)}
            {integ.last_discovered_at && ` · accounts refreshed ${timeAgo(integ.last_discovered_at, now)}`}
          </p>
          {integ.last_error && <p className="mt-1 text-xs text-danger-fg">Last error: {integ.last_error}</p>}
        </div>

        {canManage && !disconnected && (
          <div className="flex flex-wrap items-center gap-1.5">
            {needsReauth ? (
              <Button size="sm" onClick={onConnect} disabled={busyConnect || notConfigured}>
                {busyConnect ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plug aria-hidden="true" />}
                Reconnect
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSyncNow(integ)}
                disabled={syncEnabledCount === 0 || starting || syncActive}
                title={syncEnabledCount === 0 ? "Turn on sync for at least one account first" : undefined}
              >
                {starting || syncActive ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Zap aria-hidden="true" />
                )}
                {syncActive ? "Syncing…" : "Sync now"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDiscover(integ)}
              disabled={discoveringId === integ.id || notConfigured}
            >
              <RefreshCw className={cn(discoveringId === integ.id && "animate-spin")} aria-hidden="true" />
              Refresh accounts
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${name}`}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => onDisconnect(integ)}>
                  <Unplug aria-hidden="true" /> Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {progress && progress.state !== "idle" && <SyncProgressBar progress={progress} now={now} />}
      {canManage && notConfigured && !disconnected && (
        <p className="px-5 pt-2 text-xs text-fg-subtle">
          Not configured on this server, so refreshing accounts and reconnecting are unavailable.
        </p>
      )}

      {highlighted && (
        <p className="mx-5 mt-3 flex items-start gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-fg">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          Turn on sync for the {plural(accountLabel).toLowerCase()} you want. Syncing starts once enabled.
        </p>
      )}

      {accounts.length === 0 ? (
        <p className="px-5 pt-3 pb-4 text-sm text-fg-muted">
          No {plural(accountLabel).toLowerCase()} found for this connection yet.
          {canManage && !disconnected && !notConfigured && " Use Refresh accounts to look again."}
        </p>
      ) : (
        <AccountsBlock
          title={plural(accountLabel)}
          accounts={accounts}
          canManage={canManage}
          now={now}
          onToggleSync={onToggleSync}
          onReconnect={canManage && !notConfigured ? onConnect : undefined}
        />
      )}
    </section>
  );
}

function SyncProgressBar({ progress: p, now }: { progress: SyncProgress; now: number }) {
  const active = isSyncActive(p.state);
  const failed = p.entities_failed + p.metrics_failed;
  // A finished sync stays visible for a few minutes, then gets out of the way.
  if (!active && p.updated_at && now - new Date(p.updated_at).getTime() > 5 * 60_000) return null;

  const label =
    p.state === "queued"
      ? "Waiting to start…"
      : p.state === "running"
        ? p.entities_done + p.entities_failed < p.accounts_total
          ? `Syncing campaigns · ${p.entities_done + p.entities_failed} of ${p.accounts_total} accounts`
          : `Syncing performance data · ${p.metrics_done + p.metrics_failed} of ${p.metrics_total} reports`
        : p.state === "done"
          ? failed > 0
            ? `Synced with ${failed} ${failed === 1 ? "error" : "errors"}`
            : "Sync complete"
          : "Sync failed";

  return (
    <div className="px-5 pt-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={cn("text-fg-muted", p.state === "failed" && "text-danger-fg")}>{label}</span>
        {p.state !== "failed" && <span className="font-mono text-fg-subtle tabular-nums">{p.percent}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label="Sync progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-subtle"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            p.state === "failed" ? "bg-danger" : p.state === "done" && failed === 0 ? "bg-success" : "bg-primary",
            p.state === "queued" && "w-1/4 animate-pulse",
          )}
          style={p.state === "queued" ? undefined : { width: `${Math.max(p.percent, 3)}%` }}
        />
      </div>
      {p.error && (active || failed > 0 || p.state === "failed") && (
        <p className="mt-1 truncate text-xs text-danger-fg" title={p.error}>
          {p.error}
        </p>
      )}
    </div>
  );
}
