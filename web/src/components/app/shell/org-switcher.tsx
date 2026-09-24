"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveOrg, useMe } from "@/lib/queries";
import { useActiveOrgStore } from "@/lib/stores/org";
import { cn } from "@/lib/utils";

function OrgAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-display text-sm font-semibold text-primary-fg",
        className,
      )}
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function OrgSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { data } = useMe();
  const active = useActiveOrg();
  const setActive = useActiveOrgStore((s) => s.setActiveOrgId);
  const orgs = data?.organizations ?? [];
  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent",
          collapsed && "justify-center",
        )}
        aria-label={`Organization: ${active.name}. Switch organization`}
      >
        <OrgAvatar name={active.name} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{active.name}</span>
              <span className="block text-xs text-fg-subtle capitalize">{active.role}</span>
            </span>
            <ChevronsUpDown className="size-4 text-fg-subtle" aria-hidden="true" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-fg-subtle">Organizations</DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem key={org.id} onSelect={() => setActive(org.id)} className="gap-2.5">
            <OrgAvatar name={org.name} className="size-6 rounded-md text-xs" />
            <span className="min-w-0 flex-1 truncate">{org.name}</span>
            {org.id === active.id && <Check className="size-4 text-primary" aria-label="Active" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2.5">
          <Link href="/onboarding?new=1">
            <span className="grid size-6 place-items-center rounded-md border border-dashed border-border-strong">
              <Plus className="size-3.5" aria-hidden="true" />
            </span>
            Create organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
