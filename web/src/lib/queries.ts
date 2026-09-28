"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  isApiError,
  type AdAccount,
  type LoginResult,
  type MeResponse,
  type Organization,
  type Provider,
  type ProviderLabels,
  type Role,
  type SyncProgressState,
} from "@/lib/api";
import { useActiveOrgStore } from "@/lib/stores/org";

export const queryKeys = {
  me: ["auth", "me"] as const,
  security: ["auth", "security"] as const,
  members: (orgId: string) => ["orgs", orgId, "members"] as const,
  invitations: (orgId: string) => ["orgs", orgId, "invitations"] as const,
  integrations: (orgId: string) => ["orgs", orgId, "integrations"] as const,
  accounts: (orgId: string) => ["orgs", orgId, "accounts"] as const,
  syncProgress: (orgId: string, integrationId: string) =>
    ["orgs", orgId, "integrations", integrationId, "sync-progress"] as const,
};

/**
 * Current session. Resolves to `null` when the user is not logged in (401),
 * so callers can distinguish "logged out" from "loading" and real errors.
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await api.auth.me();
      } catch (e) {
        if (isApiError(e) && e.status === 401) return null;
        throw e;
      }
    },
  });
}

/** Resolves the active org: the persisted choice if still valid, else the first. */
export function useActiveOrg(): Organization | null {
  const { data } = useMe();
  const activeOrgId = useActiveOrgStore((s) => s.activeOrgId);
  const orgs = data?.organizations ?? [];
  return orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null;
}

export const useLogin = () => useLoginStep(api.auth.login);

/** Any sign-in step that may finish the login (returns a LoginResult). */
function useLoginStep<I>(fn: (input: I) => Promise<LoginResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      if (res.status === "ok") return qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export const useLoginCodeVerify = () => useLoginStep(api.auth.loginCodeVerify);
export const useChallengeVerify = () => useLoginStep(api.auth.challengeVerify);
export const useLoginCodeStart = () => useMutation({ mutationFn: api.auth.loginCodeStart });
export const useChallengeEmail = () => useMutation({ mutationFn: api.auth.challengeEmail });
export const useForgotPassword = () => useMutation({ mutationFn: api.auth.forgotPassword });
export const useResetPassword = () => useMutation({ mutationFn: api.auth.resetPassword });
export const useResendVerifyEmail = () => useMutation({ mutationFn: api.auth.resendEmail });

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.auth.verifyEmail,
    onSuccess: async () => {
      qc.setQueryData<MeResponse | null>(queryKeys.me, (old) => (old ? { ...old, email_verified: true } : old));
      await qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useSecurity() {
  return useQuery({ queryKey: queryKeys.security, queryFn: api.auth.security });
}

/** Security-settings mutation that refreshes the overview (and `me`) when done. */
function useSecurityMutation<I, O>(fn: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.security });
      qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export const useChangePassword = () => useSecurityMutation(api.auth.changePassword);
export const useTotpSetup = () => useMutation({ mutationFn: api.auth.totpSetup });
export const useTotpEnable = () => useSecurityMutation(api.auth.totpEnable);
export const useTotpDisable = () => useSecurityMutation(api.auth.totpDisable);
export const useSetEmail2fa = () => useSecurityMutation(api.auth.setEmail2fa);
export const useRegenerateRecoveryCodes = () => useSecurityMutation(api.auth.regenerateRecoveryCodes);
export const useAddPhone = () => useSecurityMutation(api.auth.addPhone);
export const useVerifyPhone = () => useSecurityMutation(api.auth.verifyPhone);
export const useRemovePhone = () => useSecurityMutation(api.auth.removePhone);
export const useRemoveDevice = () => useSecurityMutation(api.auth.removeDevice);
export const useRevokeOtherSessions = () => useSecurityMutation(api.auth.revokeOtherSessions);

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.auth.signup,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.auth.logout,
    onSettled: () => {
      qc.setQueryData(queryKeys.me, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    },
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  const setActive = useActiveOrgStore((s) => s.setActiveOrgId);
  return useMutation({
    mutationFn: api.orgs.create,
    onSuccess: async ({ organization }) => {
      setActive(organization.id);
      await qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  const setActive = useActiveOrgStore((s) => s.setActiveOrgId);
  return useMutation({
    mutationFn: api.invitations.accept,
    onSuccess: async ({ organization }) => {
      setActive(organization.id);
      await qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.members(orgId ?? ""),
    queryFn: () => api.orgs.members(orgId!).then((r) => r.members),
    enabled: !!orgId,
  });
}

export function useInvitations(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.invitations(orgId ?? ""),
    queryFn: () => api.orgs.invitations(orgId!).then((r) => r.invitations),
    enabled: !!orgId && enabled,
  });
}

export function useUpdateMemberRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.orgs.updateMember(orgId, userId, role),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.members(orgId) }),
  });
}

