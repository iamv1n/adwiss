"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/app/field";
import { StrengthMeter } from "@/components/app/auth/security-bits";
import { AUTH_ERROR_MESSAGES, authErrorMessage, isApiError } from "@/lib/api";
import { useChangePassword } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { Panel } from "./shared";

const MIN_PASSWORD = 10;

export function PasswordSection({ changedAt }: { changedAt: string | null }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFields({});
    setFormError(null);
    const errs: Record<string, string> = {};
    if (!current) errs.current = "Enter your current password.";
    if (next.length < MIN_PASSWORD) errs.next = `Use at least ${MIN_PASSWORD} characters.`;
    else if (next !== confirm) errs.confirm = "The passwords don't match.";
    if (Object.keys(errs).length) {
      setFields(errs);
      return;
    }
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed", { description: "Other devices have been signed out." });
    } catch (err) {
      if (!isApiError(err)) return setFormError(authErrorMessage(err));
      if (err.code === "invalid_credentials" || err.fields.current_password || err.code === "password_required")
        setFields({ current: err.code === "invalid_credentials" ? "That password isn't right." : err.fields.current_password ?? AUTH_ERROR_MESSAGES.password_required });
      else if (err.code === "weak_password" || err.fields.new_password)
        setFields({ next: err.code === "weak_password" ? AUTH_ERROR_MESSAGES.weak_password : err.fields.new_password });
      else setFormError(authErrorMessage(err));
    }
  }

  return (
    <Panel className="p-4 sm:p-5">
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <p className="text-sm text-fg-muted">
          {changedAt ? `Last changed ${timeAgo(changedAt)}.` : "Changing your password signs out your other devices."}
        </p>
        <FormError message={formError} />
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={fields.current}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={fields.next}
            />
            <StrengthMeter password={next} />
          </div>
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={fields.confirm}
          />
        </div>
        <Button type="submit" className="justify-self-start" disabled={change.isPending}>
          {change.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Update password
        </Button>
      </form>
    </Panel>
  );
}
