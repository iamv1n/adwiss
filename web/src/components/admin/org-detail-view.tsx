"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/app/integrations/status-pill";
import { ActivityTable } from "@/components/admin/activity-table";
import { IntegrationsTable } from "@/components/admin/integrations-table";
import { EmptyRow, ErrorRow, FreshnessPill, Mono, Panel, ProviderName, StatTile } from "@/components/admin/ui";
import { ImpersonateButton, UserIdentity } from "@/components/admin/users-view";
import { useAdminOrg } from "@/lib/admin-queries";
import { formatDate } from "@/lib/utils";

export function OrgDetailView({ id }: { id: string }) {
  const q = useAdminOrg(id);

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-fg-muted">
      <Link href="/admin/organizations">
        <ArrowLeft aria-hidden="true" /> Organizations
      </Link>
    </Button>
  );

  if (q.isPending) {
    return (
      <div className="grid gap-6">
        {back}
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="grid gap-6">
        {back}
        <div className="rounded-2xl border border-border bg-surface">
          <ErrorRow message={q.error.message} onRetry={() => q.refetch()} />
        </div>
      </div>
    );
  }

  const { organization: org, members, integrations, accounts, activity } = q.data;

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        {back}
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{org.name}</h1>
          <p className="mt-1 text-fg-muted">
            {org.slug} · created {formatDate(org.created_at)} · <Mono>{org.id}</Mono>
          </p>
        </div>
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Members" value={org.members} />
        <StatTile
          label="Integrations"
          value={org.integrations}
          tone={org.integration_issues > 0 ? "warning" : undefined}
          hint={org.integration_issues > 0 ? `${org.integration_issues} need attention` : "All healthy"}
        />
        <StatTile label="Ad accounts" value={org.ad_accounts} />
        <StatTile label="Campaigns" value={org.campaigns} />
      </section>

      <Panel title="Integrations" description="Provider connections and their sync health">
        <IntegrationsTable rows={integrations} showOrg={false} />
      </Panel>

      <Panel title="Ad accounts" description="Imported accounts and how fresh each one's data is">
        {accounts.length === 0 ? (
          <EmptyRow>No ad accounts imported.</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Account</TableHead>
                <TableHead className="hidden w-32 md:table-cell">Provider</TableHead>
                <TableHead className="hidden w-24 text-right sm:table-cell">Campaigns</TableHead>
                <TableHead className="w-36">Oldest data</TableHead>
                <TableHead className="hidden w-24 pr-5 lg:table-cell">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-0 pl-5">
                    <p className="truncate font-medium text-fg">{a.name || a.external_id}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {a.external_id} · {a.currency}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <ProviderName provider={a.provider} />
                  </TableCell>
                  <TableCell className="hidden text-right text-fg-muted tabular-nums sm:table-cell">{a.campaigns}</TableCell>
                  <TableCell>
                    <FreshnessPill at={a.oldest_synced_at} enabled={a.sync_enabled} />
                  </TableCell>
                  <TableCell className="hidden pr-5 lg:table-cell">
                    <StatusPill tone={a.status === "active" ? "success" : "muted"}>
                      <span className="capitalize">{a.status}</span>
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title="Members">
        {members.length === 0 ? (
          <EmptyRow>No members.</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Member</TableHead>
                <TableHead className="w-24">Role</TableHead>
                <TableHead className="hidden w-32 sm:table-cell">Joined</TableHead>
                <TableHead className="w-32 pr-5">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="max-w-0 pl-5">
                    <UserIdentity user={m} href={`/admin/users/${m.id}`} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.role === "owner" ? "default" : "outline"} className="capitalize">
                      {m.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-fg-muted sm:table-cell">{formatDate(m.joined_at)}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <ImpersonateButton user={m} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title="Activity" description="Audit log for this organization">
        <ActivityTable rows={activity} showOrg={false} empty="No recorded activity." />
      </Panel>
    </div>
  );
}
