"use client";

/**
 * Client + React Query hooks for dayparting schedules, automation rules and
 * the actions log (internal/automation):
 *
 *   /v1/orgs/{orgID}/dayparting/schedules[/{id}]   CRUD (+ POST /preview)
 *   /v1/orgs/{orgID}/automations/rules[/{id}]      CRUD (+ POST /preview)
 *   /v1/orgs/{orgID}/actions                       log (GET), POST /{id}/revert
 *
 * Reads need org membership; mutations need admin or owner. Everything is
 * created with dry_run: true, and a preview never executes anything.
 * Money is in major units of the account currency.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Provider } from "@/lib/api";

// --- Shared ---

export type Level = "campaign" | "ad_group";

/** Rules can also act on single ads (pause, activate or notify only). */
export type RuleLevel = Level | "ad";

export interface EntityState {
  status?: string;
  daily_budget?: number;
}

/** A change a schedule or rule makes (or would make) to one entity. */
export interface PlannedChange {
  at: string;
  target_id: string;
  target_name: string;
  account_name: string;
  provider: Provider;
  currency: string;
  type: "pause" | "activate" | "set_budget" | "notify";
  before: EntityState;
  after: EntityState;
  reason: string;
  /** Why this change would not be made (conflict, cooldown, limit, unsupported). */
  skip_reason?: string;
}

export interface PreviewTarget {
  id: string;
  level: Level;
  name: string;
  account_id: string;
  account_name: string;
  provider: Provider;
  currency: string;
  timezone: string;
  status: string;
  daily_budget: number | null;
}

// --- Dayparting schedules ---

/** grid[weekday 0=Mon][hour]: 0 = off, 1 = on, other = budget multiplier. */
export type Grid = number[][];

export interface Schedule {
  id: string;
  organization_id: string;
  name: string;
  level: Level;
  target_ids: string[];
  /** null = each target's account time zone. */
  timezone: string | null;
  grid: Grid;
  enabled: boolean;
  dry_run: boolean;
  created_by: string | null;
  last_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
  /** Actions recorded by this schedule (not skipped). */
  changes_total: number;
  targets: PreviewTarget[];
  /** Grid value in effect now (first target's clock); null without targets. */
  value_now: number | null;
  /** Next transition within 48 h, e.g. "pauses 3 targets". */
  next_change: { at: string; summary: string } | null;
  /** Changes the schedule wants this hour but hasn't made (always > 0 in dry run when it would act). */
  pending_now: number;
}

export interface ScheduleInput {
  name: string;
  level: Level;
  target_ids: string[];
  timezone: string | null;
  grid: Grid;
  enabled: boolean;
  dry_run: boolean;
}

export interface SimulatedHour {
  at: string;
  value: number;
  status: string;
  daily_budget: number | null;
}

export interface SchedulePreview {
  generated_at: string;
  affected: { accounts: number; targets: number };
  targets: (PreviewTarget & { value_now: number; timezone_used: string })[];
  now: PlannedChange[];
  next_24h: PlannedChange[];
  /** Per target: its state hour by hour for the next 24 h, as if every change succeeded. */
  timeline: Record<string, SimulatedHour[]>;
  warnings: string[];
}

export interface RunResult {
  recorded: number;
  actions: Action[];
}

// --- Automation rules ---

export type ConditionMetric =
  | "spend"
  | "conversions"
  | "revenue"
  | "cpa"
  | "roas"
  | "ctr"
  | "cpc"
  | "cpm"
  | "impressions"
  | "clicks"
  | "frequency";

/**
 * change_gt / change_lt compare the lookback window with the previous window
 * of the same length; value is the relative change as a fraction
 * (change_lt -0.25 = fell by more than 25%, change_gt 0.2 = rose by more than 20%).
 */
export type ConditionOp = "gt" | "gte" | "lt" | "lte" | "eq" | "change_gt" | "change_lt";

export interface Condition {
  metric: ConditionMetric;
  op: ConditionOp;
  /** Money in major units; CTR as a fraction (0.01 = 1%); trend ops: relative change. */
  value: number;
}

export const isTrendOp = (op: ConditionOp) => op === "change_gt" || op === "change_lt";

