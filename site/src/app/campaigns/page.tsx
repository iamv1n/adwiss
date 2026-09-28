import type { Metadata } from "next";
import { FolderTree, History, PencilLine, Plus, type LucideIcon } from "lucide-react";
import { BudgetEditor } from "@/components/marketing/campaigns/budget-editor";
import { CampaignsDemo } from "@/components/marketing/campaigns/campaigns-demo";
import { DayGrid } from "@/components/marketing/campaigns/day-grid";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { Container, Provider, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Campaigns and spend",
  description:
    "See spend and results for every campaign, ad group and ad in one place, change status, budgets, spend caps and bids without leaving Adwise, and schedule budgets hour by hour.",
};

const EDITS: { level: string; fields: string[] }[] = [
  { level: "Campaign", fields: ["Name", "Status: active / paused / archive", "Daily budget", "Spend cap"] },
  { level: "Ad group", fields: ["Status", "Daily budget", "Bid amount"] },
  { level: "Ad", fields: ["Status", "Name"] },
];

const HISTORY = [
  { who: "Maya R.", what: "Daily budget $250 → $320", target: "Retargeting · 14d", time: "16:12" },
  { who: "Dev K.", what: "Paused", target: "Lookalike 2% · Video", time: "14:40" },
  { who: "Maya R.", what: "Bid $1.80 → $2.10", target: "Search · Generic / Shoes", time: "11:03" },
  { who: "Dev K.", what: "Created ad", target: "Prospecting · Broad US / UGC v3", time: "09:26" },
];

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FolderTree, title: "Every level", body: "Drill from campaign to ad group to ad, with spend and results at each step." },
  { icon: PencilLine, title: "Edit in place", body: "Change status, budgets, spend caps, bids and names without switching tabs." },
  { icon: Plus, title: "Create, too", body: "Launch new campaigns, ad groups and ads from the same screen." },
  { icon: History, title: "Nothing silent", body: "Every manual change records who made it and shows up in the action log." },
];

export default function CampaignsPage() {
  return (
    <>
      <PageHero
        eyebrow="Campaigns & spend"
        title="Know where every dollar is going. Move it in a click."
        description="Spend, pacing and results for every campaign, ad group and ad across your ad accounts, with the controls to pause, re-budget and create right next to the numbers."
      >
        <CampaignsDemo />
      </PageHero>

      <section aria-labelledby="overview-title" className="py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="overview-title"
            eyebrow="One view"
            title="All your spend, one table."
            description={
              <>
                Campaigns from <Provider name="Meta" /> and <Provider name="Google" /> accounts sit side by side, so you
                compare results instead of dashboards.
              </>
            }
          />
          <ul className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p, i) => (
              <li key={p.title}>
                <Reveal delay={i * 0.05} className="h-full rounded-xl border border-border bg-surface p-5">
                  <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
                    <p.icon className="size-4" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-fg">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{p.body}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="edit-title" className="border-y border-border bg-bg-subtle py-24 sm:py-32">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeader
              id="edit-title"
              align="left"
              eyebrow="Edit"
              title="Budgets, bids and status, where you see the numbers."
              description="Spot a campaign running hot and fix it on the spot."
            />
            <dl className="mt-8 space-y-4">
              {EDITS.map((e) => (
                <Reveal key={e.level} className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
                  <dt className="w-20 shrink-0 text-sm font-semibold text-fg">{e.level}</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {e.fields.map((f) => (
                      <span key={f} className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-fg-muted">{f}</span>
                    ))}
                  </dd>
                </Reveal>
              ))}
            </dl>
          </div>
          <Reveal delay={0.1} className="mx-auto w-full max-w-sm">
            <BudgetEditor />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="history-title" className="py-24 sm:py-32">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Reveal className="order-2 min-w-0 lg:order-1">
            <ol aria-label="Example manual change history" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              {HISTORY.map((h) => (
                <li key={h.time} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-3 text-xs">
                  <span className="grid size-7 place-items-center rounded-full bg-accent font-medium text-accent-fg">
                    {h.who.split(" ").map((s) => s[0]).join("")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-fg"><span className="font-medium">{h.what}</span><span className="text-fg-subtle"> · </span>{h.target}</p>
                    <p className="truncate text-fg-subtle">{h.who} · manual · {h.time}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
          <div className="order-1 lg:order-2">
            <SectionHeader
              id="history-title"
              align="left"
              eyebrow="Accountability"
              title="Know who changed what."
              description="Every manual edit is recorded with who made it, next to the changes your schedules and rules make, in one action log."
            />
          </div>
        </Container>
      </section>

      <section aria-labelledby="daypart-title" className="border-y border-border bg-bg-subtle py-24 sm:py-32">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <SectionHeader
            id="daypart-title"
            align="left"
            eyebrow="Dayparting"
            title="Spend more in the hours that convert."
            description="Paint a weekly 7×24 grid: each hour off, on, or with a budget multiplier from 0.1× to 5×. It follows the account’s timezone by default."
          />
          <Reveal delay={0.1} className="min-w-0">
            <DayGrid />
          </Reveal>
        </Container>
      </section>

      <div className="pt-24 sm:pt-32">
        <FinalCta />
      </div>
    </>
  );
}
