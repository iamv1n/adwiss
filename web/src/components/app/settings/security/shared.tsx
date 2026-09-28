"use client";

import { useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Field, FormError } from "@/components/app/field";
import { AUTH_ERROR_MESSAGES, authErrorMessage, isApiError } from "@/lib/api";

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-[16rem_1fr] md:gap-10">
      <div>
        <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface ${className}`}>{children}</div>;
}

/** Split an API error into a field error (password/code) or a general message. */
export function splitError(err: unknown, codeField = "code"): { password?: string; code?: string; form?: string } {
  if (isApiError(err)) {
    if (err.code === "invalid_credentials" || err.code === "password_required" || err.fields.password)
      return {
        password:
          err.code === "invalid_credentials"
            ? "That password isn't right."
            : err.fields.password ?? AUTH_ERROR_MESSAGES.password_required,
      };
    if (err.code === "invalid_code" || err.code === "code_expired" || err.fields[codeField])
      return { code: AUTH_ERROR_MESSAGES[err.code] ?? err.fields[codeField] };
  }
  return { form: authErrorMessage(err) };
}

/**
 * "Confirm with your password" dialog for sensitive changes. `onConfirm` throws
 * on failure; errors are mapped onto the password field when relevant.
 */
export function PasswordConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof splitError>>({});
  const [pending, setPending] = useState(false);

  function change(o: boolean) {
    if (!o) {
      setPassword("");
      setErrors({});
    }
    onOpenChange(o);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setErrors({ password: "Enter your current password to confirm." });
      return;
    }
    setPending(true);
    setErrors({});
    try {
      await onConfirm(password);
      change(false);
    } catch (err) {
      setErrors(splitError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <FormError message={errors.form} />
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Recovery codes, shown once: copy / download, and an "I saved them" gate before closing. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: user can still download */
    }
  }

  function download() {
    const body = `Adwise recovery codes\nGenerated ${new Date().toISOString()}\n\nEach code can be used once to sign in if you lose your authenticator app.\n\n${text}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "adwise-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4">
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-bg-subtle p-4 font-mono text-sm text-fg"
      >
        {codes.map((c) => (
          <li key={c} className="tabular-nums">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-live="polite">
          {copied ? <Check className="text-success" aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download aria-hidden="true" /> Download .txt
        </Button>
      </div>
      <p className="text-sm text-fg-muted">
        Store these somewhere safe, like a password manager. Each code works once, and you won&apos;t see them again.
      </p>
      <div className="flex items-center gap-2.5">
        <Checkbox id="codes-saved" checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
        <Label htmlFor="codes-saved" className="font-normal">
          I&apos;ve saved my recovery codes
        </Label>
      </div>
      <Button type="button" onClick={onDone} disabled={!saved} className="justify-self-end">
        Done
      </Button>
    </div>
  );
}
