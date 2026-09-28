"use client";

import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SyncScopeName, type TaskState } from "@/lib/api";

/** Live pages poll so the console shows what the worker is doing right now. */
const LIVE_MS = 5_000;

export const adminKeys = {
  all: ["admin"] as const,
  stats: ["admin", "stats"] as const,
  users: (q: string, offset: number) => ["admin", "users", q, offset] as const,
  user: (id: string) => ["admin", "user", id] as const,
  orgs: (q: string, offset: number) => ["admin", "orgs", q, offset] as const,
  org: (id: string) => ["admin", "org", id] as const,
  integrations: ["admin", "integrations"] as const,
  queues: ["admin", "queues"] as const,
  failures: ["admin", "failures"] as const,
  tasks: (queue: string, state: TaskState) => ["admin", "tasks", queue, state] as const,
  activity: (action: string) => ["admin", "activity", action] as const,
  system: ["admin", "system"] as const,
};

export const PAGE_SIZE = 50;

export function useAdminStats() {
  return useQuery({ queryKey: adminKeys.stats, queryFn: async () => (await api.admin.stats()).stats, refetchInterval: 30_000 });
}

export function useAdminUsers(q: string, offset: number) {
  return useQuery({
    queryKey: adminKeys.users(q, offset),
    queryFn: () => api.admin.users({ q, offset, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminUser(id: string) {
  return useQuery({ queryKey: adminKeys.user(id), queryFn: () => api.admin.user(id) });
}

export function useAdminOrgs(q: string, offset: number) {
  return useQuery({
    queryKey: adminKeys.orgs(q, offset),
    queryFn: () => api.admin.orgs({ q, offset, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrg(id: string) {
  return useQuery({ queryKey: adminKeys.org(id), queryFn: () => api.admin.org(id), refetchInterval: LIVE_MS * 2 });
}

export function useAdminIntegrations() {
  return useQuery({
    queryKey: adminKeys.integrations,
    queryFn: async () => (await api.admin.integrations()).integrations,
    refetchInterval: LIVE_MS * 2,
  });
}

export function useQueues() {
  return useQuery({ queryKey: adminKeys.queues, queryFn: api.admin.queues, refetchInterval: LIVE_MS });
}

export function useFailures() {
  return useQuery({
    queryKey: adminKeys.failures,
    queryFn: async () => (await api.admin.failures()).tasks,
    refetchInterval: LIVE_MS * 2,
  });
}

export function useQueueTasks(queue: string, state: TaskState) {
  return useQuery({
    queryKey: adminKeys.tasks(queue, state),
    queryFn: async () => (await api.admin.tasks(queue, state)).tasks,
    refetchInterval: LIVE_MS,
  });
}

export function useAdminActivity(action: string) {
  return useQuery({
    queryKey: adminKeys.activity(action),
    queryFn: async () => (await api.admin.activity({ action, limit: 200 })).activity,
    refetchInterval: LIVE_MS * 3,
  });
}

export function useSystem() {
  return useQuery({ queryKey: adminKeys.system, queryFn: api.admin.system, refetchInterval: 30_000 });
}

/** Any admin mutation refreshes the whole console. */
function useAdminMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: adminKeys.all }) });
}

export function useSyncIntegration() {
  return useAdminMutation((v: { id: string; scope?: SyncScopeName }) => api.admin.sync(v.id, v.scope));
}

export function useTaskAction() {
  return useAdminMutation((v: { queue: string; id: string; action: "run" | "delete" }) =>
    v.action === "run" ? api.admin.runTask(v.queue, v.id) : api.admin.deleteTask(v.queue, v.id),
  );
}

export function useQueueAction() {
  return useAdminMutation((v: { queue: string; action: "pause" | "resume" | "retry-all" | "clear-archived" }) =>
    api.admin.queueAction(v.queue, v.action),
  );
}

export function useRevokeSessions() {
  return useAdminMutation((id: string) => api.admin.revokeSessions(id));
}

/**
 * The session cookie now belongs to someone else, so drop every cached query
 * (the active-org store falls back to the new user's first org on its own).
 */
function useSwitchUser() {
  const qc = useQueryClient();
  const router = useRouter();
  return (to: string) => {
    qc.clear();
    router.replace(to);
  };
}

/** Starts an impersonation and opens the app as that user. */
export function useImpersonate() {
  const switchTo = useSwitchUser();
  return useMutation({
    mutationFn: api.admin.impersonate,
    onSuccess: () => switchTo("/app/dashboard"),
  });
}

/** Ends an impersonation and returns to the console (or /login if the admin session expired). */
export function useStopImpersonation() {
  const switchTo = useSwitchUser();
  return useMutation({
    mutationFn: api.auth.stopImpersonation,
    onSuccess: (res) => switchTo(res.restored ? "/admin/users" : "/login"),
  });
}
