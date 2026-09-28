"use client";

/**
 * Client + React Query hooks for leads (internal/leads):
 *
 *   GET   /v1/orgs/{orgID}/leads            page of leads, newest first
 *   GET   /v1/orgs/{orgID}/leads/summary    pipeline + spend per campaign
 *   POST  /v1/orgs/{orgID}/leads            add a lead by hand
 *   PATCH /v1/orgs/{orgID}/leads/{id}       status, value, notes, contact
 *   POST  /v1/orgs/{orgID}/leads/instant    admin+: subscribe Pages to Meta's lead webhook
 *
 * Meta lead-form leads are imported by the account sync (hourly), or pushed
 * within seconds once "instant leads" subscribed the org's Pages. Any member can work
 * leads. Money is in major units of the lead's currency.
 */

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Provider } from "@/lib/api";

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export interface Lead {
  id: string;
  source: "meta_form" | "manual";
  provider: Provider | null;
  external_id: string | null;
  account_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_group_id: string | null;
  ad_group_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  form_id: string;
  is_organic: boolean;
  name: string;
  email: string;
  phone: string;
  /** Every form answer, question → answer. */
  fields: Record<string, string>;
  status: LeadStatus;
  value: number | null;
  currency: string;
  notes: string;
  lead_created_at: string;
  status_changed_at: string | null;
  won_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadFilter {
  status?: LeadStatus;
  campaign_id?: string;
  q?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

export interface SummaryRow {
  campaign_id?: string;
  campaign_name?: string | null;
  /** ISO code, "" when unknown, "mixed" on totals across currencies. */
  currency: string;
  leads: number;
  by_status: Record<LeadStatus, number>;
  won: number;
  won_value: number;
  spend: number | null;
  cost_per_lead: number | null;
  cost_per_won: number | null;
  win_rate: number | null;
  roas: number | null;
}

export interface LeadSummary {
  totals: SummaryRow;
  campaigns: SummaryRow[];
}

export interface CreateLeadInput {
  name: string;
  email?: string;
  phone?: string;
  campaign_id?: string;
  status?: LeadStatus;
  value?: number;
  currency?: string;
  notes?: string;
}

export interface UpdateLeadInput {
  status?: LeadStatus;
  /** null clears the value. */
  value?: number | null;
  notes?: string;
  name?: string;
  email?: string;
  phone?: string;
}

const org = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}`;

function qs(params: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const leadsApi = {
  list: (orgId: string, f: LeadFilter, cursor?: string) =>
    request<{ leads: Lead[]; next_cursor: string | null }>(
      "GET",
      `${org(orgId)}/leads${qs({ ...f, cursor, limit: 50 })}`,
    ),
  summary: (orgId: string, from: string, to: string) =>
    request<LeadSummary>("GET", `${org(orgId)}/leads/summary${qs({ from, to })}`),
  create: (orgId: string, body: CreateLeadInput) => request<{ lead: Lead }>("POST", `${org(orgId)}/leads`, body),
  update: (orgId: string, id: string, body: UpdateLeadInput) =>
    request<{ lead: Lead }>("PATCH", `${org(orgId)}/leads/${encodeURIComponent(id)}`, body),
};

const keys = {
  all: (orgId: string) => ["orgs", orgId, "leads"] as const,
  list: (orgId: string, f: LeadFilter) => ["orgs", orgId, "leads", "list", f] as const,
  summary: (orgId: string, from: string, to: string) => ["orgs", orgId, "leads", "summary", from, to] as const,
};

export function useLeads(orgId: string | undefined, f: LeadFilter) {
  return useInfiniteQuery({
    queryKey: keys.list(orgId ?? "", f),
    queryFn: ({ pageParam }) => leadsApi.list(orgId!, f, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    // New Meta leads arrive with each account sync.
    refetchInterval: 60_000,
  });
}

export function useLeadSummary(orgId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: keys.summary(orgId ?? "", from, to),
    queryFn: () => leadsApi.summary(orgId!, from, to),
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useCreateLead(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLeadInput) => leadsApi.create(orgId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(orgId ?? "") }),
  });
}

export function useUpdateLead(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLeadInput }) => leadsApi.update(orgId!, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(orgId ?? "") }),
  });
}

// --- Setup: what kinds of ads the org runs, and lead access ---

export type AdType =
  | "online_sales"
  | "lead_forms"
  | "messages"
  | "website_leads"
  | "app_installs"
  | "store_visits"
  | "awareness";

export type SetupStep = "ad_types" | "connect_meta" | "grant_lead_access";

export interface LeadSetup {
  /** null until the org has answered. */
  ad_types: AdType[] | null;
  complete: boolean;
  pending: SetupStep[];
  meta_connections: { integration_id: string; display_name: string; has_lead_access: boolean }[];
  /** Optional: Pages subscribed to Meta's lead webhook push leads instantly. */
  instant_leads: { enabled: boolean; pages: number };
}

export interface InstantLeadsPage {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
}

const setupKey = (orgId: string) => ["orgs", orgId, "leads", "setup"] as const;

export function useLeadSetup(orgId: string | undefined) {
  return useQuery({
    queryKey: setupKey(orgId ?? ""),
    queryFn: async () => (await request<{ setup: LeadSetup }>("GET", `${org(orgId!)}/leads/setup`)).setup,
    enabled: !!orgId,
  });
}

export function useSetAdTypes(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adTypes: AdType[]) =>
      (await request<{ setup: LeadSetup }>("PUT", `${org(orgId!)}/leads/setup`, { ad_types: adTypes })).setup,
    onSuccess: (setup) => qc.setQueryData(setupKey(orgId ?? ""), setup),
  });
}

/** Subscribes every Page the org's Meta connections manage to the lead webhook. */
export function useEnableInstantLeads(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await request<{ pages: InstantLeadsPage[] }>("POST", `${org(orgId!)}/leads/instant`)).pages,
    onSuccess: () => qc.invalidateQueries({ queryKey: setupKey(orgId ?? "") }),
  });
}
