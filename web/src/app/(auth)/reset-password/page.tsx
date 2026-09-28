import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/app/auth-shell";
import { ResetPasswordForm } from "@/components/app/auth/password-reset-forms";
import { AccessAccountIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      illustration={<AccessAccountIllustration className="h-auto w-full" />}
      asideTitle="A fresh start for your account."
      asideBody="Pick something long and unique. A few unrelated words is easier to remember than symbols."
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
