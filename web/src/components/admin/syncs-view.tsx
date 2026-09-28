"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/integrations/status-pill";
import { IntegrationsTable } from "@/components/admin/integrations-table";
import { TasksTable } from "@/components/admin/tasks-table";
import { EmptyRow, ErrorRow, Mono, Panel, RowsSkeleton, When } from "@/components/admin/ui";
import type { QueueStat, TaskState } from "@/lib/api";
import { useAdminIntegrations, useFailures, useQueueAction, useQueueTasks, useQueues } from "@/lib/admin-queries";
import { cn } from "@/lib/utils";

const STATES: { value: TaskState; label: string }[] = [
  { value: "active", label: "Running" },
  { value: "pending", label: "Queued" },
  { value: "scheduled", label: "Scheduled" },
  { value: "retry", label: "Retrying" },
  { value: "archived", label: "Dead" },
  { value: "completed", label: "Done" },
];

const humanQueue = (name: string) => name.replaceAll("_", " ");

function Count({ n, tone }: { n: number; tone?: "warning" | "danger" | "info" }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        n === 0 ? "text-fg-subtle" : "text-fg",
        n > 0 && tone === "warning" && "font-medium text-warning-fg",
        n > 0 && tone === "danger" && "font-medium text-danger-fg",
        n > 0 && tone === "info" && "font-medium text-primary",
      )}
    >
      {n}
    </span>
  );
}

