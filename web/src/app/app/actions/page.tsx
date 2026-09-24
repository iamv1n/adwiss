import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { PageHeader } from "@/components/app/page-header";
import { StatusPageIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Actions" };

export default function ActionsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Actions"
        description="The audit trail: every pause, activation and budget change, whether it came from a person, a rule or a schedule."
      />
      <EmptyState
        illustration={<StatusPageIllustration className="h-auto w-full" />}
        title="Nothing has been changed yet"
        description="Connect Meta or Google to see data. Each action records who or what triggered it, the before and after state, and the provider's response."
        actions={<ConnectCta />}
      />
    </div>
  );
}
