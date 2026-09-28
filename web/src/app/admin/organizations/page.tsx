import type { Metadata } from "next";
import { OrgsView } from "@/components/admin/orgs-view";

export const metadata: Metadata = { title: "Organizations" };

export default function Page() {
  return <OrgsView />;
}