export function useRemoveMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.orgs.removeMember(orgId, userId),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.members(orgId) }),
  });
}

export function useInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: Role }) => api.orgs.invite(orgId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.invitations(orgId) }),
  });
}

export function useRevokeInvitation(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => api.orgs.revokeInvitation(orgId, invitationId),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.invitations(orgId) }),
  });
}

export function useIntegrations(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.integrations(orgId ?? ""),
    queryFn: () =>
      api.integrations.list(orgId!).then((r) => ({ integrations: r.integrations ?? [], providers: r.providers ?? [] })),
    enabled: !!orgId,
  });
}

export interface AccountsData {
  accounts: AdAccount[];
  labels: ProviderLabels | undefined;
}

export function useAdAccounts(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.accounts(orgId ?? ""),
    queryFn: () => api.accounts.list(orgId!).then((r) => ({ accounts: r.accounts ?? [], labels: r.labels })),
    enabled: !!orgId,
  });
}

/** Starts OAuth: the backend returns an authorize URL and we leave the app. */
export function useConnectProvider(orgId: string) {
  return useMutation({
    mutationFn: (provider: Provider) => api.integrations.connect(orgId, provider),
    onSuccess: ({ authorize_url }) => {
      window.location.href = authorize_url;
    },
  });
}

export function useDisconnectIntegration(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (integrationId: string) => api.integrations.disconnect(orgId, integrationId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.integrations(orgId) });
      qc.invalidateQueries({ queryKey: queryKeys.accounts(orgId) });
    },
  });
}

export function useDiscoverAccounts(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (integrationId: string) => api.integrations.discover(orgId, integrationId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts(orgId) });
      qc.invalidateQueries({ queryKey: queryKeys.integrations(orgId) });
    },
  });
}

export function useSyncIntegration(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (integrationId: string) => api.integrations.sync(orgId, integrationId),
    onSettled: (_data, _err, integrationId) => {
      qc.invalidateQueries({ queryKey: queryKeys.syncProgress(orgId, integrationId) });
      qc.invalidateQueries({ queryKey: queryKeys.accounts(orgId) });
      qc.invalidateQueries({ queryKey: queryKeys.integrations(orgId) });
    },
  });
}

/** Toggle account sync with an optimistic update and rollback on error. */
export function useSetAccountSync(orgId: string) {
  const qc = useQueryClient();
  const key = queryKeys.accounts(orgId);
  return useMutation({
    mutationFn: ({ accountId, syncEnabled }: { accountId: string; syncEnabled: boolean }) =>
      api.accounts.setSync(orgId, accountId, syncEnabled),
    onMutate: async ({ accountId, syncEnabled }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AccountsData>(key);
      qc.setQueryData<AccountsData>(key, (old) =>
        old && {
          ...old,
          accounts: old.accounts.map((a) => (a.id === accountId ? { ...a, sync_enabled: syncEnabled } : a)),
        },
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: ({ account }) => {
      if (!account) return;
      qc.setQueryData<AccountsData>(key, (old) =>
        old && { ...old, accounts: old.accounts.map((a) => (a.id === account.id ? account : a)) },
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

const ACTIVE_SYNC: SyncProgressState[] = ["queued", "running"];

/**
 * Live progress of an integration's sync. Polls every 2 s while a sync is
 * queued or running (and every 30 s otherwise, to pick up scheduled syncs).
 * When a sync finishes, accounts and integrations are refetched so their
 * "last synced" times update.
 */
export function useSyncProgress(orgId: string, integrationId: string, enabled = true) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.syncProgress(orgId, integrationId),
    queryFn: async () => (await api.integrations.syncProgress(orgId, integrationId)).progress,
    enabled: enabled && !!orgId,
    refetchInterval: (query) => (query.state.data && ACTIVE_SYNC.includes(query.state.data.state) ? 2000 : 30000),
  });
  const state = q.data?.state;
  const prev = useRef(state);
  useEffect(() => {
    const was = prev.current;
    prev.current = state;
    if (was && ACTIVE_SYNC.includes(was) && state && !ACTIVE_SYNC.includes(state)) {
      qc.invalidateQueries({ queryKey: queryKeys.accounts(orgId) });
      qc.invalidateQueries({ queryKey: queryKeys.integrations(orgId) });
    }
  }, [state, orgId, qc]);
  return q;
}

export function isSyncActive(state: SyncProgressState | undefined) {
  return !!state && ACTIVE_SYNC.includes(state);
}
