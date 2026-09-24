"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_SECTIONS, isActive } from "@/components/app/shell/nav";
import { cn } from "@/lib/utils";

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          {!collapsed ? (
            <p className="mb-1.5 px-2.5 text-[0.6875rem] font-medium tracking-wider text-fg-subtle uppercase">
              {section.label}
            </p>
          ) : (
            <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
          )}
          <ul className="grid gap-0.5">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              const link = (
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active
                      ? "bg-accent text-accent-fg"
                      : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", active ? "text-primary" : "text-fg-subtle group-hover:text-fg")}
                    aria-hidden="true"
                  />
                  {!collapsed && label}
                </Link>
              );
              return (
                <li key={href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
