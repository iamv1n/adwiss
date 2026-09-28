"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SecurityEvent } from "@/lib/api";
import { useSecurity } from "@/lib/queries";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { DevicesSection } from "./devices-section";
import { PasswordSection } from "./password-section";
import { PhoneSection } from "./phone-section";
import { Panel, Section } from "./shared";
import { TwoFactorSection } from "./two-factor-section";

type Tone = "ok" | "warn" | "bad" | "neutral";

const EVENTS: Record<string, { label: string; icon: typeof LogIn; tone: Tone }> = {
  login_succeeded: { label: "Signed in", icon: LogIn, tone: "ok" },
  login_failed: { label: "Failed sign-in attempt", icon: XCircle, tone: "bad" },
  challenge_issued: { label: "Asked for a second check", icon: ShieldAlert, tone: "neutral" },
  challenge_passed: { label: "Passed second check", icon: ShieldCheck, tone: "ok" },
  challenge_failed: { label: "Failed second check", icon: ShieldAlert, tone: "bad" },
  password_reset: { label: "Password reset", icon: KeyRound, tone: "warn" },
  password_changed: { label: "Password changed", icon: KeyRound, tone: "warn" },
  email_verified: { label: "Email verified", icon: CheckCircle2, tone: "ok" },
  totp_enabled: { label: "Authenticator app turned on", icon: Smartphone, tone: "ok" },
  totp_disabled: { label: "Authenticator app turned off", icon: ShieldOff, tone: "warn" },
  email_2fa_enabled: { label: "Email codes turned on", icon: Mail, tone: "ok" },
  email_2fa_disabled: { label: "Email codes turned off", icon: ShieldOff, tone: "warn" },
  recovery_codes_regenerated: { label: "Recovery codes regenerated", icon: KeyRound, tone: "neutral" },
  recovery_code_used: { label: "Recovery code used", icon: KeyRound, tone: "warn" },
  phone_added: { label: "Phone number added", icon: Phone, tone: "neutral" },
  phone_verified: { label: "Phone number verified", icon: Phone, tone: "ok" },
  phone_removed: { label: "Phone number removed", icon: Phone, tone: "warn" },
  device_removed: { label: "Device removed", icon: Smartphone, tone: "neutral" },
  sessions_revoked: { label: "Signed out other sessions", icon: LogOut, tone: "neutral" },
};

const TONE: Record<Tone, string> = {
  ok: "bg-success-subtle text-success-fg",
  warn: "bg-warning-subtle text-warning-fg",
  bad: "bg-danger-subtle text-danger-fg",
  neutral: "bg-bg-subtle text-fg-muted",
};

/** Short "Chrome on macOS" from a user-agent string. */
function uaLabel(ua: string) {
  if (!ua) return "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return browser && os ? `${browser} on ${os}` : browser || os;
}

/** Events shown before "Show all"; the server sends the latest 10. */
const ACTIVITY_PREVIEW = 3;

function Activity({ events }: { events: SecurityEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!events.length) return <p className="p-5 text-sm text-fg-muted">No security activity yet.</p>;
  const shown = expanded ? events : events.slice(0, ACTIVITY_PREVIEW);
  const hidden = events.length - ACTIVITY_PREVIEW;
  return (
    <>
    <ol id="security-activity" className="divide-y divide-border">
      {shown.map((e, i) => {
        const meta = EVENTS[e.type] ?? {
          label: e.type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
          icon: AlertTriangle,
          tone: "neutral" as Tone,
        };
        const Icon = meta.icon;
        const device = uaLabel(e.user_agent);
        return (
          <li key={`${e.created_at}-${i}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONE[meta.tone])}>
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{meta.label}</p>
              <p className="truncate text-xs text-fg-muted">
                {[device, e.ip].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <time
              dateTime={e.created_at}
              title={formatDate(e.created_at, { dateStyle: "medium", timeStyle: "short" })}
              className="shrink-0 text-xs text-fg-subtle"
            >
              {timeAgo(e.created_at)}
            </time>
          </li>
        );
      })}
    </ol>
    {hidden > 0 && (
      <div className="border-t border-border px-4 py-2 sm:px-5">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          aria-expanded={expanded}
          aria-controls="security-activity"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : `Show all ${events.length}`}
        </Button>
      </div>
    )}
    </>
  );
}

export function SecurityView() {
  const reduce = useReducedMotion();
  const { data, isPending, isError, error, refetch } = useSecurity();

  if (isPending) {
    return (
      <div className="grid gap-8" aria-busy="true" aria-label="Loading security settings">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-4 md:grid-cols-[16rem_1fr] md:gap-10">
            <div className="grid content-start gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-36 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-fg-muted">{error.message}</p>
        <Button className="mt-4" variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const sections = [
    <Section key="pw" title="Password" description="Changing it signs you out everywhere else.">
      <PasswordSection changedAt={data.password_changed_at} />
    </Section>,
    <Section
      key="2fa"
      title="Two-step verification"
      description="Ask for a second check when you sign in on a device you haven't trusted."
    >
      <TwoFactorSection data={data} />
    </Section>,
    <Section key="phone" title="Phone number" description="Optional. Helps us reach you if you're locked out.">
      <PhoneSection data={data} />
    </Section>,
    <Section key="devices" title="Devices" description="Browsers that have signed in to your account.">
      <DevicesSection devices={data.devices ?? []} sessionsCount={data.sessions_count} />
    </Section>,
    <Section key="activity" title="Recent activity" description="The latest sign-ins and security changes.">
      <Panel>
        <Activity events={data.events ?? []} />
      </Panel>
    </Section>,
  ];

  return (
    <div>
      {sections.map((s, i) => (
        <motion.div
          key={s.key}
          className="border-b border-border py-8 first:pt-0 last:border-0"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: reduce ? 0 : i * 0.05 }}
        >
          {s}
        </motion.div>
      ))}
    </div>
  );
}
