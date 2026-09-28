import type { Metadata } from "next";
import { SecurityView } from "@/components/app/settings/security/security-view";

export const metadata: Metadata = { title: "Account security" };

// Security settings belong to the user, not a workspace, so admins without a
// workspace manage them here instead of under /app/settings.
export default function AdminSecurityPage() {
  return <SecurityView />;
}
