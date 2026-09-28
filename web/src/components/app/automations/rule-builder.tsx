"use client";

import { useState } from "react";
import { Eye, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { errorMessage } from "@/components/app/analytics/states";
import { formatMoney, formatNumber, formatPercent, formatRoas } from "@/components/app/analytics/format";
import { ChangeSummary } from "@/components/app/actions/action-bits";
import {
  isTrendOp,
  usePreviewRule,
  useSaveRule,
  type Condition,
  type ConditionMetric,
  type ConditionOp,
  type Rule,
  type RuleActionType,
  type RuleInput,
  type RuleLevel,
  type RulePreview,
} from "@/lib/automation-api";
import { cn } from "@/lib/utils";
import { METRIC_OPTIONS, OP_OPTIONS, cooldownLabel, intervalLabel, metricKind } from "./templates";
import { TargetPicker } from "./target-picker";

const ACTIONS: { id: RuleActionType; label: string; unit?: "pct" | "money" }[] = [
  { id: "pause", label: "pause it" },
  { id: "activate", label: "activate it" },
  { id: "increase_budget", label: "raise its daily budget by", unit: "pct" },
  { id: "decrease_budget", label: "lower its daily budget by", unit: "pct" },
  { id: "set_budget", label: "set its daily budget to", unit: "money" },
  { id: "notify", label: "only log it (notify)" },
];

const BUDGET_ACTIONS: RuleActionType[] = ["increase_budget", "decrease_budget", "set_budget"];

const LEVELS: { id: RuleLevel; label: string; noun: string }[] = [
  { id: "campaign", label: "Campaigns", noun: "campaign" },
  { id: "ad_group", label: "Ad sets", noun: "ad set" },
  { id: "ad", label: "Ads", noun: "ad" },
];

export const levelNoun = (l: RuleLevel | undefined) => LEVELS.find((x) => x.id === (l ?? "campaign"))!.noun;

const INTERVALS = [15, 30, 60, 180, 360, 1440];
const COOLDOWNS = [0, 60, 360, 720, 1440, 4320, 10080];
const LOOKBACKS = [1, 3, 7, 14, 30];

const EMPTY: RuleInput = {
  name: "",
  level: "campaign",
  scope_type: "org",
  scope_ids: [],
  conditions: [{ metric: "spend", op: "gt", value: 500 }],
  lookback_days: 3,
  action: { type: "pause" },
  check_interval_minutes: 60,
  cooldown_minutes: 1440,
  max_changes_per_run: 10,
  enabled: false,
  dry_run: true,
};

function toInput(r: Rule): RuleInput {
  return {
    name: r.name,
    level: r.level ?? "campaign",
    scope_type: r.scope_type,
    scope_ids: r.scope_ids,
    conditions: r.conditions,
    lookback_days: r.lookback_days,
    action: r.action,
    check_interval_minutes: r.check_interval_minutes,
    cooldown_minutes: r.cooldown_minutes,
    max_changes_per_run: r.max_changes_per_run,
    enabled: r.enabled,
    dry_run: r.dry_run,
  };
}

/**
 * Conditions are edited in display units (CTR in %), stored as fractions.
 * Trend conditions are edited as a positive percentage ("fell by more than
 * 25") and stored as a signed fraction (-0.25).
 */
function displayValue(c: Condition) {
  if (isTrendOp(c.op)) return +(Math.abs(c.value) * 100).toFixed(2);
  return metricKind(c.metric) === "percent" ? +(c.value * 100).toFixed(4) : c.value;
}
function storedValue(c: Condition, v: number) {
  if (isTrendOp(c.op)) return c.op === "change_lt" ? -Math.abs(v) / 100 : Math.abs(v) / 100;
  return metricKind(c.metric) === "percent" ? v / 100 : v;
}

/** Switching between a plain and a trend operator resets the value to a sensible default. */
function withOp(c: Condition, op: ConditionOp): Partial<Condition> {
  if (isTrendOp(op) === isTrendOp(c.op)) {
    return isTrendOp(op) ? { op, value: op === "change_lt" ? -Math.abs(c.value) : Math.abs(c.value) } : { op };
  }
  return { op, value: op === "change_lt" ? -0.2 : op === "change_gt" ? 0.2 : 0 };
}

function Mini({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-xs font-medium text-fg-muted", className)}>{children}</span>;
}

export function RuleBuilderSheet({
  orgId,
  rule,
  seed,
  readOnly,
  onClose,
}: {
  orgId: string | undefined;
  rule?: Rule;
  seed?: RuleInput;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const [f, setF] = useState<RuleInput>(() => (rule ? toInput(rule) : { ...(seed ?? EMPTY) }));
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [confirm, setConfirm] = useState<null | { enable: boolean }>(null);
  const previewM = usePreviewRule(orgId);
  const save = useSaveRule(orgId);
  const set = <K extends keyof RuleInput>(k: K, v: RuleInput[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setPreview(null);
  };
  const setCond = (i: number, c: Partial<Condition>) =>
    set(
      "conditions",
      f.conditions.map((x, j) => (j === i ? { ...x, ...c } : x)),
    );
  const actionInfo = ACTIONS.find((a) => a.id === f.action.type)!;
  const level = f.level ?? "campaign";
  const noun = levelNoun(level);
  const actions = level === "ad" ? ACTIONS.filter((a) => !BUDGET_ACTIONS.includes(a.id)) : ACTIONS;
  const hasTrend = f.conditions.some((c) => isTrendOp(c.op));
  const setLevel = (l: RuleLevel) =>
    setF((p) => ({
      ...p,
      level: l,
      // Ads have no budget of their own.
      action: l === "ad" && BUDGET_ACTIONS.includes(p.action.type) ? { type: "pause" } : p.action,
    }));
  const budgetRule = f.action.type === "increase_budget" || f.action.type === "decrease_budget" || f.action.type === "set_budget";

  const runPreview = () =>
    previewM.mutate(f, { onSuccess: setPreview, onError: (e) => toast.error(errorMessage(e)) });

  const doSave = (enable: boolean) => {
    const body = { ...f, enabled: enable, name: f.name.trim() || "Untitled rule" };
    save.mutate(
      { id: rule?.id, body },
      {
        onSuccess: () => {
          toast.success(`${body.name} saved${enable ? (body.dry_run ? " and enabled (dry run)" : " and live") : ""}`);
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  const requestSave = (enable: boolean) => {
    // Going live (or re-saving an enabled live rule) needs an explicit confirmation.
    if (enable && !f.dry_run && (!rule || rule.dry_run || !rule.enabled || budgetRule)) setConfirm({ enable });
    else doSave(enable);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-border px-5 py-3">
          <SheetTitle>{rule ? "Edit rule" : "New rule"}</SheetTitle>
          <SheetDescription className="text-xs">
            Checked {intervalLabel(f.check_interval_minutes)} against the last {f.lookback_days} days of data. Nothing runs until
            you enable it, and dry run only records what it would do.
          </SheetDescription>
        </SheetHeader>

        <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-1">
            <Label htmlFor="rule-name" className="text-xs">
              Name
            </Label>
            <Input
              id="rule-name"
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Stop wasted spend"
              className="h-8"
              disabled={readOnly}
            />
          </div>

          <fieldset className="grid gap-2 rounded-lg border border-border p-3" disabled={readOnly}>
            <legend className="px-1 text-xs font-medium text-fg-muted">When</legend>
            <p className="text-sm text-fg">If {noun === "ad" ? "an" : "a"} {noun}’s</p>
            {f.conditions.map((c, i) => {
              const kind = metricKind(c.metric);
              return (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  {i > 0 ? <Mini className="w-8">and</Mini> : <span className="w-8" />}
                  <Select value={c.metric} onValueChange={(v) => setCond(i, { metric: v as ConditionMetric })}>
                    <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Metric">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METRIC_OPTIONS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={c.op} onValueChange={(v) => setCond(i, withOp(c, v as ConditionOp))}>
                    <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Comparison">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OP_OPTIONS.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    {kind === "money" && !isTrendOp(c.op) ? (
                      <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-fg-subtle">₹</span>
                    ) : null}
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={displayValue(c)}
                      onChange={(e) => setCond(i, { value: storedValue(c, Number(e.target.value) || 0) })}
                      className={cn("h-8 w-28 text-xs tabular-nums", kind === "money" && !isTrendOp(c.op) && "pl-5")}
                      aria-label="Value"
                    />
                    {isTrendOp(c.op) || kind === "percent" || c.metric === "roas" ? (
                      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-fg-subtle">
                        {isTrendOp(c.op) || kind === "percent" ? "%" : "×"}
                      </span>
                    ) : null}
                  </div>
                  {isTrendOp(c.op) ? <Mini>vs the previous {f.lookback_days} days</Mini> : null}
                  {f.conditions.length > 1 ? (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Remove condition"
                      onClick={() => set("conditions", f.conditions.filter((_, j) => j !== i))}
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-8" />
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => set("conditions", [...f.conditions, { metric: "conversions", op: "eq", value: 0 }])}
                disabled={f.conditions.length >= 6}
              >
                <Plus /> Condition
              </Button>
              <Mini className="ml-3">in the last</Mini>
              <Select value={String(f.lookback_days)} onValueChange={(v) => set("lookback_days", Number(v))}>
                <SelectTrigger size="sm" className="h-8 w-24 text-xs" aria-label="Lookback window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOOKBACKS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} day{d === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <fieldset className="grid gap-2 rounded-lg border border-border p-3" disabled={readOnly}>
            <legend className="px-1 text-xs font-medium text-fg-muted">Then</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select value={f.action.type} onValueChange={(v) => set("action", { type: v as RuleActionType, value: v === "increase_budget" || v === "decrease_budget" ? 20 : v === "set_budget" ? 500 : undefined })}>
                <SelectTrigger size="sm" className="h-8 w-60 text-xs" aria-label="Action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {actionInfo.unit ? (
                <div className="relative">
                  {actionInfo.unit === "money" ? (
                    <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-fg-subtle">₹</span>
                  ) : null}
                  <Input
                    type="number"
                    min={0}
                    value={f.action.value ?? 0}
                    onChange={(e) => set("action", { ...f.action, value: Number(e.target.value) || 0 })}
                    className={cn("h-8 w-24 text-xs tabular-nums", actionInfo.unit === "money" && "pl-5")}
                    aria-label="Action value"
                  />
                  {actionInfo.unit === "pct" ? (
                    <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-fg-subtle">%</span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {level === "ad" ? (
              <p className="text-xs text-fg-subtle">Ads have no budget of their own, so ad rules pause, activate or log.</p>
            ) : null}
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <label className="grid gap-1">
                <Mini>Check</Mini>
                <Select value={String(f.check_interval_minutes)} onValueChange={(v) => set("check_interval_minutes", Number(v))}>
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {intervalLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1">
                <Mini>Cooldown per {noun}</Mini>
                <Select value={String(f.cooldown_minutes)} onValueChange={(v) => set("cooldown_minutes", Number(v))}>
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COOLDOWNS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {cooldownLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1">
                <Mini>Max changes per run</Mini>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={f.max_changes_per_run}
                  onChange={(e) => set("max_changes_per_run", Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="h-8 text-xs tabular-nums"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="grid gap-2 rounded-lg border border-border p-3" disabled={readOnly}>
            <legend className="px-1 text-xs font-medium text-fg-muted">Applies to</legend>
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Level">
              <Mini className="mr-1">Check each</Mini>
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={level === l.id}
                  onClick={() => setLevel(l.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs",
                    level === l.id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:text-fg",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Scope">
              {(
                [
                  ["org", level === "campaign" ? "All campaigns" : "Everywhere"],
                  ["account", "Accounts"],
                  ["campaigns", level === "campaign" ? "Specific campaigns" : "In specific campaigns"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={f.scope_type === id}
                  onClick={() => setF((p) => ({ ...p, scope_type: id, scope_ids: p.scope_type === id ? p.scope_ids : [] }))}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs",
                    f.scope_type === id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {f.scope_type !== "org" ? (
              <TargetPicker
                orgId={orgId}
                kind={f.scope_type === "account" ? "accounts" : "campaigns"}
                value={f.scope_ids}
                onChange={(ids) => set("scope_ids", ids)}
                disabled={readOnly}
                maxHeight="12rem"
              />
            ) : null}
          </fieldset>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-fg">Dry run</p>
              <p className="text-xs text-fg-muted">
                {f.dry_run
                  ? "Records what it would change, as dry-run actions. Nothing is sent to Meta or Google."
                  : `Live: matching ${noun}s are changed on Meta or Google.`}
              </p>
            </div>
            <Switch checked={f.dry_run} onCheckedChange={(v) => set("dry_run", v)} disabled={readOnly} aria-label="Dry run" />
          </div>

          <section aria-labelledby="rule-preview-h" className="grid gap-2">
            <div className="flex items-center justify-between">
              <h3 id="rule-preview-h" className="text-sm font-semibold text-fg">
                Preview
              </h3>
              <Button size="xs" variant="outline" onClick={runPreview} disabled={previewM.isPending}>
                {previewM.isPending ? <Loader2 className="animate-spin" /> : <Eye />} {preview ? "Refresh" : "Run preview"}
              </Button>
            </div>
            {preview ? <RulePreviewTable preview={preview} /> : (
              <p className="text-xs text-fg-muted">
                See which {noun}s match right now and what would change. A preview never changes anything.
                {hasTrend ? ` Trend conditions compare the last ${f.lookback_days} days with the ${f.lookback_days} before.` : ""}
              </p>
            )}
          </section>
        </div>

        {!readOnly ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={() => requestSave(rule?.enabled ?? false)} disabled={save.isPending}>
              Save{rule?.enabled ? "" : " (disabled)"}
            </Button>
            {!rule?.enabled ? (
              <Button size="sm" onClick={() => requestSave(true)} disabled={save.isPending || !preview}>
                {f.dry_run ? "Save & enable dry run" : "Save & go live"}
              </Button>
            ) : null}
          </div>
        ) : null}
        {!readOnly && !rule?.enabled && !preview ? (
          <p className="px-5 pb-3 text-right text-xs text-fg-subtle">Run the preview before enabling.</p>
        ) : null}
      </SheetContent>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={budgetRule ? "Enable a live budget rule?" : "Enable a live rule?"}
        description={
          <>
            This rule is live. {intervalLabel(f.check_interval_minutes).replace(/^./, (c) => c.toUpperCase())}, it will{" "}
            {actionInfo.label}
            {actionInfo.unit === "pct" ? ` ${f.action.value}%` : actionInfo.unit === "money" ? ` ₹${f.action.value}` : ""} for up to{" "}
            {f.max_changes_per_run} matching {noun}s on Meta or Google
            {budgetRule ? ", changing real daily budgets" : ""}. Each {noun} waits {cooldownLabel(f.cooldown_minutes)} before it
            can be changed again, and every change is logged in Actions.
            {preview ? ` Right now it would change ${preview.changes.filter((c) => !c.skip_reason).length} ${noun}(s).` : ""}
          </>
        }
        confirmLabel="Go live"
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c) doSave(c.enable);
        }}
      />
    </Sheet>
  );
}

function fmtActual(metric: ConditionMetric, v: number | null | undefined, currency: string) {
  const kind = metricKind(metric);
  if (v == null) return "—";
  if (kind === "money") return formatMoney(v, currency);
  if (kind === "percent") return formatPercent(v, 2);
  if (metric === "roas") return formatRoas(v);
  return formatNumber(Math.round(v * 100) / 100);
}

export function RulePreviewTable({ preview }: { preview: RulePreview }) {
  const changes = new Map(preview.changes.map((c) => [c.target_id, c]));
  const matched = preview.targets.filter((t) => t.matched);
  const others = preview.targets.filter((t) => !t.matched);
  const wouldChange = preview.changes.filter((c) => !c.skip_reason).length;
  const noun = levelNoun(preview.targets[0]?.level);
  return (
    <div className="grid gap-2">
      <p className="text-xs text-fg">
        <span className="font-medium">{preview.description}.</span>{" "}
        <span className="text-fg-muted">
          {preview.evaluated} {noun}s checked · {preview.matched} match · {wouldChange} would change now ·{" "}
          {preview.checks_next_24h} checks in the next 24 h.
        </span>
      </p>
      {preview.warnings.map((w) => (
        <p key={w} className="rounded-md bg-warning-subtle px-2 py-1 text-xs text-warning-fg">
          {w}
        </p>
      ))}
      <div className="max-h-72 overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-bg-subtle text-left text-fg-muted">
            <tr className="[&>th]:h-7 [&>th]:px-2 [&>th]:font-medium">
              <th className="capitalize">{noun}</th>
              {preview.targets[0]?.conditions.map((c, i) => (
                <th key={i} className="text-right">
                  {METRIC_OPTIONS.find((m) => m.id === c.metric)?.label}
                  {isTrendOp(c.op) ? " trend" : ""}
                </th>
              ))}
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {[...matched, ...others].slice(0, 100).map((t) => {
              const ch = changes.get(t.id);
              return (
                <tr key={t.id} className={cn("h-8 border-t border-border [&>td]:px-2", !t.matched && "text-fg-subtle")}>
                  <td className="max-w-56 truncate font-medium" title={`${t.name} · ${t.account_name}`}>
                    {t.name}
                  </td>
                  {t.conditions.map((c, i) => (
                    <td
                      key={i}
                      className={cn("text-right tabular-nums", c.met ? "font-medium text-fg" : "text-fg-subtle")}
                    >
                      {isTrendOp(c.op) ? (
                        <span
                          title={`Previous ${fmtActual(c.metric, c.previous, t.currency)} → now ${fmtActual(c.metric, c.actual, t.currency)}`}
                        >
                          {c.change == null ? "—" : `${c.change > 0 ? "+" : ""}${formatPercent(c.change, 0)}`}
                        </span>
                      ) : (
                        fmtActual(c.metric, c.actual, t.currency)
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap">
                    {!t.matched ? (
                      "No match"
                    ) : ch?.skip_reason ? (
                      <span className="text-warning-fg" title={ch.skip_reason}>
                        Skipped: {ch.skip_reason}
                      </span>
                    ) : ch ? (
                      <ChangeSummary type={ch.type} before={ch.before} after={ch.after} currency={ch.currency} />
                    ) : (
                      <span className="text-fg-muted">Already in that state</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
