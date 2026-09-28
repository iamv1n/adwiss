"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyRow, FreshnessPill, IntegrationPill, ProviderName, When } from "@/components/admin/ui";
import type { AdminIntegration } from "@/lib/api";
import { useSyncIntegration } from "@/lib/admin-queries";

export function IntegrationsTable({ rows, showOrg = true }: { rows: AdminIntegration[]; showOrg?: boolean }) {
  const sync = useSyncIntegration();
  if (rows.length === 0) return <EmptyRow>No integrations.</EmptyRow>;

  function onSync(i: AdminIntegration) {
    sync.mutate(
      { id: i.id },
      {
        onSuccess: (r) =>
          toast.success(r.already_queued ? "A sync is already queued for this integration." : "Sync queued.", {
            description: `${r.account_ids.length} ad account${r.account_ids.length === 1 ? "" : "s"} will sync.`,
          }),
        onError: (e) => toast.error("Couldn't start sync", { description: e.message }),
      },
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-5">Integration</TableHead>
          {showOrg && <TableHead className="hidden md:table-cell">Organization</TableHead>}
          <TableHead className="w-32">Status</TableHead>
          <TableHead className="hidden w-28 text-right sm:table-cell">Syncing</TableHead>
          <TableHead className="hidden w-36 lg:table-cell">Last sync</TableHead>
          <TableHead className="w-28 pr-5">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((i) => (
          <TableRow key={i.id} className="align-top">
            <TableCell className="max-w-0 pl-5">
              <ProviderName provider={i.provider} />
              <p className="truncate text-xs text-fg-muted" title={i.display_name}>
                {i.display_name} · connected <When at={i.created_at} />
              </p>
              {i.last_error && (
                <p className="mt-1 line-clamp-2 text-xs break-words whitespace-normal text-danger-fg" title={i.last_error}>
                  {i.last_error}
                </p>
              )}
            </TableCell>
            {showOrg && (
              <TableCell className="hidden max-w-48 truncate md:table-cell">
                <Link href={`/admin/organizations/${i.organization_id}`} className="text-fg hover:underline">
                  {i.organization_name}
                </Link>
              </TableCell>
            )}
            <TableCell>
              <IntegrationPill status={i.status} lastError={i.last_error} />
            </TableCell>
            <TableCell className="hidden text-right text-fg-muted tabular-nums sm:table-cell">
              {i.sync_enabled} / {i.accounts}
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              {i.status === "disconnected" ? (
                <span className="text-fg-subtle">—</span>
              ) : (
                <FreshnessPill at={i.last_synced_at} enabled={i.sync_enabled > 0} />
              )}
            </TableCell>
            <TableCell className="pr-5 text-right">
              {i.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={sync.isPending && sync.variables?.id === i.id}
                  onClick={() => onSync(i)}
                >
                  <RefreshCw aria-hidden="true" /> Sync now
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
