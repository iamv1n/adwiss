"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  Gauge,
  Lock,
  Megaphone,
  Menu,
  Palette,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/app/logo";
import { UserMenu } from "@/components/app/shell/user-menu";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/syncs", label: "Syncs & queues", icon: RefreshCcw },
  { href: "/admin/activity", label: "Activity", icon: Activity },
  { href: "/admin/system", label: "System", icon: ServerCog },
  { href: "/admin/changelog", label: "Changelog", icon: Megaphone },
  { href: "/admin/brand", label: "Brand kit", icon: Palette },
  { href: "/admin/security", label: "Account security", icon: Lock },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-fg-subtle group-hover:text-fg")} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <span className="inline-flex items-center gap-2">
      <Logo />
      <span className="rounded-md bg-fg px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-bg uppercase">Admin</span>
    </span>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (me.data === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [me.data, pathname, router]);

  if (me.isError) {
    return (
      <main className="grid min-h-dvh flex-1 place-items-center p-6 text-center">
        <div>
          <p className="text-fg-muted">{me.error.message}</p>
          <Button className="mt-4" onClick={() => me.refetch()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }
  if (!me.data) {
    return (
      <div className="flex-1 p-8" aria-busy="true" aria-label="Loading admin console">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    );
  }

  // The API returns 404 for non-admins too; this just avoids a page of errors.
  if (!me.data.user.is_platform_admin || me.data.impersonator) {
    return (
      <main className="grid min-h-dvh flex-1 place-items-center p-6">
        <div className="max-w-sm text-center">
          <ShieldCheck className="mx-auto size-8 text-fg-subtle" aria-hidden="true" />
          <h1 className="mt-4 font-display text-xl font-semibold text-fg">Admin access only</h1>
          <p className="mt-2 text-fg-muted">
            {me.data.impersonator
              ? "You're logged in as another user. Return to your own account to use the admin console."
              : "This area is for Adwise platform admins."}
          </p>
          <Button asChild className="mt-6">
            <Link href="/app/dashboard">Go to the app</Link>
          </Button>
        </div>
      </main>
    );
  }

  const hasOrgs = me.data.organizations.length > 0;

  return (
    <div className="flex min-h-dvh flex-1">
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-bg-subtle md:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/admin" aria-label="Admin overview" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <Brand />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <AdminNav />
        </div>
        {hasOrgs && (
          <div className="border-t border-border p-2">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start text-fg-muted">
              <Link href="/app/dashboard">
                <ArrowLeft aria-hidden="true" /> Back to the app
              </Link>
            </Button>
          </div>
        )}
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
                <Brand />
              </div>
              <div className="px-2 py-3">
                <AdminNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <p className="min-w-0 truncate text-sm font-medium text-fg">
            {NAV.find((n) => isActive(pathname, n.href, n.exact))?.label ?? "Admin"}
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
