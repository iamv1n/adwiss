import { PROVIDERS } from "@/components/app/integrations/providers";
import { formatMoney } from "@/components/app/campaigns/format";
import type { Provider } from "@/lib/api";
import type { Campaign } from "@/lib/entities-api";
import { cn } from "@/lib/utils";

export function ProviderMark({ provider, className }: { provider: Provider; className?: string }) {
  const p = PROVIDERS[provider];
  return (
    <span
      title={p.name}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md text-[0.625rem] font-semibold",
        p.tone,
        className,
      )}
    >
      <span aria-hidden="true">{p.monogram}</span>
      <span className="sr-only">{p.name}</span>
    </span>
  );
}

export function Budget({ c }: { c: Pick<Campaign, "daily_budget" | "lifetime_budget" | "currency"> }) {
  if (c.daily_budget != null)
    return (
      <>
        {formatMoney(c.daily_budget, c.currency)}
        <span className="text-fg-muted">/day</span>
      </>
    );
  if (c.lifetime_budget != null)
    return (
      <>
        {formatMoney(c.lifetime_budget, c.currency)} <span className="text-fg-muted">total</span>
      </>
    );
  return <span className="text-fg-muted">—</span>;
}
