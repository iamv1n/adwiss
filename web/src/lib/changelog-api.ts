"use client";

/**
 * Client + React Query hooks for product updates (internal/changelog):
 *
 *   GET    /v1/changelog?limit=&before=      published entries, newest first (public)
 *   GET    /v1/me/changelog/unread           { count, latest_published_at }
 *   POST   /v1/me/changelog/seen             mark everything seen
 *   GET    /v1/admin/changelog               every entry incl. drafts (platform admin)
 *   POST   /v1/admin/changelog               create a draft
 *   PUT    /v1/admin/changelog/{id}          replace fields
 *   DELETE /v1/admin/changelog/{id}
 *   POST   /v1/admin/changelog/{id}/publish | /unpublish
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

export type ChangelogKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  id: string;
  slug: string;
  title: string;
  summary: string;
  /** Lightweight markdown; render with <Markdown> from components/app/changelog/markdown. */
  body: string;
  kind: ChangelogKind;
  tags: string[];
  /** In-app path, e.g. /app/learn. */
  link_path: string | null;
  link_label: string | null;
  image_url: string | null;
  /** null = draft. */
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangelogInput {
  slug: string;
  title: string;
  summary: string;
  body: string;
  kind: ChangelogKind;
  tags: string[];
  link_path: string | null;
  link_label: string | null;
  image_url: string | null;
}

export interface ChangelogUnread {
  count: number;
  latest_published_at: string | null;
}

export const KIND_LABEL: Record<ChangelogKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };

/**
 * The public changelog on the marketing site. NEXT_PUBLIC_SITE_URL is the
 * same variable the auth shell uses to link home; without it we fall back to
 * a relative path so the link never points at a wrong absolute host.
 */
export const SITE_CHANGELOG_URL = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")}/changelog`;

const keys = {
  list: (limit: number) => ["changelog", "list", limit] as const,
  unread: ["changelog", "unread"] as const,
  admin: ["admin", "changelog"] as const,
};

export function useChangelog(limit = 20, enabled = true) {
  return useQuery({
    queryKey: keys.list(limit),
    queryFn: () =>
      request<{ entries: ChangelogEntry[]; next_before: string | null }>("GET", `/v1/changelog?limit=${limit}`),
    enabled,
    staleTime: 60_000,
  });
}

export function useChangelogUnread() {
  return useQuery({
    queryKey: keys.unread,
    queryFn: () => request<ChangelogUnread>("GET", "/v1/me/changelog/unread"),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
}

export function useMarkChangelogSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<void>("POST", "/v1/me/changelog/seen"),
    onMutate: () => {
      qc.setQueryData<ChangelogUnread>(keys.unread, (u) => (u ? { ...u, count: 0 } : u));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.unread }),
  });
}

export function useAdminChangelog() {
  return useQuery({
    queryKey: keys.admin,
    queryFn: () => request<{ entries: ChangelogEntry[] }>("GET", "/v1/admin/changelog"),
  });
}

function useAdminMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.admin });
      qc.invalidateQueries({ queryKey: ["changelog"] });
    },
  });
}

export function useCreateChangelog() {
  return useAdminMutation((input: ChangelogInput) =>
    request<{ entry: ChangelogEntry }>("POST", "/v1/admin/changelog", input),
  );
}

export function useUpdateChangelog() {
  return useAdminMutation(({ id, input }: { id: string; input: ChangelogInput }) =>
    request<{ entry: ChangelogEntry }>("PUT", `/v1/admin/changelog/${id}`, input),
  );
}

export function useDeleteChangelog() {
  return useAdminMutation((id: string) => request<void>("DELETE", `/v1/admin/changelog/${id}`));
}

export function useSetChangelogPublished() {
  return useAdminMutation(({ id, publish }: { id: string; publish: boolean }) =>
    request<{ entry: ChangelogEntry }>("POST", `/v1/admin/changelog/${id}/${publish ? "publish" : "unpublish"}`),
  );
}
