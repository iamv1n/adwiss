"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, MoreHorizontal, Pencil, Play, Radio, Trash2, FlaskConical, List } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { StatusPill } from "@/components/app/integrations/status-pill";
import { ErrorState, errorMessage } from "@/components/app/analytics/states";
import { isNotLive } from "@/components/app/actions/action-bits";
import {
  useDeleteSchedule,
  useRunSchedule,
  useSaveSchedule,
  useSchedules,
  type Schedule,
} from "@/lib/automation-api";
import { cn, timeAgo } from "@/lib/utils";
import { cellClass, valueLabel } from "./grid";

function whenLocal(iso: string, tz: string | undefined) {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(
      new Date(iso),
    );
  } catch {
    return new Date(iso).toLocaleString();
  }
}

type Pending =
  | { kind: "live"; s: Schedule }
  | { kind: "enable-live"; s: Schedule }
  | { kind: "run-live"; s: Schedule }
  | { kind: "delete"; s: Schedule };

/** Mini 7×24 thumbnail of a schedule's grid. */
function GridThumb({ grid }: { grid: number[][] }) {
  return (
    <div aria-hidden="true" className="grid w-24 shrink-0 grid-cols-24 gap-px">
      {grid.flatMap((row, d) => row.map((v, h) => <span key={`${d}-${h}`} className={cn("h-[3px]", cellClass(v))} />))}
    </div>
  );
}

