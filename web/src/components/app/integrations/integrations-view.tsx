"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Info, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { ProviderCard } from "@/components/app/integrations/provider-card";
import {
  PROVIDERS,
  PROVIDER_IDS,
  integrationErrorMessage,
  isProvider,
  oauthErrorToast,
} from "@/components/app/integrations/providers";
import { CloudSyncIllustration } from "@/components/app/illustrations";
import { isApiError, type Integration, type Provider } from "@/lib/api";
import {
  useActiveOrg,
  useAdAccounts,
  useConnectProvider,
  useDisconnectIntegration,
  useDiscoverAccounts,
  useIntegrations,
  useSetAccountSync,
  useSyncIntegration,
} from "@/lib/queries";

const HIGHLIGHT_MS = 15_000;

/**
 * Handles the OAuth callback redirect:
 *   ?connected={provider}&integration_id={uuid}&accounts={n}   (or discover_error=1)
 *   ?error={code}&provider={provider}
 * Shows a toast, strips the params, and returns the integration to highlight.
 */
function useOAuthReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef<string | null>(null);
  // The callback lands on a fresh page load, so the initial URL is enough.
  const [highlightId, setHighlightId] = useState<string | null>(() =>
    params.get("connected") ? params.get("integration_id") : null,
  );

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    const signature = params.toString();
    if (handled.current === signature) return;
    handled.current = signature;

    if (connected) {
      const name = isProvider(connected) ? PROVIDERS[connected].name : "Your ad platform";
      const count = Number(params.get("accounts"));
      if (params.get("discover_error") === "1") {
        toast.warning(`${name} connected, but accounts couldn't be loaded`, {
          description: "Use Refresh accounts to try again.",
        });
      } else {
        toast.success(`${name} connected`, {
          description: `${
            Number.isFinite(count) && params.has("accounts")
              ? `Found ${count} ${count === 1 ? "account" : "accounts"}. `
              : ""
          }Turn on sync for the accounts you want.`,
        });
      }
    } else if (error) {
      const provider = params.get("provider");
      const t = oauthErrorToast(error, isProvider(provider) ? provider : null);
      if (t.tone === "neutral") toast(t.title, { description: t.description });
      else toast.error(t.title, { description: t.description });
    }
    router.replace(pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [highlightId]);

  return highlightId;
}

export function IntegrationsView() {
  const highlightId = useOAuthReturn();
  const org = useActiveOrg();
  if (!org) return null;
  return (
    <IntegrationsForOrg
      key={org.id}
      orgId={org.id}
      canManage={org.role === "owner" || org.role === "admin"}
      highlightId={highlightId}
    />
  );
}

