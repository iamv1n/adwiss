"use client";

/**
 * Shared campaign-management actions for every table and sheet on the
 * Campaigns pages: status, budget, archive, bulk and generic updates.
 *
 * Safety rules live here so no control can bypass them:
 * - anything that can start or increase spending asks first, naming the
 *   amount and currency;
 * - provider errors are shown verbatim in a toast;
 * - members (and unsupported Google changes) are refused before any request.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorToast } from "@/components/app/campaigns/toasts";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FALLBACK_LABELS } from "@/components/app/integrations/providers";
import { blockedReason, useCanManage, type Capability } from "@/components/app/campaigns/capabilities";
import { budgetPhrase, formatMoney } from "@/components/app/campaigns/format";
import type { EntityLabels, Provider, ProviderLabels } from "@/lib/api";
import { type Ad, type AdGroup, type Campaign, entityKeys } from "@/lib/entities-api";
import {
  type AdGroupPatch,
  type CampaignPatch,
  type Level,
  type ManageStatus,
  type ManagedExtras,
  useArchive,
  useBulkStatus,
  useUpdateAd,
  useUpdateAdGroup,
  useUpdateCampaign,
} from "@/lib/manage-api";

export type AnyRow = (Campaign | AdGroup | Ad) & ManagedExtras;
export type AnyPatch = CampaignPatch & AdGroupPatch;

/** Entity plus its level; what edit and create flows are opened with. */
export type EditFocus = "name" | "budget" | "schedule";

export type Target = (
  | { level: "campaign"; row: Campaign & ManagedExtras }
  | { level: "ad_group"; row: AdGroup & ManagedExtras }
  | { level: "ad"; row: Ad & ManagedExtras }
) & { focus?: EditFocus };

export interface CreateRequest {
  level: Level;
  /** Pre-selected parent: a campaign for a new ad set, an ad set for a new ad. */
  campaign?: Campaign | null;
  adGroup?: AdGroup | null;
  /** Pre-selected account for a new campaign. */
  accountId?: string;
}

interface ConfirmOpts {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
}

interface ManageCtx {
  orgId: string;
  canManage: boolean;
  labels: ProviderLabels;
  labelsFor: (p: Provider) => EntityLabels;
  levelLabel: (p: Provider, level: Level) => string;
  /** Null when allowed, otherwise the tooltip explaining why not. */
  blocked: (provider: Provider, level: Level, cap: Capability) => string | null;
  isBusy: (id: string) => boolean;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  setStatus: (level: Level, row: AnyRow, status: ManageStatus) => Promise<boolean>;
  update: (level: Level, row: AnyRow, patch: AnyPatch, successText?: string) => Promise<boolean>;
  archive: (level: Level, row: AnyRow) => Promise<boolean>;
  bulkStatus: (level: Level, rows: AnyRow[], status: ManageStatus) => Promise<void>;
  openEdit: (t: Target) => void;
  openCreate: (r: CreateRequest) => void;
}

const Ctx = createContext<ManageCtx | null>(null);

export function useManage(): ManageCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useManage must be used inside <ManageProvider>");
  return c;
}

/**
 * The latest cached copy of `row` (any entity list that contains it), so open
 * panels reflect status flips and saved changes without being reopened.
 */
export function useFreshRow<T extends AnyRow>(row: T): T {
  const qc = useQueryClient();
  const { orgId } = useManage();
  const find = useCallback((): T => {
    let best: T | undefined;
    for (const [, data] of qc.getQueriesData<unknown>({ queryKey: entityKeys.all(orgId) })) {
      const d = data as { rows?: T[]; campaign?: T } | undefined;
      const hit = d?.rows?.find((r) => r.id === row.id) ?? (d?.campaign?.id === row.id ? d.campaign : undefined);
      // Any cached copy works; prefer one that carries range metrics.
      if (hit && (!best || (!best.metrics && hit.metrics))) best = hit;
    }
    return best ?? row;
  }, [qc, orgId, row]);
  return useSyncExternalStore((cb) => qc.getQueryCache().subscribe(cb), find, () => row);
}

