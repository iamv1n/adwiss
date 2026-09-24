"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FormError } from "@/components/app/field";
import { isApiError } from "@/lib/api";
import { useAcceptInvitation, useLogout, useMe } from "@/lib/queries";

function describeError(err: unknown): string {
  if (!isApiError(err)) return "Something went wrong. Please try again.";
  switch (err.code) {
    case "invitation_invalid":
      return "This invitation is invalid, has expired, or was already used. Ask an admin for a new link.";
    case "invitation_email_mismatch":
      return "This invitation was sent to a different email address. Sign in with that address to accept it.";
    default:
      return err.message;
  }
}

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const me = useMe();
  const accept = useAcceptInvitation();
  const logout = useLogout();
  const here = `/invite/${encodeURIComponent(token)}`;

  useEffect(() => {
    if (me.data === null) router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [me.data, here, router]);

  useEffect(() => {
    if (accept.error && isApiError(accept.error) && accept.error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [accept.error, here, router]);

  if (me.isPending || !me.data) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="mt-6 h-10 w-full" />
      </div>
    );
  }

  if (accept.isSuccess) {
    const org = accept.data.organization;
    return (
      <div>
        <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-fg">
          You&apos;ve joined {org.name}
        </h1>
        <p className="mt-2 text-fg-muted">
          You&apos;re in as <span className="font-medium text-fg">{org.role}</span>.
        </p>
        <Button size="lg" className="mt-8 h-10 w-full" onClick={() => router.push("/app/dashboard")}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-primary">Team invitation</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
        Join your team on Adwise
      </h1>
      <p className="mt-2 text-fg-muted">
        You&apos;re signed in as <span className="font-medium text-fg">{me.data.user.email}</span>. The
        invitation must have been sent to this address.
      </p>

      <div className="mt-8 grid gap-4">
        {accept.error && (
          <FormError message={describeError(accept.error)} />
        )}
        <Button
          size="lg"
          className="h-10 w-full"
          disabled={accept.isPending}
          onClick={() => accept.mutate(token)}
        >
          {accept.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {accept.isPending ? "Joining…" : "Accept invitation"}
        </Button>
        {isApiError(accept.error) && accept.error.code === "invitation_email_mismatch" ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-subtle p-3 text-sm text-fg-muted">
            <MailWarning className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden="true" />
            <p>
              Invited under another email?{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() =>
                  logout.mutate(undefined, {
                    onSettled: () => router.replace(`/login?next=${encodeURIComponent(here)}`),
                  })
                }
              >
                Switch account
              </button>
            </p>
          </div>
        ) : (
          <Button asChild variant="ghost" className="w-full">
            <Link href="/app/dashboard">Not now</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
