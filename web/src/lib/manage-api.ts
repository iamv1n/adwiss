"use client";

/**
 * Client + React Query hooks for campaign management
 * (plan/campaign-management-api.md): update, archive, bulk status, create,
 * Pages, image upload, account spend limits and daily series for charts.
 *
 * Money is always in the account currency's major units (500 = ₹500.00).
 * IDs are Adwise UUIDs, never provider IDs.
 */

import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, humanizeMessage, request } from "@/lib/api";
import {
  type Ad,
  type AdGroup,
  type Campaign,
  type EntityFilter,
  entitiesApi,
  entityKeys,
} from "@/lib/entities-api";

const enc = encodeURIComponent;
const base = (orgId: string) => `/orgs/${enc(orgId)}`;

// --- Types ---

export type ManageStatus = "active" | "paused" | "archived";
export type Level = "campaign" | "ad_group" | "ad";

export type MetaObjective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_APP_PROMOTION"
  | "OUTCOME_SALES";

export type CallToAction =
  | "LEARN_MORE"
  | "SHOP_NOW"
  | "SIGN_UP"
  | "CONTACT_US"
  | "DOWNLOAD"
  | "GET_OFFER"
  | "BOOK_TRAVEL"
  | "SUBSCRIBE";

/** Fields the mutation responses may carry beyond the list shape. */
export interface ManagedExtras {
  spend_cap?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  lifetime_budget?: number | null;
  bid_amount?: number | null;
}

export interface CampaignPatch {
  status?: ManageStatus;
  name?: string;
  daily_budget?: number | null;
  lifetime_budget?: number | null;
  spend_cap?: number | null;
  end_time?: string | null;
}

export interface AdGroupPatch {
  status?: ManageStatus;
  name?: string;
  daily_budget?: number | null;
  lifetime_budget?: number | null;
  bid_amount?: number | null;
  end_time?: string | null;
}

export interface AdPatch {
  status?: ManageStatus;
  name?: string;
}

export interface CreateCampaignInput {
  account_id: string;
  name: string;
  objective: MetaObjective;
  status: ManageStatus;
  daily_budget: number | null;
  lifetime_budget: number | null;
  end_time: string | null;
  bid_strategy?: string;
  special_ad_categories: string[];
}

/** An interest, location or language from targeting search. */
export interface TargetingOption {
  id: string;
  name: string;
  /** interests, behaviors, … for detailed targeting; region or city for locations; locale for languages. */
  type: string;
  description?: string;
  audience_size?: number;
}

export type TargetingKind = "interests" | "locations" | "languages";

export interface CustomAudience {
  id: string;
  name: string;
  subtype: string;
  approx_count?: number;
}

export type Platform = "facebook" | "instagram" | "messenger" | "audience_network";

