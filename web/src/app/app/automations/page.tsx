import type { Metadata } from "next";
import { AutomationsView } from "@/components/app/automations/automations-view";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage() {
  return <AutomationsView />;
}
