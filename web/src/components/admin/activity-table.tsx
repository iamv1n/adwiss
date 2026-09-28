"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyRow, JsonBlock, When } from "@/components/admin/ui";
import type { AdminActivity } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "integration.accounts_discovered" → ["Integration", "accounts discovered"]. */
export function describeAction(action: string): [string, string] {
  const [area, ...rest] = action.split(".");
  const verb = rest.join(" ").replaceAll("_", " ");
  return [area.charAt(0).toUpperCase() + area.slice(1), verb || area];
}

export function ActivityTable({
  rows,
  showOrg = true,
  empty = "No activity yet.",
}: {
  rows: AdminActivity[];
  showOrg?: boolean;
  empty?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return <EmptyRow>{empty}</EmptyRow>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8 pl-3" />
          <TableHead className="w-32">When</TableHead>
          <TableHead>Event</TableHead>
          <TableHead className="hidden md:table-cell">Actor</TableHead>
          {showOrg && <TableHead className="hidden lg:table-cell">Organization</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => {
          const [area, verb] = describeAction(a.action);
          const impersonated = typeof a.metadata?.impersonated_by === "string";
          const isOpen = open === a.id;
          return (
            <Fragment key={a.id}>
              <TableRow className={cn(isOpen && "bg-bg-subtle")}>
                <TableCell className="pl-3">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setOpen(isOpen ? null : a.id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? "Hide details" : "Show details"}
                  >
                    <ChevronRight className={cn("transition-transform", isOpen && "rotate-90")} aria-hidden="true" />
                  </Button>
                </TableCell>
                <TableCell className="text-fg-muted">
                  <When at={a.created_at} />
                </TableCell>
                <TableCell>
                  <span className="text-fg-muted">{area}</span> <span className="font-medium text-fg">{verb}</span>
                  {impersonated && (
                    <Badge variant="outline" className="ml-2 border-warning text-warning-fg">
                      by admin as user
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-56 truncate md:table-cell">
                  {a.actor_id ? (
                    <Link href={`/admin/users/${a.actor_id}`} className="text-fg hover:underline">
                      {a.actor_email ?? a.actor_name}
                    </Link>
                  ) : (
                    <span className="text-fg-subtle">System</span>
                  )}
                </TableCell>
                {showOrg && (
                  <TableCell className="hidden max-w-48 truncate lg:table-cell">
                    {a.organization_id ? (
                      <Link href={`/admin/organizations/${a.organization_id}`} className="text-fg hover:underline">
                        {a.organization_name}
                      </Link>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
              {isOpen && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={showOrg ? 5 : 4} className="bg-bg-subtle px-5 pb-4 whitespace-normal">
                    <p className="mb-2 text-xs text-fg-muted">
                      {a.action} · {a.entity_type} <span className="font-mono">{a.entity_id}</span>
                    </p>
                    <JsonBlock value={a.metadata} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
