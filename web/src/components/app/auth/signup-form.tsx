"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/app/field";
import { isApiError } from "@/lib/api";
import { useMe, useSignup } from "@/lib/queries";
import { safeNext } from "@/lib/utils";

const MIN_PASSWORD = 10;

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  // New accounts land on onboarding (via /app) unless they came from an invite link.
  const next = safeNext(params.get("next"));
  const me = useMe();
  const signup = useSignup();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (me.data) router.replace(next);
  }, [me.data, next, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFields({});
    setFormError(null);
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Tell us what to call you.";
    if (!email.trim()) errs.email = "Enter your work email.";
    if (password.length < MIN_PASSWORD) errs.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (Object.keys(errs).length) {
      setFields(errs);
      return;
    }
    try {
      await signup.mutateAsync({ name: name.trim(), email: email.trim(), password });
      router.replace(next);
    } catch (err) {
      if (isApiError(err)) {
        setFields(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Something went wrong. Please try again.");
    }
  }

  const loginHref = params.get("next") ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">Create your account</h1>
      <p className="mt-2 text-fg-muted">Find the hours that earn, and act on them safely.</p>

      <form method="post" onSubmit={onSubmit} noValidate className="mt-8 grid gap-5">
        <FormError message={formError} />
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fields.name}
          autoFocus
        />
        <Field
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields.email}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields.password}
          hint={`At least ${MIN_PASSWORD} characters.`}
        />
        <Button type="submit" size="lg" className="mt-1 h-10 w-full" disabled={signup.isPending}>
          {signup.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {signup.isPending ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-xs text-fg-subtle">
          By creating an account you agree to the Terms and Privacy Policy.
        </p>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
