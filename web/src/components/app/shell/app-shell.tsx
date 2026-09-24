"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/app/logo";
import { ALL_NAV_ITEMS, isActive } from "@/components/app/shell/nav";
import { OrgSwitcher } from "@/components/app/shell/org-switcher";
import { SidebarNav } from "@/components/app/shell/sidebar-nav";
import { UserMenu } from "@/components/app/shell/user-menu";
import { useMe } from "@/lib/queries";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-1" aria-busy="true" aria-label="Loading your workspace">
      <div className="hidden w-60 shrink-0 flex-col gap-3 border-r border-border bg-bg-subtle p-3 md:flex">
        <Skeleton className="h-11 w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-5 w-80 max-w-full" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    </div>
  );
}

function ShellError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="grid min-h-dvh flex-1 place-items-center p-6">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto size-8 text-warning-fg" aria-hidden="true" />
        <h1 className="mt-4 font-display text-xl font-semibold text-fg">We couldn&apos;t load your workspace</h1>
        <p className="mt-2 text-fg-muted">{message}</p>
        <Button className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </main>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);

  const orgCount = me.data?.organizations.length ?? 0;

  useEffect(() => {
    if (me.data === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me.data && orgCount === 0) router.replace("/onboarding");
  }, [me.data, orgCount, pathname, router]);

  if (me.isError) return <ShellError message={me.error.message} onRetry={() => me.refetch()} />;
  if (!me.data || orgCount === 0) return <ShellSkeleton />;

  const current = ALL_NAV_ITEMS.find((i) => isActive(pathname, i.href));

  return (
    <div className="flex min-h-dvh flex-1">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-bg-subtle transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-border", collapsed ? "justify-center" : "px-4")}>
          <Link
            href="/app/dashboard"
            aria-label="Adwise dashboard"
            className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Logo collapsed={collapsed} />
          </Link>
        </div>
        <div className="p-2">
          <OrgSwitcher collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <SidebarNav collapsed={collapsed} />
        </div>
        <div className={cn("border-t border-border p-2", collapsed && "flex justify-center")}>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={toggleSidebar}
            className={cn("text-fg-muted", !collapsed && "w-full justify-start")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-bg/70 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 md:hidden" aria-label="Open navigation">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 bg-bg-subtle p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-14 items-center border-b border-border px-4">
                <Logo />
              </div>
              <div className="p-2">
                <OrgSwitcher />
              </div>
              <div className="overflow-y-auto px-2 py-3">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <p className="min-w-0 truncate text-sm font-medium text-fg">{current?.label ?? "Adwise"}</p>
          <div className="ml-auto flex items-center gap-1.5">
            <UserMenu />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
