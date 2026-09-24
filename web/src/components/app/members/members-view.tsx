"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { InviteDialog } from "@/components/app/members/invite-dialog";
import { type Invitation, type Member, type Role } from "@/lib/api";
import {
  queryKeys,
  useActiveOrg,
  useInvitations,
  useMe,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMemberRole,
} from "@/lib/queries";
import { useActiveOrgStore } from "@/lib/stores/org";
import { formatDate, initials } from "@/lib/utils";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };

function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
          {description && <p className="text-sm text-fg-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-8 w-28" />
        </div>
      ))}
    </div>
  );
}

function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
      <p className="text-danger-fg">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw aria-hidden="true" /> Retry
      </Button>
    </div>
  );
}

export function MembersView() {
  const org = useActiveOrg();
  const { data: me } = useMe();
  if (!org || !me) return null;
  return <MembersForOrg key={org.id} orgId={org.id} orgName={org.name} myRole={org.role} myUserId={me.user.id} />;
}

function MembersForOrg({
  orgId,
  orgName,
  myRole,
  myUserId,
}: {
  orgId: string;
  orgName: string;
  myRole: Role;
  myUserId: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const setActiveOrg = useActiveOrgStore((s) => s.setActiveOrgId);
  const canManage = myRole === "owner" || myRole === "admin";
  const members = useMembers(orgId);
  const invitations = useInvitations(orgId, canManage);
  const updateRole = useUpdateMemberRole(orgId);
  const removeMember = useRemoveMember(orgId);
  const revoke = useRevokeInvitation(orgId);

  const [removing, setRemoving] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [now] = useState(Date.now);

  function canEditMember(m: Member) {
    if (!canManage || m.id === myUserId) return false;
    if (m.role === "owner" && myRole !== "owner") return false;
    return true;
  }

  function onRoleChange(m: Member, role: Role) {
    if (role === m.role) return;
    updateRole.mutate(
      { userId: m.id, role },
      {
        onSuccess: () => toast.success(`${m.name || m.email} is now ${ROLE_LABEL[role].toLowerCase()}.`),
        onError: (e) => toast.error("Couldn't change role", { description: e.message }),
      },
    );
  }

  function onConfirmRemove() {
    const m = removing;
    if (!m) return;
    const leaving = m.id === myUserId;
    removeMember.mutate(m.id, {
      onSuccess: async () => {
        if (leaving) {
          toast.success(`You left ${orgName}.`);
          setActiveOrg(null);
          await qc.invalidateQueries({ queryKey: queryKeys.me });
          router.replace("/app/dashboard");
        } else {
          toast.success(`${m.name || m.email} was removed.`);
        }
      },
      onError: (e) => toast.error(leaving ? "Couldn't leave organization" : "Couldn't remove member", { description: e.message }),
    });
    setRemoving(null);
  }

  function onConfirmRevoke() {
    const inv = revoking;
    if (!inv) return;
    revoke.mutate(inv.id, {
      onSuccess: () => toast.success(`Invitation to ${inv.email} revoked.`),
      onError: (e) => toast.error("Couldn't revoke invitation", { description: e.message }),
    });
    setRevoking(null);
  }

  const sortedMembers = [...(members.data ?? [])].sort((a, b) => {
    const rank = { owner: 0, admin: 1, member: 2 } as const;
    return rank[a.role] - rank[b.role] || (a.name || a.email).localeCompare(b.name || b.email);
  });

  return (
    <div className="grid gap-6">
      <Panel
        title="Members"
        description={
          members.data
            ? `${members.data.length} ${members.data.length === 1 ? "person has" : "people have"} access to ${orgName}.`
            : `People with access to ${orgName}.`
        }
        actions={canManage ? <InviteDialog orgId={orgId} orgName={orgName} canInviteOwner={myRole === "owner"} /> : undefined}
      >
        {members.isPending ? (
          <RowsSkeleton />
        ) : members.isError ? (
          <ErrorRow message={members.error.message} onRetry={() => members.refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Member</TableHead>
                <TableHead className="w-28 sm:w-44">Role</TableHead>
                <TableHead className="hidden w-36 sm:table-cell">Joined</TableHead>
                <TableHead className="w-12 pr-3 sm:pr-5">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.map((m) => {
                const isMe = m.id === myUserId;
                const editable = canEditMember(m);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-accent text-xs font-medium text-accent-fg">
                            {initials(m.name || m.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-medium text-fg">
                            {m.name || m.email}
                            {isMe && (
                              <Badge variant="secondary" className="text-[0.6875rem]">
                                You
                              </Badge>
                            )}
                          </p>
                          <p className="truncate text-xs text-fg-muted">{m.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => onRoleChange(m, v as Role)}
                          disabled={updateRole.isPending && updateRole.variables?.userId === m.id}
                        >
                          <SelectTrigger size="sm" className="w-28 sm:w-32" aria-label={`Role for ${m.name || m.email}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            {myRole === "owner" && <SelectItem value="owner">Owner</SelectItem>}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={m.role === "owner" ? "default" : "outline"}>{ROLE_LABEL[m.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-fg-muted sm:table-cell">{formatDate(m.joined_at)}</TableCell>
                    <TableCell className="pr-5 text-right">
                      {(editable || isMe) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name || m.email}`}>
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                              {isMe ? "Leave organization" : "Remove from organization"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      {canManage && (
        <Panel title="Pending invitations" description="Invitations that haven't been accepted yet.">
          {invitations.isPending ? (
            <RowsSkeleton rows={2} />
          ) : invitations.isError ? (
            <ErrorRow message={invitations.error.message} onRetry={() => invitations.refetch()} />
          ) : invitations.data.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-muted">No pending invitations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Email</TableHead>
                  <TableHead className="w-28">Role</TableHead>
                  <TableHead className="hidden w-36 md:table-cell">Sent</TableHead>
                  <TableHead className="hidden w-36 sm:table-cell">Expires</TableHead>
                  <TableHead className="w-24 pr-5">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.data.map((inv) => {
                  const expired = new Date(inv.expires_at).getTime() < now;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="max-w-0 truncate pl-5 font-medium text-fg">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ROLE_LABEL[inv.role]}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-fg-muted md:table-cell">{formatDate(inv.created_at)}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {expired ? (
                          <span className="text-warning-fg">Expired</span>
                        ) : (
                          <span className="text-fg-muted">{formatDate(inv.expires_at)}</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-fg hover:bg-danger-subtle hover:text-danger-fg"
                          onClick={() => setRevoking(inv)}
                          aria-label={`Revoke invitation for ${inv.email}`}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}

      {!canManage && (
        <p className="text-sm text-fg-muted">Only owners and admins can invite people or change roles.</p>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.id === myUserId ? `Leave ${orgName}?` : `Remove ${removing?.name || removing?.email}?`}
        description={
          removing?.id === myUserId
            ? "You'll lose access to this organization's data until someone invites you again."
            : "They'll immediately lose access to this organization. You can invite them again later."
        }
        confirmLabel={removing?.id === myUserId ? "Leave" : "Remove"}
        onConfirm={onConfirmRemove}
      />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke invitation?"
        description={`The link sent to ${revoking?.email ?? "this address"} will stop working.`}
        confirmLabel="Revoke"
        onConfirm={onConfirmRevoke}
      />
    </div>
  );
}
