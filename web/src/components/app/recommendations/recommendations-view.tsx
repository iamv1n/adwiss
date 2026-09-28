"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Inbox, Loader2, RefreshCw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, errorMessage } from "@/components/app/analytics/states";
import { formatMoney, formatNumber, formatPercent, formatRoas } from "@/components/app/analytics/format";
import { ProviderMark } from "@/components/app/campaigns/entity-bits";
import { StatusPill, type PillTone } from "@/components/app/integrations/status-pill";
import { canManage, useRevertAction } from "@/lib/automation-api";
import { useActiveOrg } from "@/lib/queries";
import {
  useAcceptRecommendation,
  useDismissRecommendation,
  useGenerateRecommendations,
  useRecommendations,
  type Recommendation,
  type RecommendationKind,
  type RecommendationStatus,
  type WindowStats,
} from "@/lib/recommendations-api";
import { cn, timeAgo } from "@/lib/utils";

const KINDS: { id: RecommendationKind; label: string; blurb: string }[] = [
  { id: "wasted_spend", label: "Wasted spend", blurb: "Spending with nothing to show for it." },
  { id: "losing_money", label: "Losing money", blurb: "Returning less than they cost." },
  { id: "creative_fatigue", label: "Creative fatigue", blurb: "Ads people have seen too often and stopped clicking." },
  { id: "scale_winner", label: "Scale winners", blurb: "Beating your target by a wide margin." },
];

const FILTERS: { id: RecommendationStatus | "all"; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "accepted", label: "Applied" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "All" },
];

const STATUS: Record<RecommendationStatus, { label: string; tone: PillTone }> = {
  open: { label: "Open", tone: "info" },
  accepted: { label: "Applied", tone: "success" },
  dismissed: { label: "Dismissed", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  failed: { label: "Failed", tone: "danger" },
};

const LEVEL_NOUN: Record<Recommendation["entity_type"], string> = { campaign: "campaign", ad_group: "ad set", ad: "ad" };

/** The exact change, e.g. "Pause ad “Diwali video 2”" or "Budget ₹1,000 → ₹1,200/day". */
function ChangeText({ r }: { r: Recommendation }) {
  const a = r.proposed_action;
  if (a.type === "set_budget") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        Daily budget {formatMoney(a.before ?? null, r.currency)}
        <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden="true" />
        <span className="font-semibold">{formatMoney(a.value ?? null, r.currency)}/day</span>
      </span>
    );
  }
  const verb = a.type === "pause" ? "Pause" : "Activate";
  return (
    <span>
      {verb} {LEVEL_NOUN[r.entity_type]} <span className="font-semibold">“{r.entity_name}”</span>
    </span>
  );
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function Stat({ label, before, after, highlight }: { label: string; before?: string; after: string; highlight?: boolean }) {
  return (
    <div className="grid gap-0.5 rounded-md bg-bg-subtle px-2 py-1.5">
      <span className="text-[0.6875rem] text-fg-subtle">{label}</span>
      <span className={cn("flex items-center gap-1 text-xs tabular-nums", highlight ? "font-semibold text-fg" : "text-fg-muted")}>
        {before !== undefined ? (
          <>
            <span className="text-fg-subtle">{before}</span>
            <ArrowRight className="size-3 text-fg-subtle" aria-hidden="true" />
          </>
        ) : null}
        {after}
      </span>
    </div>
  );
}

