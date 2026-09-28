"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWastedSpend, type AnalyticsScope, type WastedRow } from "@/lib/analytics-api";
import { cn } from "@/lib/utils";
import { PROVIDER_NAMES, REASON_LABELS, formatMoney, formatNumber, formatPercent, formatRoas } from "./format";
import { ErrorState } from "./states";

function reasonText(r: WastedRow) {
  if (r.reasons.includes("no_conversions")) return REASON_LABELS.no_conversions;
  if (r.reasons.includes("low_roas")) return `ROAS ${formatRoas(r.metrics.roas)}`;
  return `${formatNumber(r.metrics.conversions)} conversions`;
}

/**
 * "What's spending without converting": campaigns with no conversions or ROAS
 * below 1× in the range, ranked by the spend that didn't pay back.
 */
export function WastedSpendCard({
  orgId,
  scope,
  enabled,
  days,
}: {
  orgId: string | undefined;
  scope: AnalyticsScope;
  enabled: boolean;
  days: number;
}) {
  const q = useWastedSpend(orgId, { ...scope, limit: 5 }, { enabled });
  const d = q.data;
  const currency = d?.currency ?? null;

  return (
    <section
      aria-labelledby="wasted-heading"
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-xs transition-opacity sm:p-5",
        q.isPlaceholderData && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger-subtle text-danger-fg">
          <TriangleAlert className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="wasted-heading" className="font-display text-lg font-semibold text-fg">
            Wasted spend
          </h2>
          <p className="text-sm text-fg-muted">
            Campaigns with no conversions or ROAS under{" "}
            {formatRoas(d?.criteria.roas_below ?? 1)} in the last {days} days.
          </p>
        </div>
      </div>

      {q.isError ? (
        <ErrorState className="mt-4" error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <div className="mt-5 grid gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-2 w-full" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : d.rows.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-success-subtle px-4 py-3 text-sm text-fg">
          <CircleCheck className="size-4 shrink-0 text-success-fg" aria-hidden="true" />
          Nothing flagged. Every campaign with spend converted at a ROAS of {formatRoas(d.criteria.roas_below)} or better.
        </div>
      ) : (
        <>
          <div className="mt-5">
            {currency ? (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-3xl font-semibold text-fg">
                  {formatMoney(d.wasted_spend_total, currency, { compact: true })}
                </span>
                <span className="text-sm text-fg-muted">
                  {d.share_of_spend != null && <>{formatPercent(d.share_of_spend, 0)} of all spend · </>}
                  {d.page.total} {d.page.total === 1 ? "campaign" : "campaigns"}
                </span>
              </p>
            ) : (
              // Mixed currencies: one figure per currency, never added together.
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(d.wasted_by_currency).map(([c, v]) => (
                  <li key={c} className="font-display text-2xl font-semibold text-fg">
                    {formatMoney(v, c, { compact: true })}
                  </li>
                ))}
              </ul>
            )}
            {d.share_of_spend != null && (
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-danger-subtle"
                role="meter"
                aria-label="Share of spend wasted"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(d.share_of_spend * 100)}
              >
                <div
                  className="h-full rounded-full bg-danger"
                  style={{ width: `${Math.min(100, d.share_of_spend * 100)}%` }}
                />
              </div>
            )}
          </div>

          <ol className="mt-4 grid divide-y divide-border">
            {d.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg" title={r.name}>
                    {r.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
                    <span>{PROVIDER_NAMES[r.provider] ?? r.provider}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-danger-fg">{reasonText(r)}</span>
                    {r.status !== "active" && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] capitalize">
                        {r.status}
                      </Badge>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-fg tabular-nums">{formatMoney(r.wasted_spend, r.currency)}</p>
                  <p className="text-xs text-fg-subtle tabular-nums">
                    of {formatMoney(r.metrics.spend, r.currency, { compact: true })} spent
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Button asChild variant="outline" size="sm" className="mt-3 self-start">
            <Link href="/app/campaigns">
              Review campaigns <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </>
      )}
    </section>
  );
}
