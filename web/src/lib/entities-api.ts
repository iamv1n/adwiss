"use client";

/**
 * Client + React Query hooks for the entity list endpoints
 * (GET /v1/orgs/{orgID}/campaigns | ad-groups | ads | creatives).
 *
 * Every list accepts the same filters (see internal/entities/handlers.go):
 * account_id, campaign_id, ad_group_id, provider, status, search,
 * from/to (YYYY-MM-DD, both or neither; adds `metrics` to each row) and
 * limit (1–200, default 50) / offset.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { request, type Provider, type ProviderLabels } from "@/lib/api";

/** Normalized delivery status shared by campaigns, ad groups and ads. */
export type EntityStatus = "active" | "paused" | "archived" | "deleted" | "unknown";

export const ENTITY_STATUSES: EntityStatus[] = ["active", "paused", "archived", "deleted", "unknown"];

/** Aggregated performance over the requested date range, in the row's account currency. */
export interface EntityMetrics {
  currency: string | null;
  impressions: number;
  clicks: number;
  spend: number | null;
  conversions: number;
  conversion_value: number | null;
  /** Ratios are null when the denominator is zero. */
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  cvr: number | null;
  roas: number | null;
  acos: number | null;
}

export type PacingStatus = "inactive" | "no_budget" | "under" | "on_track" | "over";

/** Today's budget pacing for a campaign (account-local day). */
export interface Pacing {
  date: string;
  spend_today: number;
  daily_budget: number | null;
  spent_fraction: number | null;
  day_elapsed_fraction: number;
  expected_fraction: number;
  /** Null early in the day. */
  projected_spend: number | null;
  status: PacingStatus;
}

interface EntityBase {
  id: string;
  account_id: string;
  account_name: string;
  provider: Provider;
  external_id: string;
  name: string;
  currency: string;
  /** Present only when the request had from/to. */
  metrics?: EntityMetrics;
  created_at: string;
  updated_at: string;
}

export interface Campaign extends EntityBase {
  status: EntityStatus;
  /** Provider-native objective / channel type, e.g. OUTCOME_SALES, SEARCH, PERFORMANCE_MAX. */
  objective: string;
  timezone: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  pacing: Pacing | null;
}

export interface AdGroup extends EntityBase {
  campaign_id: string;
  campaign_name: string;
  status: EntityStatus;
  daily_budget: number | null;
}

export interface Ad extends EntityBase {
  campaign_id: string;
  campaign_name: string;
  ad_group_id: string;
  ad_group_name: string;
  status: EntityStatus;
  creative_id: string | null;
  creative_external_id: string;
}

export interface Creative extends EntityBase {
  type: string;
  thumbnail_url: string;
}

export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
}

export interface RangeInfo {
  from: string;
  to: string;
  days: number;
}

interface ListEnvelope {
  page: PageInfo;
  labels: ProviderLabels;
  range?: RangeInfo;
}

export interface EntityList<T> extends ListEnvelope {
  rows: T[];
}

export interface EntityFilter {
  provider?: Provider;
  status?: EntityStatus;
  search?: string;
  account_id?: string;
  campaign_id?: string;
  ad_group_id?: string;
  /** YYYY-MM-DD; give both or neither. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

function qs(f: EntityFilter): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

type Kind = "campaigns" | "ad-groups" | "ads" | "creatives";
const ROW_KEY = { campaigns: "campaigns", "ad-groups": "ad_groups", ads: "ads", creatives: "creatives" } as const;

async function list<T>(orgId: string, kind: Kind, f: EntityFilter): Promise<EntityList<T>> {
  const res = await request<ListEnvelope & Record<string, unknown>>(
    "GET",
    `/orgs/${encodeURIComponent(orgId)}/${kind}${qs(f)}`,
  );
  return { rows: (res[ROW_KEY[kind]] as T[] | undefined) ?? [], page: res.page, labels: res.labels, range: res.range };
}

export const entitiesApi = {
  campaigns: (orgId: string, f: EntityFilter = {}) => list<Campaign>(orgId, "campaigns", f),
  adGroups: (orgId: string, f: EntityFilter = {}) => list<AdGroup>(orgId, "ad-groups", f),
  ads: (orgId: string, f: EntityFilter = {}) => list<Ad>(orgId, "ads", f),
  creatives: (orgId: string, f: EntityFilter = {}) => list<Creative>(orgId, "creatives", f),
};

export const entityKeys = {
  all: (orgId: string) => ["orgs", orgId, "entities"] as const,
  list: (orgId: string, kind: Kind, f: EntityFilter) => ["orgs", orgId, "entities", kind, f] as const,
};

function useEntityList<T>(
  kind: Kind,
  fetcher: (orgId: string, f: EntityFilter) => Promise<EntityList<T>>,
  orgId: string | undefined,
  f: EntityFilter,
  enabled = true,
) {
  return useQuery({
    queryKey: entityKeys.list(orgId ?? "", kind, f),
    queryFn: () => fetcher(orgId!, f),
    enabled: !!orgId && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useCampaigns(orgId: string | undefined, f: EntityFilter, enabled = true) {
  return useEntityList("campaigns", entitiesApi.campaigns, orgId, f, enabled);
}

export function useAdGroups(orgId: string | undefined, f: EntityFilter, enabled = true) {
  return useEntityList("ad-groups", entitiesApi.adGroups, orgId, f, enabled);
}

export function useAds(orgId: string | undefined, f: EntityFilter, enabled = true) {
  return useEntityList("ads", entitiesApi.ads, orgId, f, enabled);
}

export function useCreatives(orgId: string | undefined, f: EntityFilter, enabled = true) {
  return useEntityList("creatives", entitiesApi.creatives, orgId, f, enabled);
}
