import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, FlaskConical, Globe, Layers, ScrollText, Wallet, type LucideIcon } from "lucide-react";
import { CurveCards } from "@/components/marketing/budget-planner/curve-cards";
import { DeliveryReport } from "@/components/marketing/budget-planner/delivery-report";
import { HeroPlan } from "@/components/marketing/budget-planner/hero-plan";
import { ReallocationFlow } from "@/components/marketing/budget-planner/reallocation-flow";
import { RepacingChart } from "@/components/marketing/budget-planner/repacing-chart";
import { SplitTable } from "@/components/marketing/budget-planner/split-table";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { Container, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Budget planner",
  description:
    "Set one budget for the month. Adwise paces it day by day, splits it across campaigns, moves unused budget to what’s working and reports delivery. Starts in dry-run.",
};

const link = "font-medium text-primary underline-offset-4 hover:underline";

const SAFETY: { icon: LucideIcon; title: string; body: React.ReactNode }[] = [
  { icon: FlaskConical, title: "Dry-run first", body: "A new plan records the budget changes it would make and never touches the ad platform until you switch it live." },
  {
    icon: CalendarClock,
    title: "Works with dayparting",
    body: (
      <>
        If a campaign is also on a <Link href="/dayparting" className={link}>dayparting</Link> schedule, the plan sets its base
        budget and the schedule applies its hourly multipliers on top.
      </>
    ),
  },
  { icon: Globe, title: "Once a day, on local time", body: "The plan re-paces once per day, just after midnight in the ad account’s timezone, or whenever you hit Run now." },
  { icon: Wallet, title: "Campaign daily budgets", body: "Plans work with campaigns that have a campaign-level daily budget, in one currency per plan." },
  { icon: Layers, title: "One plan per campaign", body: "A campaign can belong to only one enabled plan at a time, so plans never fight each other." },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What happens if a campaign overspends one day?",
    a: "The next day’s run re-paces: the remaining budget is spread over the days left, so the plan lands close to your total instead of drifting.",
  },
  {
    q: "How long can a plan run?",
    a: "Any period up to 92 days: this month, the next 7 days, or a custom range such as a sale week.",
  },
  {
    q: "Will it change anything the moment I save?",
    a: "No. Every plan starts in dry-run and only records what it would have set. Check the action log, then switch it live.",
  },
  {
    q: "Which budgets can it manage?",
    a: "Campaign-level daily budgets on your connected Meta Ads and Google Ads accounts. Ad set, ad group and lifetime budgets aren’t managed by plans.",
  },
];

export default function BudgetPlannerPage() {
  return (
    <>
      <PageHero
        eyebrow="Budget planner"
        title="Set one budget. Adwise spends it on plan."
        description="Tell Adwise what you want to spend this month. It paces the total day by day, splits it across your campaigns, moves unused budget to what’s working, and shows how much of the plan was delivered."
      >
        <HeroPlan />
      </PageHero>

      <section aria-labelledby="pace-title" className="py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="pace-title"
            eyebrow="One number, paced for you"
            title="Pick a curve. Adwise does the daily math."
            description="Spread the total evenly, front-load it for a launch, or back-load it toward a deadline. You can also edit any single day."
          />
          <Reveal delay={0.1} className="mx-auto mt-14 max-w-4xl">
            <CurveCards />
          </Reveal>
          <div className="mt-16 grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <SectionHeader
              id="repace-title"
              align="left"
              eyebrow="Re-paced daily"
              title="Over or under, it corrects itself."
              description="Every day, the plan takes what’s left of the total and spreads it over the remaining days. Spend ran hot? Tomorrow’s budgets ease off. Came in light? They step up."
            />
            <Reveal delay={0.1} className="min-w-0">
              <RepacingChart />
            </Reveal>
          </div>
        </Container>
      </section>

      <section aria-labelledby="split-title" className="border-y border-border bg-bg-subtle py-24 sm:py-32">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <SectionHeader
            id="split-title"
            align="left"
            eyebrow="Split across campaigns"
            title="Each campaign gets its share, and never less than its floor."
            description="Auto-fill the percentage split from past spend or ROAS, then adjust by hand. Set a daily minimum per campaign; if a share falls below it, the difference comes proportionally from the others."
          />
          <Reveal delay={0.1} className="min-w-0">
            <SplitTable />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="realloc-title" className="py-24 sm:py-32">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <SectionHeader
            id="realloc-title"
            align="left"
            eyebrow="Unused budget moves"
            title="Money left on the table goes where it’s working."
            description="If a campaign spent under 70% of its budget yesterday, its unspent amount moves to campaigns that hit their cap, weighted by 7-day ROAS. It never drops a campaign below its minimum, and the reason is logged."
          />
          <Reveal delay={0.1} className="min-w-0">
            <ReallocationFlow />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="delivery-title" className="border-y border-border bg-bg-subtle py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="delivery-title"
            eyebrow="Delivery you can trust"
            title="See how much of the plan actually got spent."
            description={
              <>
                Planned vs spent, day by day, with every budget change in the{" "}
                <Link href="/automation" className={link}>action log</Link> under the source “Budget plan”.
              </>
            }
          />
          <Reveal delay={0.1} className="mx-auto mt-14 max-w-4xl">
            <DeliveryReport />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="safety-title" className="py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="safety-title"
            eyebrow="Safe by default"
            title="Built to be trusted with your budget."
            description="Try a plan risk-free, keep full control, and see every change it makes."
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
            <li>
              <Reveal delay={0.2} className="flex h-full gap-3 rounded-xl border border-border bg-bg-subtle p-5">
                <ScrollText className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-fg-muted">
                  <span className="font-semibold text-fg">Every change in the action log.</span> Dry-run or live, each budget the
                  plan sets is recorded with its reason.
                </p>
              </Reveal>
            </li>
          </ul>
        </Container>
      </section>

      <section aria-labelledby="faq-title" className="border-t border-border bg-bg-subtle py-24 sm:py-32">
        <Container className="max-w-3xl">
          <SectionHeader id="faq-title" eyebrow="FAQ" title="Budget planner questions" />
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
