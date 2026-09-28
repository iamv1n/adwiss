import type { Metadata } from "next";
import { ActivityView } from "@/components/admin/activity-view";

export const metadata: Metadata = { title: "Activity" };

export default function Page() {
  return <ActivityView />;
}
