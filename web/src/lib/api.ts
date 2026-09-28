/**
 * Typed client for the Adwise Go API.
 *
 * All requests go to same-origin `/api/v1/...`; next.config.ts rewrites
 * `/api/:path*` to the backend so the HttpOnly `adwise_session` cookie is
 * sent automatically.
 */

export type Role = "owner" | "admin" | "member";

export interface User {
  id: string;
  email: string;
  name: string;
  /** Operates the whole Adwise installation (/admin). */
  is_platform_admin?: boolean;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: Role;
  joined_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expires_at: string;
  created_at: string;
}

export type Provider = "meta" | "google";
export type IntegrationStatus = "active" | "needs_reauth" | "disconnected";

export interface Integration {
  id: string;
  provider: Provider;
  status: IntegrationStatus;
  display_name: string;
  external_user_id?: string;
  scopes?: string[];
  token_expires_at?: string | null;
  last_error?: string | null;
  last_discovered_at?: string | null;
  account_count?: number;
  sync_enabled_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface DiscoveredAccount {
  provider: Provider;
  external_id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
}

export type SyncScopeName = "entities" | "metrics" | "all";

export interface ProviderAvailability {
  provider: Provider;
  /** False when the server has no OAuth app credentials for this provider. */
  configured: boolean;
}

export type SyncProgressState = "idle" | "queued" | "running" | "done" | "failed";

/** The latest sync of an integration, as the worker reports it. */
export interface SyncProgress {
  state: SyncProgressState;
  started_at: string | null;
  updated_at: string | null;
  accounts_total: number;
  entities_done: number;
  entities_failed: number;
  /** Grows while account syncs run: each adds its reports. */
  metrics_total: number;
  metrics_done: number;
  metrics_failed: number;
  /** 0–100 */
  percent: number;
  error: string | null;
}

export type SyncStatus = "disabled" | "integration_error" | "never_synced" | "stale" | "ok";

export interface SyncScope {
  scope: string;
  last_synced_at: string;
  lag_seconds: number;
}

export interface AdAccount {
  id: string;
  integration_id: string | null;
  integration_status: IntegrationStatus | null;
  provider: Provider;
  name: string;
  external_id: string;
  currency: string;
  timezone: string;
  /** Provider-side status: active | paused | archived | deleted | unknown */
  status: string;
  sync_enabled: boolean;
  sync_status: SyncStatus;
  /** Oldest sync across scopes. */
  last_synced_at: string | null;
  freshness_lag_seconds: number | null;
  sync_scopes: SyncScope[];
  created_at: string;
  updated_at: string;
}

/** Provider-specific names for canonical entities (e.g. Meta "Ad set" = Adwise ad group). */
export interface EntityLabels {
  account: string;
  campaign: string;
  ad_group: string;
  ad: string;
  creative: string;
}

export type ProviderLabels = Record<Provider, EntityLabels>;

export interface MeResponse {
  user: User;
  organizations: Organization[];
  /** Set when a platform admin is logged in as `user`. */
  impersonator?: User;
  impersonation_expires_at?: string;
  /** False until the user confirms their email with the code we sent. */
  email_verified?: boolean;
  two_factor_enabled?: boolean;
}

// --- Account security ---

export type ChallengeMethod = "totp" | "email" | "recovery";
export type ChallengeReason = "two_factor" | "new_device" | "failed_attempts";

export type LoginResult =
  | { status: "ok"; user: User }
  | {
      status: "challenge";
      challenge: string;
      methods: ChallengeMethod[];
      reason: ChallengeReason;
      /** Masked email the code goes to, e.g. v***@gmail.com */
      email_hint: string;
    };

export interface KnownDevice {
  id: string;
  label: string;
  last_ip: string;
  last_seen_at: string;
  trusted: boolean;
  current: boolean;
}

export interface SecurityEvent {
  type: string;
  ip: string;
  user_agent: string;
  created_at: string;
}

export interface SecurityOverview {
  email: string;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  totp_enabled: boolean;
  email_2fa_enabled: boolean;
  recovery_codes_remaining: number;
  password_changed_at: string | null;
  devices: KnownDevice[];
  sessions_count: number;
  events: SecurityEvent[];
}

// --- Platform admin console (/v1/admin) ---

export interface AdminStats {
  users: number;
  users_last_7d: number;
  active_users_24h: number;
  platform_admins: number;
  organizations: number;
  active_impersonations: number;
  integrations_active: number;
  integrations_needs_reauth: number;
  integrations_with_errors: number;
  ad_accounts: number;
  ad_accounts_syncing: number;
  campaigns: number;
  ads: number;
  metric_facts_estimate: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  is_platform_admin: boolean;
  created_at: string;
  org_count: number;
  last_seen_at: string | null;
  active_sessions: number;
}

export interface AdminMembership {
  organization_id: string;
  name: string;
  slug: string;
  role: Role;
  joined_at: string;
}

export interface AdminSession {
  id: string;
  user_agent: string;
  ip_address: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  impersonator_id: string | null;
  impersonator_email: string | null;
}

export interface AdminActivity {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  organization_id: string | null;
  organization_name: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  members: number;
  integrations: number;
  integration_issues: number;
  ad_accounts: number;
  campaigns: number;
  last_synced_at: string | null;
}

export interface AdminOrgMember {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_platform_admin: boolean;
  joined_at: string;
}

export interface AdminAccount {
  id: string;
  integration_id: string | null;
  provider: Provider;
  external_id: string;
  name: string;
  currency: string;
  status: string;
  sync_enabled: boolean;
  campaigns: number;
  oldest_synced_at: string | null;
  last_synced_at: string | null;
}

export interface AdminIntegration {
  id: string;
  organization_id: string;
  organization_name: string;
  provider: Provider;
  status: IntegrationStatus;
  display_name: string;
  last_error: string | null;
  last_discovered_at: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
  accounts: number;
  sync_enabled: number;
  last_synced_at: string | null;
}

export type TaskState = "active" | "pending" | "scheduled" | "retry" | "archived" | "completed";

export interface QueueStat {
  name: string;
  paused: boolean;
  size: number;
  pending: number;
  active: number;
  scheduled: number;
  retry: number;
  archived: number;
  completed: number;
  processed_today: number;
  failed_today: number;
  latency_ms: number;
  memory_kb: number;
  priority: number;
}

export interface WorkerServer {
  id: string;
  host: string;
  pid: number;
  concurrency: number;
  status: string;
  started: string;
  active: { task_id: string; type: string; queue: string; payload: unknown; started: string; deadline: string }[];
}

export interface QueuesOverview {
  queues: QueueStat[];
  servers: WorkerServer[];
  schedules: { id: string; spec: string; type: string; next: string; prev: string | null }[];
  history: { date: string; processed: number; failed: number }[];
}

export interface QueueTask {
  id: string;
  queue: string;
  type: string;
  state: TaskState;
  payload: unknown;
  organization_id?: string;
  organization_name?: string;
  retried: number;
  max_retry: number;
  last_error?: string;
  last_failed_at?: string;
  next_process_at?: string;
  completed_at?: string;
  timeout_seconds: number;
}

export interface SystemInfo {
  env: string;
  web_base_url: string;
  api_base_url: string;
  session_ttl_hours: number;
  redis_memory: string;
  database: { size_bytes: number; migration_version: number; server_version: string; expired_sessions: number };
  checks: { name: string; ok: boolean; detail: string }[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields ?? {};
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Sentence-case a server message ("an account exists" → "An account exists."). */
export function humanizeMessage(message: string): string {
  const m = message.trim();
  if (!m) return m;
  const cased = m[0].toUpperCase() + m.slice(1);
  return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

const FIELD_LABELS: Record<string, string> = {
  email: "email address",
  name: "name",
  password: "password",
  role: "role",
  token: "link",
  code: "code",
  phone: "phone number",
  current_password: "current password",
  new_password: "new password",
};

/**
 * The API returns validator tags as field messages (e.g. `{"password":"min"}`).
 * Turn known tags into readable sentences; pass real sentences through.
 */
export function humanizeFieldError(field: string, value: string): string {
  const label = FIELD_LABELS[field] ?? field.replace(/_/g, " ");
  switch (value) {
    case "required":
      return `Enter your ${label}.`;
    case "email":
      return "Enter a valid email address.";
    case "min":
      return field === "password" || field === "new_password" ? "Use at least 10 characters." : `That ${label} is too short.`;
    case "max":
      return `That ${label} is too long.`;
    case "oneof":
      return `Choose a valid ${label}.`;
    default:
      return /\s/.test(value) ? humanizeMessage(value) : `Invalid ${label}.`;
  }
}

/** Some error codes are really about a single field; surface them inline. */
const CODE_TO_FIELD: Record<string, [field: string, message: string]> = {
  email_taken: ["email", "An account with this email already exists."],
};

/** Friendly copy for the auth/security error codes the UI keys on. */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match an account.",
  too_many_attempts: "Too many attempts. Wait a few minutes and try again.",
  invalid_code: "That code isn't right. Check it and try again.",
  code_expired: "That code has expired. Request a new one.",
  challenge_expired: "This sign-in took too long. Please start again.",
  password_required: "Enter your current password to confirm.",
  weak_password: "Choose a stronger password — longer, and not a common one.",
  invalid_phone: "Enter a valid mobile number with its country code, e.g. +91 98765 43210.",
  rate_limited: "Please wait a moment before requesting another code.",
  invalid_token: "This link is invalid or has expired. Request a new one.",
};

/** Best user-facing message for an auth error. */
export function authErrorMessage(err: unknown): string {
  if (isApiError(err)) return AUTH_ERROR_MESSAGES[err.code] ?? err.message;
  return "Something went wrong. Please try again.";
}

const BASE = "/api/v1";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the Adwise API. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    const err = (data as Partial<ApiErrorBody> | undefined)?.error;
    const code = err?.code ?? (res.status >= 500 ? "server_error" : "request_failed");
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(err?.fields ?? {})) fields[k] = humanizeFieldError(k, v);
    if (CODE_TO_FIELD[code]) {
      const [f, msg] = CODE_TO_FIELD[code];
      fields[f] = msg;
    }
    // Keep specific server messages (e.g. 503 provider_not_configured); hide generic 500s.
    const message =
      !err?.message || res.status === 500 || code === "server_error"
        ? res.status >= 500
          ? "Something went wrong on our side. Please try again."
          : `Request failed (${res.status}).`
        : humanizeMessage(err.message);
    throw new ApiError(res.status, code, message, fields);
  }