export type RuleActionType = "pause" | "activate" | "increase_budget" | "decrease_budget" | "set_budget" | "notify";

export interface RuleAction {
  type: RuleActionType;
  /** Percent for increase/decrease; amount for set_budget. */
  value?: number;
}

export type RuleScope = "org" | "account" | "campaigns";

export interface Rule {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  level: RuleLevel;
  scope_type: RuleScope;
  scope_ids: string[];
  conditions: Condition[];
  lookback_days: number;
  action: RuleAction;
  check_interval_minutes: number;
  cooldown_minutes: number;
  max_changes_per_run: number;
  enabled: boolean;
  dry_run: boolean;
  created_by: string | null;
  last_run_at: string | null;
  last_run_matched: number;
  last_run_changes: number;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  changes_total: number;
  changes_7d: number;
}

export interface RuleInput {
  name: string;
  /** Defaults to "campaign". */
  level?: RuleLevel;
  scope_type: RuleScope;
  scope_ids: string[];
  conditions: Condition[];
  lookback_days: number;
  action: RuleAction;
  check_interval_minutes: number;
  cooldown_minutes: number;
  max_changes_per_run: number;
  enabled: boolean;
  dry_run: boolean;
}

export interface MetricWindow {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  reach: number;
}

export interface ConditionResult extends Condition {
  actual: number | null;
  /** Trend conditions: the previous window's value and the relative change. */
  previous?: number | null;
  change?: number | null;
  met: boolean;
}

export interface RulePreview {
  generated_at: string;
  description: string;
  evaluated: number;
  matched: number;
  checks_next_24h: number;
  changes: PlannedChange[];
  targets: (Omit<PreviewTarget, "level"> & {
    level: RuleLevel;
    window: MetricWindow;
    /** Set when the rule has trend conditions. */
    previous?: MetricWindow;
    conditions: ConditionResult[];
    matched: boolean;
  })[];
  warnings: string[];
}

// --- Actions ---

export type ActionSource = "manual" | "schedule" | "rule" | "plan" | "revert";
export type ActionStatus = "dry_run" | "pending" | "running" | "succeeded" | "failed" | "skipped";
export type ActionType = "pause" | "activate" | "set_budget" | "notify" | "archive" | "update";