export interface PlacementsInput {
  platforms: Platform[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  messenger_positions?: string[];
  audience_network_positions?: string[];
}

export interface Targeting {
  countries: string[];
  regions?: string[];
  cities?: { key: string; radius_km: number }[];
  excluded_countries?: string[];
  locales?: number[];
  age_min: number;
  age_max: number;
  /** [] = all, [1] = men, [2] = women. */
  genders: number[];
  advantage_audience: boolean;
  interests?: TargetingOption[];
  excluded_interests?: TargetingOption[];
  audiences?: string[];
  excluded_audiences?: string[];
  /** null/absent = automatic (Advantage+) placements. */
  placements?: PlacementsInput | null;
}

export type BidStrategy =
  | "LOWEST_COST_WITHOUT_CAP"
  | "LOWEST_COST_WITH_BID_CAP"
  | "COST_CAP"
  | "LOWEST_COST_WITH_MIN_ROAS";

export type Attribution = "7d_click_1d_view" | "7d_click" | "1d_click" | "1d_click_1d_view";

export interface CreateAdGroupInput {
  campaign_id: string;
  name: string;
  status: ManageStatus;
  daily_budget: number | null;
  lifetime_budget: number | null;
  start_time: string | null;
  end_time: string | null;
  optimization_goal: string;
  billing_event: string;
  bid_amount: number | null;
  bid_strategy?: BidStrategy;
  roas_floor?: number | null;
  attribution?: Attribution;
  destination_type?: string;
  targeting: Targeting;
  /** Required for Sales (pixel_id + custom_event_type), Leads (page_id) and App promotion (application_id + object_store_url). */
  promoted_object?: Record<string, string>;
}

export type CreativeFormat = "image" | "video" | "carousel" | "flexible";

export interface CarouselCardInput {
  image_hash?: string;
  video_id?: string;
  link?: string;
  headline?: string;
  description?: string;
}

export interface AdCreativeInput {
  format?: CreativeFormat;
  image_hash?: string;
  video_id?: string;
  link: string;
  display_link?: string;
  message: string;
  headline: string;
  description: string;
  call_to_action: CallToAction;
  cards?: CarouselCardInput[];
  image_hashes?: string[];
  video_ids?: string[];
  messages?: string[];
  headlines?: string[];
  descriptions?: string[];
}

export interface CreateAdInput {
  ad_group_id: string;
  name: string;
  status: ManageStatus;
  page_id: string;
  instagram_user_id?: string;
  url_tags?: string;
  creative?: AdCreativeInput;
  object_story_id?: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  picture_url: string;
  instagram_user_id?: string;
  instagram_username?: string;
}

export interface UploadedImage {
  hash: string;
  url: string;
}

export interface UploadedVideo {
  id: string;
  status: "processing" | "ready" | "error";
  thumbnail_url?: string;
}

export interface AccountLimits {
  spend_cap: number | null;
  amount_spent: number;
  currency: string;
  balance: number;
}

export interface BulkResult {
  id: string;
  ok: boolean;
  error?: string;
}

export interface SeriesPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
}

export interface SeriesResponse {
  currency_by_id: Record<string, string>;
  series: Record<string, SeriesPoint[]>;
}

// --- Client ---

/** Multipart upload; `request` only speaks JSON. Mirrors its error handling. */
async function uploadFile<T>(path: string, file: File, tooLarge: string): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { method: "POST", credentials: "include", body, cache: "no-store" });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the Adwise API. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | undefined)
      ?.error;
    const message = err?.message
      ? humanizeMessage(err.message)
      : res.status === 413
        ? tooLarge
        : `Upload failed (${res.status}).`;
    throw new ApiError(res.status, err?.code ?? "request_failed", message, err?.fields);
  }
  return data as T;
}

const uploadImage = (orgId: string, accountId: string, file: File) =>
  uploadFile<{ image: UploadedImage }>(
    `${base(orgId)}/accounts/${enc(accountId)}/images`,
    file,
    "That image is too large. Use a JPG or PNG under 8 MB.",
  );

const uploadVideo = (orgId: string, accountId: string, file: File) =>
  uploadFile<{ video: UploadedVideo }>(
    `${base(orgId)}/accounts/${enc(accountId)}/videos`,
    file,
    "That video is too large. Use an MP4 or MOV under 1 GB.",
  );

