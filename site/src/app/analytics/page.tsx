import type { Metadata } from "next";
import { ArrowRight, CalendarClock, GitCompareArrows, RefreshCw, Workflow } from "lucide-react";
import { Breakdowns } from "@/components/marketing/analytics/breakdowns";
import { PerformanceChart } from "@/components/marketing/analytics/performance-chart";
import { WastedSpend } from "@/components/marketing/analytics/wasted-spend";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { Container, CtaLink, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Analytics",
  description:
    "See spend, CTR, CPC, CPA, revenue and ROAS for any date range, compared with the previous period. Break results down by country, device, placement and hour of day, and find campaigns, ad groups and ads spending without results.",
};

const METRICS = ["Spend", "Impressions", "Clicks", "CTR", "CPC", "CPM", "Conversions", "CPA", "Revenue", "ROAS", "Frequency"];

const FACTS = [
  {
    icon: GitCompareArrows,
    title: "Compared by default",
    body: "Every range is measured against the previous period of the same length, so a good week looks good for the right reasons.",
  },
  {
    icon: Workflow,
    title: "Campaign, ad group or ad",
    body: "Totals up top, then drill into the level you manage. The same metrics hold at every level.",
  },
  {
    icon: RefreshCw,
    title: "Daily and hourly data",
    body: "Synced from your connected Meta Ads and Google Ads accounts, so hour-level questions have hour-level answers.",
  },
];

export default function AnalyticsPage() {
  return (
    <>
      <PageHero
        eyebrow="Analytics"
        title="See where your ad spend earns, and where it leaks."
        description="Pick any date range and Adwise shows spend, conversions, CPA, revenue and ROAS for your campaigns, ad groups and ads, next to the previous period so you know what actually changed."
      >
        <PerformanceChart />
      </PageHero>

      <section aria-labelledby="metrics-title" className="py-20 sm:py-28">
        <Container>
          <SectionHeader
            id="metrics-title"
            eyebrow="Performance"
            title="Every number that decides a budget."
            description="One view of the metrics you check every morning, across every level of every account."
          />
          <Reveal className="mt-10">
            <ul className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
              {METRICS.map((m) => (
                <li key={m} className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-fg shadow-xs">
                  {m}
                </li>
              ))}
            </ul>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            {FACTS.map((f, i) => (
              <Reveal key={f.title} delay={0.08 * i}>
                <article className="h-full rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
                    <f.icon className="size-4" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-fg">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{f.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="breakdowns-title" className="border-y border-border bg-bg-subtle py-20 sm:py-28">
        <Container>
          <SectionHeader
            id="breakdowns-title"
            eyebrow="Breakdowns"
            title="Averages hide the waste."
            description="Split results by country, device, placement and hour of day. The segment dragging your ROAS down is usually obvious once it has its own row."
          />
          <Reveal className="mt-12">
            <Breakdowns />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="waste-title" className="py-20 sm:py-28">
        <Container className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <SectionHeader
              id="waste-title"
              align="left"
              eyebrow="Wasted spend"
              title="Find the money that bought nothing."
              description="The wasted-spend finder flags campaigns, ad groups and ads that keep spending without results, ranked by how much they cost you."
            />
          </div>
          <Reveal delay={0.1} className="min-w-0">
            <WastedSpend />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="act-title" className="pb-20 sm:pb-28">
        <Container>
          <SectionHeader
            id="act-title"
            eyebrow="Then act"
            title="Turn what you found into a fix."
            description="Analytics feeds straight into the tools that change spend."
          />
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Reveal>
              <article className="flex h-full flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <CalendarClock className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold text-fg">Build a dayparting schedule</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-fg-muted">
                  The hour-of-day breakdown becomes a heatmap. Pause the hours that lose money and keep the ones that pay.
                </p>
                <CtaLink href="/#dayparting" variant="secondary" className="mt-5 self-start">
                  See dayparting <ArrowRight aria-hidden="true" />
                </CtaLink>
              </article>
            </Reveal>
            <Reveal delay={0.08}>
              <article className="flex h-full flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <Workflow className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold text-fg">Create an automation rule</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-fg-muted">
                  Found an ad group that spends without converting? Write a rule so the next one gets caught for you.
                </p>
                <CtaLink href="/automation" variant="secondary" className="mt-5 self-start">
                  See automation <ArrowRight aria-hidden="true" />
                </CtaLink>
              </article>
            </Reveal>
          </div>
        </Container>
      </section>

      <FinalCta />
    </>
  );
}
