import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/app/auth-shell";
import { SignupForm } from "@/components/app/auth/signup-form";
import { AnalyticsSetupIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <AuthShell
      illustration={<AnalyticsSetupIllustration className="h-auto w-full" />}
      asideTitle="Spend where it earns."
      asideBody="Connect your accounts once. Adwise normalizes the data, spots wasted spend and helps you act on it."
      asidePoints={[
        "Spend, ROAS, CPA and CTR calculated the same way for every campaign",
        "Rule-based automation with approvals",
        "An AI analyst that answers questions from your real data",
      ]}
    >
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
