"use client";

import Link from "next/link";
import { ArrowRight, Check, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { PageHeader } from "@/components/app/page-header";
import { CloudSyncIllustration } from "@/components/app/illustrations";
import { useActiveOrg, useMe } from "@/lib/queries";

const KPIS = ["Spend", "Revenue", "ROAS", "CPA"] as const;

export function DashboardView() {
  const { data } = useMe();
  const org = useActiveOrg();
  const firstName = data?.user.name.split(" ")[0] ?? "there";

  const steps = [
    { label: "Create your organization", done: true, href: undefined },
    { label: "Invite your team", done: false, href: "/app/settings/members" },
    { label: "Connect Meta Ads", done: false, href: "/app/integrations" },
    { label: "Connect Google Ads", done: false, href: "/app/integrations" },
    { label: "Create your first dayparting schedule", done: false, href: "/app/dayparting" },
  ];

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={org ? `Here's how ${org.name} is performing across Meta and Google.` : undefined}
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k} className="rounded-xl border border-border bg-surface p-4 shadow-xs">
            <p className="text-sm text-fg-muted">{k}</p>
            <p className="mt-2 font-display text-2xl font-semibold text-fg-subtle" aria-label={`${k}: no data yet`}>
              —
            </p>
            <p className="mt-1 text-xs text-fg-subtle">No data yet</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <EmptyState
          illustration={<CloudSyncIllustration className="h-auto w-full" />}
          title="Connect Meta or Google to see data"
          description="Once an ad account is connected, Adwise imports campaigns and hourly performance so you can compare providers side by side."
          actions={<ConnectCta />}
        />

        <section aria-labelledby="setup-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <h2 id="setup-heading" className="font-display text-lg font-semibold text-fg">
            Get set up
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {steps.filter((s) => s.done).length} of {steps.length} complete
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-subtle"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={steps.filter((s) => s.done).length}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(steps.filter((s) => s.done).length / steps.length) * 100}%` }}
            />
          </div>
          <ol className="mt-5 grid gap-1">
            {steps.map((s) => (
              <li key={s.label}>
                {s.href && !s.done ? (
                  <Link
                    href={s.href}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-fg outline-none hover:bg-bg-subtle focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <CircleDashed className="size-4 text-fg-subtle" aria-hidden="true" />
                    <span className="flex-1">{s.label}</span>
                    <ArrowRight
                      className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2 text-sm text-fg-muted">
                    <span className="grid size-4 place-items-center rounded-full bg-success text-on-status">
                      <Check className="size-3" aria-hidden="true" />
                    </span>
                    <span className="line-through decoration-fg-subtle">{s.label}</span>
                    <span className="sr-only">(done)</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link href="/app/settings/members">Invite teammates</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
