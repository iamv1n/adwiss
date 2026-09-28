import {
  BarChart3,
  CalendarClock,
  GraduationCap,
  History,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Plug,
  Settings,
  UserRoundPlus,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/app/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/app/leads", label: "Leads", icon: UserRoundPlus },
      { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Optimize",
    items: [
      { href: "/app/recommendations", label: "Recommendations", icon: Inbox },
      { href: "/app/budget", label: "Budget planner", icon: Wallet },
      { href: "/app/dayparting", label: "Dayparting", icon: CalendarClock },
      { href: "/app/automations", label: "Automations", icon: Workflow },
      { href: "/app/actions", label: "Actions", icon: History },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/app/integrations", label: "Integrations", icon: Plug },
      { href: "/app/learn", label: "Learn", icon: GraduationCap },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
