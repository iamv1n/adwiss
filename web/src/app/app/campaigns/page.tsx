import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { PageHeader } from "@/components/app/page-header";
import { ChartsIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Campaigns" };

export default function CampaignsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Campaigns"
        description="Every Meta and Google campaign in one table, with ad sets, ad groups, ads and creatives underneath."
      />
      <EmptyState
        illustration={<ChartsIllustration className="h-auto w-full" />}
        title="No campaigns yet"
        description="Connect Meta or Google to see data. Campaigns sync automatically after you pick which ad accounts to import."
        actions={<ConnectCta />}
      />
    </div>
  );
}
