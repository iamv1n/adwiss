"use client";

import { AppearanceSettings } from "@/components/app/appearance-settings";
import { useActiveOrg, useMe } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{value}</dd>
    </div>
  );
}

export function GeneralSettings() {
  const { data } = useMe();
  const org = useActiveOrg();
  if (!data || !org) return null;

  return (
    <div>
      <Section title="Organization" description="The workspace you're viewing now. Switch it from the sidebar.">
        <dl className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
          <Row label="Name" value={org.name} />
          <Row label="Slug" value={<code className="font-mono text-xs">{org.slug}</code>} />
          <Row label="Your role" value={<span className="capitalize">{org.role}</span>} />
        </dl>
      </Section>
      <Section title="Profile" description="Your personal account.">
        <dl className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
          <Row label="Name" value={data.user.name} />
          <Row label="Email" value={data.user.email} />
          <Row label="Member since" value={formatDate(data.user.created_at)} />
        </dl>
      </Section>
      <Section title="Appearance" description="Color mode and brand color for this browser.">
        <AppearanceSettings />
      </Section>
    </div>
  );
}
