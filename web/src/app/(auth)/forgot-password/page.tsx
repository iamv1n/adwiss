import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/app/auth-shell";
import { ForgotPasswordForm } from "@/components/app/auth/password-reset-forms";
import { AccessAccountIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      illustration={<AccessAccountIllustration className="h-auto w-full" />}
      asideTitle="Back in, in a minute."
      asideBody="Reset links expire after an hour and work once. Resetting signs you out everywhere else."
    >
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
