"use client";

/**
 * Account spending limit (Meta ad account spend_cap): amount spent vs the cap
 * as a meter, editable by admins. Raising or removing the limit asks first.
 */

import { useState } from "react";
import { Gauge, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useManage } from "@/components/app/campaigns/manage-context";
import { ProviderMark } from "@/components/app/campaigns/entity-bits";
import { formatMoney } from "@/components/app/campaigns/format";
import { errorToast } from "@/components/app/campaigns/toasts";
import type { AdAccount } from "@/lib/api";
import { type AccountLimits as Limits, useAccountLimits, useUpdateAccountLimits } from "@/lib/manage-api";
import { cn } from "@/lib/utils";

function fraction(l: Limits): number | null {
  return l.spend_cap && l.spend_cap > 0 ? Math.min(1, l.amount_spent / l.spend_cap) : null;
}

/** Fill carries severity: normal → warning at 75% → danger at 90%. */
function Meter({ value, className }: { value: number | null; className?: string }) {
  if (value == null) return null;
  const tone = value >= 0.9 ? "bg-danger" : value >= 0.75 ? "bg-warning" : "bg-primary";
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-label="Share of the account spending limit used"
      className={cn("block h-1.5 overflow-hidden rounded-full bg-accent", className)}
    >
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(2, value * 100)}%` }} />
    </span>
  );
}

function LimitSummary({ l }: { l: Limits }) {
  const f = fraction(l);
  return (
    <div className="grid gap-1.5">
      <p className="text-sm text-fg tabular-nums">
        {formatMoney(l.amount_spent, l.currency)}
        <span className="text-fg-muted"> spent</span>
        {l.spend_cap != null ? (
          <span className="text-fg-muted">
            {" "}
            of {formatMoney(l.spend_cap, l.currency)} limit
            {f != null && <> · {Math.round(f * 100)}%</>}
          </span>
        ) : (
          <span className="text-fg-muted"> · no account limit</span>
        )}
      </p>
      <Meter value={f} />
      {l.spend_cap != null && (
        <p className="text-xs text-fg-subtle tabular-nums">
          {formatMoney(Math.max(0, l.spend_cap - l.amount_spent), l.currency)} left before Meta stops all ads in this account.
        </p>
      )}
    </div>
  );
}

function LimitEditor({ account, l, onDone }: { account: AdAccount; l: Limits; onDone?: () => void }) {
  const m = useManage();
  const upd = useUpdateAccountLimits(m.orgId);
  const [value, setValue] = useState(l.spend_cap != null ? String(l.spend_cap) : "");
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n > 0;
  const blocked = !m.canManage ? "Only admins and owners can change account limits." : null;

  async function apply(next: number | null) {
    const cur = l.currency;
    const raising = next == null ? l.spend_cap != null : l.spend_cap != null && next > l.spend_cap;
    if (next != null && next <= l.amount_spent) {
      toast.error("That limit is already used up", {
        description: `This account has spent ${formatMoney(l.amount_spent, cur)}. A lower limit would stop all ads right away.`,
      });
      return;
    }
    if (raising || (next != null && l.spend_cap == null)) {
      const ok = await m.confirm({
        title: next == null ? "Remove the account spending limit?" : "Raise the account spending limit?",
        description:
          next == null
            ? `Ads in “${account.name}” will no longer stop at ${formatMoney(l.spend_cap, cur)} (${cur}). Only campaign budgets will limit spending.`
            : l.spend_cap == null
              ? `Ads in “${account.name}” will stop once ${formatMoney(next, cur)} (${cur}) has been spent in total.`
              : `The limit for “${account.name}” goes up from ${formatMoney(l.spend_cap, cur)} to ${formatMoney(next, cur)} (${cur}), allowing ${formatMoney(next - l.spend_cap, cur)} more spend.`,
        confirmLabel: next == null ? "Remove limit" : l.spend_cap == null ? "Set limit" : "Raise limit",
        destructive: false,
      });
      if (!ok) return;
    }
    try {
      await upd.mutateAsync({ accountId: account.id, spend_cap: next });
      toast.success(next == null ? "Account limit removed" : "Account limit saved", { description: account.name });
      onDone?.();
    } catch (e) {
      errorToast("Couldn't change the account limit", e);
    }
  }

  if (blocked) return <p className="text-xs text-fg-muted">{blocked}</p>;
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void apply(n);
      }}
    >
      <Label htmlFor={`limit-${account.id}`} className="text-xs">
        Account spending limit ({l.currency})
      </Label>
      <div className="flex gap-2">
        <Input
          id={`limit-${account.id}`}
          type="number"
          inputMode="decimal"
          min={1}
          step="any"
          placeholder="No limit"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 tabular-nums"
        />
        <Button type="submit" size="sm" disabled={!valid || n === l.spend_cap || upd.isPending}>
          {upd.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Save
        </Button>
      </div>
      {l.spend_cap != null && (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start px-0 text-xs" disabled={upd.isPending} onClick={() => void apply(null)}>
          Remove limit
        </Button>
      )}
    </form>
  );
}

function AccountLimitBlock({ account }: { account: AdAccount }) {
  const m = useManage();
  const q = useAccountLimits(m.orgId, account.id);
  if (q.isPending)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-1.5 w-full" />
      </div>
    );
  if (q.isError)
    return (
      <div className="flex items-start justify-between gap-2 text-xs">
        <p className="text-danger-fg">{q.error.message}</p>
        <Button variant="ghost" size="icon-xs" aria-label="Retry" onClick={() => q.refetch()}>
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>
    );
  return (
    <div className="grid gap-3">
      <LimitSummary l={q.data} />
      <LimitEditor key={String(q.data.spend_cap)} account={account} l={q.data} />
    </div>
  );
}

/** Compact trigger for the top bar; the popover lists the account(s) in scope. */
export function AccountLimitsControl({ accounts, selected }: { accounts: AdAccount[]; selected: AdAccount | undefined }) {
  const m = useManage();
  const scope = selected ? [selected] : accounts;
  const meta = scope.filter((a) => a.provider === "meta");
  const single = selected?.provider === "meta" ? selected : undefined;
  const q = useAccountLimits(m.orgId, single?.id);
  if (accounts.length === 0) return null;

  const f = q.data ? fraction(q.data) : null;
  const label = single
    ? q.data
      ? q.data.spend_cap != null
        ? `${formatMoney(q.data.amount_spent, q.data.currency)} of ${formatMoney(q.data.spend_cap, q.data.currency)}`
        : "No account limit"
      : q.isError
        ? "Limit unavailable"
        : "Account limit"
    : "Account limits";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 bg-surface" aria-label="Account spending limits">
          <Gauge aria-hidden="true" />
          <span className="grid gap-0.5 text-left">
            <span className="text-xs leading-none tabular-nums">{label}</span>
            {single && f != null && <Meter value={f} className="h-1 w-28" />}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-96 overflow-y-auto p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-fg">Account spending limits</p>
          <p className="text-xs text-fg-muted">When an account reaches its limit, Meta stops every ad in it.</p>
        </div>
        {selected?.provider === "google" ? (
          <p className="px-4 py-3 text-sm text-fg-muted">Account spending limits aren&apos;t available for Google Ads accounts.</p>
        ) : meta.length === 0 ? (
          <p className="px-4 py-3 text-sm text-fg-muted">No Meta ad accounts connected.</p>
        ) : (
          <ul className="divide-y divide-border">
            {meta.map((a) => (
              <li key={a.id} className="grid gap-2 px-4 py-3">
                <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-fg">
                  <ProviderMark provider={a.provider} className="size-4 text-[0.5625rem]" />
                  <span className="truncate">{a.name}</span>
                </p>
                <AccountLimitBlock account={a} />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
