"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/app/field";
import { isApiError } from "@/lib/api";
import { useLogin, useMe } from "@/lib/queries";
import { safeNext } from "@/lib/utils";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const me = useMe();
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Already signed in? Skip the form.
  useEffect(() => {
    if (me.data) router.replace(next);
  }, [me.data, next, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      await login.mutateAsync({ email: email.trim(), password });
      router.replace(next);
    } catch (err) {
      if (isApiError(err)) {
        if (err.code === "invalid_credentials") setFormError("That email and password don't match an account.");
        else {
          setFields(err.fields);
          if (!Object.keys(err.fields).length) setFormError(err.message);
        }
      } else setFormError("Something went wrong. Please try again.");
    }
  }

  const signupHref = params.get("next") ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">Welcome back</h1>
      <p className="mt-2 text-fg-muted">Log in to your Adwise workspace.</p>

      <form method="post" onSubmit={onSubmit} noValidate className="mt-8 grid gap-5">
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
        />
        <Button type="submit" size="lg" className="mt-1 h-10 w-full" disabled={login.isPending}>
          {login.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {login.isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        New to Adwise?{" "}
        <Link href={signupHref} className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
