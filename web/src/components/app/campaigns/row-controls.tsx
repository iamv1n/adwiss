"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  BarChart3,
  CalendarClock,
  Loader2,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type AnyRow, type EditFocus, type Target, useManage } from "@/components/app/campaigns/manage-context";
import { DELIVERY_LABEL, STATUS_DOT, formatMoney } from "@/components/app/campaigns/format";
import type { Level } from "@/lib/manage-api";
import { cn } from "@/lib/utils";

export function toTarget(level: Level, row: AnyRow): Target {
  return { level, row } as Target;
}

/** Wraps a (possibly disabled) control in a tooltip explaining why it's disabled. */
export function WhyDisabled({
  reason,
  children,
  className,
}: {
  reason: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", className)} tabIndex={0}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{reason}</TooltipContent>
    </Tooltip>
  );
}

/** On/off switch. Turning on asks for confirmation (see ManageProvider). */
export function StatusSwitch({ level, row, size = "sm" }: { level: Level; row: AnyRow; size?: "sm" | "default" }) {
  const m = useManage();
  const busy = m.isBusy(row.id);
  const terminal = row.status === "archived" || row.status === "deleted";
  const reason = terminal
    ? `${m.levelLabel(row.provider, level)} is ${row.status} and can't be turned on again.`
    : m.blocked(row.provider, level, "status");
  const on = row.status === "active";
  return (
    <WhyDisabled reason={reason}>
      <span className="relative inline-flex items-center">
        <Switch
          size={size}
          checked={on}
          disabled={!!reason || busy}
          aria-label={`${on ? "Turn off" : "Turn on"} ${row.name}`}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(v) => void m.setStatus(level, row, v ? "active" : "paused")}
        />
        {busy && <Loader2 aria-hidden="true" className="absolute -right-4 size-3 animate-spin text-fg-muted" />}
      </span>
    </WhyDisabled>
  );
}

export function DeliveryCell({ row }: { row: AnyRow }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[row.status] ?? "bg-border-strong")} />
      <span className={row.status === "active" ? "text-fg" : "text-fg-muted"}>{DELIVERY_LABEL[row.status] ?? row.status}</span>
    </span>
  );
}

type Budgeted = AnyRow & { daily_budget?: number | null; lifetime_budget?: number | null };

/** Budget text; admins can click it to edit in a popover. */
export function BudgetCell({ level, row }: { level: Level; row: AnyRow }) {
  const m = useManage();
  const b = row as Budgeted;
  const kind: "daily" | "lifetime" | null = b.daily_budget != null ? "daily" : b.lifetime_budget != null ? "lifetime" : null;
  const current = kind === "daily" ? b.daily_budget! : kind === "lifetime" ? b.lifetime_budget! : null;

  if (level === "ad") return <span className="text-fg-subtle">—</span>;
  if (kind == null) {
    return (
      <span className="text-xs whitespace-nowrap text-fg-subtle">
        {level === "campaign" ? `Using ${m.levelLabel(row.provider, "ad_group").toLowerCase()} budgets` : "Campaign budget"}
      </span>
    );
  }
  const text = (
    <span className="whitespace-nowrap tabular-nums">
      {formatMoney(current, row.currency)}
      <span className="text-xs text-fg-muted">{kind === "daily" ? " /day" : " total"}</span>
    </span>
  );
  const reason =
    m.blocked(row.provider, level, "budget") ??
    (row.provider === "google" && kind === "lifetime" ? "Google budgets can only be changed as daily budgets." : null);
  if (reason || row.status === "archived" || row.status === "deleted") return text;
  return <BudgetPopover level={level} row={row} kind={kind} current={current!}>{text}</BudgetPopover>;
}

export function BudgetPopover({
  level,
  row,
  kind,
  current,
  children,
}: {
  level: Level;
  row: AnyRow;
  kind: "daily" | "lifetime";
  current: number;
  children: React.ReactNode;
}) {
  const m = useManage();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(current));
  const [saving, setSaving] = useState(false);
  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount > 0;
  const changed = valid && amount !== current;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    setSaving(true);
    const ok = await m.update(
      level,
      row,
      kind === "daily" ? { daily_budget: amount } : { lifetime_budget: amount },
      "Budget updated",
    );
    setSaving(false);
    if (ok) setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(String(current));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded-sm border-b border-dashed border-border-strong text-right hover:border-fg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Edit budget for ${row.name}`}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={save} className="grid gap-2">
          <Label htmlFor={`budget-${row.id}`} className="text-xs">
            {kind === "daily" ? "Daily budget" : "Lifetime budget"} ({row.currency})
          </Label>
          <Input
            id={`budget-${row.id}`}
            type="number"
            inputMode="decimal"
            min={1}
            step="any"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            className="h-8 tabular-nums"
          />
          <p className="text-xs text-fg-muted">
            Now {formatMoney(current, row.currency)}
            {changed && amount > current && " · raising it asks you to confirm"}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!changed || saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** "⋯" menu with every row action. Disabled entries say why. */
export function RowMenu({
  level,
  row,
  chartsHref,
  className,
}: {
  level: Level;
  row: AnyRow;
  chartsHref?: string;
  className?: string;
}) {
  const m = useManage();
  const word = m.levelLabel(row.provider, level);
  const terminal = row.status === "archived" || row.status === "deleted";
  const st = m.blocked(row.provider, level, "status");
  const budget = m.blocked(row.provider, level, "budget");
  const name = m.blocked(row.provider, level, "name");
  const sched = m.blocked(row.provider, level, "schedule");
  const arch = m.blocked(row.provider, level, "archive");
  const hint = !m.canManage ? m.blocked(row.provider, level, "status") : row.provider === "google" ? m.blocked(row.provider, level, "name") : null;
  const edit = (focus?: EditFocus) => m.openEdit({ ...toTarget(level, row), focus });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${row.name}`}
          className={cn("text-fg-muted", className)}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="truncate text-xs font-normal text-fg-muted">{row.name}</DropdownMenuLabel>
        {row.status === "active" ? (
          <DropdownMenuItem disabled={!!st} onSelect={() => void m.setStatus(level, row, "paused")}>
            <PowerOff aria-hidden="true" /> Turn off
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={!!st || terminal} onSelect={() => void m.setStatus(level, row, "active")}>
            <Power aria-hidden="true" /> Turn on…
          </DropdownMenuItem>
        )}
        {level !== "ad" && (
          <DropdownMenuItem disabled={!!budget || terminal} onSelect={() => edit("budget")}>
            <Wallet aria-hidden="true" /> Edit budget
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!!name || terminal} onSelect={() => edit("name")}>
          <Pencil aria-hidden="true" /> Rename
        </DropdownMenuItem>
        {level !== "ad" && (
          <DropdownMenuItem disabled={!!sched || terminal} onSelect={() => edit("schedule")}>
            <CalendarClock aria-hidden="true" /> {level === "campaign" ? "End date & spend cap" : "End date & bid"}
          </DropdownMenuItem>
        )}
        {chartsHref && (
          <DropdownMenuItem asChild>
            <Link href={chartsHref}>
              <BarChart3 aria-hidden="true" /> View charts
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!!arch || terminal}
          onSelect={() => void m.archive(level, row)}
        >
          <Archive aria-hidden="true" /> Archive {word.toLowerCase()}
        </DropdownMenuItem>
        {hint && <p className="px-2 pt-1 pb-1.5 text-xs text-fg-muted">{hint}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