/** Sentence-case level label for a provider: Meta "Ad set", Google "Ad group". */
function levelKey(level: Level): keyof EntityLabels {
  return level === "ad_group" ? "ad_group" : level;
}

/** Spend-increasing parts of a change, as sentences for the confirm dialog. */
export function spendRisks(level: Level, row: AnyRow, patch: AnyPatch, entityWord: string): string[] {
  const cur = row.currency;
  const out: string[] = [];
  const b = row as { daily_budget?: number | null; lifetime_budget?: number | null };
  if (patch.status === "active" && row.status !== "active") {
    const next = {
      daily_budget: patch.daily_budget !== undefined ? patch.daily_budget : b.daily_budget,
      lifetime_budget: patch.lifetime_budget !== undefined ? patch.lifetime_budget : b.lifetime_budget,
    };
    const phrase = budgetPhrase(next, cur);
    out.push(
      phrase
        ? `This ${entityWord} will start delivering and can spend up to ${phrase} (${cur}).`
        : `This ${entityWord} will start delivering and spend from its ${level === "ad" ? "ad set's or ad group's" : "campaign's"} budget (${cur}).`,
    );
  }
  if (patch.daily_budget != null && (b.daily_budget == null || patch.daily_budget > b.daily_budget)) {
    out.push(
      b.daily_budget != null
        ? `Daily budget goes up from ${formatMoney(b.daily_budget, cur)} to ${formatMoney(patch.daily_budget, cur)} (${cur}).`
        : `Daily budget set to ${formatMoney(patch.daily_budget, cur)} (${cur}).`,
    );
  }
  if (patch.lifetime_budget != null && (b.lifetime_budget == null || patch.lifetime_budget > b.lifetime_budget)) {
    out.push(
      b.lifetime_budget != null
        ? `Lifetime budget goes up from ${formatMoney(b.lifetime_budget, cur)} to ${formatMoney(patch.lifetime_budget, cur)} (${cur}).`
        : `Lifetime budget set to ${formatMoney(patch.lifetime_budget, cur)} (${cur}).`,
    );
  }
  if (patch.spend_cap === null && row.spend_cap !== null) {
    out.push(
      row.spend_cap != null
        ? `The ${formatMoney(row.spend_cap, cur)} spend cap is removed, so spending is limited only by the budget.`
        : `Any spend cap is removed, so spending is limited only by the budget.`,
    );
  } else if (patch.spend_cap != null && row.spend_cap != null && patch.spend_cap > row.spend_cap) {
    out.push(`Spend cap goes up from ${formatMoney(row.spend_cap, cur)} to ${formatMoney(patch.spend_cap, cur)} (${cur}).`);
  }
  if (patch.bid_amount != null && row.bid_amount != null && patch.bid_amount > row.bid_amount) {
    out.push(`Bid goes up from ${formatMoney(row.bid_amount, cur, true)} to ${formatMoney(patch.bid_amount, cur, true)}.`);
  }
  return out;
}

