"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/integrations/status-pill";
import { ActivityTable } from "@/components/admin/activity-table";
import { TasksTable } from "@/components/admin/tasks-table";
import { ErrorRow, Panel, RowsSkeleton, StatTile, When, formatNumber } from "@/components/admin/ui";
import { useAdminActivity, useAdminStats, useFailures, useQueues } from "@/lib/admin-queries";

export function OverviewView() {
  const stats = useAdminStats();
  const queues = useQueues();
  const failures = useFailures();
  const activity = useAdminActivity("");

  const s = stats.data;
  const q = queues.data;
  const today = q?.queues.reduce((acc, x) => ({ ok: acc.ok + x.processed_today, failed: acc.failed + x.failed_today }), { ok: 0, failed: 0 });
  const running = q?.servers.flatMap((sv) => sv.active) ?? [];
  const backlog = q?.queues.reduce((n, x) => n + x.pending + x.scheduled + x.retry, 0) ?? 0;
  const workerDown = q && q.servers.length === 0;
  const integrationIssues = s ? s.integrations_needs_reauth + s.integrations_with_errors : 0;

  return (
    <div className="grid gap-8">
      <PageHeader title="Overview" description="Everything happening across every Adwise organization." />

      {workerDown && (
        <div role="alert" className="rounded-xl border border-danger bg-danger-subtle px-4 py-3 text-sm text-danger-fg">
          <strong>No worker is running.</strong> Syncs and hourly schedules are stopped. Start one with <code>make worker</code>.
        </div>
      )}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.isPending ? (
          Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[6.5rem] rounded-xl" />)
        ) : stats.isError ? (
          <div className="col-span-full rounded-xl border border-border bg-surface">
            <ErrorRow message={stats.error.message} onRetry={() => stats.refetch()} />
          </div>
        ) : (
          <>
            <StatTile label="Users" value={formatNumber(s!.users)} hint={`+${s!.users_last_7d} in the last 7 days`} href="/admin/users" />
            <StatTile label="Active in 24h" value={formatNumber(s!.active_users_24h)} hint="Distinct users with a live session" />
            <StatTile label="Organizations" value={formatNumber(s!.organizations)} href="/admin/organizations" />
            <StatTile
              label="Integration issues"
              value={integrationIssues}
              tone={integrationIssues > 0 ? "warning" : undefined}
              hint={`${s!.integrations_active} active · ${s!.integrations_needs_reauth} need reconnect`}
              href="/admin/syncs"
            />
            <StatTile label="Ad accounts syncing" value={`${s!.ad_accounts_syncing} / ${s!.ad_accounts}`} href="/admin/syncs" />
            <StatTile label="Campaigns · ads" value={`${formatNumber(s!.campaigns)} · ${formatNumber(s!.ads)}`} />
            <StatTile label="Metric rows" value={formatNumber(s!.metric_facts_estimate)} hint="Planner estimate" />
            <StatTile
              label="Jobs today"
              value={today ? formatNumber(today.ok) : "—"}
              tone={today && today.failed > 0 ? "warning" : undefined}
              hint={today ? `${today.failed} failed · ${backlog} waiting` : undefined}
              href="/admin/syncs"
            />
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Running now"
          description={q ? `${q.servers.length} worker${q.servers.length === 1 ? "" : "s"} · ${running.length} task${running.length === 1 ? "" : "s"} in progress` : undefined}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/syncs">
                Queues <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          {queues.isPending ? (
            <RowsSkeleton rows={3} />
          ) : queues.isError ? (
            <ErrorRow message={queues.error.message} onRetry={() => queues.refetch()} />
          ) : running.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-muted">
              Idle.{" "}
              {q!.schedules.length > 0 && (
                <>
                  Next scheduled run <When at={[...q!.schedules].sort((a, b) => a.next.localeCompare(b.next))[0].next} />.
                </>
              )}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {running.map((t) => (
                <li key={t.task_id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <StatusPill tone="info">Running</StatusPill>
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{t.type}</span>
                  <span className="text-fg-muted">
                    started <When at={t.started} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent failures"
          description="Retrying and dead jobs across all queues"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/syncs#failures">
                All failures <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          {failures.isPending ? (
            <RowsSkeleton rows={3} />
          ) : failures.isError ? (
            <ErrorRow message={failures.error.message} onRetry={() => failures.refetch()} />
          ) : (
            <TasksTable tasks={failures.data.slice(0, 6)} empty="No failed jobs." />
          )}
        </Panel>
      </div>

      <Panel
        title="Recent activity"
        description="Audit log across every organization"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/activity">
              All activity <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      >
        {activity.isPending ? (
          <RowsSkeleton />
        ) : activity.isError ? (
          <ErrorRow message={activity.error.message} onRetry={() => activity.refetch()} />
        ) : (
          <ActivityTable rows={activity.data.slice(0, 12)} />
        )}
      </Panel>
    </div>
  );
}
