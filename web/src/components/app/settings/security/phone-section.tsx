"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FormError } from "@/components/app/field";
import { OtpInput } from "@/components/app/auth/otp-input";
import { AUTH_ERROR_MESSAGES, isApiError, type SecurityOverview } from "@/lib/api";
import { useAddPhone, useRemovePhone, useVerifyPhone } from "@/lib/queries";
import { Panel, PasswordConfirmDialog, splitError } from "./shared";

const COUNTRY_CODES = [
  ["+91", "India"],
  ["+1", "US / Canada"],
  ["+44", "UK"],
  ["+61", "Australia"],
  ["+65", "Singapore"],
  ["+971", "UAE"],
  ["+49", "Germany"],
  ["+33", "France"],
  ["+81", "Japan"],
  ["+55", "Brazil"],
] as const;

/** "+91" + "98765 43210" → "+919876543210". A number typed with its own "+" wins. */
function toE164(cc: string, local: string) {
  const t = local.trim();
  if (t.startsWith("+")) return "+" + t.replace(/\D/g, "");
  return cc + t.replace(/\D/g, "").replace(/^0+/, "");
}

export function PhoneSection({ data }: { data: SecurityOverview }) {
  const reduce = useReducedMotion();
  const add = useAddPhone();
  const verify = useVerifyPhone();
  const remove = useRemovePhone();
  const [adding, setAdding] = useState(false);
  const [cc, setCc] = useState("+91");
  const [local, setLocal] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<{ phone?: string; password?: string; code?: string; form?: string }>({});
  const [removeOpen, setRemoveOpen] = useState(false);

  const e164 = toE164(cc, local);
  const verifying = pending ?? (data.phone && !data.phone_verified ? data.phone : null);
  const state = verifying ? "verify" : data.phone && data.phone_verified ? "done" : adding ? "add" : "empty";

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) errs.phone = AUTH_ERROR_MESSAGES.invalid_phone;
    if (!password) errs.password = "Enter your current password.";
    if (errs.phone || errs.password) return setErrors(errs);
    setErrors({});
    try {
      await add.mutateAsync({ password, phone: e164 });
      setPending(e164);
      setPassword("");
      setCode("");
    } catch (err) {
      if (isApiError(err) && (err.code === "invalid_phone" || err.fields.phone))
        setErrors({ phone: AUTH_ERROR_MESSAGES.invalid_phone });
      else setErrors(splitError(err));
    }
  }

  async function onVerify(value = code) {
    if (value.length < 6) return setErrors({ code: "Enter the 6-digit code we texted you." });
    setErrors({});
    try {
      await verify.mutateAsync({ code: value });
      setPending(null);
      setAdding(false);
      setLocal("");
      toast.success("Phone number verified");
    } catch (err) {
      setErrors(splitError(err));
      setCode("");
    }
  }

  function cancel() {
    setPending(null);
    setAdding(false);
    setErrors({});
    setCode("");
    setPassword("");
  }

  return (
    <Panel className="p-4 sm:p-5">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {(state === "empty" || state === "done") && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-fg-muted">
                  <Phone className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  {state === "done" ? (
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      <span className="font-mono tabular-nums">{data.phone}</span>
                      <Badge variant="outline" className="border-success/30 bg-success-subtle text-success-fg">
                        Verified
                      </Badge>
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-fg">No phone number</p>
                  )}
                  <p className="mt-0.5 text-sm text-fg-muted">Used only to reach you about account recovery.</p>
                </div>
              </div>
              {state === "done" ? (
                <Button variant="outline" size="sm" onClick={() => setRemoveOpen(true)}>
                  Remove
                </Button>
              ) : (
                <Button size="sm" onClick={() => setAdding(true)}>
                  Add phone
                </Button>
              )}
            </div>
          )}

          {state === "add" && (
            <form onSubmit={onAdd} noValidate className="grid gap-4">
              <FormError message={errors.form} />
              <div className="grid gap-1.5">
                <Label htmlFor="phone-local">Mobile number</Label>
                <div className="flex gap-2">
                  <select
                    aria-label="Country code"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    className="h-10 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm text-fg shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    {COUNTRY_CODES.map(([c, name]) => (
                      <option key={c} value={c}>
                        {c} {name}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="phone-local"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    aria-invalid={errors.phone ? true : undefined}
                    aria-describedby="phone-hint"
                    className="h-10"
                    autoFocus
                  />
                </div>
                <p id="phone-hint" className={errors.phone ? "text-sm text-danger-fg" : "text-sm text-fg-subtle"}>
                  {errors.phone ?? (local ? `We'll text a code to ${e164}.` : "We'll text you a 6-digit code.")}
                </p>
              </div>
              <Field
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={add.isPending}>
                  {add.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                  Send code
                </Button>
                <Button type="button" variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {state === "verify" && (
            <form
              noValidate
              className="grid max-w-sm gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void onVerify();
              }}
            >
              <p className="text-sm text-fg-muted">
                Enter the 6-digit code we texted to <span className="font-mono font-medium text-fg">{verifying}</span>.
              </p>
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={(v) => void onVerify(v)}
                error={errors.code}
                disabled={verify.isPending}
                label="SMS code"
                autoFocus
              />
              <FormError message={errors.form} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={verify.isPending}>
                  {verify.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                  Verify
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    cancel();
                    setAdding(true);
                  }}
                >
                  Use a different number
                </Button>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>

      <PasswordConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove phone number?"
        description={`${data.phone ?? "This number"} will be removed from your account.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async (pw) => {
          await remove.mutateAsync({ password: pw });
          toast.success("Phone number removed");
        }}
      />
    </Panel>
  );
}