/** Small before/after numbers behind the suggestion. */
function Evidence({ r }: { r: Recommendation }) {
  const e = r.evidence;
  if (r.kind === "creative_fatigue") {
    const cur = e.current as WindowStats | undefined;
    const prev = e.previous as WindowStats | undefined;
    if (!cur || !prev) return null;
    return (
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Frequency" before={prev.frequency?.toFixed(2) ?? "—"} after={cur.frequency?.toFixed(2) ?? "—"} highlight />
        <Stat label="CTR" before={formatPercent(prev.ctr, 2)} after={formatPercent(cur.ctr, 2)} highlight />
        <Stat
          label="Impressions"
          before={formatNumber(prev.impressions, { compact: true })}
          after={formatNumber(cur.impressions, { compact: true })}
        />
      </div>
    );
  }
  const roas = num(e.roas);
  const cpa = num(e.cpa);
  const targetRoas = num(e.target_roas);
  const targetCpa = num(e.target_cpa) ?? num(e.account_cpa);
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <Stat label={`Spend, ${num(e.window_days) ?? 7}d`} after={formatMoney(num(e.spend), r.currency)} />
      <Stat label="Conversions" after={formatNumber(num(e.conversions))} highlight={r.kind === "wasted_spend"} />
      <Stat
        label={targetRoas != null ? `ROAS (target ${formatRoas(targetRoas)})` : "ROAS"}
        after={formatRoas(roas)}
        highlight={r.kind !== "wasted_spend"}
      />
      <Stat
        label={num(e.target_cpa) != null ? "CPA (vs target)" : num(e.account_cpa) != null ? "CPA (vs 30d avg)" : "CPA"}
        before={targetCpa != null ? formatMoney(targetCpa, r.currency) : undefined}
        after={cpa != null ? formatMoney(cpa, r.currency) : "—"}
      />
    </div>
  );
}

function RecommendationCard({
  r,
  manage,
  busy,
  onApply,
  onDismiss,
  onUndo,
}: {
  r: Recommendation;
  manage: boolean;
  busy: boolean;
  onApply: () => void;
  onDismiss: () => void;
  onUndo: () => void;
}) {
  const campaign = typeof r.evidence.campaign_name === "string" ? r.evidence.campaign_name : null;
  return (
    <article className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="text-sm font-semibold text-fg">{r.title}</h3>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            {r.provider ? <ProviderMark provider={r.provider} className="size-4 text-[0.5625rem]" /> : null}
            <span className="truncate">
              <span className="capitalize">{LEVEL_NOUN[r.entity_type]}</span> · {r.entity_name}
              {campaign ? ` · in ${campaign}` : ""} · {r.account_name}
            </span>
          </p>
        </div>
        {r.status !== "open" ? <StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusPill> : null}
      </header>

      <p className="text-sm text-fg-muted">{r.reason}</p>
      <Evidence r={r} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm text-fg">
          <ChangeText r={r} />
        </p>
        {r.status === "open" && manage ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
              <X aria-hidden="true" /> Dismiss
            </Button>
            <Button size="sm" onClick={onApply} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Apply
            </Button>
          </div>
        ) : r.status === "accepted" && r.action_id ? (
          <div className="flex items-center gap-2 text-xs">
            <Link href={`/app/actions?source_id=${r.id}`} className="text-primary hover:underline">
              View action
            </Link>
            {manage ? (
              <Button size="xs" variant="outline" onClick={onUndo} disabled={busy}>
                <Undo2 aria-hidden="true" /> Undo
              </Button>
            ) : null}
          </div>
        ) : r.status === "open" ? (
          <span className="text-xs text-fg-subtle">An admin can apply this.</span>
        ) : (
          <span className="text-xs text-fg-subtle">{r.decided_at ? timeAgo(r.decided_at) : `Expired ${timeAgo(r.expires_at)}`}</span>
        )}
      </div>
      {r.error ? (
        <p className={cn("rounded-md px-2 py-1 text-xs", r.status === "failed" ? "bg-danger-subtle text-danger-fg" : "bg-bg-subtle text-fg-muted")}>
          {r.error}
        </p>
      ) : null}
    </article>
  );
}

