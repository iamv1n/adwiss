"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { KeyRound, Loader2, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Field, FormError } from "@/components/app/field";
import { OtpInput } from "@/components/app/auth/otp-input";
import { CopyField } from "@/components/app/members/copy-field";
import type { SecurityOverview } from "@/lib/api";
import {
  useRegenerateRecoveryCodes,
  useSetEmail2fa,
  useTotpDisable,
  useTotpEnable,
  useTotpSetup,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Panel, PasswordConfirmDialog, RecoveryCodes, splitError } from "./shared";

function Row({
  icon: Icon,
  title,
  description,
  status,
  action,
}: {
  icon: typeof Smartphone;
  title: string;
  description: React.ReactNode;
  status?: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-fg-muted">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
            {title}
            {status}
          </p>
          <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
        </div>
      </div>
      <div className="shrink-0 sm:ml-auto">{action}</div>
    </div>
  );
}

const OnBadge = () => (
  <Badge className="border-success/30 bg-success-subtle text-success-fg" variant="outline">
    On
  </Badge>
);

export function TwoFactorSection({ data }: { data: SecurityOverview }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const setEmail2fa = useSetEmail2fa();
  const regen = useRegenerateRecoveryCodes();
  const low = data.recovery_codes_remaining <= 3;

  return (
    <Panel className="divide-y divide-border">
      <Row
        icon={Smartphone}
        title="Authenticator app"
        status={data.totp_enabled ? <OnBadge /> : null}
        description={
          data.totp_enabled
            ? "Codes from an app like 1Password, Google Authenticator or Authy are required when you sign in."
            : "The most secure option. Use an app like 1Password, Google Authenticator or Authy."
        }
        action={
          data.totp_enabled ? (
            <Button variant="outline" size="sm" onClick={() => setDisableOpen(true)}>
              Turn off
            </Button>
          ) : (
            <Button size="sm" onClick={() => setSetupOpen(true)}>
              Set up
            </Button>
          )
        }
      />
      <Row
        icon={Mail}
        title="Email codes"
        status={data.email_2fa_enabled ? <OnBadge /> : null}
        description={`Ask for a code sent to ${data.email} every time you sign in on a device you haven't trusted.`}
        action={
          <Switch
            checked={data.email_2fa_enabled}
            onCheckedChange={() => setEmailOpen(true)}
            aria-label="Require email codes at sign-in"
          />
        }
      />
      {data.totp_enabled && (
        <Row
          icon={KeyRound}
          title="Recovery codes"
          status={
            <span className={cn("text-xs font-normal", low ? "text-warning-fg" : "text-fg-subtle")}>
              {data.recovery_codes_remaining} of 10 left
            </span>
          }
          description="One-time codes for when you can't use your authenticator app."
          action={
            <Button variant="outline" size="sm" onClick={() => setRegenOpen(true)}>
              Regenerate
            </Button>
          }
        />
      )}

      <TotpSetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
      <TotpDisableDialog open={disableOpen} onOpenChange={setDisableOpen} />
      <PasswordConfirmDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        title={data.email_2fa_enabled ? "Turn off email codes?" : "Turn on email codes"}
        description={
          data.email_2fa_enabled
            ? "You'll no longer be asked for an emailed code at sign-in (unusual sign-ins are still checked)."
            : `We'll email a code to ${data.email} whenever you sign in on a device you haven't trusted.`
        }
        confirmLabel={data.email_2fa_enabled ? "Turn off" : "Turn on"}
        destructive={data.email_2fa_enabled}
        onConfirm={async (password) => {
          await setEmail2fa.mutateAsync({ password, enabled: !data.email_2fa_enabled });
          toast.success(data.email_2fa_enabled ? "Email codes turned off" : "Email codes turned on");
        }}
      />
      <PasswordConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Regenerate recovery codes?"
        description={`Your ${data.recovery_codes_remaining} unused codes will stop working and you'll get 10 new ones.`}
        confirmLabel="Regenerate"
        onConfirm={async (password) => {
          const res = await regen.mutateAsync({ password });
          setNewCodes(res.recovery_codes);
        }}
      />
      <Dialog open={!!newCodes} onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false} onEscapeKeyDown={(e) => e.preventDefault()} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your new recovery codes</DialogTitle>
            <DialogDescription>Your old codes no longer work.</DialogDescription>
          </DialogHeader>
          {newCodes && <RecoveryCodes codes={newCodes} onDone={() => setNewCodes(null)} />}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

type SetupStep = "password" | "scan" | "codes";

function TotpSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const reduce = useReducedMotion();
  const setup = useTotpSetup();
  const enable = useTotpEnable();
  const [step, setStep] = useState<SetupStep>("password");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [errors, setErrors] = useState<ReturnType<typeof splitError>>({});

  useEffect(() => {
    if (!secret) return;
    let alive = true;
    QRCode.toDataURL(secret.otpauth_url, { margin: 1, width: 360, errorCorrectionLevel: "M" })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [secret]);

  function reset() {
    setStep("password");
    setPassword("");
    setSecret(null);
    setQr(null);
    setCode("");
    setCodes([]);
    setErrors({});
  }

  function change(o: boolean) {
    if (!o && step === "codes") return; // must acknowledge the codes first
    if (!o) reset();
    onOpenChange(o);
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return setErrors({ password: "Enter your current password to continue." });
    setErrors({});
    try {
      setSecret(await setup.mutateAsync({ password }));
      setStep("scan");
    } catch (err) {
      setErrors(splitError(err));
    }
  }

  async function onCode(value = code) {
    if (value.length < 6) return setErrors({ code: "Enter the 6-digit code from your app." });
    setErrors({});
    try {
      const res = await enable.mutateAsync({ code: value });
      setCodes(res.recovery_codes);
      setStep("codes");
      toast.success("Two-step verification is on");
    } catch (err) {
      setErrors(splitError(err));
      setCode("");
    }
  }

  const titles: Record<SetupStep, [string, string]> = {
    password: ["Set up an authenticator app", "Confirm your password to start."],
    scan: ["Scan the QR code", "Open your authenticator app and scan this code, or enter the key manually."],
    codes: ["Save your recovery codes", "If you lose your phone, these are the only way back in without contacting support."],
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        showCloseButton={step !== "codes"}
        onEscapeKeyDown={(e) => step === "codes" && e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <p className="text-xs font-medium text-fg-subtle">Step {["password", "scan", "codes"].indexOf(step) + 1} of 3</p>
          <DialogTitle>{titles[step][0]}</DialogTitle>
          <DialogDescription>{titles[step][1]}</DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
          >
            {step === "password" && (
              <form onSubmit={onPassword} noValidate className="grid gap-5">
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
                  <Button type="submit" disabled={setup.isPending}>
                    {setup.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                    Continue
                  </Button>
                </DialogFooter>
              </form>
            )}
            {step === "scan" && secret && (
              <form
                noValidate
                className="grid gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void onCode();
                }}
              >
                <div className="mx-auto grid size-44 place-items-center rounded-xl border border-border bg-white p-2">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="QR code for your authenticator app" className="size-full [image-rendering:pixelated]" />
                  ) : (
                    <Loader2 className="size-5 animate-spin text-fg-subtle" aria-label="Generating QR code" />
                  )}
                </div>
                <div className="grid gap-1.5">
                  <p className="text-sm font-medium text-fg">Can&apos;t scan? Enter this key</p>
                  <CopyField value={secret.secret.replace(/(.{4})/g, "$1 ").trim()} label="Setup key" />
                </div>
                <div className="grid gap-1.5">
                  <p className="text-sm font-medium text-fg">Enter the 6-digit code from the app</p>
                  <OtpInput
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => void onCode(v)}
                    error={errors.code}
                    disabled={enable.isPending}
                    label="Authenticator code"
                  />
                </div>
                <FormError message={errors.form} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => change(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={enable.isPending}>
                    {enable.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                    Verify and turn on
                  </Button>
                </DialogFooter>
              </form>
            )}
            {step === "codes" && (
              <RecoveryCodes
                codes={codes}
                onDone={() => {
                  reset();
                  onOpenChange(false);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function TotpDisableDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const disable = useTotpDisable();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof splitError>>({});

  function change(o: boolean) {
    if (!o) {
      setPassword("");
      setCode("");
      setErrors({});
    }
    onOpenChange(o);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: ReturnType<typeof splitError> = {};
    if (!password) errs.password = "Enter your current password.";
    if (code.length < 6) errs.code = "Enter the 6-digit code from your app.";
    if (errs.password || errs.code) return setErrors(errs);
    setErrors({});
    try {
      await disable.mutateAsync({ password, code });
      toast.success("Authenticator app turned off");
      change(false);
    } catch (err) {
      setErrors(splitError(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-fg-muted" aria-hidden="true" /> Turn off authenticator app?
            </DialogTitle>
            <DialogDescription>
              Your recovery codes will stop working, and signing in will only need your password (plus email checks for
              unusual sign-ins).
            </DialogDescription>
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
          <div className="grid gap-1.5">
            <p className="text-sm font-medium text-fg">Authenticator code</p>
            <OtpInput value={code} onChange={setCode} error={errors.code} label="Authenticator code" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={disable.isPending}>
              {disable.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Turn off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