export const manageApi = {
  updateCampaign: (orgId: string, id: string, patch: CampaignPatch) =>
    request<{ campaign: Campaign & ManagedExtras }>("PATCH", `${base(orgId)}/campaigns/${enc(id)}`, patch),
  updateAdGroup: (orgId: string, id: string, patch: AdGroupPatch) =>
    request<{ ad_group: AdGroup & ManagedExtras }>("PATCH", `${base(orgId)}/ad-groups/${enc(id)}`, patch),
  updateAd: (orgId: string, id: string, patch: AdPatch) =>
    request<{ ad: Ad }>("PATCH", `${base(orgId)}/ads/${enc(id)}`, patch),
  archive: (orgId: string, level: Level, id: string) =>
    request<void>("DELETE", `${base(orgId)}/${LEVEL_PATH[level]}/${enc(id)}`),
  bulkStatus: (orgId: string, input: { level: Level; ids: string[]; status: ManageStatus }) =>
    request<{ results: BulkResult[] }>("POST", `${base(orgId)}/bulk/status`, input),
  createCampaign: (orgId: string, input: CreateCampaignInput) =>
    request<{ campaign: Campaign }>("POST", `${base(orgId)}/campaigns`, input),
  createAdGroup: (orgId: string, input: CreateAdGroupInput) =>
    request<{ ad_group: AdGroup }>("POST", `${base(orgId)}/ad-groups`, input),
  createAd: (orgId: string, input: CreateAdInput) => request<{ ad: Ad }>("POST", `${base(orgId)}/ads`, input),
  pages: (orgId: string, accountId: string) =>
    request<{ pages: FacebookPage[] }>("GET", `${base(orgId)}/accounts/${enc(accountId)}/pages`),
  uploadImage,
  uploadVideo,
  videoStatus: (orgId: string, accountId: string, videoId: string) =>
    request<{ video: UploadedVideo }>("GET", `${base(orgId)}/accounts/${enc(accountId)}/videos/${enc(videoId)}`),
  targetingSearch: (orgId: string, accountId: string, type: TargetingKind, q: string) =>
    request<{ results: TargetingOption[] }>(
      "GET",
      `${base(orgId)}/accounts/${enc(accountId)}/targeting-search?${new URLSearchParams({ type, q })}`,
    ),
  audiences: (orgId: string, accountId: string) =>
    request<{ audiences: CustomAudience[] }>("GET", `${base(orgId)}/accounts/${enc(accountId)}/audiences`),
  limits: (orgId: string, accountId: string) =>
    request<AccountLimits>("GET", `${base(orgId)}/accounts/${enc(accountId)}/limits`),
  updateLimits: (orgId: string, accountId: string, spend_cap: number | null) =>
    request<AccountLimits>("PATCH", `${base(orgId)}/accounts/${enc(accountId)}/limits`, { spend_cap }),
  series: (orgId: string, level: Level, ids: string[], from: string, to: string) => {
    const sp = new URLSearchParams({ level, ids: ids.join(","), from, to });
    return request<SeriesResponse>("GET", `${base(orgId)}/analytics/series?${sp}`);
  },
};

const LEVEL_PATH: Record<Level, string> = { campaign: "campaigns", ad_group: "ad-groups", ad: "ads" };

// --- Keys ---

export const manageKeys = {
  series: (orgId: string, level: Level, ids: string[], from: string, to: string) =>
    ["orgs", orgId, "series", level, from, to, ids] as const,
  pages: (orgId: string, accountId: string) => ["orgs", orgId, "pages", accountId] as const,
  limits: (orgId: string, accountId: string) => ["orgs", orgId, "limits", accountId] as const,
  audiences: (orgId: string, accountId: string) => ["orgs", orgId, "audiences", accountId] as const,
  targeting: (orgId: string, accountId: string, type: TargetingKind, q: string) =>
    ["orgs", orgId, "targeting", accountId, type, q] as const,
  campaign: (orgId: string, id: string, f: EntityFilter) => ["orgs", orgId, "entities", "campaign", id, f] as const,
};

// --- Cache helpers ---

type Row = { id: string; metrics?: unknown; status?: string };
type Cached = { rows: Row[] } | { campaign: Row } | undefined;

/** Apply `fn` to every cached entity row: list pages and single-campaign lookups alike. */
function mapCachedRows(qc: QueryClient, orgId: string, fn: (r: Row) => Row) {
  qc.setQueriesData<Cached>({ queryKey: entityKeys.all(orgId) }, (old) => {
    if (!old || typeof old !== "object") return old;
    if ("rows" in old && Array.isArray(old.rows)) return { ...old, rows: old.rows.map(fn) };
    if ("campaign" in old && old.campaign) return { ...old, campaign: fn(old.campaign) };
    return old;
  });
}

/**
 * Merge a server-returned entity into every cached list (keeping the list's
 * range metrics, which mutation responses don't carry), then refetch.
 */
