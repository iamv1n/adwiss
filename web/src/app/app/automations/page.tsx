import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { PageHeader } from "@/components/app/page-header";
import { ProjectFlowIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Automations"
        description="Rules follow Trigger → Conditions → Validation → Action, and every run is previewed and logged."
      />
      <EmptyState
        illustration={<ProjectFlowIllustration className="h-auto w-full" />}
        title="No automation rules yet"
        description="Connect Meta or Google to see data. Then create a rule such as “If ROAS < 1.0 and spend > ₹5,000, reduce budget by 20%”."
        actions={<ConnectCta />}
      />
    </div>
  );
}
