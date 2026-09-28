import type { Metadata } from "next";
import Link from "next/link";
import { Clock, FlaskConical, Globe, Power, Repeat, ScrollText, ShieldCheck, type LucideIcon } from "lucide-react";
import { HeroSchedule } from "@/components/marketing/dayparting-page/hero-schedule";
import { HourlyTimeline } from "@/components/marketing/dayparting-page/hourly-timeline";
import { PerformanceHeatmap } from "@/components/marketing/dayparting-page/performance-heatmap";
import { SchedulePainter } from "@/components/marketing/dayparting-page/schedule-painter";
import { SpendVsConversions } from "@/components/marketing/dayparting-page/spend-vs-conversions";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { Container, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Dayparting",
  description:
    "See which hours and days actually convert, then paint a weekly schedule that pauses, resumes and re-budgets Meta Ads and Google Ads campaigns or ad groups hour by hour. Starts in dry-run.",
};

const link = "font-medium text-primary underline-offset-4 hover:underline";

const SAFETY: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FlaskConical, title: "Dry-run first", body: "A new schedule records what it would do and never touches the ad platform until you switch it live." },
  { icon: Power, title: "On and off anytime", body: "Enable or disable a schedule whenever you like. Disabled schedules make no changes." },
  { icon: Clock, title: "Checked every 5 minutes", body: "The scheduler checks every 5 minutes, so an hour’s change lands close to the top of the hour." },
  { icon: Globe, title: "The right timezone", body: "Hours follow each ad account’s own timezone by default, or a timezone you choose." },
  { icon: ShieldCheck, title: "Schedules win", body: "If an automation rule touches the same campaign in the same hour, the schedule wins and the rule’s change is logged as skipped." },
  { icon: Repeat, title: "Never applied twice", body: "Changes are idempotent: an hour’s change is applied once, even if the check runs again." },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What can a schedule control?",
    a: "Campaigns or ad groups on your connected Meta Ads and Google Ads accounts. Each hour of the week is off (paused), on, or a budget multiplier from 0.1× to 5×.",
  },
  {
    q: "Where does the heatmap data come from?",
    a: (
      <>
        From the hourly performance Adwise syncs from your ad accounts, the same data behind{" "}
        <Link href="/analytics" className={link}>analytics</Link>.
      </>
    ),
  },
  {
    q: "Will it change anything the moment I save?",
    a: "No. Every schedule starts in dry-run and only records what it would have done. Check the action log, then switch it live when you’re happy.",
  },
  {
    q: "What if I also have automation rules?",
    a: (
      <>
        They work together. If a <Link href="/automation" className={link}>rule</Link> and a schedule touch the same campaign in
        the same hour, the schedule wins and the rule’s change is logged as skipped.
      </>
    ),
  },
  {
    q: "Which timezone are the hours in?",
    a: "Each ad account’s own timezone by default. You can pick a different one per schedule.",
  },
];

export default function DaypartingPage() {
  return (
    <>
      <PageHero
        eyebrow="Dayparting"
        title="Spend when your customers buy. Pause when they sleep."
        description="Adwise shows which hours and days actually convert, then runs a weekly schedule that pauses, resumes and re-budgets your campaigns hour by hour, on Meta Ads and Google Ads."
      >
        <HeroSchedule />
      </PageHero>

      <section aria-labelledby="problem-title" className="py-24 sm:py-32">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <SectionHeader
            id="problem-title"
            align="left"
            eyebrow="The problem"
            title="Your budget runs all night. Your customers don’t."
            description="Ad platforms pace a daily budget across all 24 hours, but conversions bunch up in a few windows. Every dollar spent at 3 a.m. is a dollar missing at 8 p.m."
          />
          <Reveal delay={0.1} className="min-w-0">
            <SpendVsConversions />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="find-title" className="border-y border-border bg-bg-subtle py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="find-title"
            eyebrow="Find your hours"
            title="Hour of day × day of week, from your own data."
            description={
              <>
                A 7×24 heatmap built from your synced hourly performance. Switch between ROAS, CPA and conversions to see
                where money works and where it leaks. Want the bigger picture? See{" "}
                <Link href="/analytics" className={link}>analytics</Link>.
              </>
            }
          />
          <Reveal delay={0.1} className="mx-auto mt-14 max-w-4xl">
            <PerformanceHeatmap />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="paint-title" className="py-24 sm:py-32">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <SectionHeader
            id="paint-title"
            align="left"
            eyebrow="Paint the schedule"
            title="168 hours. Paint each one."
            description="Pick campaigns or ad groups, then brush across the week. Each cell is off (paused), on, or a budget multiplier from 0.1× to 5×: lean into your best evenings, trim slow mornings, switch off the dead of night."
          />
          <Reveal delay={0.1} className="min-w-0">
            <SchedulePainter />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="hourly-title" className="border-y border-border bg-bg-subtle py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="hourly-title"
            eyebrow="Every hour"
            title="Each hour, the schedule does its job, and writes it down."
            description="When an hour starts, Adwise applies that cell to your targets. Every change lands in the action log with the status and daily budget before and after."
          />
          <Reveal delay={0.1} className="mt-14">
            <HourlyTimeline />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="safety-title" className="py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="safety-title"
            eyebrow="Safety"
            title="Built to be trusted with your budget."
            description="Try it risk-free, keep full control, and see every change it makes."
          />
          <ul className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SAFETY.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 0.04} className="h-full rounded-xl border border-border bg-surface p-5">
                  <s.icon className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold text-fg">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{s.body}</p>
                </Reveal>
              </li>
            ))}
            <li className="sm:col-span-2 lg:col-span-3">
              <Reveal className="flex h-full gap-3 rounded-xl border border-border bg-bg-subtle p-5">
                <ScrollText className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-fg-muted">
                  <span className="font-semibold text-fg">Every change in the action log.</span> Dry-run or live, from a schedule
                  or an <Link href="/automation" className={link}>automation rule</Link>, it’s all recorded in one place.
                </p>
              </Reveal>
            </li>
          </ul>
        </Container>
      </section>

      <section aria-labelledby="faq-title" className="border-t border-border bg-bg-subtle py-24 sm:py-32">
        <Container className="max-w-3xl">
          <SectionHeader id="faq-title" eyebrow="FAQ" title="Dayparting questions" />
          <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-surface">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-fg outline-none focus-visible:text-primary [&::-webkit-details-marker]:hidden sm:text-base">
                  {f.q}
                  <span aria-hidden="true" className="text-lg leading-none text-fg-subtle transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      <div className="pt-24 sm:pt-32">
        <FinalCta />
      </div>
    </>
  );
}
