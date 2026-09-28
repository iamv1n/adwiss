"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Scale, Sparkles, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { errorMessage } from "@/components/app/analytics/states";
import { currencyName, formatMoney, PROVIDER_NAMES } from "@/components/app/analytics/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTargets } from "@/lib/recommendations-api";
import { MoneyInput } from "./money-input";
import { TargetPicker } from "@/components/app/automations/target-picker";
import { useCampaigns } from "@/lib/entities-api";
import {
  dayCount,
  MAX_PLAN_DAYS,
  shareSum,
  usePreviewPlan,
  useSavePlan,
  useSuggestSplit,
  validatePlan,
  type Curve,
  type Plan,
  type PlanCampaignInput,
  type PlanInput,
  type PlanPreview,
  type SplitMode,
} from "@/lib/budget-api";
import { cn } from "@/lib/utils";
import {
  CURVES,
  DailyBars,
  PERIOD_PRESETS,
  curveWeights,
  daysBetween,
  matchPreset,
  presetPeriod,
  spread,
  type PeriodPreset,
} from "./bits";

export function planToInput(p: Plan): PlanInput {
  return {
    name: p.name,
    total_budget: p.total_budget,
    currency: p.currency,
    start_date: p.start_date,
    end_date: p.end_date,
    timezone: p.timezone ?? null,
    curve: p.curve,
    custom_weights: p.custom_weights ?? null,
    allocation_mode: p.allocation_mode,
    reallocate: p.reallocate,
    campaigns: p.campaigns.map((c) => ({ campaign_id: c.campaign_id, share_pct: c.share_pct, min_daily_budget: c.min_daily_budget })),
  };
}

function emptyInput(): PlanInput {
  const r = presetPeriod("this_month");
  return {
    name: "",
    total_budget: 0,
    currency: "",
    start_date: r.start,
    end_date: r.end,
    timezone: null,
    curve: "even",
    custom_weights: null,
    allocation_mode: "manual",
    reallocate: true,
    campaigns: [],
  };
}

/** Round shares to 2 dp, with the rounding remainder on the largest one so the sum is exactly 100. */
function normaliseShares(raw: number[]): number[] {
  const total = raw.reduce((a, b) => a + b, 0);
  if (!raw.length) return [];
  const pct = raw.map((v) => (total > 0 ? Math.round((v / total) * 10000) / 100 : Math.round(10000 / raw.length) / 100));
  const diff = Math.round((100 - pct.reduce((a, b) => a + b, 0)) * 100) / 100;
  const big = pct.indexOf(Math.max(...pct));
  pct[big] = Math.round((pct[big] + diff) * 100) / 100;
  return pct;
}

