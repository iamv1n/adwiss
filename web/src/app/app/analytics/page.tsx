import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { PageHeader } from "@/components/app/page-header";
import { DataAnalysisIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Analytics"
        description="Compare periods and break performance down by hour, device, geography and placement."
      />
      <EmptyState
        illustration={<DataAnalysisIllustration className="h-auto w-full" />}
        title="Connect Meta or Google to see data"
        description="Adwise normalizes spend, conversions and revenue across providers. ROAS, CPA, CTR and CPC are then calculated the same way everywhere."
        actions={<ConnectCta />}
      />
    </div>
  );
}
