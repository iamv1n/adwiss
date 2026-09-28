import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Inbox, History, PenLine, Tag } from "lucide-react";
import { CampaignSplit } from "@/components/marketing/results/campaign-split";
import { LeadPipeline } from "@/components/marketing/results/lead-pipeline";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { Container, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Results & leads",
  description:
    "Track every lead from Meta lead forms through new, contacted, qualified, won and lost. See cost per lead, win rate and won value by campaign, so you fund the ads that bring customers, not just cheap leads.",
};

const ANSWERS = [
  ["Company size", "11–50"],
  ["Budget per month", "$2,000–$5,000"],
  ["Timeline", "This quarter"],
];

const AUDIT = [
  { time: "Today 14:02", text: "Stage changed contacted → qualified", who: "you" },
  { time: "Today 11:40", text: "Value set to $2,400", who: "you" },
  { time: "Yesterday 17:15", text: "Note added: “Wants a demo next week”", who: "you" },
  { time: "Yesterday 09:03", text: "Lead created from Meta lead form", who: "sync" },
];

export default function ResultsPage() {
  return (
    <>
      <PageHero
        eyebrow="Results & leads"
        title="Know which ads bring customers, not just leads."
        description="Leads from your Meta lead forms land in Adwise automatically, tied to the campaign, ad group and ad that produced them. Move them from new to won, and see cost per lead next to what actually closed."
      >
        <LeadPipeline />
      </PageHero>

      <section aria-labelledby="capture-title" className="py-20 sm:py-28">
        <Container>
          <SectionHeader
            id="capture-title"
            eyebrow="Capture"
            title="Every lead, with where it came from."
            description="Instant-form leads sync in on their own. Leads from calls, email or walk-ins can be added by hand, so the pipeline is the whole picture."
          />
          <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Reveal className="min-w-0">
              <article className="h-full rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-fg">Priya Sharma</h3>
                    <p className="truncate font-mono text-xs text-fg-subtle">priya@northwind.example</p>
                  </div>
                  <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[0.6875rem] font-medium text-warning-fg">
                    Qualified
                  </span>
                </header>
                <dl className="mt-5 grid grid-cols-1 gap-2 rounded-xl bg-bg-subtle p-3.5 text-xs sm:grid-cols-3">
                  {[
                    ["Campaign", "Lead gen · Demo request"],
                    ["Ad group", "US · Founders 25–44"],
                    ["Ad", "Carousel · 3 benefits"],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-fg-subtle">{k}</dt>
                      <dd className="truncate font-medium text-fg">{v}</dd>
                    </div>
                  ))}
                </dl>
                <h4 className="mt-5 text-xs font-medium text-fg-subtle">Form answers</h4>
                <dl className="mt-2 divide-y divide-border text-sm">
                  {ANSWERS.map(([q, a]) => (
                    <div key={q} className="flex justify-between gap-3 py-2">
                      <dt className="text-fg-muted">{q}</dt>
                      <dd className="text-right font-medium text-fg">{a}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-fg">
                    <Tag className="size-3 text-primary" aria-hidden="true" /> Value $2,400
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-fg-muted">
                    <PenLine className="size-3" aria-hidden="true" /> Wants a demo next week
                  </span>
                </div>
              </article>
            </Reveal>
            <div className="flex flex-col gap-4">
              {[
                {
                  icon: Inbox,
                  title: "Synced from lead forms",
                  body: "Connect a Meta ad account and instant-form submissions arrive with the email and every answer the person gave.",
                },
                {
                  icon: PenLine,
                  title: "Added by hand",
                  body: "Log a lead that came in another way. Tie it to a campaign or mark it organic so it doesn’t skew cost per lead.",
                },
                {
                  icon: Tag,
                  title: "Values and notes",
                  body: "Give each lead a value and keep notes and timestamps next to it, so won revenue is real revenue.",
                },
              ].map((c, i) => (
                <Reveal key={c.title} delay={0.08 * (i + 1)} className="flex-1">
                  <div className="flex h-full gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
                      <c.icon className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-fg">{c.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{c.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="split-title" className="border-y border-border bg-bg-subtle py-20 sm:py-28">
        <Container>
          <SectionHeader
            id="split-title"
            eyebrow="By campaign"
            title="Cheap leads aren’t always good leads."
            description="Split your results by campaign to see counts by stage, cost per lead, win rate and won value side by side. Then move budget toward the campaigns whose leads close."
          />
          <Reveal className="mt-12">
            <CampaignSplit />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="audit-title" className="py-20 sm:py-28">
        <Container className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <SectionHeader
            id="audit-title"
            align="left"
            eyebrow="History"
            title="Every change, on the record."
            description={
              <>
                Stage moves, value edits and notes are written to the audit log with who made them and when. Pair
                what closed with{" "}
                <Link href="/analytics" className="font-medium text-primary hover:underline">
                  spend analytics <ArrowRight className="inline size-3.5" aria-hidden="true" />
                </Link>
              </>
            }
          />
          <Reveal delay={0.1}>
            <ol className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              {AUDIT.map((a, i) => (
                <li key={a.time} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < AUDIT.length - 1 ? (
                    <span aria-hidden="true" className="absolute top-7 bottom-0 left-3.5 w-px bg-border" />
                  ) : null}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bg-subtle text-fg-muted">
                    <History className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm text-fg">{a.text}</p>
                    <p className="font-mono text-[0.6875rem] text-fg-subtle">
                      {a.time} · {a.who}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </Container>
      </section>

      <FinalCta />
    </>
  );
}
