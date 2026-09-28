"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Lock,
  LogOut,
  Megaphone,
  Monitor,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMounted } from "@/components/theme-toggle";
import { WhatsNewSheet } from "@/components/app/changelog/whats-new-sheet";
import { useChangelogUnread, useMarkChangelogSeen } from "@/lib/changelog-api";
import { useLogout, useMe } from "@/lib/queries";
import { initials } from "@/lib/utils";

export function UserMenu() {
  const { data } = useMe();
  const router = useRouter();
  const inAdmin = usePathname().startsWith("/admin");
  const logout = useLogout();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const unread = useChangelogUnread().data?.count ?? 0;
  const markSeen = useMarkChangelogSeen();
  const user = data?.user;
  if (!user) return null;

  function openWhatsNew() {
    setWhatsNewOpen(true);
    if (unread > 0) markSeen.mutate();
  }

  function onLogout() {
    logout.mutate(undefined, {
      onSuccess: () => router.replace("/login"),
      onError: () => {
        toast.error(
          "Couldn't log out cleanly. You've been signed out on this device.",
        );
        router.replace("/login");
      },
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="relative rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={`Account menu for ${user.name}${unread > 0 ? ` (${unread} new updates)` : ""}`}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-xs font-medium text-accent-fg">
              {initials(user.name || user.email)}
            </AvatarFallback>
          </Avatar>
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-bg"
            />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-fg">
              {user.name}
            </span>
            <span className="block truncate text-xs text-fg-muted">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.is_platform_admin && !data?.impersonator && (
            <>
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <ShieldCheck aria-hidden="true" /> Admin console
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuGroup>
            {inAdmin ? (
              // Workspace settings don't apply in the admin console; account security does.
              <DropdownMenuItem asChild>
                <Link href="/admin/security">
                  <Lock aria-hidden="true" /> Account security
                </Link>
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/app/settings">
                    <Settings aria-hidden="true" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/app/settings/security">
                    <Lock aria-hidden="true" /> Security
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/app/settings/members">
                    <Users aria-hidden="true" /> Members
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
                <Palette aria-hidden="true" /> Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-36">
                <DropdownMenuRadioGroup
                  value={mounted ? (theme ?? "system") : undefined}
                  onValueChange={setTheme}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun aria-hidden="true" /> Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon aria-hidden="true" /> Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor aria-hidden="true" /> System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuItem onSelect={openWhatsNew}>
            <Megaphone aria-hidden="true" /> What&apos;s new
            {unread > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-primary-fg">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onLogout} disabled={logout.isPending}>
            <LogOut aria-hidden="true" />{" "}
            {logout.isPending ? "Logging out…" : "Log out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WhatsNewSheet open={whatsNewOpen} onOpenChange={setWhatsNewOpen} />
    </>
  );
}