function IntegrationsForOrg({
  orgId,
  canManage,
  highlightId,
}: {
  orgId: string;
  canManage: boolean;
  highlightId: string | null;
}) {
  const integrations = useIntegrations(orgId);
  const accounts = useAdAccounts(orgId);
  const connect = useConnectProvider(orgId);
  const disconnect = useDisconnectIntegration(orgId);
  const discover = useDiscoverAccounts(orgId);
  const syncNow = useSyncIntegration(orgId);
  const setSync = useSetAccountSync(orgId);
  const [disconnecting, setDisconnecting] = useState<Integration | null>(null);

  // Live "x ago" labels without calling Date.now() during render.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  function onConnect(provider: Provider) {
    connect.mutate(provider);
  }

  function errorToast(title: string, err: Error, provider: Provider) {
    const reauth = isApiError(err) && err.code === "reauth_required";
    toast.error(title, {
      description: integrationErrorMessage(err, provider),
      action: reauth && canManage ? { label: "Reconnect", onClick: () => onConnect(provider) } : undefined,
    });
  }

  function onDiscover(integration: Integration) {
    discover.mutate(integration.id, {
      onSuccess: ({ accounts: found }) => {
        const n = found?.length ?? 0;
        toast.success(`${PROVIDERS[integration.provider].name} accounts refreshed`, {
          description: `${n} ${n === 1 ? "account" : "accounts"} available. New accounts start with sync off.`,
        });
      },
      onError: (e) => errorToast("Couldn't refresh accounts", e, integration.provider),
    });
  }

  function onSyncNow(integration: Integration) {
    syncNow.mutate(integration.id, {
      onSuccess: (res) => {
        const n = res.account_ids?.length ?? 0;
        if (res.already_queued) toast.info("A sync is already queued", { description: "It'll run shortly." });
        else
          toast.success("Sync queued", {
            description: `${n} ${n === 1 ? "account" : "accounts"} will sync shortly.`,
          });
      },
      onError: (e) => errorToast("Couldn't start sync", e, integration.provider),
    });
  }

  function onConfirmDisconnect() {
    const integ = disconnecting;
    if (!integ) return;
    disconnect.mutate(integ.id, {
      onSuccess: () =>
        toast.success(`${integ.display_name || PROVIDERS[integ.provider].name} disconnected`, {
          description: "Synced data is kept.",
        }),
      onError: (e) => errorToast("Couldn't disconnect", e, integ.provider),
    });
    setDisconnecting(null);
  }

  function onToggleSync(accountId: string, name: string, syncEnabled: boolean) {
    setSync.mutate(
      { accountId, syncEnabled },
      {
        onSuccess: () =>
          toast.success(syncEnabled ? `Sync on for ${name}` : `Sync off for ${name}`, {
            description: syncEnabled ? "Syncing starts shortly." : "Data that's already synced is kept.",
          }),
        onError: (e) => toast.error("Couldn't change sync", { description: e.message }),
      },
    );
  }

  const integrationsFailed = integrations.isError;
  const loading = accounts.isPending || integrations.isPending;
  const allIntegrations = integrations.data?.integrations ?? [];
  const availability = integrations.data?.providers ?? [];
  const allAccounts = accounts.data?.accounts ?? [];
  const nothingYet =
    !loading &&
    allAccounts.length === 0 &&
    allIntegrations.filter((i) => i.status !== "disconnected").length === 0;

  return (
    <div className="grid gap-8">
      <PageHeader title="Integrations" description="Connect your ad platforms, then choose which accounts to sync." />

      {!canManage && (
        <p className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-subtle px-3 py-2.5 text-sm text-fg-muted">
          <Lock className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          You have read-only access. Ask an owner or admin to connect platforms or change sync settings.
        </p>
      )}

      {integrationsFailed && (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-fg"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">Couldn&apos;t load connections. {integrations.error.message}</p>
          <Button variant="outline" size="xs" onClick={() => integrations.refetch()}>
            <RefreshCw aria-hidden="true" /> Retry
          </Button>
        </div>
      )}

      {accounts.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-fg"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">Couldn&apos;t load ad accounts. {accounts.error.message}</p>
          <Button variant="outline" size="xs" onClick={() => accounts.refetch()}>
            <RefreshCw aria-hidden="true" /> Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4" aria-busy="true" aria-label="Loading integrations">
          {PROVIDER_IDS.map((p) => (
            <Skeleton key={p} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6">
          {PROVIDER_IDS.map((p) => (
            <ProviderCard
              orgId={orgId}
              key={p}
              provider={p}
              labels={accounts.data?.labels?.[p]}
              integrations={allIntegrations.filter((i) => i.provider === p)}
              integrationsKnown={!integrationsFailed}
              configured={availability.find((a) => a.provider === p)?.configured}
              accounts={allAccounts.filter((a) => a.provider === p)}
              canManage={canManage}
              now={now}
              connectState={{
                pending: connect.isPending && connect.variables === p,
                redirecting: connect.isSuccess && connect.variables === p,
                error: connect.isError && connect.variables === p ? connect.error : null,
              }}
              discoveringId={discover.isPending ? discover.variables : undefined}
              syncingId={syncNow.isPending ? syncNow.variables : undefined}
              highlightId={highlightId}
              onConnect={() => onConnect(p)}
              onDiscover={onDiscover}
              onSyncNow={onSyncNow}
              onDisconnect={setDisconnecting}
              onToggleSync={onToggleSync}
            />
          ))}
        </div>
      )}

      {nothingYet && (
        <section className="grid items-center gap-6 rounded-2xl border border-dashed border-border-strong bg-bg-subtle/60 p-6 sm:grid-cols-[12rem_1fr] sm:p-8">
          <CloudSyncIllustration className="mx-auto h-auto w-40 sm:w-full" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-semibold text-fg">How connecting works</h2>
            <ol className="mt-3 grid gap-2 text-sm text-fg-muted">
              <li>1. Sign in with the platform and approve access.</li>
              <li>2. Your ad accounts appear here with sync turned off.</li>
              <li>3. Turn sync on for the accounts you want. Syncing starts once enabled.</li>
            </ol>
            <p className="mt-4 flex items-center gap-2 text-xs text-fg-subtle">
              <Info className="size-3.5" aria-hidden="true" />
              Adwise doesn&apos;t change anything in your ad accounts unless you set up an action or automation.
            </p>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!disconnecting}
        onOpenChange={(o) => !o && setDisconnecting(null)}
        title={`Disconnect ${
          disconnecting?.display_name || (disconnecting ? PROVIDERS[disconnecting.provider].name : "")
        }?`}
        description="Syncing stops for every account under this connection. Data that's already synced is kept, and you can reconnect later."
        confirmLabel="Disconnect"
        onConfirm={onConfirmDisconnect}
      />
    </div>
  );
}
