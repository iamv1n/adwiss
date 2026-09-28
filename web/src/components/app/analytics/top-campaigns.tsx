"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaignPerformance, type AnalyticsScope } from "@/lib/analytics-api";
import { cn } from "@/lib/utils";
import { PROVIDER_NAMES, formatMoney, formatRoas } from "./format";
import { DeltaBadge } from "./stat-tile";
import { ErrorState, InlineEmpty } from "./states";

/** The five biggest spenders with ROAS and its change vs the previous period. */
export function TopCampaigns({
  orgId,
  scope,
  enabled,
}: {
  orgId: string | undefined;
  scope: AnalyticsScope;
  enabled: boolean;
}) {
  const q = useCampaignPerformance(
    orgId,
    { ...scope, compare: "previous_period", sort: "spend", order: "desc", limit: 5 },
    { enabled },
  );
  const rows = q.data?.campaigns.filter((c) => (c.metrics.spend ?? 0) > 0) ?? [];

  return (
    <section
      aria-labelledby="top-campaigns-heading"
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-xs transition-opacity sm:p-5",
        q.isPlaceholderData && "opacity-60",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="top-campaigns-heading" className="font-display text-lg font-semibold text-fg">
          Top campaigns
        </h2>
        <Link
          href="/app/campaigns"
          className="inline-flex items-center gap-1 rounded text-sm text-fg-muted outline-none hover:text-fg focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          All <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <p className="text-sm text-fg-muted">By spend, with ROAS vs the previous period.</p>

      {q.isError ? (
        <ErrorState className="mt-4" error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <div className="mt-4 grid gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <InlineEmpty>No campaign spent in this period.</InlineEmpty>
      ) : (
        <ol className="mt-3 grid divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg" title={c.name}>
                  {c.name}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {PROVIDER_NAMES[c.provider] ?? c.provider} · {formatMoney(c.metrics.spend, c.currency, { compact: true })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-fg tabular-nums">{formatRoas(c.metrics.roas)}</p>
                <DeltaBadge delta={c.deltas?.roas} polarity="up-good" />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
