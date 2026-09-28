"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Loader2, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ErrorState, InlineEmpty, Panel, errorMessage } from "@/components/app/analytics/states";
import { ChartLegend, ChartTable, LineChart } from "@/components/app/analytics/charts";
import { formatMoney, formatRoas, PROVIDER_NAMES } from "@/components/app/analytics/format";
import { ActionStatusPill, ChangeSummary } from "@/components/app/actions/action-bits";
import { isoDate } from "@/components/app/campaigns/format";
import { canManage } from "@/lib/automation-api";
import { useDeletePlan, usePlan, useRunPlan, useSavePlan, type Plan } from "@/lib/budget-api";
import { useActiveOrg } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { CURVES, DailyBars, DeliveryRing, PlanBadges, formatDayShort, formatPeriod } from "./bits";
import { PlanBuilderSheet } from "./plan-builder";

export function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const org = useActiveOrg();
  const orgId = org?.id;
  const manage = canManage(org?.role);
  const q = usePlan(orgId, id);

  return (
    <div className="grid gap-4">
      <Link href="/app/budget" className="inline-flex w-fit items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Budget planner
      </Link>
      {q.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <PlanBody plan={q.data} orgId={orgId} manage={manage} />
      )}
    </div>
  );
}

function PlanBody({ plan, orgId, manage }: { plan: Plan; orgId: string | undefined; manage: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const save = useSavePlan(orgId);
  const run = useRunPlan(orgId);
  const del = useDeletePlan(orgId);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "live" | null>(null);
  const cur = plan.currency;
  const today = isoDate(new Date());

  const patch = (body: { enabled?: boolean; dry_run?: boolean }, msg: string) =>
    save.mutate({ id: plan.id, body }, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e)) });

  // Cumulative planned vs spent.
  let cp = 0;
  let cs = 0;
  const cumPlanned: number[] = [];
  const cumSpent: (number | null)[] = [];
  for (const d of plan.days) {
    cp += d.planned;
    cumPlanned.push(cp);
    if (d.spent != null) {
      cs += d.spent;
      cumSpent.push(cs);
    } else cumSpent.push(null);
  }
  const series = [
    { key: "planned", label: "Planned", color: "var(--color-chart-1)", values: cumPlanned },
    { key: "spent", label: "Spent", color: "var(--color-chart-2)", values: cumSpent },
  ];

  return (
    <>
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-xs sm:flex-row sm:items-center sm:p-5"
      >
        <DeliveryRing pct={plan.delivery_pct} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{plan.name}</h1>
            <PlanBadges plan={plan} />
          </div>
          <p className="mt-1 text-fg">
            {plan.delivery_pct == null ? (
              "Delivery starts once the first day is over."
            ) : (
              <>
                <span className="font-semibold tabular-nums">{plan.delivery_pct.toFixed(1)}%</span> of planned spend delivered
              </>
            )}
          </p>
          <p className="mt-0.5 text-sm text-fg-muted tabular-nums">
            {formatMoney(plan.spent_to_date, cur)} spent of {formatMoney(plan.planned_to_date, cur)} planned to date ·{" "}
            {formatMoney(plan.total_budget, cur)} total · {formatPeriod(plan.start_date, plan.end_date)} ·{" "}
            {CURVES.find((c) => c.id === plan.curve)?.label ?? plan.curve}
            {plan.last_run_at ? ` · last run ${timeAgo(plan.last_run_at)}` : ""}
          </p>
        </div>
        {manage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={run.isPending}
              onClick={() =>
                run.mutate(plan.id, {
                  onSuccess: (r) =>
                    toast.success(
                      r.actions.length
                        ? `${r.actions.length} budget change${r.actions.length === 1 ? "" : "s"} ${plan.dry_run ? "logged (dry run)" : "made"}`
                        : "Budgets already on plan",
                    ),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {run.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />} Run now
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" /> Edit
            </Button>
            <Button size="sm" variant="ghost" aria-label="Delete plan" onClick={() => setConfirm("delete")}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </motion.section>

      {manage ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-fg">Plan on</span>
              <span className="block text-xs text-fg-muted">Evaluates every morning in the account’s time zone.</span>
            </span>
            <Switch
              checked={plan.enabled}
              disabled={save.isPending}
              onCheckedChange={(v) => patch({ enabled: v }, v ? "Plan turned on" : "Plan turned off")}
              aria-label="Plan on"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-fg">Dry run</span>
              <span className="block text-xs text-fg-muted">
                {plan.dry_run ? "Only logs the budgets it would set." : "Live: sets daily budgets on Meta and Google."}
              </span>
            </span>
            <Switch
              checked={plan.dry_run}
              disabled={save.isPending}
              onCheckedChange={(v) => (v ? patch({ dry_run: true }, "Back in dry run") : setConfirm("live"))}
              aria-label="Dry run"
            />
          </label>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Planned vs spent" description="Cumulative over the plan period.">
          {plan.days.length ? (
            <>
              <ChartLegend series={series} />
              <div className="mt-2">
                <LineChart
                  dates={plan.days.map((d) => d.day)}
                  series={series}
                  formatValue={(v) => formatMoney(v, cur)}
                  formatAxis={(v) => formatMoney(v, cur, { compact: true })}
                  formatX={formatDayShort}
                  ariaLabel="Cumulative planned and spent budget"
                />
              </div>
              <ChartTable
                caption="Daily planned, set and spent"
                headers={["Day", "Planned", "Budget set", "Spent"]}
                rows={plan.days.map((d) => [formatDayShort(d.day), formatMoney(d.planned, cur), formatMoney(d.budget_set, cur), formatMoney(d.spent, cur)])}
              />
            </>
          ) : (
            <InlineEmpty>No days planned yet.</InlineEmpty>
          )}
        </Panel>
        <Panel title="Daily budget" description="Planned per day, with actual spend on days that are over.">
          {plan.days.length ? (
            <>
              <ChartLegend
                series={[
                  { key: "p", label: "Planned", color: "var(--color-chart-1)" },
                  { key: "s", label: "Spent", color: "var(--color-chart-2)" },
                ]}
              />
              <div className="mt-6">
                <DailyBars bars={plan.days} currency={cur} today={today} ariaLabel="Planned and spent budget by day" height={180} />
              </div>
            </>
          ) : (
            <InlineEmpty>No days planned yet.</InlineEmpty>
          )}
        </Panel>
      </div>

      <Panel title="Campaigns" description={plan.reallocate ? "Unused budget moves to capped campaigns each day." : "Fixed split; unused budget stays put."}>
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-subtle">
                <th scope="col" className="px-4 py-2 font-medium sm:pl-0">Campaign</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Share</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Min / day</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Planned today</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Spent</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">ROAS 7d</th>
                <th scope="col" className="px-4 py-2 text-right font-medium sm:pr-0">Current budget</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {plan.campaigns.map((c) => (
                <tr key={c.campaign_id} className="border-t border-border">
                  <td className="max-w-64 px-4 py-2 sm:pl-0">
                    <p className="truncate font-medium text-fg">{c.name}</p>
                    <p className="text-xs text-fg-subtle">{PROVIDER_NAMES[c.provider]}</p>
                  </td>
                  <td className="px-3 py-2 text-right">{c.share_pct}%</td>
                  <td className="px-3 py-2 text-right text-fg-muted">{c.min_daily_budget ? formatMoney(c.min_daily_budget, cur) : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatMoney(c.planned_today, cur)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(c.spent_to_date, cur)}</td>
                  <td className="px-3 py-2 text-right">{formatRoas(c.roas_7d)}</td>
                  <td className="px-4 py-2 text-right sm:pr-0">{c.current_daily_budget != null ? `${formatMoney(c.current_daily_budget, cur)}/day` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Change log"
        description="Budgets this plan set or would set."
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href={`/app/actions?source_id=${plan.id}`}>All actions</Link>
          </Button>
        }
      >
        {plan.recent_actions.length ? (
          <ul className="divide-y divide-border">
            {plan.recent_actions.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{a.entity_name}</p>
                  {a.reason ? <p className="text-xs text-fg-muted">{a.reason}</p> : null}
                  {a.error ? <p className="text-xs text-danger-fg">{a.error}</p> : null}
                </div>
                <ChangeSummary type={a.action_type} before={a.before} after={a.after} currency={a.currency || cur} className="text-sm" />
                <ActionStatusPill status={a.status} />
                <span className="w-20 shrink-0 text-xs text-fg-subtle sm:text-right">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <InlineEmpty>No changes yet. Use Run now to evaluate the plan.</InlineEmpty>
        )}
      </Panel>

      {editing ? <PlanBuilderSheet orgId={orgId} plan={plan} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this plan?"
        description={`“${plan.name}” stops pacing. Budgets stay as last set, and its logged actions remain in Actions.`}
        confirmLabel="Delete plan"
        onConfirm={() =>
          del.mutate(plan.id, {
            onSuccess: () => {
              toast.success("Plan deleted");
              router.push("/app/budget");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
      <ConfirmDialog
        open={confirm === "live"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Run this plan live?"
        description={`Every morning “${plan.name}” will set the daily budgets of ${plan.campaign_count} campaign${plan.campaign_count === 1 ? "" : "s"} on Meta or Google. Every change is logged in Actions and can be reverted there.`}
        confirmLabel="Go live"
        destructive={false}
        onConfirm={() => {
          setConfirm(null);
          patch({ dry_run: false }, "Plan is live");
        }}
      />
    </>
  );
}
