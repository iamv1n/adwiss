"use client";

import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/integrations/status-pill";
import { EmptyRow, ErrorRow, FreshnessPill, Pager, Panel, RowsSkeleton, SearchInput } from "@/components/admin/ui";
import { PAGE_SIZE, useAdminOrgs } from "@/lib/admin-queries";
import { formatDate } from "@/lib/utils";

export function OrgsView() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const orgs = useAdminOrgs(q, offset);

  return (
    <div className="grid gap-8">
      <PageHeader title="Organizations" description="Every workspace, its connections and how fresh its data is." />
      <Panel
        title="All organizations"
        description={orgs.data ? `${orgs.data.total} organization${orgs.data.total === 1 ? "" : "s"}` : undefined}
        actions={
          <SearchInput
            label="Search organizations"
            placeholder="Search name or slug"
            onChange={(v) => {
              setQ(v);
              setOffset(0);
            }}
          />
        }
      >
        {orgs.isPending ? (
          <RowsSkeleton rows={6} />
        ) : orgs.isError ? (
          <ErrorRow message={orgs.error.message} onRetry={() => orgs.refetch()} />
        ) : orgs.data.organizations.length === 0 ? (
          <EmptyRow>No organizations match “{q}”.</EmptyRow>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Organization</TableHead>
                  <TableHead className="hidden w-24 text-right sm:table-cell">Members</TableHead>
                  <TableHead className="w-32">Integrations</TableHead>
                  <TableHead className="hidden w-32 text-right md:table-cell">Accounts · campaigns</TableHead>
                  <TableHead className="hidden w-36 lg:table-cell">Last sync</TableHead>
                  <TableHead className="hidden w-32 pr-5 xl:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.data.organizations.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="max-w-0 pl-5">
                      <Link href={`/admin/organizations/${o.id}`} className="block truncate font-medium text-fg hover:underline">
                        {o.name}
                      </Link>
                      <p className="truncate text-xs text-fg-muted">{o.slug}</p>
                    </TableCell>
                    <TableCell className="hidden text-right text-fg-muted tabular-nums sm:table-cell">{o.members}</TableCell>
                    <TableCell>
                      {o.integrations === 0 ? (
                        <span className="text-fg-subtle">None</span>
                      ) : o.integration_issues > 0 ? (
                        <StatusPill tone="warning">
                          {o.integration_issues} of {o.integrations} need attention
                        </StatusPill>
                      ) : (
                        <StatusPill tone="success">{o.integrations} healthy</StatusPill>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right text-fg-muted tabular-nums md:table-cell">
                      {o.ad_accounts} · {o.campaigns}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {o.ad_accounts === 0 ? <span className="text-fg-subtle">—</span> : <FreshnessPill at={o.last_synced_at} />}
                    </TableCell>
                    <TableCell className="hidden pr-5 text-fg-muted xl:table-cell">{formatDate(o.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager offset={offset} pageSize={PAGE_SIZE} total={orgs.data.total} onChange={setOffset} />
          </>
        )}
      </Panel>
    </div>
  );
}
