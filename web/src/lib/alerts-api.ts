"use client";

/**
 * Client + React Query hooks for alerts (internal/alerts):
 *
 *   GET  /v1/orgs/{orgID}/alerts                 unread first, newest first (?unread&status&severity&kind&limit)
 *   GET  /v1/orgs/{orgID}/alerts/unread-count    badge count (last 30 days)
 *   POST /v1/orgs/{orgID}/alerts/{id}/read       mark one read (for the caller)
 *   POST /v1/orgs/{orgID}/alerts/read-all        mark all read (for the caller)
 *   GET  /v1/orgs/{orgID}/alerts/preferences     the caller's email preferences
 *   PUT  /v1/orgs/{orgID}/alerts/preferences
 *
 * Alerts are detected hourly by the worker. Read state and preferences are
 * per user; every alert is shown in-app.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertKind = "spend_spike" | "roas_drop" | "stopped_delivering" | "needs_reauth" | "action_failed";
export type EmailLevel = "all" | "warning" | "critical" | "none";

export interface Alert {
  id: string;
  organization_id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  title: string;
  body: string;
  /** Evidence behind the alert (numbers, dates). */
  data: Record<string, unknown>;
  /** App path, e.g. /app/campaigns/{id}. */
  link: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  read_at: string | null;
}

export interface AlertFilter {
  unread?: boolean;
  status?: "open" | "resolved";
  severity?: AlertSeverity;
  kind?: AlertKind;
  limit?: number;
}

export interface AlertPreferences {
  email_level: EmailLevel;
  email_muted_kinds: AlertKind[];
  /** Nothing saved yet; the role default applies. */
  is_default?: boolean;
}

export interface AlertKindInfo {
  kind: AlertKind;
  label: string;
  description: string;
}

const org = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}`;

function qs(params: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const alertsApi = {
  list: (orgId: string, f: AlertFilter) =>
    request<{ alerts: Alert[]; unread_count: number }>("GET", `${org(orgId)}/alerts${qs({ ...f })}`),
  unreadCount: (orgId: string) => request<{ count: number }>("GET", `${org(orgId)}/alerts/unread-count`),
  markRead: (orgId: string, id: string) =>
    request<void>("POST", `${org(orgId)}/alerts/${encodeURIComponent(id)}/read`),
  markAllRead: (orgId: string) => request<{ marked: number }>("POST", `${org(orgId)}/alerts/read-all`),
  preferences: (orgId: string) =>
    request<{ preferences: AlertPreferences; kinds: AlertKindInfo[] }>("GET", `${org(orgId)}/alerts/preferences`),
  savePreferences: (orgId: string, body: Omit<AlertPreferences, "is_default">) =>
    request<{ preferences: AlertPreferences; kinds: AlertKindInfo[] }>("PUT", `${org(orgId)}/alerts/preferences`, body),
};

const keys = {
  all: (orgId: string) => ["orgs", orgId, "alerts"] as const,
  list: (orgId: string, f: AlertFilter) => ["orgs", orgId, "alerts", "list", f] as const,
  unread: (orgId: string) => ["orgs", orgId, "alerts", "unread"] as const,
  prefs: (orgId: string) => ["orgs", orgId, "alerts", "preferences"] as const,
};

/** Unread badge count, polled every minute. */
export function useUnreadAlertCount(orgId: string | undefined) {
  return useQuery({
    queryKey: keys.unread(orgId ?? ""),
    queryFn: async () => (await alertsApi.unreadCount(orgId!)).count,
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}

export function useAlerts(orgId: string | undefined, f: AlertFilter, enabled = true) {
  return useQuery({
    queryKey: keys.list(orgId ?? "", f),
    queryFn: () => alertsApi.list(orgId!, f),
    enabled: !!orgId && enabled,
  });
}

export function useMarkAlertRead(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alertsApi.markRead(orgId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(orgId ?? "") }),
  });
}

export function useMarkAllAlertsRead(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => alertsApi.markAllRead(orgId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(orgId ?? "") }),
  });
}

export function useAlertPreferences(orgId: string | undefined) {
  return useQuery({
    queryKey: keys.prefs(orgId ?? ""),
    queryFn: () => alertsApi.preferences(orgId!),
    enabled: !!orgId,
  });
}

export function useSaveAlertPreferences(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<AlertPreferences, "is_default">) => alertsApi.savePreferences(orgId!, body),
    onSuccess: (data) => qc.setQueryData(keys.prefs(orgId ?? ""), data),
  });
}
