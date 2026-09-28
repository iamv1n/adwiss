/**
 * Server-side reads of the public changelog API (GET /v1/changelog). Set
 * ADWISE_API_URL to the Go API's base URL (default http://localhost:8080).
 * Responses are cached for five minutes; if the API is unreachable the
 * page renders an empty state instead of failing (including at build time).
 */

import { APP_URL } from "@/lib/links";

export type ChangelogKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  kind: ChangelogKind;
  tags: string[];
  link_path: string | null;
  link_label: string | null;
  image_url: string | null;
  published_at: string;
}

export const KIND_LABEL: Record<ChangelogKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };

export const REVALIDATE_SECONDS = 300;

const API_URL = (process.env.ADWISE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["changelog"] },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Published entries, newest first; null when the API could not be reached. */
export async function listEntries(limit = 50): Promise<ChangelogEntry[] | null> {
  const data = await get<{ entries: ChangelogEntry[] }>(`/v1/changelog?limit=${limit}`);
  return data?.entries ?? null;
}

export async function getEntry(slug: string): Promise<ChangelogEntry | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const data = await get<{ entry: ChangelogEntry }>(`/v1/changelog/${slug}`);
  return data?.entry ?? null;
}

/** Link into the web app for an entry's in-app path. */
export function appHref(path: string): string | null {
  return path.startsWith("/") && !path.startsWith("//") ? `${APP_URL}${path}` : null;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "long" }) {
  return new Intl.DateTimeFormat("en", { ...opts, timeZone: "UTC" }).format(new Date(iso));
}

export function groupByMonth(entries: ChangelogEntry[]) {
  const groups: { key: string; label: string; entries: ChangelogEntry[] }[] = [];
  for (const e of entries) {
    const key = new Date(e.published_at).toISOString().slice(0, 7);
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: formatDate(e.published_at, { month: "long", year: "numeric" }), entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups;
}
