import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/app/auth-shell";
import { LoginForm } from "@/components/app/auth/login-form";
import { DataAtWorkIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell
      illustration={<DataAtWorkIllustration className="h-auto w-full" />}
      asideTitle="Every campaign, every hour, one view."
      asideBody="See what's working, when it's working, and act on it safely."
      asidePoints={[
        "Hour × weekday heatmaps for ROAS, CPA and spend",
        "Dayparting schedules with dry-run previews",
        "A full audit trail of every automated action",
      ]}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