export function PlanBuilderSheet({
  orgId,
  plan,
  onClose,
  onSaved,
}: {
  orgId: string | undefined;
  plan?: Plan;
  onClose: () => void;
  onSaved?: (plan: Plan) => void;
}) {
  const initial = useMemo(() => (plan ? planToInput(plan) : emptyInput()), [plan]);
  const [f, setF] = useState<PlanInput>(initial);
  const [preset, setPreset] = useState<PeriodPreset>(() => matchPreset(initial.start_date, initial.end_date));
  const [enable, setEnable] = useState(false);
  const [touched, setTouched] = useState(false);
  const [preview, setPreview] = useState<{ key: string; data: PlanPreview } | null>(null);
  const campaigns = useCampaigns(orgId, { limit: 200 });
  const previewM = usePreviewPlan(orgId);
  const suggest = useSuggestSplit(orgId);
  const save = useSavePlan(orgId);

  const byId = useMemo(() => new Map((campaigns.data?.rows ?? []).map((c) => [c.id, c])), [campaigns.data]);
  const targets = useTargets(orgId);
  // Currencies of the connected ad accounts (synced from Meta / Google), most-used first.
  const accountCurrencies = useMemo(() => {
    const seen = new Map<string, { code: string; count: number; providers: Set<string> }>();
    for (const c of campaigns.data?.rows ?? []) {
      if (!c.currency) continue;
      const e = seen.get(c.currency) ?? { code: c.currency, count: 0, providers: new Set<string>() };
      e.count++;
      e.providers.add(c.provider);
      seen.set(c.currency, e);
    }
    return [...seen.values()].sort((a, b) => b.count - a.count);
  }, [campaigns.data]);
  const currencies = Array.from(new Set(f.campaigns.map((c) => byId.get(c.campaign_id)?.currency).filter(Boolean))) as string[];
  // Precedence: the chosen campaigns' currency, then what's set on the plan / picked here,
  // then the workspace currency from targets, then the ad accounts' own currency.
  const workspaceCurrency = targets.data?.targets.currency || "";
  const fallbackCurrency = f.currency || workspaceCurrency || accountCurrencies[0]?.code || "";
  const derivedCurrency = currencies.length === 1 ? currencies[0] : fallbackCurrency;
  const currencySource =
    currencies.length === 1
      ? "From the selected campaigns’ ad accounts."
      : f.currency
        ? null
        : workspaceCurrency
          ? "Your workspace currency."
          : accountCurrencies[0]
            ? `From your ${[...accountCurrencies[0].providers].map((p) => PROVIDER_NAMES[p as keyof typeof PROVIDER_NAMES] ?? p).join(" and ")} account.`
            : null;
  const canPickCurrency = currencies.length === 0 && accountCurrencies.length > 1;
  const input: PlanInput = { ...f, currency: derivedCurrency };
  const errors = validatePlan(input);
  if (currencies.length > 1) errors.campaigns = `These campaigns use ${currencies.join(" and ")}. A plan needs one currency.`;
  const noBudget = f.campaigns.filter((c) => {
    const row = byId.get(c.campaign_id);
    return row && row.daily_budget == null;
  });
  if (noBudget.length && !errors.campaigns)
    errors.campaigns = "Some campaigns have no campaign-level daily budget, which plans can't pace yet. Remove them.";
  const valid = Object.keys(errors).length === 0;

  const days = useMemo(() => daysBetween(f.start_date, f.end_date, MAX_PLAN_DAYS), [f.start_date, f.end_date]);
  const n = dayCount(f.start_date, f.end_date);
  const weights = curveWeights(f.curve, days.length, f.custom_weights);
  const localPlanned = spread(f.total_budget > 0 ? f.total_budget : 0, weights);

  // Debounced server preview (pure, no writes) whenever the input is valid.
  const inputKey = JSON.stringify(input);
  const { mutate: runPreview } = previewM;
  useEffect(() => {
    if (!valid || !orgId) return;
    const body = JSON.parse(inputKey) as PlanInput;
    const t = setTimeout(() => runPreview(body, { onSuccess: (data) => setPreview({ key: inputKey, data }) }), 450);
    return () => clearTimeout(t);
  }, [inputKey, valid, orgId, runPreview]);
  const fresh = preview?.key === inputKey ? preview.data : null;
  const bars = days.map((day, i) => ({
    day,
    planned: fresh?.days.find((d) => d.day === day)?.planned ?? localPlanned[i] ?? 0,
  }));

  const set = <K extends keyof PlanInput>(k: K, v: PlanInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const setPeriod = (start: string, end: string) =>
    setF((p) => ({ ...p, start_date: start, end_date: end, custom_weights: p.curve === "custom" ? null : p.custom_weights, curve: p.curve === "custom" ? "even" : p.curve }));
  const setCurve = (c: Curve) =>
    setF((p) => ({ ...p, curve: c, custom_weights: c === "custom" ? curveWeights(p.curve, days.length, p.custom_weights) : null }));
  const editDay = (i: number, amount: number) =>
    setF((p) => {
      const w = bars.map((b) => b.planned);
      w[i] = amount;
      const sum = w.reduce((a, b) => a + b, 0) || 1;
      return { ...p, curve: "custom", custom_weights: w.map((x) => Math.max(0.0001, Math.round((x / sum) * days.length * 10000) / 10000)) };
    });

  const setCampaignIds = (ids: string[]) =>
    setF((p) => {
      const keep = new Map(p.campaigns.map((c) => [c.campaign_id, c]));
      const added = ids.filter((id) => !keep.has(id));
      const next = ids.map((id) => keep.get(id) ?? { campaign_id: id, share_pct: 0, min_daily_budget: 0 });
      // First pick(s) get an even split; later additions start at 0% so existing shares stay put.
      if (!p.campaigns.length || added.length === ids.length) {
        const s = normaliseShares(next.map(() => 1));
        next.forEach((c, i) => (c.share_pct = s[i]));
      }
      return { ...p, campaigns: next, allocation_mode: "manual" };
    });
  const updateCampaign = (id: string, patch: Partial<PlanCampaignInput>) =>
    setF((p) => ({
      ...p,
      allocation_mode: "share_pct" in patch ? "manual" : p.allocation_mode,
      campaigns: p.campaigns.map((c) => (c.campaign_id === id ? { ...c, ...patch } : c)),
    }));
  const evenSplit = () =>
    setF((p) => {
      const s = normaliseShares(p.campaigns.map(() => 1));
      return { ...p, allocation_mode: "manual", campaigns: p.campaigns.map((c, i) => ({ ...c, share_pct: s[i] })) };
    });
  const autoFill = (mode: SplitMode) =>
    suggest.mutate(
      { ids: f.campaigns.map((c) => c.campaign_id), mode, days: 30 },
      {
        onSuccess: (res) => {
          const m = new Map(res.shares.map((s) => [s.campaign_id, s.share_pct]));
          setF((p) => {
            const s = normaliseShares(p.campaigns.map((c) => m.get(c.campaign_id) ?? 0));
            return { ...p, allocation_mode: mode, campaigns: p.campaigns.map((c, i) => ({ ...c, share_pct: s[i] })) };
          });
          toast.success(mode === "roas" ? "Split by ROAS over the last 30 days" : "Split by spend over the last 30 days");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const doSave = () => {
    setTouched(true);
    if (!valid) return;
    save.mutate(
      { id: plan?.id, body: input },
      {
        onSuccess: (saved) => {
          const finish = (p: Plan) => {
            toast.success(`${p.name} saved${p.enabled ? (p.dry_run ? ", running in dry run" : ", live") : ""}`);
            onSaved?.(p);
            onClose();
          };
          if (!plan && enable) {
            save.mutate({ id: saved.id, body: { enabled: true } }, { onSuccess: finish, onError: (e) => toast.error(errorMessage(e)) });
          } else finish(saved);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const sum = shareSum(f.campaigns);
  const sumOk = Math.abs(sum - 100) <= 0.01;
  const cur = derivedCurrency || "USD";
  const show = (k: string) => (touched ? errors[k] : undefined);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[min(64rem,95vw)]">
        <SheetHeader className="border-b border-border px-5 py-3">
          <SheetTitle>{plan ? `Edit “${plan.name}”` : "New budget plan"}</SheetTitle>
          <SheetDescription className="text-xs">
            One budget for a period. Adwise sets each campaign’s daily budget every morning so the total lands on target.
          </SheetDescription>
        </SheetHeader>

        <div className="grid flex-1 gap-5 overflow-y-auto px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Left: amount, period, curve */}
          <div className="grid content-start gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="plan-name">Name</Label>
              <Input id="plan-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="October always-on" aria-invalid={!!show("name")} />
              {show("name") ? <p className="text-xs text-danger-fg">{errors.name}</p> : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="plan-total">Total budget</Label>
              <div className="flex items-center gap-2">
                <MoneyInput
                  id="plan-total"
                  currency={derivedCurrency}
                  value={f.total_budget || ""}
                  onChange={(e) => set("total_budget", Number(e.target.value))}
                  placeholder="200000"
                  aria-invalid={!!show("total_budget")}
                  aria-describedby="plan-currency-hint"
                />
                {canPickCurrency ? (
                  <Select value={derivedCurrency} onValueChange={(v) => set("currency", v)}>
                    <SelectTrigger className="w-24 shrink-0" aria-label="Currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountCurrencies.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span
                    title={derivedCurrency ? currencyName(derivedCurrency) : undefined}
                    className="w-16 shrink-0 rounded-md border border-border bg-bg-subtle px-2 py-1.5 text-center text-sm font-medium text-fg-muted"
                  >
                    {derivedCurrency || "—"}
                  </span>
                )}
              </div>
              <p id="plan-currency-hint" className="text-xs text-fg-subtle">
                {derivedCurrency
                  ? `${currencyName(derivedCurrency)}. ${currencySource ?? ""}${canPickCurrency ? " Picking campaigns switches it to their currency." : ""}`
                  : "Currency is set by the campaigns you pick."}
              </p>
              {show("total_budget") ? <p className="text-xs text-danger-fg">{errors.total_budget}</p> : null}
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">Period</legend>
              <div className="flex flex-wrap gap-1.5">
                {PERIOD_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={preset === p.id}
                    onClick={() => {
                      setPreset(p.id);
                      if (p.id !== "custom") {
                        const r = presetPeriod(p.id);
                        setPeriod(r.start, r.end);
                      }
                    }}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors",
                      preset === p.id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:text-fg",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {preset === "custom" ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="grid grid-cols-2 gap-2 overflow-hidden"
                  >
                    <div className="grid gap-1">
                      <Label htmlFor="plan-start" className="text-xs text-fg-muted">From</Label>
                      <Input id="plan-start" type="date" value={f.start_date} onChange={(e) => setPeriod(e.target.value, f.end_date)} />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="plan-end" className="text-xs text-fg-muted">To</Label>
                      <Input id="plan-end" type="date" value={f.end_date} min={f.start_date} onChange={(e) => setPeriod(f.start_date, e.target.value)} />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <p className="text-xs text-fg-subtle tabular-nums">
                {n > 0 ? `${n} day${n === 1 ? "" : "s"}` : ""}
                {n > 0 && f.total_budget > 0 ? ` · about ${formatMoney(f.total_budget / n, cur)} a day on average` : ""}
              </p>
              {errors.period ? <p className="text-xs text-danger-fg">{errors.period}</p> : null}
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">Daily pacing</legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Pacing curve">
                {CURVES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={f.curve === c.id}
                    title={c.hint}
                    onClick={() => setCurve(c.id)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                      f.curve === c.id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:text-fg",
                    )}
                  >
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-[0.6875rem] opacity-80">{c.hint}</span>
                  </button>
                ))}
              </div>
              {days.length > 0 && days.length <= MAX_PLAN_DAYS ? (
                <div className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
                    <span>Daily budget preview</span>
                    <span className="flex items-center gap-1">
                      {previewM.isPending ? <Loader2 className="size-3 animate-spin" aria-label="Updating preview" /> : null}
                      {fresh ? "From Adwise" : "Estimate"}
                    </span>
                  </div>
                  <DailyBars bars={bars} currency={cur} onEdit={f.total_budget > 0 ? editDay : undefined} ariaLabel="Planned daily budget by day" height={140} />
                  <p className="mt-2 text-[0.6875rem] text-fg-subtle">
                    Drag a bar (or focus it and press ↑/↓) to shape a day; the curve switches to Custom. Each morning Adwise re-paces
                    what’s left, so over- or under-delivery corrects itself.
                  </p>
                </div>
              ) : null}
              {show("curve") ? <p className="text-xs text-danger-fg">{errors.curve}</p> : null}
            </fieldset>
          </div>

          {/* Right: campaigns and split */}
          <div className="grid content-start gap-4">
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">Campaigns</p>
              <TargetPicker orgId={orgId} kind="campaigns" value={f.campaigns.map((c) => c.campaign_id)} onChange={setCampaignIds} maxHeight="12rem" />
              <p className="text-xs text-fg-subtle">Campaigns with a campaign-level daily budget, all in one currency.</p>
            </div>

            {f.campaigns.length ? (
              <div className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
                  <span className="mr-auto text-xs font-medium">Split</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={evenSplit}>
                    <Scale aria-hidden="true" /> Even split
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => autoFill("past_spend")} disabled={suggest.isPending}>
                    <TrendingUp aria-hidden="true" /> By past spend
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => autoFill("roas")} disabled={suggest.isPending}>
                    <Sparkles aria-hidden="true" /> By ROAS
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[26rem] text-xs">
                    <thead>
                      <tr className="text-left text-fg-subtle">
                        <th scope="col" className="px-2 py-1.5 font-medium">Campaign</th>
                        <th scope="col" className="w-20 px-2 py-1.5 text-right font-medium">Share %</th>
                        <th scope="col" className="w-24 px-2 py-1.5 text-right font-medium">Min / day</th>
                        <th scope="col" className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence initial={false}>
                        {f.campaigns.map((c) => {
                          const row = byId.get(c.campaign_id);
                          const est = fresh?.campaigns.find((x) => x.campaign_id === c.campaign_id);
                          return (
                            <motion.tr
                              key={c.campaign_id}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="border-t border-border"
                            >
                              <td className="max-w-0 px-2 py-1.5">
                                <p className="truncate font-medium text-fg">{row?.name ?? est?.name ?? c.campaign_id}</p>
                                <p className={cn("truncate", row && row.daily_budget == null ? "text-danger-fg" : "text-fg-subtle")}>
                                  {row ? `${PROVIDER_NAMES[row.provider]} · ` : ""}
                                  {row && row.daily_budget == null
                                    ? "no daily budget"
                                    : est
                                      ? `${formatMoney(est.planned_today, cur)} first day`
                                      : row?.daily_budget != null
                                        ? `now ${formatMoney(row.daily_budget, row.currency)}/day`
                                        : ""}
                                </p>
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="any"
                                  aria-label={`Share for ${row?.name ?? "campaign"}`}
                                  value={c.share_pct}
                                  onChange={(e) => updateCampaign(c.campaign_id, { share_pct: Number(e.target.value) })}
                                  className="h-7 text-right text-xs tabular-nums"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <MoneyInput
                                  currency={derivedCurrency}
                                  aria-label={`Minimum daily budget for ${row?.name ?? "campaign"}`}
                                  value={c.min_daily_budget || ""}
                                  placeholder="0"
                                  onChange={(e) => updateCampaign(c.campaign_id, { min_daily_budget: Number(e.target.value) })}
                                  className="h-7 text-right text-xs tabular-nums"
                                />
                              </td>
                              <td className="px-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  aria-label={`Remove ${row?.name ?? "campaign"}`}
                                  onClick={() => setCampaignIds(f.campaigns.filter((x) => x.campaign_id !== c.campaign_id).map((x) => x.campaign_id))}
                                >
                                  <X aria-hidden="true" />
                                </Button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td className="px-2 py-1.5 text-fg-muted">
                          {f.allocation_mode === "manual" ? "Manual split" : f.allocation_mode === "roas" ? "Filled from ROAS" : "Filled from past spend"}
                        </td>
                        <td className="px-2 py-1.5 text-right" colSpan={3}>
                          <span
                            role="status"
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 font-semibold tabular-nums transition-colors",
                              sumOk ? "bg-success-subtle text-success-fg" : "bg-danger-subtle text-danger-fg",
                            )}
                          >
                            {sum.toFixed(2).replace(/\.00$/, "")}% {sumOk ? "✓" : `(${sum > 100 ? "over" : "under"} by ${Math.abs(100 - sum).toFixed(2).replace(/\.00$/, "")}%)`}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : null}
            {errors.campaigns && (touched || f.campaigns.length) ? <p className="text-xs text-danger-fg">{errors.campaigns}</p> : null}

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium text-fg">Move unused budget</p>
                <p className="text-xs text-fg-muted">
                  Each day, budget a campaign didn’t spend yesterday goes to the ones that hit their cap, weighted by ROAS.
                </p>
              </div>
              <Switch checked={f.reallocate} onCheckedChange={(v) => set("reallocate", v)} aria-label="Move unused budget between campaigns" />
            </div>

            {!plan ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-subtle/60 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-fg">Start in dry run</p>
                  <p className="text-xs text-fg-muted">
                    New plans only log the budgets they would set. Nothing changes on Meta or Google until you switch dry run off on the
                    plan page.
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs text-fg-muted">
                  Turn on
                  <Switch checked={enable} onCheckedChange={setEnable} aria-label="Turn the plan on in dry run after saving" />
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          {touched && !valid ? <span className="mr-auto text-xs text-danger-fg">Fix the highlighted fields to save.</span> : null}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={doSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {plan ? "Save changes" : enable ? "Save & run in dry run" : "Save plan"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
