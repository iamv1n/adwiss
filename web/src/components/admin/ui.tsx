"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill, type PillTone } from "@/components/app/integrations/status-pill";
import { PROVIDERS } from "@/components/app/integrations/providers";
import type { IntegrationStatus, Provider } from "@/lib/api";
import { cn, formatDate, timeAgo } from "@/lib/utils";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border bg-surface shadow-xs", className)}>
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
          {description && <p className="text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "warning" | "danger";
  href?: string;
}) {
  const body = (
    <>
      <p className="text-sm text-fg-muted">{label}</p>
      <p
        className={cn(
          "mt-2 font-display text-2xl font-semibold tabular-nums text-fg",
          tone === "warning" && "text-warning-fg",
          tone === "danger" && "text-danger-fg",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </>
  );
  const cls = "rounded-xl border border-border bg-surface p-4 shadow-xs";
  return href ? (
    <Link
      href={href}
      className={cn(cls, "transition-colors outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/50")}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
      <p className="text-danger-fg">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw aria-hidden="true" /> Retry
      </Button>
    </div>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-fg-muted">{children}</p>;
}

/** Search box that reports its value after the user pauses typing. */
export function SearchInput({
  placeholder,
  onChange,
  label,
}: {
  placeholder: string;
  label: string;
  onChange: (q: string) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const t = setTimeout(() => onChange(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value, onChange]);
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-8 pl-8"
      />
    </div>
  );
}

export function Pager({
  offset,
  pageSize,
  total,
  onChange,
}: {
  offset: number;
  pageSize: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-fg-muted">
      <span className="tabular-nums">
        {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - pageSize))}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={offset + pageSize >= total} onClick={() => onChange(offset + pageSize)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** Relative time with the exact timestamp on hover. */
export function When({ at, empty = "Never" }: { at: string | null | undefined; empty?: string }) {
  if (!at) return <span className="text-fg-subtle">{empty}</span>;
  return (
    <time dateTime={at} title={formatDate(at, { dateStyle: "medium", timeStyle: "medium" })} className="whitespace-nowrap">
      {timeAgo(at)}
    </time>
  );
}

export function ProviderName({ provider }: { provider: Provider }) {
  const p = PROVIDERS[provider];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className={cn("grid size-5 place-items-center rounded text-[0.625rem] font-semibold", p.tone)}>
        {p.monogram}
      </span>
      {p.name}
    </span>
  );
}

export function IntegrationPill({ status, lastError }: { status: IntegrationStatus; lastError?: string | null }) {
  if (status === "needs_reauth") return <StatusPill tone="warning">Needs reconnect</StatusPill>;
  if (status === "disconnected") return <StatusPill tone="muted">Disconnected</StatusPill>;
  if (lastError) return <StatusPill tone="danger">Error</StatusPill>;
  return <StatusPill tone="success">Active</StatusPill>;
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

/** Sync freshness: hourly syncs mean anything older than ~2h is behind. */
export function FreshnessPill({ at, enabled = true }: { at: string | null; enabled?: boolean }) {
  if (!enabled) return <StatusPill tone="muted">Off</StatusPill>;
  if (!at) return <StatusPill tone="warning">Never synced</StatusPill>;
  const hours = hoursSince(at);
  const tone: PillTone = hours < 2 ? "success" : hours < 24 ? "warning" : "danger";
  return (
    <StatusPill tone={tone}>
      <When at={at} />
    </StatusPill>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs break-all text-fg-muted", className)}>{children}</span>;
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-bg-subtle p-3 font-mono text-xs leading-relaxed text-fg-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat(undefined, { notation: n >= 100_000 ? "compact" : "standard" }).format(n);
}

export function formatBytes(n: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
