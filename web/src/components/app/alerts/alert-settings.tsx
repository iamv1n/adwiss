"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAlertPreferences,
  useSaveAlertPreferences,
  type AlertKind,
  type EmailLevel,
} from "@/lib/alerts-api";
import { useActiveOrg } from "@/lib/queries";
import { cn } from "@/lib/utils";

const LEVELS: { value: EmailLevel; label: string; description: string }[] = [
  { value: "all", label: "All alerts", description: "Every alert, including informational ones." },
  { value: "warning", label: "Warnings and critical", description: "Spend spikes, ROAS drops, failures and outages." },
  { value: "critical", label: "Critical only", description: "Only things that need action now." },
  { value: "none", label: "Off", description: "In-app only. You'll still see every alert under the bell." },
];

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border py-8 first:pt-0 last:border-0 md:grid-cols-[16rem_1fr] md:gap-10">
      <div>
        <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

/** Settings → Alerts: the signed-in user's email preferences for this org. */
export function AlertSettings() {
  const org = useActiveOrg();
  const prefs = useAlertPreferences(org?.id);
  const save = useSaveAlertPreferences(org?.id);
  // Unsaved edits; null = showing what's saved.
  const [draft, setDraft] = useState<{ level: EmailLevel; muted: AlertKind[] } | null>(null);

  const saved = prefs.data?.preferences;
  const level = draft?.level ?? saved?.email_level ?? "warning";
  const muted = draft?.muted ?? saved?.email_muted_kinds ?? [];
  const setLevel = (l: EmailLevel) => setDraft({ level: l, muted });
  const setMuted = (fn: (m: AlertKind[]) => AlertKind[]) => setDraft({ level, muted: fn(muted) });

  if (!org) return null;
  if (prefs.isPending) return <Skeleton className="h-64 w-full" />;
  if (prefs.isError)
    return (
      <p className="text-sm text-danger-fg">
        Couldn&apos;t load your alert settings. {prefs.error.message}
      </p>
    );

  const kinds = prefs.data.kinds;
  const dirty =
    !!saved &&
    (saved.email_level !== level || [...saved.email_muted_kinds].sort().join() !== [...muted].sort().join());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      { email_level: level, email_muted_kinds: muted },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success("Alert emails updated.");
        },
        onError: (err) => toast.error("Couldn't save", { description: err.message }),
      },
    );
  }

  return (
    <form onSubmit={submit}>
      <Section
        title="Email me about"
        description={`Alerts for ${org.name} always appear under the bell. Choose which ones also reach your inbox. Several alerts from one check arrive as one email.`}
      >
        <fieldset className="grid gap-2">
          <legend className="sr-only">Email level</legend>
          {LEVELS.map((l) => (
            <label
              key={l.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                level === l.value && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="email_level"
                value={l.value}
                checked={level === l.value}
                onChange={() => setLevel(l.value)}
                className="mt-1 accent-(--color-primary)"
              />
              <span>
                <span className="block text-sm font-medium text-fg">{l.label}</span>
                <span className="block text-xs text-fg-muted">{l.description}</span>
              </span>
            </label>
          ))}
          {saved?.is_default ? (
            <p className="text-xs text-fg-subtle">
              This is the default for your role ({org.role}). Owners and admins get warnings and critical alerts;
              members get none.
            </p>
          ) : null}
        </fieldset>
      </Section>

      <Section title="Alert types" description="Turn off email for kinds of alerts you don't need in your inbox.">
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {kinds.map((k) => {
            const id = `alert-kind-${k.kind}`;
            const on = !muted.includes(k.kind);
            return (
              <li key={k.kind} className="flex items-start gap-3 px-4 py-3">
                <Checkbox
                  id={id}
                  checked={on && level !== "none"}
                  disabled={level === "none"}
                  onCheckedChange={(v) =>
                    setMuted((m) => (v ? m.filter((x) => x !== k.kind) : [...m.filter((x) => x !== k.kind), k.kind]))
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <Label htmlFor={id} className="text-sm font-medium text-fg">
                    {k.label}
                  </Label>
                  <p className="text-xs text-fg-muted">{k.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Section>
    </form>
  );
}
