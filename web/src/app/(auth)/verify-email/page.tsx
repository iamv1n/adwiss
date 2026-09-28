import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/app/auth-shell";
import { VerifyEmailForm } from "@/components/app/auth/verify-email-form";
import { AnalyticsSetupIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Verify your email", robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <AuthShell
      illustration={<AnalyticsSetupIllustration className="h-auto w-full" />}
      asideTitle="One quick check."
      asideBody="Confirming your email keeps your workspace secure and makes sure alerts and reports reach you."
    >
      <Suspense>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