  return data as T;
}

const enc = encodeURIComponent;

/** Query string from defined, non-empty values. */
function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  auth: {
    signup: (input: { email: string; name: string; password: string }) =>
      request<{ user: User }>("POST", "/auth/signup", input),
    login: (input: { email: string; password: string; remember_device?: boolean }) =>
      request<LoginResult>("POST", "/auth/login", input),
    loginCodeStart: (input: { email: string }) => request<void>("POST", "/auth/login/code/start", input),
    loginCodeVerify: (input: { email: string; code: string; remember_device?: boolean }) =>
      request<LoginResult>("POST", "/auth/login/code/verify", input),
    challengeEmail: (input: { challenge: string }) => request<void>("POST", "/auth/challenge/email", input),
    challengeVerify: (input: { challenge: string; method: ChallengeMethod; code: string; remember_device?: boolean }) =>
      request<LoginResult>("POST", "/auth/challenge/verify", input),
    forgotPassword: (input: { email: string }) => request<void>("POST", "/auth/password/forgot", input),
    resetPassword: (input: { token: string; password: string }) =>
      request<{ status: "ok" }>("POST", "/auth/password/reset", input),
    verifyEmail: (input: { code: string }) => request<{ email_verified: true }>("POST", "/auth/email/verify", input),
    resendEmail: () => request<void>("POST", "/auth/email/resend"),
    changePassword: (input: { current_password: string; new_password: string }) =>
      request<void>("POST", "/auth/password/change", input),
    security: () => request<SecurityOverview>("GET", "/auth/security"),
    totpSetup: (input: { password: string }) =>
      request<{ secret: string; otpauth_url: string }>("POST", "/auth/2fa/totp/setup", input),
    totpEnable: (input: { code: string }) =>
      request<{ recovery_codes: string[] }>("POST", "/auth/2fa/totp/enable", input),
    totpDisable: (input: { password: string; code: string }) => request<void>("POST", "/auth/2fa/totp/disable", input),
    setEmail2fa: (input: { password: string; enabled: boolean }) => request<void>("POST", "/auth/2fa/email", input),
    regenerateRecoveryCodes: (input: { password: string }) =>
      request<{ recovery_codes: string[] }>("POST", "/auth/2fa/recovery-codes", input),
    addPhone: (input: { password: string; phone: string }) => request<void>("POST", "/auth/phone", input),
    verifyPhone: (input: { code: string }) => request<void>("POST", "/auth/phone/verify", input),
    removePhone: (input: { password: string }) => request<void>("DELETE", "/auth/phone", input),
    removeDevice: (id: string) => request<void>("DELETE", `/auth/devices/${enc(id)}`),
    revokeOtherSessions: () => request<{ revoked: number }>("POST", "/auth/sessions/revoke-others"),
    logout: () => request<void>("POST", "/auth/logout"),
    me: () => request<MeResponse>("GET", "/auth/me"),
    stopImpersonation: () =>
      request<{ restored: boolean; user?: User }>("POST", "/auth/impersonation/stop"),
  },
  orgs: {
    list: () => request<{ organizations: Organization[] }>("GET", "/orgs"),
    create: (input: { name: string }) =>
      request<{ organization: Organization }>("POST", "/orgs", input),
    members: (orgId: string) =>
      request<{ members: Member[] }>("GET", `/orgs/${enc(orgId)}/members`),
    updateMember: (orgId: string, userId: string, role: Role) =>
      request<void>("PATCH", `/orgs/${enc(orgId)}/members/${enc(userId)}`, { role }),
    removeMember: (orgId: string, userId: string) =>
      request<void>("DELETE", `/orgs/${enc(orgId)}/members/${enc(userId)}`),
    invitations: (orgId: string) =>
      request<{ invitations: Invitation[] }>("GET", `/orgs/${enc(orgId)}/invitations`),
    invite: (orgId: string, input: { email: string; role: Role }) =>
      request<{ invitation: Invitation; accept_url: string }>(
        "POST",
        `/orgs/${enc(orgId)}/invitations`,
        input,
      ),
    revokeInvitation: (orgId: string, invitationId: string) =>
      request<void>("DELETE", `/orgs/${enc(orgId)}/invitations/${enc(invitationId)}`),
  },
  integrations: {
    list: (orgId: string) =>
      request<{ integrations: Integration[]; providers?: ProviderAvailability[] }>(
        "GET",
        `/orgs/${enc(orgId)}/integrations`,
      ),
    connect: (orgId: string, provider: Provider) =>
      request<{ authorize_url: string; expires_in?: number }>("POST", `/orgs/${enc(orgId)}/integrations/${enc(provider)}/connect`),
    disconnect: (orgId: string, integrationId: string) =>
      request<void>("DELETE", `/orgs/${enc(orgId)}/integrations/${enc(integrationId)}`),
    discover: (orgId: string, integrationId: string) =>
      request<{ accounts: DiscoveredAccount[] }>(
        "POST",
        `/orgs/${enc(orgId)}/integrations/${enc(integrationId)}/discover`,
      ),
    sync: (orgId: string, integrationId: string, scope?: SyncScopeName) =>
      request<{ task_id: string; already_queued: boolean; account_ids: string[] }>(
        "POST",
        `/orgs/${enc(orgId)}/integrations/${enc(integrationId)}/sync`,
        scope ? { scope } : undefined,
      ),
    syncProgress: (orgId: string, integrationId: string) =>
      request<{ progress: SyncProgress }>(
        "GET",
        `/orgs/${enc(orgId)}/integrations/${enc(integrationId)}/sync/progress`,
      ),
  },
  accounts: {
    list: (orgId: string) => request<{ accounts: AdAccount[]; labels: ProviderLabels }>("GET", `/orgs/${enc(orgId)}/accounts`),
    setSync: (orgId: string, accountId: string, syncEnabled: boolean) =>
      request<{ account: AdAccount }>("PATCH", `/orgs/${enc(orgId)}/accounts/${enc(accountId)}`, {
        sync_enabled: syncEnabled,
      }),
  },
  admin: {
    stats: () => request<{ stats: AdminStats }>("GET", "/admin/stats"),
    users: (p: { q?: string; limit?: number; offset?: number }) =>
      request<{ users: AdminUser[]; total: number }>("GET", `/admin/users${qs(p)}`),
    user: (id: string) =>
      request<{
        user: AdminUser;
        organizations: AdminMembership[];
        sessions: AdminSession[];
        activity: AdminActivity[];
      }>("GET", `/admin/users/${enc(id)}`),
    impersonate: (id: string) =>
      request<{ user: User; expires_at: string }>("POST", `/admin/users/${enc(id)}/impersonate`),
    revokeSessions: (id: string) => request<{ revoked: number }>("POST", `/admin/users/${enc(id)}/revoke-sessions`),
    orgs: (p: { q?: string; limit?: number; offset?: number }) =>
      request<{ organizations: AdminOrg[]; total: number }>("GET", `/admin/organizations${qs(p)}`),
    org: (id: string) =>
      request<{
        organization: AdminOrg;
        members: AdminOrgMember[];
        integrations: AdminIntegration[];
        accounts: AdminAccount[];
        activity: AdminActivity[];
      }>("GET", `/admin/organizations/${enc(id)}`),
    integrations: () => request<{ integrations: AdminIntegration[] }>("GET", "/admin/integrations"),
    sync: (integrationId: string, scope?: SyncScopeName) =>
      request<{ task_id: string; already_queued: boolean; account_ids: string[] }>(
        "POST",
        `/admin/integrations/${enc(integrationId)}/sync`,
        scope ? { scope } : undefined,
      ),
    queues: () => request<QueuesOverview>("GET", "/admin/queues"),
    failures: () => request<{ tasks: QueueTask[] }>("GET", "/admin/queues/failures"),
    tasks: (queue: string, state: TaskState, page = 1) =>
      request<{ tasks: QueueTask[]; page: number }>("GET", `/admin/queues/${enc(queue)}/tasks${qs({ state, page })}`),
    runTask: (queue: string, id: string) => request<void>("POST", `/admin/queues/${enc(queue)}/tasks/${enc(id)}/run`),
    deleteTask: (queue: string, id: string) => request<void>("DELETE", `/admin/queues/${enc(queue)}/tasks/${enc(id)}`),
    queueAction: (queue: string, action: "pause" | "resume" | "retry-all" | "clear-archived") =>
      request<{ tasks: number }>("POST", `/admin/queues/${enc(queue)}/${action}`),
    activity: (p: { organization_id?: string; actor_id?: string; action?: string; before?: string; limit?: number }) =>
      request<{ activity: AdminActivity[] }>("GET", `/admin/activity${qs(p)}`),
    system: () => request<SystemInfo>("GET", "/admin/system"),
  },
  invitations: {
    accept: (token: string) =>
      request<{ organization: Organization }>("POST", "/invitations/accept", { token }),
  },
};
