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
  token: "invitation token",
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
      return field === "password" ? "Use at least 10 characters." : `That ${label} is too short.`;
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

const BASE = "/api/v1";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
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

export const api = {
  auth: {
    signup: (input: { email: string; name: string; password: string }) =>
      request<{ user: User }>("POST", "/auth/signup", input),
    login: (input: { email: string; password: string }) =>
      request<{ user: User }>("POST", "/auth/login", input),
    logout: () => request<void>("POST", "/auth/logout"),
    me: () => request<MeResponse>("GET", "/auth/me"),
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
  },
  accounts: {
    list: (orgId: string) => request<{ accounts: AdAccount[]; labels: ProviderLabels }>("GET", `/orgs/${enc(orgId)}/accounts`),
    setSync: (orgId: string, accountId: string, syncEnabled: boolean) =>
      request<{ account: AdAccount }>("PATCH", `/orgs/${enc(orgId)}/accounts/${enc(accountId)}`, {
        sync_enabled: syncEnabled,
      }),
  },
  invitations: {
    accept: (token: string) =>
      request<{ organization: Organization }>("POST", "/invitations/accept", { token }),
  },
};