function mergeRow(qc: QueryClient, orgId: string, row: Row | undefined) {
  if (!row) return;
  mapCachedRows(qc, orgId, (r) => (r.id === row.id ? { ...r, ...row, metrics: r.metrics } : r));
}

/** Optimistically set status on cached rows; returns a rollback. */
function patchStatus(qc: QueryClient, orgId: string, ids: string[], status: ManageStatus) {
  const snapshot = qc.getQueriesData({ queryKey: entityKeys.all(orgId) });
  const set = new Set(ids);
  mapCachedRows(qc, orgId, (r) => (set.has(r.id) ? { ...r, status } : r));
  return () => snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
}

function invalidate(qc: QueryClient, orgId: string) {
  return qc.invalidateQueries({ queryKey: entityKeys.all(orgId) });
}

// --- Mutations ---

type UpdateVars<P> = { id: string; patch: P };

function useUpdate<P extends { status?: ManageStatus }, R>(
  orgId: string,
  fn: (orgId: string, id: string, patch: P) => Promise<R>,
  pick: (r: R) => Row | undefined,
) {
  const qc = useQueryClient();
  return useMutation<R, ApiError, UpdateVars<P>, { rollback?: () => void }>({
    mutationFn: ({ id, patch }) => fn(orgId, id, patch),
    onMutate: async ({ id, patch }) => {
      // Status flips feel instant; everything else waits for the provider.
      if (!patch.status) return {};
      await qc.cancelQueries({ queryKey: entityKeys.all(orgId) });
      return { rollback: patchStatus(qc, orgId, [id], patch.status) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback?.(),
    onSuccess: (r) => mergeRow(qc, orgId, pick(r)),
    onSettled: () => invalidate(qc, orgId),
  });
}

export function useUpdateCampaign(orgId: string) {
  return useUpdate(orgId, manageApi.updateCampaign, (r) => r?.campaign);
}

export function useUpdateAdGroup(orgId: string) {
  return useUpdate(orgId, manageApi.updateAdGroup, (r) => r?.ad_group);
}

export function useUpdateAd(orgId: string) {
  return useUpdate(orgId, manageApi.updateAd, (r) => r?.ad);
}

export function useArchive(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { level: Level; id: string }>({
    mutationFn: ({ level, id }) => manageApi.archive(orgId, level, id),
    onSuccess: (_r, { id }) => {
      patchStatus(qc, orgId, [id], "archived");
    },
    onSettled: () => invalidate(qc, orgId),
  });
}

/** The bulk endpoint takes at most 100 ids per call. */
const BULK_MAX = 100;

export function useBulkStatus(orgId: string) {
  const qc = useQueryClient();
  return useMutation<{ results: BulkResult[] }, ApiError, { level: Level; ids: string[]; status: ManageStatus }>({
    mutationFn: async ({ level, ids, status }) => {
      const results: BulkResult[] = [];
      for (let i = 0; i < ids.length; i += BULK_MAX) {
        const r = await manageApi.bulkStatus(orgId, { level, ids: ids.slice(i, i + BULK_MAX), status });
        results.push(...(r?.results ?? []));
      }
      return { results };
    },
    onSuccess: (r, { status }) => {
      const ok = (r?.results ?? []).filter((x) => x.ok).map((x) => x.id);
      if (ok.length) patchStatus(qc, orgId, ok, status);
    },
    onSettled: () => invalidate(qc, orgId),
  });
}

export function useCreateCampaign(orgId: string) {
  const qc = useQueryClient();
  return useMutation<{ campaign: Campaign }, ApiError, CreateCampaignInput>({
    mutationFn: (input) => manageApi.createCampaign(orgId, input),
    onSettled: () => invalidate(qc, orgId),
  });
}

export function useCreateAdGroup(orgId: string) {
  const qc = useQueryClient();
  return useMutation<{ ad_group: AdGroup }, ApiError, CreateAdGroupInput>({
    mutationFn: (input) => manageApi.createAdGroup(orgId, input),
    onSettled: () => invalidate(qc, orgId),
  });
}

export function useCreateAd(orgId: string) {
  const qc = useQueryClient();
  return useMutation<{ ad: Ad }, ApiError, CreateAdInput>({
    mutationFn: (input) => manageApi.createAd(orgId, input),
    onSettled: () => invalidate(qc, orgId),
  });
}

export function useUploadImage(orgId: string) {
  return useMutation<{ image: UploadedImage }, ApiError, { accountId: string; file: File }>({
    mutationFn: ({ accountId, file }) => manageApi.uploadImage(orgId, accountId, file),
  });
}

export function useUploadVideo(orgId: string) {
  return useMutation<{ video: UploadedVideo }, ApiError, { accountId: string; file: File }>({
    mutationFn: ({ accountId, file }) => manageApi.uploadVideo(orgId, accountId, file),
  });
}

export function useUpdateAccountLimits(orgId: string) {
  const qc = useQueryClient();
  return useMutation<AccountLimits, ApiError, { accountId: string; spend_cap: number | null }>({
    mutationFn: ({ accountId, spend_cap }) => manageApi.updateLimits(orgId, accountId, spend_cap),
    onSuccess: (r, { accountId }) => qc.setQueryData(manageKeys.limits(orgId, accountId), r),
    onSettled: (_r, _e, { accountId }) => qc.invalidateQueries({ queryKey: manageKeys.limits(orgId, accountId) }),
  });
}

// --- Queries ---

export function usePages(orgId: string, accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: manageKeys.pages(orgId, accountId ?? ""),
    queryFn: () => manageApi.pages(orgId, accountId!).then((r) => r.pages ?? []),
    enabled: !!accountId && enabled,
    staleTime: 5 * 60_000,
  });
}

