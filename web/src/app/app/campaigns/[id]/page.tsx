import type { Metadata } from "next";
import { CampaignDetailView } from "@/components/app/campaigns/campaign-detail";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: PageProps<"/app/campaigns/[id]">) {
  const { id } = await params;
  return <CampaignDetailView id={id} />;
}
