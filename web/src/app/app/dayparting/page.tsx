import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { ConnectCta } from "@/components/app/connect-cta";
import { HeatmapFrame } from "@/components/app/heatmap-frame";
import { PageHeader } from "@/components/app/page-header";
import { RightTimeIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Dayparting" };

export default function DaypartingPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Dayparting"
        description="Find your most profitable hours, then schedule budgets and pauses around them, in each account's time zone."
      />
      <EmptyState
        illustration={<RightTimeIllustration className="h-auto w-full" />}
        title="Connect Meta or Google to see data"
        description="Dayparting needs hourly performance data. Once it's imported, you'll see when campaigns earn and when they burn budget, and you can build schedules with a dry-run preview."
        actions={<ConnectCta />}
      />
      <HeatmapFrame />
    </div>
  );
}
