import type { Metadata } from "next";
import { PlansView } from "@/components/app/budget/plans-view";

export const metadata: Metadata = { title: "Budget planner" };

export default function BudgetPage() {
  return <PlansView />;
}
