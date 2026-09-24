import type { Metadata } from "next";
import { Suspense } from "react";
import { IntegrationsView } from "@/components/app/integrations/integrations-view";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsView />
    </Suspense>
  );
}
