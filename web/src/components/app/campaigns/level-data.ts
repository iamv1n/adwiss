"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import type { QueryState } from "@/components/app/campaigns/entity-table";
import { type EntityFilter, type EntityList, entitiesApi, entityKeys } from "@/lib/entities-api";

type Kind = "campaigns" | "ad-groups" | "ads";
const FETCH = { campaigns: entitiesApi.campaigns, "ad-groups": entitiesApi.adGroups, ads: entitiesApi.ads } as const;

/** Most parents we fan out to when several are selected (one request each). */
export const MAX_PARENTS = 25;

/**
 * Rows for one level. With parents selected (e.g. campaigns ticked on the
 * Campaigns tab) it fetches each parent's children (≤200 each) and merges them;
 * otherwise it's one paginated list call.
 */
export function useLevelRows<T extends { id: string }>(
  kind: Kind,
  orgId: string,
  base: EntityFilter,
  parent: { key: "campaign_id" | "ad_group_id"; ids: string[] } | null,
  page: { limit: number; offset: number },
): { rows: T[]; total: number | undefined; query: QueryState; truncated: boolean } {
  const fetcher = FETCH[kind] as unknown as (o: string, f: EntityFilter) => Promise<EntityList<T>>;
  const ids = parent ? parent.ids.slice(0, MAX_PARENTS) : [];
  const fanOut = ids.length > 0;

  const listFilter: EntityFilter = { ...base, ...page };
  const list = useQuery({
    queryKey: entityKeys.list(orgId, kind, listFilter),
    queryFn: () => fetcher(orgId, listFilter),
    enabled: !fanOut,
    placeholderData: keepPreviousData,
  });

  const parts = useQueries({
    queries: ids.map((id) => {
      const f: EntityFilter = { ...base, [parent!.key]: id, limit: 200 };
      return {
        queryKey: entityKeys.list(orgId, kind, f),
        queryFn: () => fetcher(orgId, f),
        placeholderData: keepPreviousData,
      };
    }),
  });

  if (!fanOut) {
    return {
      rows: list.data?.rows ?? [],
      total: list.data?.page.total,
      truncated: false,
      query: {
        isPending: list.isPending,
        isError: list.isError,
        error: list.error,
        isPlaceholderData: list.isPlaceholderData,
        refetch: list.refetch,
      },
    };
  }

  const rows: T[] = [];
  let total = 0;
  let truncated = parent!.ids.length > MAX_PARENTS;
  for (const p of parts) {
    if (!p.data) continue;
    rows.push(...p.data.rows);
    total += p.data.page.total;
    if (p.data.page.total > p.data.rows.length) truncated = true;
  }
  const failed = parts.find((p) => p.isError);
  return {
    rows,
    total: parts.every((p) => p.data) ? total : undefined,
    truncated,
    query: {
      isPending: parts.some((p) => p.isPending),
      isError: !!failed,
      error: failed?.error ?? null,
      isPlaceholderData: parts.some((p) => p.isPlaceholderData),
      refetch: () => parts.forEach((p) => p.refetch()),
    },
  };
}
