"use client";

/**
 * Right-side quick-edit panel (~520px) for a campaign, ad set/ad group or ad.
 * Only changed fields are sent; spend increases go through the confirm step in
 * ManageProvider.update.
 */

import { useState } from "react";
import Link from "next/link";
import { Archive, BarChart3, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type AnyPatch, type Target, useFreshRow, useManage } from "@/components/app/campaigns/manage-context";
import { DeliveryCell, StatusSwitch, WhyDisabled } from "@/components/app/campaigns/row-controls";
import { ProviderMark } from "@/components/app/campaigns/entity-bits";
import {
  formatCount,
  formatMoney,
  formatRatio,
  objectiveLabel,
} from "@/components/app/campaigns/format";
import { cn } from "@/lib/utils";

export function EditSheet({ target, onClose }: { target: Target | null; onClose: () => void }) {
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 bg-surface p-0 sm:max-w-[520px]">
        {target && <EditForm key={`${target.level}:${target.row.id}`} target={target} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

/** "2026-10-31T23:59" for <input type="datetime-local"> in the viewer's zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function num(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function EditForm({ target, onClose }: { target: Target; onClose: () => void }) {
  const m = useManage();
  const { level } = target;
  // Follow cache updates (status flips, saved budgets) while the panel is open.
  const row = useFreshRow(target.row);
  const word = m.levelLabel(row.provider, level);
  const b = row as { daily_budget?: number | null; lifetime_budget?: number | null };
  const budgetKind: "daily" | "lifetime" | null =
    level === "ad" ? null : b.daily_budget != null ? "daily" : b.lifetime_budget != null ? "lifetime" : null;
  const budgetNow = budgetKind === "daily" ? b.daily_budget! : budgetKind === "lifetime" ? b.lifetime_budget! : null;
  const terminal = row.status === "archived" || row.status === "deleted";

  const [name, setName] = useState(row.name);
  const [budget, setBudget] = useState(budgetNow != null ? String(budgetNow) : "");
  const [endTime, setEndTime] = useState(toLocalInput(row.end_time));
  const [clearEnd, setClearEnd] = useState(false);
  const [spendCap, setSpendCap] = useState(row.spend_cap != null ? String(row.spend_cap) : "");
  const [removeCap, setRemoveCap] = useState(false);
  const [bid, setBid] = useState(row.bid_amount != null ? String(row.bid_amount) : "");
  const [saving, setSaving] = useState(false);
  const [openedAt] = useState(Date.now);
  const [error, setError] = useState<string | null>(null);

  const why = {
    name: m.blocked(row.provider, level, "name"),
    budget:
      m.blocked(row.provider, level, "budget") ??
      (row.provider === "google" && budgetKind === "lifetime" ? "Google budgets can only be changed as daily budgets." : null),
    schedule: m.blocked(row.provider, level, "schedule"),
    cap: m.blocked(row.provider, level, "spend_cap"),
    bid: m.blocked(row.provider, level, "bid"),
    archive: m.blocked(row.provider, level, "archive"),
  };
  const readOnly = !m.canManage || terminal;

  // Build the patch from what changed.
  const patch: AnyPatch = {};
  const problems: string[] = [];
  if (name.trim() !== row.name && !why.name) {
    if (!name.trim()) problems.push("Enter a name.");
    else patch.name = name.trim();
  }
  if (budgetKind && !why.budget) {
    const v = num(budget);
    if (v == null || Number.isNaN(v) || v <= 0) problems.push("Enter a budget above zero.");
    else if (v !== budgetNow) patch[budgetKind === "daily" ? "daily_budget" : "lifetime_budget"] = v;
  }
  if (level !== "ad" && !why.schedule) {
    if (clearEnd) {
      if (row.end_time !== null) patch.end_time = null;
    } else if (endTime && endTime !== toLocalInput(row.end_time)) {
      const d = new Date(endTime);
      if (Number.isNaN(d.getTime())) problems.push("Enter a valid end date.");
      else if (d.getTime() < openedAt) problems.push("The end date must be in the future.");
      else patch.end_time = d.toISOString();
    }
  }
  if (level === "campaign" && !why.cap) {
    if (removeCap) patch.spend_cap = null;
    else if (spendCap.trim() !== "" && Number(spendCap) !== row.spend_cap) {
      const v = num(spendCap);
      if (v == null || Number.isNaN(v) || v <= 0) problems.push("Enter a spend cap above zero.");
      else patch.spend_cap = v;
    }
  }
  if (level === "ad_group" && !why.bid && bid.trim() !== "" && Number(bid) !== row.bid_amount) {
    const v = num(bid);
    if (v == null || Number.isNaN(v) || v <= 0) problems.push("Enter a bid above zero.");
    else patch.bid_amount = v;
  }
  const dirty = Object.keys(patch).length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    if (!dirty) return;
    setError(null);
    setSaving(true);
    const ok = await m.update(level, row, patch, "Changes saved");
    setSaving(false);
    if (ok) onClose();
  }

  const mt = row.metrics;
  const chartsHref =
    level === "campaign" ? `/app/campaigns/${row.id}` : `/app/campaigns/${(row as { campaign_id: string }).campaign_id}`;

  return (
    <form onSubmit={save} className="flex h-full min-h-0 flex-col">
      <SheetHeader className="gap-1.5 border-b border-border px-5 py-4 pr-12">
        <div className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
          <ProviderMark provider={row.provider} className="size-4 text-[0.5625rem]" />
          <span className="truncate">{row.account_name}</span>
          <span aria-hidden="true">·</span>
          <span>{word}</span>
          {level === "campaign" && "objective" in row && row.objective && (
            <>
              <span aria-hidden="true">·</span>
              <span>{objectiveLabel(row.objective)}</span>
            </>
          )}
        </div>
        <SheetTitle className="truncate text-base leading-snug font-semibold text-fg">{row.name}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex items-center gap-3 text-sm">
            <StatusSwitch level={level} row={row} size="default" />
            <DeliveryCell row={row} />
            <Link href={chartsHref} className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <BarChart3 className="size-3.5" aria-hidden="true" /> View charts
            </Link>
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 py-4">
        {mt && (
          <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
            <Mini label="Spent" value={formatMoney(mt.spend, row.currency)} />
            <Mini label="Results" value={formatCount(mt.conversions)} />
            <Mini label="Cost/result" value={formatMoney(mt.cpa, row.currency, true)} />
            <Mini label="ROAS" value={formatRatio(mt.roas)} />
          </dl>
        )}

        {(!m.canManage || row.provider === "google" || terminal) && (
          <p className="flex gap-2 rounded-md bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {terminal
              ? `This ${word.toLowerCase()} is ${row.status}; it can't be edited.`
              : !m.canManage
                ? "You have view access. Ask an admin or owner to make changes."
                : "For Google Ads, Adwise can change only campaign status and daily budget. Other fields are read-only."}
          </p>
        )}

        <Section title="Name">
          <FieldRow id="edit-name" label={`${word} name`} reason={readOnly ? null : why.name}>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly || !!why.name}
              autoFocus={target.focus === "name"}
              className="h-8"
              maxLength={400}
            />
          </FieldRow>
        </Section>

        {level !== "ad" && (
          <Section title="Budget">
            {budgetKind ? (
              <FieldRow
                id="edit-budget"
                label={`${budgetKind === "daily" ? "Daily" : "Lifetime"} budget (${row.currency})`}
                reason={readOnly ? null : why.budget}
                hint={`Now ${formatMoney(budgetNow, row.currency)}. Raising it asks you to confirm.`}
              >
                <Input
                  id="edit-budget"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="any"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  disabled={readOnly || !!why.budget}
                  autoFocus={target.focus === "budget"}
                  className="h-8 tabular-nums"
                />
              </FieldRow>
            ) : (
              <p className="text-sm text-fg-muted">
                {level === "campaign"
                  ? `This campaign uses ${m.levelLabel(row.provider, "ad_group").toLowerCase()} budgets. Edit the budget on each ${m.levelLabel(row.provider, "ad_group").toLowerCase()}.`
                  : "This uses its campaign's budget (Advantage campaign budget). Edit the budget on the campaign."}
              </p>
            )}
          </Section>
        )}

        {level !== "ad" && (
          <Section title={level === "campaign" ? "Schedule and spend cap" : "Schedule and bid"}>
            <FieldRow
              id="edit-end"
              label="End date"
              reason={readOnly ? null : why.schedule}
              hint={row.end_time === undefined ? "Leave blank to keep the current end date." : row.end_time ? undefined : "Runs continuously."}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="edit-end"
                  type="datetime-local"
                  value={clearEnd ? "" : endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setClearEnd(false);
                  }}
                  disabled={readOnly || !!why.schedule || clearEnd}
                  autoFocus={target.focus === "schedule"}
                  className="h-8"
                />
                {row.end_time !== null && !why.schedule && !readOnly && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setClearEnd((v) => !v)}>
                    {clearEnd ? "Keep end date" : "No end date"}
                  </Button>
                )}
              </div>
            </FieldRow>
            {level === "campaign" && (
              <FieldRow
                id="edit-cap"
                label={`Campaign spend cap (${row.currency})`}
                reason={readOnly ? null : why.cap}
                hint={
                  removeCap
                    ? "The cap will be removed; spending is then limited only by the budget."
                    : row.spend_cap === undefined
                      ? "Leave blank to keep the current cap. Delivery stops once this much is spent."
                      : row.spend_cap == null
                        ? "No cap. Delivery stops once this much is spent."
                        : `Now ${formatMoney(row.spend_cap, row.currency)}.`
                }
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-cap"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="any"
                    placeholder="No cap"
                    value={removeCap ? "" : spendCap}
                    onChange={(e) => setSpendCap(e.target.value)}
                    disabled={readOnly || !!why.cap || removeCap}
                    className="h-8 tabular-nums"
                  />
                  {row.spend_cap !== null && !why.cap && !readOnly && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveCap((v) => !v)}>
                      {removeCap ? "Keep cap" : "Remove cap"}
                    </Button>
                  )}
                </div>
              </FieldRow>
            )}
            {level === "ad_group" && (
              <FieldRow
                id="edit-bid"
                label={`Bid cap (${row.currency})`}
                reason={readOnly ? null : why.bid}
                hint={row.bid_amount != null ? `Now ${formatMoney(row.bid_amount, row.currency, true)}.` : "Only used with bid-cap or cost-cap bidding. Leave blank to keep."}
              >
                <Input
                  id="edit-bid"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step="any"
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  disabled={readOnly || !!why.bid}
                  className="h-8 tabular-nums"
                />
              </FieldRow>
            )}
          </Section>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
      </div>

      <SheetFooter className="flex-row items-center gap-2 border-t border-border px-5 py-3">
        {!terminal && (
          <WhyDisabled reason={why.archive}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger-fg"
              disabled={!!why.archive}
              onClick={async () => {
                if (await m.archive(level, row)) onClose();
              }}
            >
              <Archive aria-hidden="true" /> Archive
            </Button>
          </WhyDisabled>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {dirty ? "Cancel" : "Close"}
          </Button>
          {!readOnly && (
            <Button type="submit" size="sm" disabled={!dirty || saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save changes
            </Button>
          )}
        </div>
      </SheetFooter>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-xs font-medium tracking-wide text-fg-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function FieldRow({
  id,
  label,
  hint,
  reason,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  reason: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", reason && "opacity-70")}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <WhyDisabled reason={reason} className="flex w-full">
        <div className="w-full">{children}</div>
      </WhyDisabled>
      {hint && !reason && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-2.5 py-2">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-fg tabular-nums">{value}</dd>
    </div>
  );
}
