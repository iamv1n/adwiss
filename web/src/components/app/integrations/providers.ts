import type { EntityLabels, Provider } from "@/lib/api";

export const PROVIDER_IDS: Provider[] = ["meta", "google"];

export const PROVIDERS: Record<
  Provider,
  { name: string; monogram: string; description: string; tone: string }
> = {
  meta: {
    name: "Meta Ads",
    monogram: "M",
    description: "Facebook and Instagram ad accounts.",
    tone: "bg-accent text-accent-fg",
  },
  google: {
    name: "Google Ads",
    monogram: "G",
    description: "Search, Performance Max, Display and YouTube campaigns.",
    tone: "border border-border-strong bg-bg-subtle text-fg",
  },
};

/** Used until the accounts endpoint returns its `labels` map. */
export const FALLBACK_LABELS: Record<Provider, EntityLabels> = {
  meta: { account: "Ad account", campaign: "Campaign", ad_group: "Ad set", ad: "Ad", creative: "Creative" },
  google: { account: "Account", campaign: "Campaign", ad_group: "Ad group", ad: "Ad", creative: "Asset" },
};

export function isProvider(v: unknown): v is Provider {
  return v === "meta" || v === "google";
}

/** Toast copy for `?error=<code>&provider=<p>` after the OAuth callback. */
export function oauthErrorToast(
  code: string,
  provider: Provider | null,
): { tone: "neutral" | "error"; title: string; description: string } {
  const name = provider ? PROVIDERS[provider].name : "the platform";
  switch (code) {
    case "access_denied":
      return { tone: "neutral", title: "Connection cancelled", description: "Nothing was connected." };
    case "invalid_state":
      return { tone: "error", title: "Link expired, try again", description: "The sign-in link is only valid for a few minutes." };
    case "missing_scope":
      return {
        tone: "error",
        title: `Grant the ${provider ? PROVIDERS[provider].name : "requested"} permission`,
        description: "Adwise needs every permission it asks for. Connect again and approve all of them.",
      };
    case "exchange_failed":
      return { tone: "error", title: `Couldn't finish signing in to ${name}`, description: "Please try connecting again." };
    case "forbidden":
      return { tone: "error", title: "You can't connect platforms", description: "Only owners and admins can connect ad platforms." };
    case "provider_not_configured":
      return { tone: "error", title: `${name} isn't configured`, description: "It isn't configured on this server yet." };
    case "provider_error":
      return { tone: "error", title: `${name} returned an error`, description: "Please try again in a few minutes." };
    case "invalid_request":
      return { tone: "error", title: "Couldn't connect", description: "The connection request was invalid. Please try again." };
    case "server_error":
    default:
      return { tone: "error", title: "Couldn't connect", description: "Something went wrong on our side. Please try again." };
  }
}

/** Copy for errors from discover / sync / connect calls on an existing integration. */
export function integrationErrorMessage(err: Error, provider: Provider): string {
  const name = PROVIDERS[provider].name;
  const code = (err as { code?: string }).code;
  switch (code) {
    case "provider_not_configured":
      return `${name} isn't configured on this server yet.`;
    case "integration_inactive":
      return "This connection isn't active. Reconnect it first.";
    case "reauth_required":
      return `Access to ${name} has expired. Reconnect to continue.`;
    case "provider_permission_denied":
      return `${name} denied access. Check that the person who connected still has access to these accounts.`;
    case "provider_rate_limited":
      return `${name} is limiting requests right now. Try again in a few minutes.`;
    case "provider_error":
      return `${name} returned an error. Try again shortly.`;
    case "forbidden":
      return "Only owners and admins can do this.";
    default:
      return err.message;
  }
}
