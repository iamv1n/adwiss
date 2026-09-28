"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OtpInput } from "@/components/app/auth/otp-input";
import { useCooldown } from "@/components/app/auth/security-bits";
import { authErrorMessage } from "@/lib/api";
import { useLogout, useMe, useResendVerifyEmail, useVerifyEmail } from "@/lib/queries";
import { safeNext } from "@/lib/utils";

export function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const me = useMe();
  const verify = useVerifyEmail();
  const resend = useResendVerifyEmail();
  const logout = useLogout();
  // Signup just sent a code, so start with the cooldown running.
  const cooldown = useCooldown(60, true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (me.data === null) router.replace(`/login?next=${encodeURIComponent(`/verify-email?next=${encodeURIComponent(next)}`)}`);
    else if (me.data && me.data.email_verified !== false) router.replace(next);
  }, [me.data, next, router]);

  async function submit(value = code) {
    setError(null);
    if (value.length < 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    try {
      await verify.mutateAsync({ code: value });
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
      setCode("");
    }
  }

  async function onResend() {
    setError(null);
    setNotice(null);
    try {
      await resend.mutateAsync();
      cooldown.start();
      setNotice("A new code is on its way.");
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  async function onChangeEmail() {
    await logout.mutateAsync().catch(() => undefined);
    router.replace("/signup");
  }

  if (!me.data) {
    return (
      <div aria-busy="true" className="grid gap-4">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="mt-4 h-12 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <MailCheck className="size-5" aria-hidden="true" />
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-fg">Verify your email</h1>
      <p className="mt-2 text-fg-muted">
        We sent a 6-digit code to <span className="font-medium text-fg">{me.data.user.email}</span>. Enter it below to
        finish setting up your account.
      </p>

      <form
        noValidate
        className="mt-8 grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={(v) => void submit(v)}
          error={error ?? undefined}
          disabled={verify.isPending}
          label="Email verification code"
          autoFocus
        />
        {notice && !error && (
          <p role="status" className="text-sm text-success-fg">
            {notice}
          </p>
        )}
        <Button type="submit" size="lg" className="h-10 w-full" disabled={verify.isPending}>
          {verify.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {verify.isPending ? "Verifying…" : "Verify email"}
        </Button>
      </form>

      <div className="mt-8 grid gap-2 text-center text-sm text-fg-muted">
        <p>
          Didn&apos;t get it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={cooldown.active || resend.isPending}
            className="font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-fg-subtle disabled:no-underline"
          >
            {cooldown.active ? `resend in ${cooldown.remaining}s` : "resend the code"}
          </button>
          .
        </p>
        <p>
          Wrong address?{" "}
          <button
            type="button"
            onClick={() => void onChangeEmail()}
            disabled={logout.isPending}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign out and sign up again
          </button>
        </p>
      </div>
    </div>
  );
}
