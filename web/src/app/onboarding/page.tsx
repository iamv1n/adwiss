import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/app/auth-shell";
import { OnboardingForm } from "@/components/app/auth/onboarding-form";
import { GettingOrganizedIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Set up your organization" };

export default function OnboardingPage() {
  return (
    <AuthShell
      illustration={<GettingOrganizedIllustration className="h-auto w-full" />}
      asideTitle="Set up once, then let the data work."
      asideBody="Next, you'll invite teammates and connect Meta and Google Ads. Nothing changes in your ad accounts until you approve it."
      asidePoints={["Owner, admin and member roles", "Read-only until you enable automations", "Every action recorded in the audit trail"]}
    >
      <Suspense>
        <OnboardingForm />
      </Suspense>
    </AuthShell>
  );
}