export function SchedulesTable({
  orgId,
  manage,
  onEdit,
  onDuplicate,
  onHover,
}: {
  orgId: string | undefined;
  manage: boolean;
  onEdit: (s: Schedule) => void;
  onDuplicate: (s: Schedule) => void;
  onHover?: (s: Schedule | null) => void;
}) {
  const q = useSchedules(orgId);
  const save = useSaveSchedule(orgId);
  const run = useRunSchedule(orgId);
  const del = useDeleteSchedule(orgId);
  const [pending, setPending] = useState<Pending | null>(null);
  const list = q.data?.schedules ?? [];
  const notLive = isNotLive(q.error);

  const patch = (s: Schedule, body: Partial<Pick<Schedule, "enabled" | "dry_run">>, msg: string) =>
    save.mutate({ id: s.id, body }, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e)) });

  const doRun = (s: Schedule) =>
    run.mutate(s.id, {
      onSuccess: (r) => {
        const failed = r.actions.filter((a) => a.status === "failed");
        if (failed.length) toast.error(`${failed.length} change(s) failed: ${failed[0].error}`);
        else if (s.dry_run) toast.success(r.recorded ? `Recorded ${r.recorded} dry-run change(s)` : "Nothing to change this hour");
        else toast.success(r.actions.length ? `Applied ${r.actions.length} change(s)` : "Already in this hour's state");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <section aria-labelledby="schedules-h" className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 id="schedules-h" className="text-sm font-semibold text-fg">
          Schedules
        </h2>
        <span className="text-xs text-fg-subtle">Checked every 5 minutes · dry runs are logged in Actions</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="bg-bg-subtle text-left text-xs text-fg-muted">
            <tr className="[&>th]:h-8 [&>th]:px-3 [&>th]:font-medium">
              <th className="w-14">On</th>
              <th>Schedule</th>
              <th className="w-56">Targets</th>
              <th className="w-24">Mode</th>
              <th className="w-28">Now</th>
              <th className="w-64">Next change</th>
              <th className="w-28">Last run</th>
              <th className="w-20 text-right">Changes</th>
              <th className="w-10" aria-label="Menu" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              Array.from({ length: 3 }, (_, i) => (
                <tr key={i} className="h-10 border-t border-border">
                  <td colSpan={9} className="px-3">
                    <div className="h-3 animate-pulse rounded bg-bg-subtle" />
                  </td>
                </tr>
              ))
            ) : notLive ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-fg-muted">
                  Schedules are coming online.
                </td>
              </tr>
            ) : q.error ? (
              <tr>
                <td colSpan={9} className="p-3">
                  <ErrorState error={q.error} onRetry={() => q.refetch()} />
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-fg-muted">
                  No schedules yet.{manage ? " Create one to pause campaigns in weak hours or boost budgets in strong ones." : ""}
                </td>
              </tr>
            ) : (
              list.map((s) => {
                const tz = s.timezone ?? s.targets[0]?.timezone;
                const names = s.targets.map((t) => t.name);
                return (
                  <tr
                    key={s.id}
                    className="h-11 border-t border-border hover:bg-bg-subtle/60 [&>td]:px-3"
                    onMouseEnter={() => onHover?.(s)}
                    onMouseLeave={() => onHover?.(null)}
                  >
                    <td>
                      <Switch
                        checked={s.enabled}
                        disabled={!manage || save.isPending}
                        aria-label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
                        onCheckedChange={(v) =>
                          v && !s.dry_run ? setPending({ kind: "enable-live", s }) : patch(s, { enabled: v }, `${s.name} ${v ? "enabled" : "disabled"}`)
                        }
                      />
                    </td>
                    <td className="max-w-0">
                      <button type="button" onClick={() => onEdit(s)} className="flex w-full min-w-0 items-center gap-3 text-left">
                        <GridThumb grid={s.grid} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-fg hover:underline">{s.name}</span>
                          <span className="block truncate text-xs text-fg-subtle">{tz ?? "account time"}</span>
                        </span>
                      </button>
                    </td>
                    <td className="max-w-56 text-xs">
                      <span className="block truncate text-fg" title={names.join(", ")}>
                        {s.targets.length} {s.level === "campaign" ? "campaign" : "ad set"}
                        {s.targets.length === 1 ? "" : "s"}
                      </span>
                      <span className="block truncate text-fg-subtle">{names.slice(0, 2).join(", ") || "none selected"}</span>
                    </td>
                    <td>{s.dry_run ? <StatusPill tone="info">Dry run</StatusPill> : <StatusPill tone="warning">Live</StatusPill>}</td>
                    <td className="text-xs whitespace-nowrap">
                      {s.value_now != null ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true" className={cn("size-3 rounded-[2px]", cellClass(s.value_now))} />
                          {valueLabel(s.value_now)}
                        </span>
                      ) : (
                        "—"
                      )}
                      {s.enabled && s.pending_now > 0 && s.dry_run ? (
                        <span className="ml-1.5 text-fg-subtle" title={`${s.pending_now} change(s) this hour, recorded as dry runs`}>
                          · {s.pending_now} dry
                        </span>
                      ) : null}
                    </td>
                    <td className="text-xs">
                      {s.next_change ? (
                        <>
                          <span className="font-medium text-fg tabular-nums">{whenLocal(s.next_change.at, tz)}</span>
                          <span className="block truncate text-fg-muted">{s.next_change.summary}</span>
                        </>
                      ) : (
                        <span className="text-fg-subtle">No change in 48 h</span>
                      )}
                    </td>
                    <td className="text-xs text-fg-muted tabular-nums">
                      {s.last_evaluated_at ? timeAgo(s.last_evaluated_at) : s.enabled ? "Waiting" : "Never"}
                    </td>
                    <td className="text-right tabular-nums">
                      <Link href={`/app/actions?source_id=${s.id}`} className={cn("hover:underline", s.changes_total ? "text-fg" : "text-fg-subtle")}>
                        {s.changes_total}
                      </Link>
                    </td>
                    <td>
                      {manage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-xs" variant="ghost" aria-label={`Actions for ${s.name}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onSelect={() => onEdit(s)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onDuplicate(s)}>
                              <Copy /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setPending({ kind: "run-live", s })}
                            >
                              <Play /> Run now{s.dry_run ? " (dry run)" : ""}
                            </DropdownMenuItem>
                            {s.dry_run ? (
                              <DropdownMenuItem onSelect={() => setPending({ kind: "live", s })}>
                                <Radio /> Switch to live
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => patch(s, { dry_run: true }, `${s.name} is back in dry run`)}>
                                <FlaskConical /> Switch to dry run
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                              <Link href={`/app/actions?source_id=${s.id}`}>
                                <List /> View actions
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: "delete", s })}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={
          pending?.kind === "delete"
            ? "Delete this schedule?"
            : pending?.kind === "run-live"
              ? pending.s.dry_run
                ? "Run this hour in dry run?"
                : "Apply this hour now?"
              : "Switch this schedule to live?"
        }
        description={
          !pending ? null : pending.kind === "delete" ? (
            <>“{pending.s.name}” stops running. Targets keep their current state (a paused campaign stays paused), and past actions stay in the log.</>
          ) : pending.kind === "run-live" ? (
            pending.s.dry_run ? (
              <>Records what “{pending.s.name}” would change this hour as dry-run actions. Nothing is sent to Meta or Google.</>
            ) : (
              <>
                Applies this hour’s state of “{pending.s.name}” to its {pending.s.targets.length} targets on Meta or Google right now
                {pending.s.pending_now ? ` (${pending.s.pending_now} change${pending.s.pending_now === 1 ? "" : "s"})` : ""}.
              </>
            )
          ) : (
            <>
              “{pending.s.name}” will change {pending.s.targets.length} {pending.s.level === "campaign" ? "campaign" : "ad set"}
              {pending.s.targets.length === 1 ? "" : "s"} on Meta or Google as its painted blocks start: pausing in off hours, re-activating what it
              paused and scaling daily budgets in percentage blocks.
              {pending.s.next_change ? ` Next: ${whenLocal(pending.s.next_change.at, pending.s.timezone ?? pending.s.targets[0]?.timezone)}, ${pending.s.next_change.summary}.` : ""}
              {pending.kind === "enable-live" ? " It will also be enabled." : ""}
            </>
          )
        }
        confirmLabel={pending?.kind === "delete" ? "Delete" : pending?.kind === "run-live" ? "Run now" : "Go live"}
        destructive={pending?.kind === "delete" || (pending?.kind !== "run-live" && pending?.kind !== undefined) || (pending?.kind === "run-live" && !pending.s.dry_run)}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (!p) return;
          if (p.kind === "delete") del.mutate(p.s.id, { onSuccess: () => toast.success("Schedule deleted"), onError: (e) => toast.error(errorMessage(e)) });
          else if (p.kind === "run-live") doRun(p.s);
          else if (p.kind === "live") patch(p.s, { dry_run: false }, `${p.s.name} is live`);
          else patch(p.s, { enabled: true }, `${p.s.name} is live`);
        }}
      />
    </section>
  );
}
