import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell/app-shell";

export const metadata: Metadata = {
  title: { default: "App", template: "%s · Adwise" },
  robots: { index: false },
};

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <AppShell>{children}</AppShell>;
}
