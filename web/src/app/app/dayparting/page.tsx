import type { Metadata } from "next";
import { Suspense } from "react";
import { DaypartingView } from "@/components/app/dayparting/dayparting-view";

export const metadata: Metadata = { title: "Dayparting" };

export default function DaypartingPage() {
  return (
    <Suspense>
      <DaypartingView />
    </Suspense>
  );
}
