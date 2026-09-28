"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { KeyRound, Loader2, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/app/field";
import { OtpInput } from "@/components/app/auth/otp-input";
import { useCooldown } from "@/components/app/auth/security-bits";
import { authErrorMessage, isApiError, type ChallengeMethod, type ChallengeReason, type User } from "@/lib/api";
import { useChallengeEmail, useChallengeVerify } from "@/lib/queries";
import { cn } from "@/lib/utils";

export interface Challenge {
  challenge: string;
  methods: ChallengeMethod[];
  reason: ChallengeReason;
  email_hint: string;
}

const REASON_COPY: Record<ChallengeReason, { title: string; body: string }> = {
  new_device: {
    title: "New device or location — confirm it's you",
    body: "We don't recognise this sign-in, so we need one more check before letting you in.",
  },
  two_factor: {
    title: "Two-step verification",
    body: "Your account has two-step verification turned on. Confirm it's you to continue.",
  },
  failed_attempts: {
    title: "Confirm it's you",
    body: "There were several failed sign-in attempts on this account recently, so we need one more check.",
  },
};

const METHOD_META: Record<ChallengeMethod, { label: string; icon: typeof Smartphone }> = {
  totp: { label: "Authenticator app", icon: Smartphone },
  email: { label: "Email me a code", icon: Mail },
  recovery: { label: "Recovery code", icon: KeyRound },
};

/** Codes like "abcd-efgh": normalise pasted spaces / case, keep the hyphen. */
function normaliseRecovery(v: string) {
  const raw = v.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

export function ChallengeStep({
  challenge,
  onSuccess,
  onRestart,
}: {
  challenge: Challenge;
  onSuccess: (user: User) => void;
  onRestart: () => void;
}) {
  const reduce = useReducedMotion();
  const copy = REASON_COPY[challenge.reason] ?? REASON_COPY.two_factor;
  const [method, setMethod] = useState<ChallengeMethod>(
    challenge.methods.includes("totp") ? "totp" : challenge.methods[0] ?? "email",
  );
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const verify = useChallengeVerify();
  const sendEmail = useChallengeEmail();
  const cooldown = useCooldown(60);
  const autoSent = useRef(false);

  async function requestEmail(auto = false) {
    setError(null);
    try {
      await sendEmail.mutateAsync({ challenge: challenge.challenge });
      setEmailSent(true);
      cooldown.start();
    } catch (err) {
      // A code may already be on its way (rate limited) — that's fine when auto-sending.
      if (auto && isApiError(err) && err.code === "rate_limited") {
        setEmailSent(true);
        cooldown.start();
      } else if (isApiError(err) && err.code === "challenge_expired") onRestart();
      else setError(authErrorMessage(err));
    }
  }

  // Email is the only way in (e.g. a new device without 2FA): send the code straight away.
  useEffect(() => {
    if (method === "email" && !emailSent && !autoSent.current) {
      autoSent.current = true;
      void requestEmail(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  function switchTo(m: ChallengeMethod) {
    setMethod(m);
    setCode("");
    setError(null);
  }

  async function submit(value = code) {
    setError(null);
    const expected = method === "recovery" ? 9 : 6;
    if (value.length < expected) {
      setError(method === "recovery" ? "Enter one of your recovery codes (xxxx-xxxx)." : "Enter the 6-digit code.");
      return;
    }
    try {
      const res = await verify.mutateAsync({
        challenge: challenge.challenge,
        method,
        code: value,
        remember_device: remember,
      });
      if (res.status === "ok") onSuccess(res.user);
      else setError("One more check is needed. Please try again.");
    } catch (err) {
      if (isApiError(err) && err.code === "challenge_expired") {
        onRestart();
        return;
      }
      setError(authErrorMessage(err));
      if (method !== "recovery") setCode("");
    }
  }

  const MethodIcon = METHOD_META[method].icon;

  return (
    <div>
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </div>
      <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-balance text-fg">{copy.title}</h1>
      <p className="mt-2 text-fg-muted">{copy.body}</p>

      {challenge.methods.length > 1 && (
        <div role="tablist" aria-label="Verification method" className="mt-6 grid gap-1 rounded-lg bg-bg-subtle p-1 sm:grid-cols-3">
          {challenge.methods.map((m) => {
            const Icon = METHOD_META[m].icon;
            const active = m === method;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTo(m)}
                className={cn(
                  "relative flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="challenge-method"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.35 }}
                    className="absolute inset-0 rounded-md bg-surface shadow-sm"
                  />
                )}
                <Icon className="relative size-3.5" aria-hidden="true" />
                <span className="relative">{METHOD_META[m].label}</span>
              </button>
            );
          })}
        </div>
      )}

      <form
        noValidate
        className="mt-6 grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={method}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="grid gap-3"
          >
            <p className="flex items-start gap-2 text-sm text-fg-muted">
              <MethodIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {method === "totp" && "Enter the 6-digit code from your authenticator app."}
                {method === "email" &&
                  (emailSent ? (
                    <>
                      We sent a code to <span className="font-medium text-fg">{challenge.email_hint}</span>. It expires in 10 minutes.
                    </>
                  ) : (
                    <>
                      We&apos;ll send a code to <span className="font-medium text-fg">{challenge.email_hint}</span>.
                    </>
                  ))}
                {method === "recovery" && "Enter one of the recovery codes you saved when you set up two-step verification. Each code works once."}
              </span>
            </p>
            {method === "recovery" ? (
              <Field
                label="Recovery code"
                name="recovery"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="xxxx-xxxx"
                className="[&_input]:font-mono [&_input]:tracking-wider"
                value={code}
                onChange={(e) => setCode(normaliseRecovery(e.target.value))}
                error={error ?? undefined}
                autoFocus
              />
            ) : (
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={(v) => void submit(v)}
                error={error ?? undefined}
                disabled={verify.isPending}
                label={method === "totp" ? "Authenticator code" : "Email code"}
                autoFocus
              />
            )}
            {method === "email" && (
              <div className="text-sm">
                <button
                  type="button"
                  onClick={() => void requestEmail()}
                  disabled={cooldown.active || sendEmail.isPending}
                  className="font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-fg-subtle disabled:no-underline"
                >
                  {sendEmail.isPending
                    ? "Sending…"
                    : cooldown.active
                      ? `Resend code in ${cooldown.remaining}s`
                      : emailSent
                        ? "Resend code"
                        : "Send code"}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2.5">
          <Checkbox id="remember-device" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          <Label htmlFor="remember-device" className="font-normal text-fg-muted">
            Remember this device for 30 days
          </Label>
        </div>

        <Button type="submit" size="lg" className="h-10 w-full" disabled={verify.isPending}>
          {verify.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {verify.isPending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        Not you, or stuck?{" "}
        <button type="button" onClick={onRestart} className="font-medium text-primary underline-offset-4 hover:underline">
          Start over
        </button>
      </p>
    </div>
  );
}