function QueueMenu({ q }: { q: QueueStat }) {
  const action = useQueueAction();
  function run(a: "pause" | "resume" | "retry-all" | "clear-archived", done: (n: number) => string) {
    action.mutate(
      { queue: q.name, action: a },
      {
        onSuccess: (r) => toast.success(done(r.tasks)),
        onError: (e) => toast.error("Queue action failed", { description: e.message }),
      },
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${humanQueue(q.name)} queue`} disabled={action.isPending}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {q.paused ? (
          <DropdownMenuItem onSelect={() => run("resume", () => `Resumed ${humanQueue(q.name)}.`)}>Resume queue</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => run("pause", () => `Paused ${humanQueue(q.name)}. Queued jobs will wait.`)}>
            Pause queue
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={q.retry + q.archived === 0}
          onSelect={() => run("retry-all", (n) => `Re-running ${n} failed job${n === 1 ? "" : "s"}.`)}
        >
          Retry all failed now
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={q.archived === 0}
          onSelect={() => run("clear-archived", (n) => `Deleted ${n} dead job${n === 1 ? "" : "s"}.`)}
        >
          Delete dead jobs
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskBrowser({ queues }: { queues: QueueStat[] }) {
  const [queue, setQueue] = useState("metric_sync");
  const [state, setState] = useState<TaskState>("active");
  const tasks = useQueueTasks(queue, state);
  const current = queues.find((q) => q.name === queue);
  const counts: Record<TaskState, number> = {
    active: current?.active ?? 0,
    pending: current?.pending ?? 0,
    scheduled: current?.scheduled ?? 0,
    retry: current?.retry ?? 0,
    archived: current?.archived ?? 0,
    completed: current?.completed ?? 0,
  };
  return (
    <Panel
      title="Jobs"
      description="Browse a queue's jobs by state. Updates every few seconds."
      actions={
        <Select value={queue} onValueChange={setQueue}>
          <SelectTrigger size="sm" className="w-48" aria-label="Queue">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {queues.map((q) => (
              <SelectItem key={q.name} value={q.name} className="capitalize">
                {humanQueue(q.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="overflow-x-auto border-b border-border px-5 py-3">
        <Tabs value={state} onValueChange={(v) => setState(v as TaskState)}>
          <TabsList>
            {STATES.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>
                {s.label} <span className="ml-1 text-fg-subtle tabular-nums">{counts[s.value]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {tasks.isPending ? (
        <RowsSkeleton rows={3} />
      ) : tasks.isError ? (
        <ErrorRow message={tasks.error.message} onRetry={() => tasks.refetch()} />
      ) : (
        <TasksTable tasks={tasks.data} empty={`No ${STATES.find((s) => s.value === state)?.label.toLowerCase()} jobs in this queue.`} />
      )}
    </Panel>
  );
}

export function SyncsView() {
  const queues = useQueues();
  const integrations = useAdminIntegrations();
  const failures = useFailures();
  const q = queues.data;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Syncs & queues"
        description="Provider connections, what the worker is doing, and anything that failed. Refreshes automatically."
      />

      <Panel title="Integrations" description="Problems first. Sync now queues a full sync for that connection.">
        {integrations.isPending ? (
          <RowsSkeleton />
        ) : integrations.isError ? (
          <ErrorRow message={integrations.error.message} onRetry={() => integrations.refetch()} />
        ) : (
          <IntegrationsTable rows={integrations.data} />
        )}
      </Panel>

      <Panel
        title="Queues"
        description={
          q ? (
            q.servers.length === 0 ? (
              <span className="text-danger-fg">No worker running: nothing is being processed.</span>
            ) : (
              `${q.servers.length} worker${q.servers.length === 1 ? "" : "s"} · ${q.servers.reduce((n, s) => n + s.concurrency, 0)} slots`
            )
          ) : undefined
        }
      >
        {queues.isPending ? (
          <RowsSkeleton rows={6} />
        ) : queues.isError ? (
          <ErrorRow message={queues.error.message} onRetry={() => queues.refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Queue</TableHead>
                <TableHead className="w-20 text-right">Running</TableHead>
                <TableHead className="w-20 text-right">Queued</TableHead>
                <TableHead className="hidden w-20 text-right sm:table-cell">Retrying</TableHead>
                <TableHead className="hidden w-16 text-right sm:table-cell">Dead</TableHead>
                <TableHead className="hidden w-28 text-right md:table-cell">Done today</TableHead>
                <TableHead className="hidden w-28 text-right md:table-cell">Failed today</TableHead>
                <TableHead className="hidden w-24 text-right lg:table-cell">Latency</TableHead>
                <TableHead className="w-12 pr-3">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q!.queues.map((x) => (
                <TableRow key={x.name}>
                  <TableCell className="pl-5">
                    <span className="font-medium text-fg capitalize">{humanQueue(x.name)}</span>
                    {x.paused && (
                      <StatusPill tone="warning" className="ml-2">
                        Paused
                      </StatusPill>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Count n={x.active} tone="info" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count n={x.pending + x.scheduled} />
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <Count n={x.retry} tone="warning" />
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <Count n={x.archived} tone="danger" />
                  </TableCell>
                  <TableCell className="hidden text-right md:table-cell">
                    <Count n={x.processed_today} />
                  </TableCell>
                  <TableCell className="hidden text-right md:table-cell">
                    <Count n={x.failed_today} tone="warning" />
                  </TableCell>
                  <TableCell className="hidden text-right text-fg-muted tabular-nums lg:table-cell">
                    {x.latency_ms > 0 ? `${(x.latency_ms / 1000).toFixed(1)}s` : "—"}
                  </TableCell>
                  <TableCell className="pr-3 text-right">
                    <QueueMenu q={x} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {q && <TaskBrowser queues={q.queues} />}

      <div id="failures" className="scroll-mt-20">
        <Panel title="Failures" description="Retrying and dead jobs across every queue, newest first">
          {failures.isPending ? (
            <RowsSkeleton />
          ) : failures.isError ? (
            <ErrorRow message={failures.error.message} onRetry={() => failures.refetch()} />
          ) : (
            <TasksTable tasks={failures.data} empty="No failed jobs." />
          )}
        </Panel>
      </div>

      {q && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Workers">
            {q.servers.length === 0 ? (
              <EmptyRow>No worker is running. Start one with make worker.</EmptyRow>
            ) : (
              <ul className="divide-y divide-border">
                {q.servers.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <StatusPill tone={s.status === "active" ? "success" : "warning"}>{s.status}</StatusPill>
                    <span className="font-medium text-fg">
                      {s.host} · pid {s.pid}
                    </span>
                    <span className="text-fg-muted">
                      {s.active.length}/{s.concurrency} busy · up since <When at={s.started} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Schedules" description="Periodic jobs the worker enqueues">
            {q.schedules.length === 0 ? (
              <EmptyRow>No schedules registered.</EmptyRow>
            ) : (
              <ul className="divide-y divide-border">
                {q.schedules.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span className="font-medium text-fg">{s.type}</span>
                    <Mono>{s.spec}</Mono>
                    <span className="ml-auto text-fg-muted">
                      next <When at={s.next} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
