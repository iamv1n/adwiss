import type { Provider } from "@/lib/api";
import type { Level } from "@/lib/manage-api";
import { useActiveOrg } from "@/lib/queries";

/** What Adwise can change per provider (plan/campaign-management-api.md). */
export type Capability = "status" | "budget" | "name" | "schedule" | "spend_cap" | "bid" | "archive" | "create";

export function supports(provider: Provider, level: Level, cap: Capability): boolean {
  if (provider === "meta") return true;
  // Google: only campaign status and campaign daily budget.
  return level === "campaign" && (cap === "status" || cap === "budget");
}

export const GOOGLE_LIMIT_HINT = "For Google Ads, Adwise can change only campaign status and daily budget.";

export const MEMBER_HINT = "Only admins and owners can change campaigns.";

/** Admins and owners may manage; members get read-only tables. */
export function useCanManage(): boolean {
  const org = useActiveOrg();
  return !!org && org.role !== "member";
}

/** Why a control is disabled, or null when it's allowed. */
export function blockedReason(canManage: boolean, provider: Provider, level: Level, cap: Capability): string | null {
  if (!canManage) return MEMBER_HINT;
  if (!supports(provider, level, cap)) return GOOGLE_LIMIT_HINT;
  return null;
}
