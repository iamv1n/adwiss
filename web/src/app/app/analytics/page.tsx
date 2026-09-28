import type { Metadata } from "next";
import { AnalyticsView } from "@/components/app/analytics/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return <AnalyticsView />;
}