export interface Action {
  id: string;
  organization_id: string;
  source: ActionSource;
  source_id: string | null;
  source_name: string;
  actor_user_id: string | null;
  actor_name: string;
  provider: Provider | null;
  account_id: string | null;
  entity_type: "campaign" | "ad_group" | "ad" | "account";
  entity_id: string;
  entity_name: string;
  currency: string;
  action_type: ActionType;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  status: ActionStatus;
  reason: string;
  error: string;
  slot_start: string | null;
  reverted_by: string | null;
  revertible: boolean;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

export interface ActionFilter {
  source?: ActionSource;
  status?: ActionStatus;
  action_type?: ActionType;
  source_id?: string;
  entity_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ActionList {
  actions: Action[];
  page: { limit: number; offset: number; total: number };
  counts: Partial<Record<ActionStatus, number>>;
}

// --- Requests ---

function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== null) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const org = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}`;

export const automationApi = {
  schedules: (orgId: string) => request<{ schedules: Schedule[] }>("GET", `${org(orgId)}/dayparting/schedules`),
  createSchedule: (orgId: string, body: ScheduleInput) =>
    request<{ schedule: Schedule }>("POST", `${org(orgId)}/dayparting/schedules`, body),
  updateSchedule: (orgId: string, id: string, body: Partial<ScheduleInput>) =>
    request<{ schedule: Schedule }>("PATCH", `${org(orgId)}/dayparting/schedules/${id}`, body),
  deleteSchedule: (orgId: string, id: string) => request<void>("DELETE", `${org(orgId)}/dayparting/schedules/${id}`),
  previewSchedule: (orgId: string, body: ScheduleInput) =>
    request<SchedulePreview>("POST", `${org(orgId)}/dayparting/schedules/preview`, body),
  runSchedule: (orgId: string, id: string) => request<RunResult>("POST", `${org(orgId)}/dayparting/schedules/${id}/run`),

  rules: (orgId: string) => request<{ rules: Rule[] }>("GET", `${org(orgId)}/automations/rules`),
  createRule: (orgId: string, body: RuleInput) => request<{ rule: Rule }>("POST", `${org(orgId)}/automations/rules`, body),
  updateRule: (orgId: string, id: string, body: Partial<RuleInput>) =>
    request<{ rule: Rule }>("PATCH", `${org(orgId)}/automations/rules/${id}`, body),
  deleteRule: (orgId: string, id: string) => request<void>("DELETE", `${org(orgId)}/automations/rules/${id}`),
  previewRule: (orgId: string, body: RuleInput) =>
    request<RulePreview>("POST", `${org(orgId)}/automations/rules/preview`, body),
  runRule: (orgId: string, id: string) => request<RunResult>("POST", `${org(orgId)}/automations/rules/${id}/run`),

  actions: (orgId: string, f: ActionFilter) => request<ActionList>("GET", `${org(orgId)}/actions${qs(f)}`),
  revert: (orgId: string, id: string) => request<{ action: Action }>("POST", `${org(orgId)}/actions/${id}/revert`),
};

// --- Hooks ---

export const automationKeys = {
  schedules: (orgId: string) => ["orgs", orgId, "dayparting", "schedules"] as const,
  rules: (orgId: string) => ["orgs", orgId, "automations", "rules"] as const,
  actions: (orgId: string, f?: ActionFilter) =>
    f ? (["orgs", orgId, "actions", f] as const) : (["orgs", orgId, "actions"] as const),
};

export function useSchedules(orgId: string | undefined) {
  return useQuery({
    queryKey: automationKeys.schedules(orgId ?? ""),
    queryFn: () => automationApi.schedules(orgId!),
    enabled: !!orgId,
    retry: 1,
    refetchInterval: 60_000,
  });
}

export function useRules(orgId: string | undefined) {
  return useQuery({
    queryKey: automationKeys.rules(orgId ?? ""),
    queryFn: () => automationApi.rules(orgId!),
    enabled: !!orgId,
    retry: 1,
    refetchInterval: 60_000,
  });
}

export function useActions(orgId: string | undefined, f: ActionFilter) {
  return useQuery({
    queryKey: automationKeys.actions(orgId ?? "", f),
    queryFn: () => automationApi.actions(orgId!, f),
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    retry: 1,
    refetchInterval: 30_000,
  });
}

function useInvalidate(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    if (!orgId) return;
    void qc.invalidateQueries({ queryKey: automationKeys.schedules(orgId) });
    void qc.invalidateQueries({ queryKey: automationKeys.rules(orgId) });
    void qc.invalidateQueries({ queryKey: automationKeys.actions(orgId) });
  };
}

export function useSaveSchedule(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<ScheduleInput> }) =>
      id
        ? automationApi.updateSchedule(orgId!, id, body)
        : automationApi.createSchedule(orgId!, body as ScheduleInput),
    onSuccess: invalidate,
  });
}

export function useDeleteSchedule(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => automationApi.deleteSchedule(orgId!, id), onSuccess: invalidate });
}

export function usePreviewSchedule(orgId: string | undefined) {
  return useMutation({ mutationFn: (body: ScheduleInput) => automationApi.previewSchedule(orgId!, body) });
}

export function useRunSchedule(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => automationApi.runSchedule(orgId!, id), onSuccess: invalidate });
}

export function useRunRule(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => automationApi.runRule(orgId!, id), onSuccess: invalidate });
}

export function useSaveRule(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<RuleInput> }) =>
      id ? automationApi.updateRule(orgId!, id, body) : automationApi.createRule(orgId!, body as RuleInput),
    onSuccess: invalidate,
  });
}

export function useDeleteRule(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => automationApi.deleteRule(orgId!, id), onSuccess: invalidate });
}

export function usePreviewRule(orgId: string | undefined) {
  return useMutation({ mutationFn: (body: RuleInput) => automationApi.previewRule(orgId!, body) });
}

export function useRevertAction(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => automationApi.revert(orgId!, id), onSuccess: invalidate });
}

/** Admins and owners may change automations; members only read. */
export function canManage(role: string | undefined) {
  return role === "owner" || role === "admin";
}
