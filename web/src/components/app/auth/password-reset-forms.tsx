"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/app/field";
import { StrengthMeter, useCooldown } from "@/components/app/auth/security-bits";
import { AUTH_ERROR_MESSAGES, authErrorMessage, isApiError } from "@/lib/api";
import { useForgotPassword, useResetPassword } from "@/lib/queries";

const MIN_PASSWORD = 10;
const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

function Fade({ id, children }: { id: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const forgot = useForgotPassword();
  const cooldown = useCooldown(60);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError(undefined);
    setFormError(null);
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    try {
      await forgot.mutateAsync({ email: email.trim() });
      setSent(true);
      cooldown.start();
    } catch (err) {
      // Only real failures (network, rate limits) land here — the endpoint never reveals whether an account exists.
      if (isApiError(err) && err.fields.email && !(err.code in AUTH_ERROR_MESSAGES)) setError(err.fields.email);
      else setFormError(authErrorMessage(err));
    }
  }

  return (
    <Fade id={sent ? "sent" : "form"}>
      {sent ? (
        <div>
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MailCheck className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-fg">Check your email</h1>
          <p className="mt-2 text-fg-muted" role="status">
            If an account exists for <span className="font-medium text-fg">{email.trim()}</span>, we&apos;ve sent a
            link to reset your password. It expires in 1 hour.
          </p>
          <FormError message={formError} />
          <div className="mt-8 grid gap-3">
            <Button asChild size="lg" className="h-10 w-full">
              <Link href="/login">Back to log in</Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => void send()}
              disabled={cooldown.active || forgot.isPending}
            >
              {cooldown.active ? `Resend in ${cooldown.remaining}s` : "Resend email"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">Reset your password</h1>
          <p className="mt-2 text-fg-muted">Enter the email you sign in with and we&apos;ll send you a reset link.</p>
          <form onSubmit={send} noValidate className="mt-8 grid gap-5">
            <FormError message={formError} />
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
              autoFocus
            />
            <Button type="submit" size="lg" className="h-10 w-full" disabled={forgot.isPending}>
              {forgot.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {forgot.isPending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
          <p className="mt-8 text-center text-sm text-fg-muted">
            Remembered it?{" "}
            <Link href="/login" className={linkClass}>
              Log in
            </Link>
          </p>
        </div>
      )}
    </Fade>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const reset = useResetPassword();

  if (!token) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">Link incomplete</h1>
        <p className="mt-2 text-fg-muted">
          This reset link is missing its token. Open the link from the email again, or request a new one.
        </p>
        <Button asChild size="lg" className="mt-8 h-10 w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFields({});
    setFormError(null);
    const errs: Record<string, string> = {};
    if (password.length < MIN_PASSWORD) errs.password = `Use at least ${MIN_PASSWORD} characters.`;
    else if (password !== confirm) errs.confirm = "The passwords don't match.";
    if (Object.keys(errs).length) {
      setFields(errs);
      return;
    }
    try {
      await reset.mutateAsync({ token, password });
      setDone(true);
    } catch (err) {
      if (isApiError(err) && err.code === "weak_password") setFields({ password: AUTH_ERROR_MESSAGES.weak_password });
      else if (isApiError(err) && err.fields.password) setFields({ password: err.fields.password });
      else if (isApiError(err) && (err.fields.token || ["invalid_code", "code_expired", "invalid_token", "not_found"].includes(err.code)))
        setFormError("This reset link is invalid or has expired. Request a new one.");
      else setFormError(authErrorMessage(err));
    }
  }

  return (
    <Fade id={done ? "done" : "form"}>
      {done ? (
        <div>
          <div className="flex size-11 items-center justify-center rounded-xl bg-success-subtle text-success-fg">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-fg">Password updated</h1>
          <p className="mt-2 text-fg-muted" role="status">
            You&apos;ve been signed out everywhere else. Log in with your new password.
          </p>
          <Button size="lg" className="mt-8 h-10 w-full" onClick={() => router.replace("/login")}>
            Continue to log in
          </Button>
        </div>
      ) : (
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">Choose a new password</h1>
          <p className="mt-2 text-fg-muted">This signs you out of every other device.</p>
          <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-5">
            <FormError message={formError} />
            <div className="grid gap-2">
              <Field
                label="New password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fields.password}
                autoFocus
              />
              <StrengthMeter password={password} />
            </div>
            <Field
              label="Confirm new password"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={fields.confirm}
            />
            <Button type="submit" size="lg" className="h-10 w-full" disabled={reset.isPending}>
              {reset.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {reset.isPending ? "Saving…" : "Set new password"}
            </Button>
          </form>
          {formError && (
            <p className="mt-6 text-center text-sm text-fg-muted">
              <Link href="/forgot-password" className={linkClass}>
                Request a new reset link
              </Link>
            </p>
          )}
        </div>
      )}
    </Fade>
  );
}
