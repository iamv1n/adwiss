"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { PageHeader } from "@/components/app/page-header";
import { LeadSetupBanner } from "@/components/app/leads/lead-setup";
import { OnboardingChecklist, useOnboarding } from "@/components/app/onboarding/onboarding-checklist";
import { dashboardKpis } from "@/lib/ad-profile";
import { CloudSyncIllustration } from "@/components/app/illustrations";
import { CurrencyPicker, RangePicker } from "@/components/app/analytics/controls";
import { formatRange } from "@/components/app/analytics/format";
import { KPI_BY_ID, KpiTiles } from "@/components/app/analytics/kpis";
import { StatTileSkeleton } from "@/components/app/analytics/stat-tile";
import { ErrorState } from "@/components/app/analytics/states";
import { TopCampaigns } from "@/components/app/analytics/top-campaigns";
import { SpendRevenueTrend } from "@/components/app/analytics/trend-panel";
import { useAnalyticsScope } from "@/components/app/analytics/use-analytics-scope";
import { WastedSpendCard } from "@/components/app/analytics/wasted-spend-card";
import type { RangePreset } from "@/lib/analytics-api";
import { useIntegrations, useMe, useMembers } from "@/lib/queries";
import { cn } from "@/lib/utils";


export function DashboardView() {
  const { data } = useMe();
  const firstName = data?.user.name.split(" ")[0] ?? "there";
  const [days, setDays] = useState<RangePreset>(30);
  const s = useAnalyticsScope({ days, compare: "previous_period" });
  const ov = s.overview;

  const onboarding = useOnboarding();
  // Headline tiles follow the kinds of ads the org runs; unchanged until it answers.
  const DASHBOARD_KPIS = dashboardKpis(onboarding.leadSetup?.ad_types).map((id) => KPI_BY_ID[id]);
  // The checklist already asks for the ad types, so the lead banner waits until it's gone or answered.
  const adTypesStep = onboarding.steps.find((st) => st.id === "ad_types");
  const showLeadBanner = onboarding.ready && !(onboarding.visible && !onboarding.celebrate && adTypesStep && !adTypesStep.done);
  const top = (
    <>
      <OnboardingChecklist onboarding={onboarding} />
      {showLeadBanner && <LeadSetupBanner />}
    </>
  );

  const hasData = ov.data?.timeseries.some((p) => p.impressions > 0 || (p.spend ?? 0) > 0) ?? false;

  const header = (
    <PageHeader
      title={`Welcome, ${firstName}`}
      description={
        ov.data
          ? `${s.org?.name ?? "Your org"}, ${formatRange(ov.data.range.from, ov.data.range.to)} vs the previous ${days} days.`
          : s.org
            ? `Here's how ${s.org.name} is performing across Meta and Google.`
            : undefined
      }
      actions={
        s.hasAccounts ? (
          <>
            {s.mixed && <CurrencyPicker currencies={s.currencies} value={s.currency} onChange={s.setCurrency} />}
            <RangePicker value={days} onChange={setDays} />
          </>
        ) : undefined
      }
    />
  );

  // No ad accounts yet: keep the connect + setup flow.
  if (s.hasAccounts === false) {
    return (
      <div className="grid gap-8">
        {header}
        {top}
        <SetupState orgId={s.orgId} showSteps={onboarding.ready && !onboarding.visible} />
      </div>
    );
  }

  if (s.accounts.isError) {
    return (
      <div className="grid gap-8">
        {header}
        <ErrorState error={s.accounts.error} onRetry={() => s.accounts.refetch()} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {header}
      {top}

      {s.mixed && (
        <p className="-mt-2 text-sm text-fg-muted">
          Your accounts report in {s.currencies.join(", ")}. Money is shown in one currency at a time and never added
          across currencies.
        </p>
      )}

      {ov.isError ? (
        <ErrorState error={ov.error} onRetry={() => ov.refetch()} />
      ) : !ov.data || s.hasAccounts === undefined ? (
        <section aria-label="Key metrics" aria-busy="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {DASHBOARD_KPIS.map((k) => (
            <StatTileSkeleton key={k.key} />
          ))}
        </section>
      ) : !hasData ? (
        <EmptyState
          illustration={<CloudSyncIllustration className="h-auto w-full" />}
          title={`No performance data in the last ${days} days`}
          description="Your ad accounts are connected, but nothing has been imported for this period yet. A first sync can take a few minutes. Check its status on the Integrations page."
          actions={
            <Button asChild variant="outline">
              <Link href="/app/integrations">View integrations</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section
            aria-label="Key metrics"
            className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", ov.isPlaceholderData && "opacity-60")}
          >
            <KpiTiles
              defs={DASHBOARD_KPIS}
              totals={ov.data.totals}
              deltas={ov.data.deltas}
              deltaSuffix={`vs prev. ${days}d`}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <WastedSpendCard orgId={s.orgId} scope={s.scope} enabled={s.scopeReady} days={days} />
            <TopCampaigns orgId={s.orgId} scope={s.scope} enabled={s.scopeReady} />
          </div>

          <div className={cn("transition-opacity", ov.isPlaceholderData && "opacity-60")}>
            <SpendRevenueTrend overview={ov.data} height={160} title="Spend vs revenue" />
          </div>
        </>
      )}
    </div>
  );
}

function SetupState({ orgId, showSteps }: { orgId: string | undefined; showSteps: boolean }) {
  const integrations = useIntegrations(orgId);
  const members = useMembers(orgId);
  const connected = (p: "meta" | "google") =>
    integrations.data?.integrations.some((i) => i.provider === p && i.status === "active") ?? false;

  const steps = [
    { label: "Create your organization", done: true, href: undefined },
    { label: "Invite your team", done: (members.data?.length ?? 0) > 1, href: "/app/settings/members" },
    { label: "Connect Meta Ads", done: connected("meta"), href: "/app/integrations" },
    { label: "Connect Google Ads", done: connected("google"), href: "/app/integrations" },
    { label: "Create your first dayparting schedule", done: false, href: "/app/dayparting" },
  ];
  const doneCount = steps.filter((st) => st.done).length;

  const empty = (
    <EmptyState
      illustration={<CloudSyncIllustration className="h-auto w-full" />}
      title="Connect Meta or Google to see data"
      description="Once an ad account is connected, Adwise imports campaigns and hourly performance, then flags spend that isn't converting."
      actions={<ConnectCta />}
    />
  );
  // The onboarding checklist above already lists the connect steps.
  if (!showSteps) return empty;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {empty}

      <section aria-labelledby="setup-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
        <h2 id="setup-heading" className="font-display text-lg font-semibold text-fg">
          Get set up
        </h2>
        {integrations.isPending ? (
          <Skeleton className="mt-2 h-4 w-24" />
        ) : (
          <p className="mt-1 text-sm text-fg-muted">
            {doneCount} of {steps.length} complete
          </p>
        )}
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-subtle"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ol className="mt-5 grid gap-1">
          {steps.map((st) => (
            <li key={st.label}>
              {st.href && !st.done ? (
                <Link
                  href={st.href}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-fg outline-none hover:bg-bg-subtle focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <CircleDashed className="size-4 text-fg-subtle" aria-hidden="true" />
                  <span className="flex-1">{st.label}</span>
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
                  <span className="line-through decoration-fg-subtle">{st.label}</span>
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
  );
}
