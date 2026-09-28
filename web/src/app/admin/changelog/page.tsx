import type { Metadata } from "next";
import { ChangelogView } from "@/components/admin/changelog-view";

export const metadata: Metadata = { title: "Changelog" };

export default function Page() {
  return <ChangelogView />;
}
