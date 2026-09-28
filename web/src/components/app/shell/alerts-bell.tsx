"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertOctagon, AlertTriangle, Bell, CheckCheck, Info, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useUnreadAlertCount,
  type Alert,
  type AlertSeverity,
} from "@/lib/alerts-api";
import { useActiveOrg } from "@/lib/queries";
import { cn, timeAgo } from "@/lib/utils";

const SEVERITY: Record<AlertSeverity, { icon: typeof Info; className: string; label: string }> = {
  critical: { icon: AlertOctagon, className: "text-danger-fg", label: "Critical" },
  warning: { icon: AlertTriangle, className: "text-warning-fg", label: "Warning" },
  info: { icon: Info, className: "text-info-fg", label: "Info" },
};

/**
 * Header bell: unread count (polled every minute) and a popover with the
 * latest alerts. Opening an alert marks it read and navigates to its page.
 */
export function AlertsBell() {
  const orgId = useActiveOrg()?.id;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnreadAlertCount(orgId).data ?? 0;
  const list = useAlerts(orgId, { limit: 20 }, open);
  const markRead = useMarkAlertRead(orgId);
  const markAll = useMarkAllAlertsRead(orgId);

  if (!orgId) return null;

  const alerts = list.data?.alerts ?? [];
  const badge = unread > 99 ? "99+" : String(unread);

  function openAlert(a: Alert) {
    if (!a.read_at) markRead.mutate(a.id);
    setOpen(false);
    router.push(a.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-fg-muted"
          aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
        >
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-white tabular-nums"
            >
              {badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium text-fg">Alerts</p>
            <p className="text-xs text-fg-subtle">{unread ? `${unread} unread` : "You're all caught up"}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!unread || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck aria-hidden="true" />
            Mark all read
          </Button>
        </div>
        <div className="max-h-[min(24rem,60dvh)] overflow-y-auto">
          {list.isPending ? (
            <p className="px-4 py-6 text-center text-sm text-fg-subtle">Loading…</p>
          ) : list.isError ? (
            <p className="px-4 py-6 text-center text-sm text-danger-fg">Couldn&apos;t load alerts.</p>
          ) : alerts.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="mx-auto size-6 text-fg-subtle" aria-hidden="true" />
              <p className="mt-2 text-sm text-fg">No alerts yet</p>
              <p className="mt-1 text-xs text-fg-subtle">
                We check hourly for spend spikes, ROAS drops, stalled campaigns and connection problems.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <AlertItem key={a.id} alert={a} onOpen={() => openAlert(a)} />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href="/app/settings/alerts"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Settings className="size-3.5" aria-hidden="true" />
            Alert email settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AlertItem({ alert: a, onOpen }: { alert: Alert; onOpen: () => void }) {
  const s = SEVERITY[a.severity] ?? SEVERITY.info;
  const Icon = s.icon;
  const unread = !a.read_at;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
          unread && "bg-primary/5",
        )}
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", s.className)} aria-label={s.label} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className={cn("text-sm text-fg", unread && "font-medium")}>{a.title}</span>
            {unread ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
          </span>
          {a.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-fg-muted">{a.body}</span> : null}
          <span className="mt-1 block text-[11px] text-fg-subtle">
            {timeAgo(a.created_at)}
            {a.resolved_at ? " · Resolved" : ""}
          </span>
        </span>
      </button>
    </li>
  );
}
