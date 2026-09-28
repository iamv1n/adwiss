import type { Metadata } from "next";
import { PlanDetail } from "@/components/app/budget/plan-detail";

export const metadata: Metadata = { title: "Budget plan" };

export default function BudgetPlanPage() {
  return <PlanDetail />;
}
