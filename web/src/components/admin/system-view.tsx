"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ErrorRow, Mono, Panel, RowsSkeleton, StatTile, formatBytes } from "@/components/admin/ui";
import { useSystem } from "@/lib/admin-queries";

export function SystemView() {
  const sys = useSystem();
  const d = sys.data;

  return (
    <div className="grid gap-8">
      <PageHeader title="System" description="Health of the services Adwise depends on, and how this installation is configured." />

      {sys.isPending ? (
        <RowsSkeleton rows={6} />
      ) : sys.isError ? (
        <div className="rounded-2xl border border-border bg-surface">
          <ErrorRow message={sys.error.message} onRetry={() => sys.refetch()} />
        </div>
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Environment" value={<span className="capitalize">{d!.env}</span>} />
            <StatTile label="Database size" value={formatBytes(d!.database.size_bytes)} hint={`PostgreSQL ${d!.database.server_version}`} />
            <StatTile label="Schema version" value={d!.database.migration_version} hint="Latest applied migration" />
            <StatTile label="Redis memory" value={d!.redis_memory || "—"} />
          </section>

          <Panel title="Checks">
            <ul className="divide-y divide-border">
              {d!.checks.map((c) => (
                <li key={c.name} className="flex items-start gap-3 px-5 py-3 text-sm">
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="OK" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Needs attention" />
                  )}
                  <span className="w-44 shrink-0 font-medium text-fg">{c.name}</span>
                  <span className="text-fg-muted">{c.detail}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Configuration">
            <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-fg-muted">Web URL</dt>
              <dd>
                <Mono>{d!.web_base_url}</Mono>
              </dd>
              <dt className="text-fg-muted">API base (OAuth callbacks)</dt>
              <dd>
                <Mono>{d!.api_base_url}</Mono>
              </dd>
              <dt className="text-fg-muted">Session lifetime</dt>
              <dd className="text-fg">{Math.round(d!.session_ttl_hours / 24)} days</dd>
              <dt className="text-fg-muted">Expired sessions awaiting cleanup</dt>
              <dd className="text-fg tabular-nums">{d!.database.expired_sessions}</dd>
            </dl>
          </Panel>
        </>
      )}
    </div>
  );
}
