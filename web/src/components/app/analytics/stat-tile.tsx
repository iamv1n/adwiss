import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDelta } from "./format";

/** Whether a rise in this metric is good (revenue), bad (CPA) or neither (spend). */
export type Polarity = "up-good" | "down-good" | "neutral";

export function DeltaBadge({
  delta,
  polarity,
  suffix,
  className,
}: {
  delta: number | null | undefined;
  polarity: Polarity;
  suffix?: string;
  className?: string;
}) {
  if (delta == null) return null;
  const flat = Math.abs(delta) < 0.0005;
  const up = delta > 0;
  const good = polarity === "neutral" || flat ? null : (polarity === "up-good") === up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        good === true && "text-success-fg",
        good === false && "text-danger-fg",
        good === null && "text-fg-muted",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {formatDelta(delta)}
      {suffix && <span className="font-normal text-fg-subtle">&nbsp;{suffix}</span>}
      {good !== null && <span className="sr-only">{good ? "(better)" : "(worse)"}</span>}
    </span>
  );
}

export function StatTile({
  label,
  value,
  delta,
  polarity = "neutral",
  deltaSuffix,
  hint,
  dimmed,
}: {
  label: string;
  value: string;
  delta?: number | null;
  polarity?: Polarity;
  deltaSuffix?: string;
  hint?: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-4 shadow-xs transition-opacity",
        dimmed && "opacity-60",
      )}
    >
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 truncate font-display text-2xl font-semibold text-fg">{value}</p>
      <div className="mt-1 flex min-h-4 flex-wrap items-center gap-x-1 text-xs text-fg-subtle">
        {delta != null ? <DeltaBadge delta={delta} polarity={polarity} suffix={deltaSuffix} /> : hint}
      </div>
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-3 h-7 w-24" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}