/** Targeting search; runs once the query has 2+ characters. */
export function useTargetingSearch(orgId: string, accountId: string | undefined, type: TargetingKind, q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: manageKeys.targeting(orgId, accountId ?? "", type, query),
    queryFn: () => manageApi.targetingSearch(orgId, accountId!, type, query).then((r) => r.results ?? []),
    enabled: !!accountId && query.length >= 2,
    staleTime: 10 * 60_000,
  });
}

export function useAudiences(orgId: string, accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: manageKeys.audiences(orgId, accountId ?? ""),
    queryFn: () => manageApi.audiences(orgId, accountId!).then((r) => r.audiences ?? []),
    enabled: !!accountId && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useAccountLimits(orgId: string, accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: manageKeys.limits(orgId, accountId ?? ""),
    queryFn: () => manageApi.limits(orgId, accountId!),
    enabled: !!accountId && enabled,
  });
}

const SERIES_MAX_IDS = 200;

/** Daily series for up to 200 entities at one level. Ids are sorted so the key is stable. */
export function useSeries(orgId: string, level: Level, ids: string[], from: string, to: string, enabled = true) {
  const sorted = [...new Set(ids)].sort().slice(0, SERIES_MAX_IDS);
  return useQuery({
    queryKey: manageKeys.series(orgId, level, sorted, from, to),
    queryFn: () => manageApi.series(orgId, level, sorted, from, to),
    enabled: enabled && sorted.length > 0,
    staleTime: 5 * 60_000,
  });
}

/**
 * One campaign with range metrics. There is no GET /campaigns/{id}, so this
 * pages through the list (200 at a time) until it finds the row.
 */
export function useCampaign(orgId: string, id: string, range: { from: string; to: string }) {
  return useQuery({
    queryKey: manageKeys.campaign(orgId, id, range),
    queryFn: async () => {
      for (let offset = 0; ; offset += 200) {
        const res = await entitiesApi.campaigns(orgId, { ...range, limit: 200, offset });
        const hit = res.rows.find((r) => r.id === id);
        if (hit) return { campaign: hit, labels: res.labels };
        if (offset + res.rows.length >= res.page.total || res.rows.length === 0)
          throw new ApiError(404, "not_found", "This campaign doesn't exist or isn't in this organization.");
      }
    },
    placeholderData: (prev) => prev,
  });
}
