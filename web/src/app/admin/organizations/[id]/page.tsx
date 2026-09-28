import type { Metadata } from "next";
import { OrgDetailView } from "@/components/admin/org-detail-view";

export const metadata: Metadata = { title: "Organization" };

export default async function Page({ params }: PageProps<"/admin/organizations/[id]">) {
  const { id } = await params;
  return <OrgDetailView id={id} />;
}
