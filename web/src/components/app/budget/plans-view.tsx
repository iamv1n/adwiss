"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CalendarRange, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/analytics/states";
import { formatMoney } from "@/components/app/analytics/format";
import { isNotLive } from "@/components/app/actions/action-bits";
import { canManage } from "@/lib/automation-api";
import { usePlans, type PlanSummary } from "@/lib/budget-api";
import { useActiveOrg } from "@/lib/queries";
import { DeliveryRing, PlanBadges, formatPeriod } from "./bits";
import { PlanBuilderSheet } from "./plan-builder";

export function PlansView() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const manage = canManage(org?.role);
  const plans = usePlans(orgId);
  const [creating, setCreating] = useState(false);
  const list = plans.data?.plans ?? [];

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Budget planner"
        description="Set one budget for a period. Adwise paces it day by day and splits it across campaigns."
        actions={
          manage && list.length ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> New plan
            </Button>
          ) : null
        }
      />
      {plans.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : plans.error && !isNotLive(plans.error) ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-6" aria-hidden="true" />}
          title="Plan a budget once, not every day"
          description={
            <>
              Say “₹2,00,000 this month” and pick campaigns. Every morning Adwise sets each campaign’s daily budget so the total lands on
              target, shifts unspent money to campaigns that are capped, and shows how much of the plan was delivered. New plans start in
              dry run, so you can see what it would do first.
            </>
          }
          actions={
            manage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" /> Create a budget plan
              </Button>
            ) : (
              <p className="text-sm text-fg-subtle">Ask an admin to create a plan.</p>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => (
            <PlanCard key={p.id} plan={p} index={i} />
          ))}
        </ul>
      )}
      {creating ? <PlanBuilderSheet orgId={orgId} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function PlanCard({ plan, index }: { plan: PlanSummary; index: number }) {
  const reduce = useReducedMotion();
  const frac = (v: number) => (plan.total_budget > 0 ? Math.min(1, Math.max(0, v / plan.total_budget)) : 0);
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
    >
      <Link
        href={`/app/budget/${plan.id}`}
        className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs transition-colors outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-semibold text-fg">{plan.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
              <CalendarRange className="size-3" aria-hidden="true" />
              {formatPeriod(plan.start_date, plan.end_date)} · {plan.campaign_count} campaign{plan.campaign_count === 1 ? "" : "s"}
            </p>
          </div>
          <DeliveryRing pct={plan.delivery_pct} label={`Delivery ${plan.delivery_pct == null ? "not started" : `${plan.delivery_pct.toFixed(1)}% of planned`}`} />
        </div>
        <p className="font-display text-2xl font-semibold tracking-tight text-fg tabular-nums">{formatMoney(plan.total_budget, plan.currency)}</p>
        <div className="grid gap-1">
          <div className="flex justify-between text-xs text-fg-muted tabular-nums">
            <span>Spent {formatMoney(plan.spent_to_date, plan.currency)}</span>
            <span>Planned to date {formatMoney(plan.planned_to_date, plan.currency)}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-bg-subtle" aria-hidden="true">
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${frac(plan.spent_to_date) * 100}%` }} />
            <div className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-fg-muted" style={{ left: `${frac(plan.planned_to_date) * 100}%` }} />
          </div>
        </div>
        <div className="mt-auto">
          <PlanBadges plan={plan} />
        </div>
      </Link>
    </motion.li>
  );
}
