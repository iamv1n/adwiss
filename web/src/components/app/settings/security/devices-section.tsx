"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, LogOut, Monitor, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import type { KnownDevice } from "@/lib/api";
import { useRemoveDevice, useRevokeOtherSessions } from "@/lib/queries";
import { formatDate, timeAgo } from "@/lib/utils";
import { Panel } from "./shared";

const isMobile = (label: string) => /iphone|ipad|android|mobile|ios/i.test(label);

export function DevicesSection({ devices, sessionsCount }: { devices: KnownDevice[]; sessionsCount: number }) {
  const reduce = useReducedMotion();
  const removeDevice = useRemoveDevice();
  const revoke = useRevokeOtherSessions();
  const [toRemove, setToRemove] = useState<KnownDevice | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const sorted = [...devices].sort((a, b) => Number(b.current) - Number(a.current) || b.last_seen_at.localeCompare(a.last_seen_at));
  const others = Math.max(0, sessionsCount - 1);

  return (
    <div className="grid gap-4">
      <Panel>
        {sorted.length === 0 ? (
          <p className="p-5 text-sm text-fg-muted">No devices yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {sorted.map((d) => {
                const Icon = isMobile(d.label) ? Smartphone : Monitor;
                return (
                  <motion.li
                    key={d.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                    className="flex items-center gap-3 overflow-hidden p-4 sm:px-5"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-fg-muted">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-fg">
                        <span className="truncate">{d.label || "Unknown device"}</span>
                        {d.current && <Badge variant="secondary">This device</Badge>}
                        {d.trusted && (
                          <Badge variant="outline" className="border-success/30 bg-success-subtle text-success-fg">
                            Trusted
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-fg-muted">
                        <span className="font-mono">{d.last_ip || "—"}</span> ·{" "}
                        <time dateTime={d.last_seen_at} title={formatDate(d.last_seen_at, { dateStyle: "medium", timeStyle: "short" })}>
                          {d.current ? "Active now" : `Last seen ${timeAgo(d.last_seen_at)}`}
                        </time>
                      </p>
                    </div>
                    {!d.current && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-fg-muted"
                        aria-label={`Remove ${d.label || "device"}`}
                        onClick={() => setToRemove(d)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-muted">
          {others > 0
            ? `You're signed in on ${others} other session${others === 1 ? "" : "s"}.`
            : "This is your only active session."}
        </p>
        <Button variant="outline" size="sm" disabled={others === 0 || revoke.isPending} onClick={() => setRevokeOpen(true)}>
          {revoke.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          Sign out other sessions
        </Button>
      </div>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remove this device?"
        description={`${toRemove?.label || "This device"} will need a second check the next time it signs in.`}
        confirmLabel="Remove device"
        onConfirm={() => {
          if (!toRemove) return;
          removeDevice.mutate(toRemove.id, {
            onSuccess: () => toast.success("Device removed"),
            onError: (e) => toast.error("Couldn't remove device", { description: e.message }),
          });
          setToRemove(null);
        }}
      />
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Sign out other sessions?"
        description="Every other browser and device will be signed out. You'll stay signed in here."
        confirmLabel="Sign out others"
        onConfirm={() =>
          revoke.mutate(undefined, {
            onSuccess: ({ revoked }) =>
              toast.success(revoked ? `Signed out ${revoked} session${revoked === 1 ? "" : "s"}` : "No other sessions"),
            onError: (e) => toast.error("Couldn't sign out other sessions", { description: e.message }),
          })
        }
      />
    </div>
  );
}