export function RecommendationsView() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const manage = canManage(org?.role);
  const [status, setStatus] = useState<RecommendationStatus | "all">("open");
  const [confirm, setConfirm] = useState<Recommendation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useRecommendations(orgId, status);
  const accept = useAcceptRecommendation(orgId);
  const dismiss = useDismissRecommendation(orgId);
  const generate = useGenerateRecommendations(orgId);
  const revert = useRevertAction(orgId);
  const list = q.data?.recommendations ?? [];
  const counts = q.data?.counts;

  const undo = (r: Recommendation) => {
    if (!r.action_id) return;
    setBusy(r.id);
    revert.mutate(r.action_id, {
      onSuccess: (res) =>
        res.action.status === "failed"
          ? toast.error(`Undo failed: ${res.action.error}`)
          : toast.success(`Undone: ${r.entity_name} is back to how it was`),
      onError: (e) => toast.error(errorMessage(e)),
      onSettled: () => setBusy(null),
    });
  };

  const apply = (r: Recommendation) => {
    setBusy(r.id);
    accept.mutate(r.id, {
      onSuccess: (res) => {
        const rec = res.recommendation;
        if (rec.status === "failed") {
          toast.error(`Couldn’t apply: ${rec.error}`);
        } else {
          toast.success(rec.error || `Applied to ${rec.entity_name}`, {
            action: rec.action_id ? { label: "Undo", onClick: () => undo(rec) } : undefined,
          });
        }
      },
      onError: (e) => toast.error(errorMessage(e)),
      onSettled: () => setBusy(null),
    });
  };

  const doDismiss = (r: Recommendation) => {
    setBusy(r.id);
    dismiss.mutate(r.id, {
      onSuccess: () => toast.success("Dismissed. It won’t be suggested again for 14 days."),
      onError: (e) => toast.error(errorMessage(e)),
      onSettled: () => setBusy(null),
    });
  };

  const groups = KINDS.map((k) => ({ ...k, items: list.filter((r) => r.kind === k.id) })).filter((g) => g.items.length > 0);

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Recommendations"
        description="Changes worth making, found by checking your campaigns and ads every hour. Nothing changes until you apply it, and every applied change can be undone from Actions."
        actions={
          manage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={generate.isPending}
              onClick={() =>
                generate.mutate(undefined, {
                  onSuccess: (res) =>
                    toast.success(res.created ? `${res.created} new recommendation${res.created === 1 ? "" : "s"}` : "Up to date: nothing new"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {generate.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Check now
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={status === f.id}
            onClick={() => setStatus(f.id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs",
              status === f.id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:text-fg",
            )}
          >
            {f.label}
            {f.id !== "all" && counts ? <span className="ml-1 tabular-nums opacity-70">{counts[f.id]}</span> : null}
          </button>
        ))}
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-bg-subtle" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" aria-hidden="true" />}
          title={status === "open" ? "Nothing to review" : "Nothing here"}
          description={
            status === "open"
              ? "No campaign or ad needs attention right now. We check every hour for wasted spend, money-losing campaigns, tired creatives and winners worth scaling. Set a target CPA and ROAS in Automations → New rule for sharper suggestions."
              : "No recommendations with this status yet."
          }
        />
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-labelledby={`rec-${g.id}`} className="grid gap-2">
            <div className="flex items-baseline gap-2">
              <h2 id={`rec-${g.id}`} className="text-sm font-semibold text-fg">
                {g.label} <span className="font-normal text-fg-subtle tabular-nums">{g.items.length}</span>
              </h2>
              <p className="text-xs text-fg-muted">{g.blurb}</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {g.items.map((r) => (
                <RecommendationCard
                  key={r.id}
                  r={r}
                  manage={manage}
                  busy={busy === r.id}
                  onApply={() => setConfirm(r)}
                  onDismiss={() => doDismiss(r)}
                  onUndo={() => undo(r)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Apply this change now?"
        description={
          confirm ? (
            <>
              <ChangeText r={confirm} /> on {confirm.provider === "google" ? "Google" : "Meta"}. It runs right away, is logged
              in Actions and can be undone there.
            </>
          ) : null
        }
        confirmLabel="Apply"
        destructive={confirm?.proposed_action.type === "pause"}
        onConfirm={() => {
          const r = confirm;
          setConfirm(null);
          if (r) apply(r);
        }}
      />
    </div>
  );
}
