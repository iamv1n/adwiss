import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Manage your organization, team and appearance." />
      <SettingsNav />
      <div className="pt-2">{children}</div>
    </div>
  );
}
