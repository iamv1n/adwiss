"use client";

import { useEffect, useMemo, useState } from "react";
import type { Provider } from "@/lib/api";
import {
  pickCurrency,
  presetRange,
  useOverview,
  type AnalyticsScope,
  type CompareMode,
  type RangePreset,
} from "@/lib/analytics-api";
import { useActiveOrg, useAdAccounts } from "@/lib/queries";

/**
 * Shared page state for analytics views: date preset, comparison, provider and
 * — when the org reports in several currencies — the currency money is shown
 * in. Money is never blended: a mixed-currency org first gets a counts-only
 * overview, then every query is scoped to one currency.
 */
export function useAnalyticsScope({
  days,
  compare,
  provider,
}: {
  days: RangePreset;
  compare: CompareMode;
  provider?: Provider;
}) {
  const org = useActiveOrg();
  const orgId = org?.id;
  const accounts = useAdAccounts(orgId);

  // Recompute "yesterday" when the preset changes or the tab is left open past midnight.
  const [dayKey, setDayKey] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setDayKey((k) => k + 1), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey only forces a refresh
  const range = useMemo(() => presetRange(days), [days, dayKey]);

  const [chosenCurrency, setCurrency] = useState<string | null>(null);
  const base = useOverview(orgId, { ...range, provider, compare });
  const mixed = !!base.data?.mixed_currency;
  const currency = pickCurrency(base.data, chosenCurrency);

  const scope: AnalyticsScope = useMemo(
    () => ({ ...range, provider, currency }),
    [range, provider, currency],
  );
  // Same query key as `base` unless the org is mixed-currency.
  const overview = useOverview(orgId, { ...scope, compare }, { enabled: !mixed || !!currency });

  /** True once the currency decision is known, so dependent queries fire once, correctly scoped. */
  const scopeReady = !!base.data && (!mixed || !!currency);
  const hasAccounts = accounts.data ? accounts.data.accounts.length > 0 : undefined;

  return {
    orgId,
    org,
    range,
    scope,
    scopeReady,
    base,
    overview,
    mixed,
    /** Every currency the org's data spans (for the picker and per-currency totals). */
    currencies: base.data?.currencies ?? [],
    /** Per-currency totals from the unscoped overview; never summed. */
    byCurrency: base.data?.by_currency,
    currency,
    setCurrency,
    accounts,
    hasAccounts,
  };
}
