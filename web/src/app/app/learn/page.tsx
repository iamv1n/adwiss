import type { Metadata } from "next";
import { LearnHome } from "@/components/app/learn/learn-home";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <LearnHome />;
}
