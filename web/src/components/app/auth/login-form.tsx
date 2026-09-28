"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, FormError } from "@/components/app/field";
import { ChallengeStep, type Challenge } from "@/components/app/auth/challenge-step";
import { OtpInput } from "@/components/app/auth/otp-input";
import { useCooldown } from "@/components/app/auth/security-bits";
import { AUTH_ERROR_MESSAGES, authErrorMessage, isApiError, type LoginResult, type User } from "@/lib/api";
import { useLogin, useLoginCodeStart, useLoginCodeVerify, useMe } from "@/lib/queries";
import { safeNext } from "@/lib/utils";

type Step = "password" | "email" | "email-code" | "challenge";

const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  // Platform admins land on the console unless a specific page was requested.
  const explicitNext = params.has("next");
  const me = useMe();
  const login = useLogin();
  const codeStart = useLoginCodeStart();
  const codeVerify = useLoginCodeVerify();
  const cooldown = useCooldown(60);
  const reduce = useReducedMotion();

  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Already signed in? Skip the form.
  useEffect(() => {
    if (me.data) router.replace(!explicitNext && me.data.user.is_platform_admin ? "/admin" : next);
  }, [me.data, explicitNext, next, router]);

  function go(s: Step) {
    setFields({});
    setFormError(null);
    setCode("");
    setStep(s);
  }

  function finish(user: User) {
    router.replace(!explicitNext && user.is_platform_admin ? "/admin" : next);
  }

  function handleResult(res: LoginResult) {
    if (res.status === "ok") finish(res.user);
    else {
      setChallenge({ challenge: res.challenge, methods: res.methods, reason: res.reason, email_hint: res.email_hint });
      go("challenge");
    }
  }

  function showError(err: unknown) {
    if (isApiError(err) && !(err.code in AUTH_ERROR_MESSAGES) && Object.keys(err.fields).length) setFields(err.fields);
    else setFormError(authErrorMessage(err));
  }

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFields({});
    setFormError(null);
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = "Enter your email address.";
    if (!password) errs.password = "Enter your password.";
    if (Object.keys(errs).length) {
      setFields(errs);
      return;
    }
    try {
      handleResult(await login.mutateAsync({ email: email.trim(), password }));
    } catch (err) {
      showError(err);
    }
  }

  async function sendCode(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setFields({});
    setFormError(null);
    if (!email.trim()) {
      setFields({ email: "Enter your email address." });
      return;
    }
    try {
      await codeStart.mutateAsync({ email: email.trim() });
      cooldown.start();
      if (step !== "email-code") go("email-code");
    } catch (err) {
      showError(err);
    }
  }

  async function onCode(value = code) {
    setFormError(null);
    if (value.length < 6) {
      setFormError("Enter the 6-digit code from the email.");
      return;
    }
    try {
      handleResult(await codeVerify.mutateAsync({ email: email.trim(), code: value, remember_device: remember }));
    } catch (err) {
      setFormError(authErrorMessage(err));
      setCode("");
    }
  }

  const signupHref = params.get("next") ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
  const forgotHref = email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : "/forgot-password";

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={reduce ? false : { opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduce ? undefined : { opacity: 0, x: -12 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {step === "password" && (
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">Welcome back</h1>
            <p className="mt-2 text-fg-muted">Log in to your Adwise workspace.</p>

            <form method="post" onSubmit={onPassword} noValidate className="mt-8 grid gap-5">
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
                error={fields.email}
                autoFocus
              />
              <Field
                label="Password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fields.password}
                labelAside={
                  <Link href={forgotHref} className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                    Forgot password?
                  </Link>
                }
              />
              <Button type="submit" size="lg" className="mt-1 h-10 w-full" disabled={login.isPending}>
                {login.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {login.isPending ? "Logging in…" : "Log in"}
              </Button>
              <div className="flex items-center gap-3 text-xs text-fg-subtle" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" size="lg" className="h-10 w-full" onClick={() => go("email")}>
                <Mail aria-hidden="true" />
                Email me a sign-in code instead
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-fg-muted">
              New to Adwise?{" "}
              <Link href={signupHref} className={linkClass}>
                Create an account
              </Link>
            </p>
          </div>
        )}

        {step === "email" && (
          <div>
            <BackButton onClick={() => go("password")} label="Use your password" />
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-fg">Sign in with a code</h1>
            <p className="mt-2 text-fg-muted">We&apos;ll email you a 6-digit code. No password needed.</p>
            <form onSubmit={sendCode} noValidate className="mt-8 grid gap-5">
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
                error={fields.email}
                autoFocus
              />
              <Button type="submit" size="lg" className="h-10 w-full" disabled={codeStart.isPending}>
                {codeStart.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {codeStart.isPending ? "Sending…" : "Send code"}
              </Button>
            </form>
          </div>
        )}

        {step === "email-code" && (
          <div>
            <BackButton onClick={() => go("email")} label="Change email" />
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-fg">Check your email</h1>
            <p className="mt-2 text-fg-muted">
              If an account exists for <span className="font-medium text-fg">{email.trim()}</span>, we sent it a 6-digit
              code. It expires in 10 minutes.
            </p>
            <form
              noValidate
              className="mt-8 grid gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void onCode();
              }}
            >
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={(v) => void onCode(v)}
                error={formError ?? undefined}
                disabled={codeVerify.isPending}
                label="Sign-in code"
                autoFocus
              />
              <div className="flex items-center gap-2.5">
                <Checkbox id="remember-code" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                <Label htmlFor="remember-code" className="font-normal text-fg-muted">
                  Remember this device for 30 days
                </Label>
              </div>
              <Button type="submit" size="lg" className="h-10 w-full" disabled={codeVerify.isPending}>
                {codeVerify.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {codeVerify.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-fg-muted">
              Didn&apos;t get it?{" "}
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={cooldown.active || codeStart.isPending}
                className={`${linkClass} disabled:cursor-not-allowed disabled:text-fg-subtle disabled:no-underline`}
              >
                {cooldown.active ? `Resend in ${cooldown.remaining}s` : "Resend code"}
              </button>
            </p>
          </div>
        )}

        {step === "challenge" && challenge && (
          <ChallengeStep
            challenge={challenge}
            onSuccess={finish}
            onRestart={() => {
              setChallenge(null);
              setPassword("");
              go("password");
              setFormError("Your sign-in expired. Please log in again.");
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm text-fg-muted transition-colors outline-none hover:text-fg focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
