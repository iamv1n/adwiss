"use client";

/**
 * Client + React Query hooks for budget plans (internal/automation):
 *
 *   /v1/orgs/{orgID}/budget-plans[/{id}]      CRUD (+ POST /{id}/run)
 *   /v1/orgs/{orgID}/budget-plans/preview     pure pacing preview (no writes)
 *   /v1/orgs/{orgID}/budget-plans/suggest-split?campaign_ids=…&mode=past_spend|roas&days=30
 *
 * Money is in major units of the plan currency. Plans start disabled and in dry run.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Provider } from "@/lib/api";
import { automationKeys, type Action } from "@/lib/automation-api";

export type Curve = "even" | "front_loaded" | "back_loaded" | "custom";
export type AllocationMode = "manual" | "past_spend" | "roas";
export type PlanStatus = "draft" | "scheduled" | "active" | "completed";

export interface PlanCampaignInput {
  campaign_id: string;
  share_pct: number;
  min_daily_budget: number;
}

export interface PlanInput {
  name: string;
  total_budget: number;
  currency: string;
  start_date: string;
  end_date: string;
  timezone?: string | null;
  curve: Curve;
  custom_weights?: number[] | null;
  allocation_mode: AllocationMode;
  reallocate: boolean;
  campaigns: PlanCampaignInput[];
}

export type PlanPatch = Partial<PlanInput> & { enabled?: boolean; dry_run?: boolean };

export interface PlanSummary {
  id: string;
  name: string;
  total_budget: number;
  currency: string;
  start_date: string;
  end_date: string;
  curve: Curve;
  enabled: boolean;
  dry_run: boolean;
  status: PlanStatus;
  campaign_count: number;
  spent_to_date: number;
  planned_to_date: number;
  /** spent_to_date / planned_to_date * 100 */
  delivery_pct: number | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface DayPlan {
  day: string;
  planned: number;
  spent: number | null;
  budget_set: number | null;
}

export interface CampaignPlan {
  campaign_id: string;
  name: string;
  provider: Provider;
  share_pct: number;
  min_daily_budget: number;
  current_daily_budget: number | null;
  planned_today: number;
  planned_total: number;
  spent_to_date: number;
  roas_7d: number | null;
}

export type Plan = PlanSummary &
  Omit<PlanInput, "campaigns"> & {
    days: DayPlan[];
    campaigns: CampaignPlan[];
    recent_actions: Action[];
  };

export interface PlanPreview {
  days: DayPlan[];
  campaigns: CampaignPlan[];
}

export type SplitMode = "past_spend" | "roas";

export interface SplitSuggestion {
  shares: { campaign_id: string; share_pct: number }[];
}

// --- Requests ---

const base = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}/budget-plans`;

export const budgetApi = {
  list: (orgId: string) => request<{ plans: PlanSummary[] }>("GET", base(orgId)),
  get: (orgId: string, id: string) => request<Plan>("GET", `${base(orgId)}/${id}`),
  create: (orgId: string, body: PlanInput) => request<Plan>("POST", base(orgId), body),
  update: (orgId: string, id: string, body: PlanPatch) => request<Plan>("PATCH", `${base(orgId)}/${id}`, body),
  remove: (orgId: string, id: string) => request<void>("DELETE", `${base(orgId)}/${id}`),
  run: (orgId: string, id: string) => request<{ actions: Action[] }>("POST", `${base(orgId)}/${id}/run`),
  preview: (orgId: string, body: PlanInput) => request<PlanPreview>("POST", `${base(orgId)}/preview`, body),
  suggestSplit: (orgId: string, campaignIds: string[], mode: SplitMode, days = 30) => {
    const sp = new URLSearchParams({ campaign_ids: campaignIds.join(","), mode, days: String(days) });
    return request<SplitSuggestion>("GET", `${base(orgId)}/suggest-split?${sp}`);
  },
};

// --- Hooks ---

export const budgetKeys = {
  all: (orgId: string) => ["orgs", orgId, "budget-plans"] as const,
  list: (orgId: string) => ["orgs", orgId, "budget-plans", "list"] as const,
  detail: (orgId: string, id: string) => ["orgs", orgId, "budget-plans", "detail", id] as const,
};

export function usePlans(orgId: string | undefined) {
  return useQuery({
    queryKey: budgetKeys.list(orgId ?? ""),
    queryFn: () => budgetApi.list(orgId!),
    enabled: !!orgId,
    retry: 1,
    refetchInterval: 60_000,
  });
}

export function usePlan(orgId: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: budgetKeys.detail(orgId ?? "", id ?? ""),
    queryFn: () => budgetApi.get(orgId!, id!),
    enabled: !!orgId && !!id,
    retry: 1,
    refetchInterval: 60_000,
  });
}

function useInvalidate(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    if (!orgId) return;
    void qc.invalidateQueries({ queryKey: budgetKeys.all(orgId) });
    void qc.invalidateQueries({ queryKey: automationKeys.actions(orgId) });
  };
}

export function useSavePlan(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: PlanPatch }) =>
      id ? budgetApi.update(orgId!, id, body) : budgetApi.create(orgId!, body as PlanInput),
    onSuccess: invalidate,
  });
}

export function useDeletePlan(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => budgetApi.remove(orgId!, id), onSuccess: invalidate });
}

export function useRunPlan(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => budgetApi.run(orgId!, id), onSuccess: invalidate });
}

export function usePreviewPlan(orgId: string | undefined) {
  return useMutation({ mutationFn: (body: PlanInput) => budgetApi.preview(orgId!, body) });
}

export function useSuggestSplit(orgId: string | undefined) {
  return useMutation({
    mutationFn: ({ ids, mode, days }: { ids: string[]; mode: SplitMode; days?: number }) =>
      budgetApi.suggestSplit(orgId!, ids, mode, days),
  });
}

// --- Validation (mirrors the API contract) ---

export const MAX_PLAN_DAYS = 92;

/** Inclusive day count between two YYYY-MM-DD dates. */
export function dayCount(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function shareSum(campaigns: PlanCampaignInput[]): number {
  return Math.round(campaigns.reduce((s, c) => s + (Number(c.share_pct) || 0), 0) * 100) / 100;
}

/** Field → message; empty when the input is valid. */
export function validatePlan(p: PlanInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!p.name.trim()) e.name = "Give the plan a name.";
  if (!(p.total_budget > 0)) e.total_budget = "Enter a budget above zero.";
  if (!p.currency) e.currency = "Pick campaigns so the currency is known.";
  const n = dayCount(p.start_date, p.end_date);
  if (!p.start_date || !p.end_date) e.period = "Choose a start and end date.";
  else if (n < 1) e.period = "The end date must be on or after the start date.";
  else if (n > MAX_PLAN_DAYS) e.period = `A plan can cover at most ${MAX_PLAN_DAYS} days.`;
  if (p.curve === "custom") {
    const w = p.custom_weights ?? [];
    if (w.length !== n) e.curve = "Custom curves need one weight per day.";
    else if (w.some((x) => !(x > 0))) e.curve = "Every day needs a weight above zero.";
  }
  if (!p.campaigns.length) e.campaigns = "Add at least one campaign.";
  else if (Math.abs(shareSum(p.campaigns) - 100) > 0.01) e.campaigns = "Campaign shares must add up to 100%.";
  else if (p.campaigns.some((c) => c.share_pct < 0 || c.min_daily_budget < 0)) e.campaigns = "Shares and minimums can't be negative.";
  return e;
}
