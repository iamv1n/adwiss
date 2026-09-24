import type { Metadata } from "next";
import { AuthShell } from "@/components/app/auth-shell";
import { AcceptInvite } from "@/components/app/auth/accept-invite";
import { AccessAccountIllustration } from "@/components/app/illustrations";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  return (
    <AuthShell
      illustration={<AccessAccountIllustration className="h-auto w-full" />}
      asideTitle="Your team is waiting."
      asideBody="Shared dashboards, dayparting schedules and automations, with every change attributed to a person or rule."
    >
      <AcceptInvite token={token} />
    </AuthShell>
  );
}
