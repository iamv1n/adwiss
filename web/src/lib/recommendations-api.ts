"use client";

/**
 * Client + React Query hooks for the recommendations inbox, creative fatigue
 * and the organization's targets (internal/recommendations):
 *
 *   GET  /v1/orgs/{orgID}/recommendations?status=open|accepted|dismissed|expired|failed|all
 *   GET  /v1/orgs/{orgID}/recommendations/count                  → { open }
 *   POST /v1/orgs/{orgID}/recommendations/{id}/accept|dismiss    (admin)
 *   POST /v1/orgs/{orgID}/recommendations/generate               (admin; the worker runs it hourly)
 *   GET|PUT /v1/orgs/{orgID}/targets                              (PUT: admin)
 *   GET  /v1/orgs/{orgID}/campaigns/{id}/creative-fatigue
 *
 * Accepting creates a manual action that runs right away; it shows in the
 * Actions log and can be reverted there (or with Undo here).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Provider } from "@/lib/api";
import { automationKeys, type Action } from "@/lib/automation-api";

export type RecommendationKind = "creative_fatigue" | "scale_winner" | "wasted_spend" | "losing_money";
export type RecommendationStatus = "open" | "accepted" | "dismissed" | "expired" | "failed";

export interface ProposedAction {
  type: "pause" | "activate" | "set_budget";
  /** New daily budget (set_budget), major units. */
  value?: number;
  /** The daily budget the proposal was computed from. */
  before?: number;
}

export interface WindowStats {
  from: string;
  to: string;
  impressions: number;
  clicks: number;
  reach: number;
  spend: number;
  frequency: number | null;
  ctr: number | null;
}

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  entity_type: "campaign" | "ad_group" | "ad";
  entity_id: string;
  entity_name: string;
  account_id: string | null;
  account_name: string;
  provider: Provider | null;
  currency: string;
  title: string;
  reason: string;
  /**
   * Fatigue: { current, previous: WindowStats, frequency_change, ctr_change, campaign_name }.
   * Campaigns: { spend, conversions, revenue, roas, cpa, target_cpa, target_roas, account_cpa, from, to }.
   */
  evidence: Record<string, unknown>;
  proposed_action: ProposedAction;
  status: RecommendationStatus;
  action_id: string | null;
  error: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface Targets {
  currency: string;
  target_cpa: number | null;
  target_roas: number | null;
}

export interface AdFatigue {
  ad_id: string;
  ad_name: string;
  status: string;
  fatigued: boolean;
  reason: string;
  current: WindowStats;
  previous: WindowStats;
  frequency_change: number | null;
  ctr_change: number | null;
}

const org = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}`;

export const recommendationsApi = {
  list: (orgId: string, status: RecommendationStatus | "all") =>
    request<{ recommendations: Recommendation[]; counts: Record<RecommendationStatus, number> }>(
      "GET",
      `${org(orgId)}/recommendations?status=${status}`,
    ),
  count: (orgId: string) => request<{ open: number }>("GET", `${org(orgId)}/recommendations/count`),
  accept: (orgId: string, id: string) =>
    request<{ recommendation: Recommendation; action: Action | null }>("POST", `${org(orgId)}/recommendations/${id}/accept`),
  dismiss: (orgId: string, id: string) =>
    request<{ recommendation: Recommendation }>("POST", `${org(orgId)}/recommendations/${id}/dismiss`),
  generate: (orgId: string) =>
    request<{ created: number; refreshed: number; expired: number }>("POST", `${org(orgId)}/recommendations/generate`),
  targets: (orgId: string) => request<{ targets: Targets }>("GET", `${org(orgId)}/targets`),
  saveTargets: (orgId: string, body: Partial<Targets>) => request<{ targets: Targets }>("PUT", `${org(orgId)}/targets`, body),
  campaignFatigue: (orgId: string, campaignId: string) =>
    request<{ ads: AdFatigue[] }>("GET", `${org(orgId)}/campaigns/${campaignId}/creative-fatigue`),
};

export const recommendationKeys = {
  all: (orgId: string) => ["orgs", orgId, "recommendations"] as const,
  list: (orgId: string, status: string) => ["orgs", orgId, "recommendations", "list", status] as const,
  count: (orgId: string) => ["orgs", orgId, "recommendations", "count"] as const,
  targets: (orgId: string) => ["orgs", orgId, "targets"] as const,
  fatigue: (orgId: string, campaignId: string) => ["orgs", orgId, "campaigns", campaignId, "creative-fatigue"] as const,
};

export function useRecommendations(orgId: string | undefined, status: RecommendationStatus | "all") {
  return useQuery({
    queryKey: recommendationKeys.list(orgId ?? "", status),
    queryFn: () => recommendationsApi.list(orgId!, status),
    enabled: !!orgId,
    retry: 1,
    refetchInterval: 120_000,
  });
}

export function useRecommendationCount(orgId: string | undefined) {
  return useQuery({
    queryKey: recommendationKeys.count(orgId ?? ""),
    queryFn: () => recommendationsApi.count(orgId!),
    enabled: !!orgId,
    retry: false,
    refetchInterval: 300_000,
  });
}

function useInvalidate(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    if (!orgId) return;
    void qc.invalidateQueries({ queryKey: recommendationKeys.all(orgId) });
    void qc.invalidateQueries({ queryKey: automationKeys.actions(orgId) });
  };
}

export function useAcceptRecommendation(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => recommendationsApi.accept(orgId!, id), onSettled: invalidate });
}

export function useDismissRecommendation(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (id: string) => recommendationsApi.dismiss(orgId!, id), onSettled: invalidate });
}

export function useGenerateRecommendations(orgId: string | undefined) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: () => recommendationsApi.generate(orgId!), onSettled: invalidate });
}

export function useTargets(orgId: string | undefined) {
  return useQuery({
    queryKey: recommendationKeys.targets(orgId ?? ""),
    queryFn: () => recommendationsApi.targets(orgId!),
    enabled: !!orgId,
    retry: 1,
    staleTime: 60_000,
  });
}

export function useSaveTargets(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Targets>) => recommendationsApi.saveTargets(orgId!, body),
    onSuccess: (res) => {
      if (!orgId) return;
      qc.setQueryData(recommendationKeys.targets(orgId), res);
    },
  });
}

export function useCampaignFatigue(orgId: string | undefined, campaignId: string | undefined) {
  return useQuery({
    queryKey: recommendationKeys.fatigue(orgId ?? "", campaignId ?? ""),
    queryFn: () => recommendationsApi.campaignFatigue(orgId!, campaignId!),
    enabled: !!orgId && !!campaignId,
    retry: false,
    staleTime: 10 * 60_000,
  });
}
