"use client";

import Link from "next/link";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { EmptyRow, ErrorRow, Pager, Panel, RowsSkeleton, SearchInput, When } from "@/components/admin/ui";
import type { AdminUser } from "@/lib/api";
import { PAGE_SIZE, useAdminUsers, useImpersonate } from "@/lib/admin-queries";
import { formatDate, initials } from "@/lib/utils";

export function UserIdentity({ user, href }: { user: Pick<AdminUser, "name" | "email" | "is_platform_admin">; href?: string }) {
  const name = user.name || user.email;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="bg-accent text-xs font-medium text-accent-fg">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-medium text-fg">
          {href ? (
            <Link href={href} className="truncate hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
          {user.is_platform_admin && <Badge className="text-[0.6875rem]">Admin</Badge>}
        </p>
        <p className="truncate text-xs text-fg-muted">{user.email}</p>
      </div>
    </div>
  );
}

/** "Log in as" button. Admins can't be impersonated, so it's hidden for them. */
export function ImpersonateButton({
  user,
  size = "sm",
}: {
  user: Pick<AdminUser, "id" | "email" | "is_platform_admin">;
  size?: "sm" | "default";
}) {
  const impersonate = useImpersonate();
  if (user.is_platform_admin) return null;
  return (
    <Button
      variant="outline"
      size={size}
      disabled={impersonate.isPending}
      onClick={() =>
        impersonate.mutate(user.id, {
          onError: (e) => toast.error(`Couldn't log in as ${user.email}`, { description: e.message }),
        })
      }
    >
      <LogIn aria-hidden="true" /> {impersonate.isPending ? "Switching…" : "Log in as"}
    </Button>
  );
}

export function UsersView() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const users = useAdminUsers(q, offset);

  return (
    <div className="grid gap-8">
      <PageHeader title="Users" description="Every account on this Adwise installation." />
      <Panel
        title="All users"
        description={users.data ? `${users.data.total} user${users.data.total === 1 ? "" : "s"}` : undefined}
        actions={
          <SearchInput
            label="Search users"
            placeholder="Search name or email"
            onChange={(v) => {
              setQ(v);
              setOffset(0);
            }}
          />
        }
      >
        {users.isPending ? (
          <RowsSkeleton rows={6} />
        ) : users.isError ? (
          <ErrorRow message={users.error.message} onRetry={() => users.refetch()} />
        ) : users.data.users.length === 0 ? (
          <EmptyRow>No users match “{q}”.</EmptyRow>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">User</TableHead>
                  <TableHead className="hidden w-20 text-right sm:table-cell">Orgs</TableHead>
                  <TableHead className="hidden w-32 md:table-cell">Last seen</TableHead>
                  <TableHead className="hidden w-32 lg:table-cell">Joined</TableHead>
                  <TableHead className="w-32 pr-5">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="max-w-0 pl-5">
                      <UserIdentity user={u} href={`/admin/users/${u.id}`} />
                    </TableCell>
                    <TableCell className="hidden text-right text-fg-muted tabular-nums sm:table-cell">{u.org_count}</TableCell>
                    <TableCell className="hidden text-fg-muted md:table-cell">
                      <When at={u.last_seen_at} />
                    </TableCell>
                    <TableCell className="hidden text-fg-muted lg:table-cell">{formatDate(u.created_at)}</TableCell>
                    <TableCell className="pr-5 text-right">
                      <ImpersonateButton user={u} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager offset={offset} pageSize={PAGE_SIZE} total={users.data.total} onChange={setOffset} />
          </>
        )}
      </Panel>
    </div>
  );
}