export function ManageProvider({
  orgId,
  labels = FALLBACK_LABELS,
  children,
  renderEdit,
  renderCreate,
}: {
  orgId: string;
  labels?: ProviderLabels;
  children: React.ReactNode;
  /** Renders the edit sheet for the open target (null when closed). */
  renderEdit?: (target: Target | null, close: () => void) => React.ReactNode;
  renderCreate?: (req: CreateRequest | null, close: () => void) => React.ReactNode;
}) {
  const canManage = useCanManage();
  const updCampaign = useUpdateCampaign(orgId);
  const updAdGroup = useUpdateAdGroup(orgId);
  const updAd = useUpdateAd(orgId);
  const archiveM = useArchive(orgId);
  const bulkM = useBulkStatus(orgId);

  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<(ConfirmOpts & { open: boolean }) | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [editTarget, setEditTarget] = useState<Target | null>(null);
  const [createReq, setCreateReq] = useState<CreateRequest | null>(null);

  const mark = useCallback((ids: string[], on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const confirm = useCallback((opts: ConfirmOpts) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setDialog({ ...opts, open: true });
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setDialog((d) => (d ? { ...d, open: false } : d));
  };

  const labelsFor = useCallback((p: Provider) => labels[p] ?? FALLBACK_LABELS[p], [labels]);
  const levelLabel = useCallback((p: Provider, level: Level) => labelsFor(p)[levelKey(level)], [labelsFor]);
  const blocked = useCallback(
    (provider: Provider, level: Level, cap: Capability) => blockedReason(canManage, provider, level, cap),
    [canManage],
  );

  const run = useCallback(
    async (level: Level, row: AnyRow, patch: AnyPatch) => {
      if (level === "campaign") return updCampaign.mutateAsync({ id: row.id, patch });
      if (level === "ad_group") return updAdGroup.mutateAsync({ id: row.id, patch });
      return updAd.mutateAsync({ id: row.id, patch: { status: patch.status, name: patch.name } });
    },
    [updCampaign, updAdGroup, updAd],
  );

  const update = useCallback(
    async (level: Level, row: AnyRow, patch: AnyPatch, successText?: string) => {
      const word = levelLabel(row.provider, level);
      const caps: Capability[] = [];
      if (patch.status !== undefined) caps.push("status");
      if (patch.daily_budget !== undefined || patch.lifetime_budget !== undefined) caps.push("budget");
      if (patch.name !== undefined) caps.push("name");
      if (patch.end_time !== undefined) caps.push("schedule");
      if (patch.spend_cap !== undefined) caps.push("spend_cap");
      if (patch.bid_amount !== undefined) caps.push("bid");
      for (const cap of caps) {
        const why = blocked(row.provider, level, cap);
        if (why) {
          toast.error(`Can't change this ${word.toLowerCase()}`, { description: why });
          return false;
        }
      }
      const risks = spendRisks(level, row, patch, word.toLowerCase());
      if (risks.length > 0) {
        const turningOn = patch.status === "active";
        const ok = await confirm({
          title: turningOn ? `Turn on “${row.name}”?` : `Confirm spending change`,
          description: (
            <span className="grid gap-1.5">
              {risks.map((r) => (
                <span key={r}>{r}</span>
              ))}
              <span className="text-fg-subtle">The change goes to {row.provider === "meta" ? "Meta" : "Google"} right away.</span>
            </span>
          ),
          confirmLabel: turningOn ? "Turn on" : "Confirm change",
          destructive: false,
        });
        if (!ok) return false;
      }
      mark([row.id], true);
      try {
        await run(level, row, patch);
        toast.success(successText ?? `${word} updated`, { description: row.name });
        return true;
      } catch (e) {
        errorToast(`Couldn't update “${row.name}”`, e);
        return false;
      } finally {
        mark([row.id], false);
      }
    },
    [blocked, confirm, levelLabel, mark, run],
  );

  const setStatus = useCallback(
    (level: Level, row: AnyRow, status: ManageStatus) =>
      update(level, row, { status }, `${levelLabel(row.provider, level)} turned ${status === "active" ? "on" : "off"}`),
    [update, levelLabel],
  );

  const archive = useCallback(
    async (level: Level, row: AnyRow) => {
      const word = levelLabel(row.provider, level);
      const why = blocked(row.provider, level, "archive");
      if (why) {
        toast.error(`Can't archive this ${word.toLowerCase()}`, { description: why });
        return false;
      }
      const ok = await confirm({
        title: `Archive “${row.name}”?`,
        description: `Archiving stops delivery for this ${word.toLowerCase()} and everything in it. It can't be turned back on.`,
        confirmLabel: "Archive",
      });
      if (!ok) return false;
      mark([row.id], true);
      try {
        await archiveM.mutateAsync({ level, id: row.id });
        toast.success(`${word} archived`, { description: row.name });
        return true;
      } catch (e) {
        errorToast(`Couldn't archive “${row.name}”`, e);
        return false;
      } finally {
        mark([row.id], false);
      }
    },
    [archiveM, blocked, confirm, levelLabel, mark],
  );

  const bulkStatus = useCallback(
    async (level: Level, rows: AnyRow[], status: ManageStatus) => {
      if (rows.length === 0) return;
      const cap: Capability = status === "archived" ? "archive" : "status";
      const allowed = rows.filter((r) => !blocked(r.provider, level, cap));
      const skipped = rows.length - allowed.length;
      if (allowed.length === 0) {
        toast.error("Nothing to change", { description: blocked(rows[0].provider, level, cap) ?? undefined });
        return;
      }
      const word = levelLabel(allowed[0].provider, level).toLowerCase();
      const noun = `${allowed.length} ${allowed.length === 1 ? word : word.endsWith("s") ? word : `${word}s`}`;
      if (status === "active") {
        const turningOn = allowed.filter((r) => r.status !== "active");
        const byCur = new Map<string, number>();
        let withoutBudget = 0;
        for (const r of turningOn) {
          const d = (r as { daily_budget?: number | null }).daily_budget;
          if (d != null) byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + d);
          else withoutBudget++;
        }
        const sums = [...byCur].map(([c, v]) => `${formatMoney(v, c)} a day (${c})`).join(" + ");
        const ok = await confirm({
          title: `Turn on ${noun}?`,
          description: (
            <span className="grid gap-1.5">
              <span>
                {turningOn.length} will start delivering
                {sums ? <> with combined daily budgets of up to {sums}</> : null}.
              </span>
              {withoutBudget > 0 && (
                <span>
                  {withoutBudget} spend from a lifetime or parent budget not included in that total.
                </span>
              )}
              {skipped > 0 && <span className="text-fg-subtle">{skipped} selected can&apos;t be changed here and are skipped.</span>}
            </span>
          ),
          confirmLabel: "Turn on",
          destructive: false,
        });
        if (!ok) return;
      } else if (status === "archived") {
        const ok = await confirm({
          title: `Archive ${noun}?`,
          description: `Archiving stops delivery and can't be undone.${skipped > 0 ? ` ${skipped} selected can't be archived here and are skipped.` : ""}`,
          confirmLabel: "Archive",
        });
        if (!ok) return;
      }
      const ids = allowed.map((r) => r.id);
      mark(ids, true);
      try {
        const res = await bulkM.mutateAsync({ level, ids, status });
        const failed = (res?.results ?? []).filter((r) => !r.ok);
        const done = ids.length - failed.length;
        const verb = status === "active" ? "turned on" : status === "paused" ? "turned off" : "archived";
        if (failed.length === 0) toast.success(`${noun} ${verb}`);
        else {
          const names = new Map(allowed.map((r) => [r.id, r.name]));
          toast.error(`${done} of ${ids.length} ${verb}; ${failed.length} failed`, {
            description: (
              <ul className="grid gap-1">
                {failed.slice(0, 5).map((f) => (
                  <li key={f.id}>
                    <span className="font-medium">{names.get(f.id) ?? f.id}:</span> {f.error ?? "Failed"}
                  </li>
                ))}
                {failed.length > 5 && <li>…and {failed.length - 5} more</li>}
              </ul>
            ),
            duration: 12000,
          });
        }
      } catch (e) {
        errorToast(`Couldn't change ${noun}`, e);
      } finally {
        mark(ids, false);
      }
    },
    [blocked, bulkM, confirm, levelLabel, mark],
  );

  const value = useMemo<ManageCtx>(
    () => ({
      orgId,
      canManage,
      labels,
      labelsFor,
      levelLabel,
      blocked,
      isBusy: (id) => busy.has(id),
      confirm,
      setStatus,
      update,
      archive,
      bulkStatus,
      openEdit: setEditTarget,
      openCreate: setCreateReq,
    }),
    [orgId, canManage, labels, labelsFor, levelLabel, blocked, busy, confirm, setStatus, update, archive, bulkStatus],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {renderEdit?.(editTarget, () => setEditTarget(null))}
      {renderCreate?.(createReq, () => setCreateReq(null))}
      {dialog && (
        <ConfirmDialog
          open={dialog.open}
          onOpenChange={(o) => !o && settle(false)}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          destructive={dialog.destructive ?? true}
          onConfirm={() => settle(true)}
        />
      )}
    </Ctx.Provider>
  );
}
