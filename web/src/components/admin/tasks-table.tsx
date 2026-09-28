"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronRight, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, type PillTone } from "@/components/app/integrations/status-pill";
import { EmptyRow, JsonBlock, Mono, When } from "@/components/admin/ui";
import type { QueueTask, TaskState } from "@/lib/api";
import { useTaskAction } from "@/lib/admin-queries";
import { cn } from "@/lib/utils";

const STATE_TONE: Record<TaskState, PillTone> = {
  active: "info",
  pending: "muted",
  scheduled: "muted",
  retry: "warning",
  archived: "danger",
  completed: "success",
};

const STATE_LABEL: Record<TaskState, string> = {
  active: "Running",
  pending: "Queued",
  scheduled: "Scheduled",
  retry: "Retrying",
  archived: "Dead",
  completed: "Done",
};

/** "integration:metric_sync" → "Metric sync", plus the report name when present. */
function taskTitle(t: QueueTask): string {
  const base = (t.type.split(":")[1] ?? t.type).replaceAll("_", " ");
  const p = t.payload as { report?: { name?: string }; account_id?: string } | null;
  const extra = [p?.report?.name, p?.account_id && `acct ${p.account_id}`].filter(Boolean).join(" · ");
  return base.charAt(0).toUpperCase() + base.slice(1) + (extra ? ` — ${extra}` : "");
}

export function TasksTable({ tasks, empty = "Nothing here." }: { tasks: QueueTask[]; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const action = useTaskAction();
  if (tasks.length === 0) return <EmptyRow>{empty}</EmptyRow>;

  function act(t: QueueTask, kind: "run" | "delete") {
    action.mutate(
      { queue: t.queue, id: t.id, action: kind },
      {
        onSuccess: () => toast.success(kind === "run" ? "Task queued to run now." : "Task deleted."),
        onError: (e) => toast.error(kind === "run" ? "Couldn't run task" : "Couldn't delete task", { description: e.message }),
      },
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8 pl-3" />
          <TableHead>Task</TableHead>
          <TableHead className="hidden md:table-cell">Organization</TableHead>
          <TableHead className="w-28">State</TableHead>
          <TableHead className="hidden w-20 sm:table-cell">Tries</TableHead>
          <TableHead className="hidden w-32 lg:table-cell">When</TableHead>
          <TableHead className="w-20 pr-5">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => {
          const key = `${t.queue}/${t.id}`;
          const isOpen = open === key;
          const canRun = t.state === "retry" || t.state === "archived" || t.state === "scheduled";
          const canDelete = t.state !== "active";
          const busy = action.isPending && action.variables?.id === t.id;
          return (
            <Fragment key={key}>
              <TableRow className={cn(isOpen && "bg-bg-subtle")}>
                <TableCell className="pl-3">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setOpen(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? "Hide details" : "Show details"}
                  >
                    <ChevronRight className={cn("transition-transform", isOpen && "rotate-90")} aria-hidden="true" />
                  </Button>
                </TableCell>
                <TableCell className="max-w-0 min-w-48">
                  <p className="truncate font-medium text-fg">{taskTitle(t)}</p>
                  {t.last_error && <p className="truncate text-xs text-danger-fg">{t.last_error}</p>}
                </TableCell>
                <TableCell className="hidden max-w-40 truncate md:table-cell">
                  {t.organization_id ? (
                    <Link href={`/admin/organizations/${t.organization_id}`} className="text-fg hover:underline">
                      {t.organization_name || "Unknown"}
                    </Link>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusPill tone={STATE_TONE[t.state]}>{STATE_LABEL[t.state]}</StatusPill>
                </TableCell>
                <TableCell className="hidden text-fg-muted tabular-nums sm:table-cell">
                  {t.retried}/{t.max_retry}
                </TableCell>
                <TableCell className="hidden text-fg-muted lg:table-cell">
                  <When at={t.last_failed_at ?? t.completed_at ?? t.next_process_at} empty="—" />
                </TableCell>
                <TableCell className="pr-5 text-right whitespace-nowrap">
                  {canRun && (
                    <Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => act(t, "run")} aria-label="Run now">
                      <Play aria-hidden="true" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => act(t, "delete")} aria-label="Delete task">
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="bg-bg-subtle px-5 pb-4 whitespace-normal">
                    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
                      <span>
                        Queue <Mono>{t.queue}</Mono>
                      </span>
                      <span>
                        ID <Mono>{t.id}</Mono>
                      </span>
                      <span>Timeout {Math.round(t.timeout_seconds / 60)} min</span>
                    </div>
                    {t.last_error && <p className="mb-2 text-sm break-words text-danger-fg">{t.last_error}</p>}
                    <JsonBlock value={t.payload} />
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
