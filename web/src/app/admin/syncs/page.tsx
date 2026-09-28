import type { Metadata } from "next";
import { SyncsView } from "@/components/admin/syncs-view";

export const metadata: Metadata = { title: "Syncs & queues" };

export default function Page() {
  return <SyncsView />;
}
