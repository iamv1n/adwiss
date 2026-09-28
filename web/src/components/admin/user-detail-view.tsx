"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ActivityTable } from "@/components/admin/activity-table";
import { EmptyRow, ErrorRow, Mono, Panel, StatTile, When } from "@/components/admin/ui";
import { ImpersonateButton, UserIdentity } from "@/components/admin/users-view";
import { useAdminUser, useRevokeSessions } from "@/lib/admin-queries";
import { useMe } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

/** "Mozilla/5.0 (Macintosh…) … Chrome/140…" → "Chrome on macOS". Good enough for a glance. */
function describeAgent(ua: string): string {
  if (!ua) return "Unknown client";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl/i.test(ua) ? "curl" : "Browser";
  const os = /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function UserDetailView({ id }: { id: string }) {
  const q = useAdminUser(id);
  const me = useMe();
  const revoke = useRevokeSessions();
  const [confirming, setConfirming] = useState(false);

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-fg-muted">
      <Link href="/admin/users">
        <ArrowLeft aria-hidden="true" /> Users
      </Link>
    </Button>
  );

  if (q.isPending) {
    return (
      <div className="grid gap-6">
        {back}
        <Skeleton className="h-12 w-72" />
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

  const { user, organizations, sessions, activity } = q.data;
  const isMe = me.data?.user.id === user.id;

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        {back}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="[&_p:first-child]:text-lg">
            <UserIdentity user={user} />
          </div>
          <div className="flex flex-wrap gap-2">
            <ImpersonateButton user={user} />
            {!isMe && (
              <Button variant="outline" size="sm" disabled={sessions.length === 0 || revoke.isPending} onClick={() => setConfirming(true)}>
                <LogOut aria-hidden="true" /> Sign out everywhere
              </Button>
            )}
          </div>
        </div>
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Organizations" value={organizations.length} />
        <StatTile label="Active sessions" value={sessions.length} />
        <StatTile label="Last seen" value={<When at={user.last_seen_at} />} />
        <StatTile label="Joined" value={formatDate(user.created_at)} hint={<Mono>{user.id}</Mono>} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Organizations" description="Where this user is a member">
          {organizations.length === 0 ? (
            <EmptyRow>Not a member of any organization.</EmptyRow>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Organization</TableHead>
                  <TableHead className="w-24">Role</TableHead>
                  <TableHead className="hidden w-32 sm:table-cell">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((o) => (
                  <TableRow key={o.organization_id}>
                    <TableCell className="max-w-0 truncate pl-5">
                      <Link href={`/admin/organizations/${o.organization_id}`} className="font-medium text-fg hover:underline">
                        {o.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.role === "owner" ? "default" : "outline"} className="capitalize">
                        {o.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-fg-muted sm:table-cell">{formatDate(o.joined_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel title="Active sessions" description="Signed-in devices, including admin impersonations">
          {sessions.length === 0 ? (
            <EmptyRow>No active sessions.</EmptyRow>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Device</TableHead>
                  <TableHead className="w-32">Last active</TableHead>
                  <TableHead className="hidden w-32 sm:table-cell">Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-0 pl-5">
                      <p className="truncate font-medium text-fg" title={s.user_agent}>
                        {describeAgent(s.user_agent)}
                      </p>
                      <p className="truncate text-xs text-fg-muted">
                        {s.ip_address || "unknown IP"}
                        {s.impersonator_email && <span className="text-warning-fg"> · admin {s.impersonator_email}</span>}
                      </p>
                    </TableCell>
                    <TableCell className="text-fg-muted">
                      <When at={s.last_seen_at} />
                    </TableCell>
                    <TableCell className="hidden text-fg-muted sm:table-cell">
                      <When at={s.expires_at} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      <Panel title="Activity" description="What this user did, and admin actions taken on them">
        <ActivityTable rows={activity} empty="No recorded activity." />
      </Panel>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Sign ${user.email} out everywhere?`}
        description={`Ends all ${sessions.length} active session${sessions.length === 1 ? "" : "s"}, including any admin impersonations. They'll need to log in again.`}
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={() => {
          setConfirming(false);
          revoke.mutate(user.id, {
            onSuccess: (r) => toast.success(`Ended ${r.revoked} session${r.revoked === 1 ? "" : "s"}.`),
            onError: (e) => toast.error("Couldn't sign the user out", { description: e.message }),
          });
        }}
      />
    </div>
  );
}
