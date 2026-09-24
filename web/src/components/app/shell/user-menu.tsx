"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Palette, Settings, Sun, Users } from "lucide-react";
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
import { useLogout, useMe } from "@/lib/queries";
import { initials } from "@/lib/utils";

export function UserMenu() {
  const { data } = useMe();
  const router = useRouter();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const user = data?.user;
  if (!user) return null;

  function onLogout() {
    logout.mutate(undefined, {
      onSuccess: () => router.replace("/login"),
      onError: () => {
        toast.error("Couldn't log out cleanly. You've been signed out on this device.");
        router.replace("/login");
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={`Account menu for ${user.name}`}
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-accent text-xs font-medium text-accent-fg">
            {initials(user.name || user.email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
          <span className="block truncate text-xs text-fg-muted">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/app/settings">
              <Settings aria-hidden="true" /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/app/settings/members">
              <Users aria-hidden="true" /> Members
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
              <Palette aria-hidden="true" /> Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-36">
              <DropdownMenuRadioGroup value={mounted ? (theme ?? "system") : undefined} onValueChange={setTheme}>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} disabled={logout.isPending}>
          <LogOut aria-hidden="true" /> {logout.isPending ? "Logging out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
