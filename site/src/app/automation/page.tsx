import type { Metadata } from "next";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CircleDollarSign,
  FlaskConical,
  Hourglass,
  Layers,
  ListChecks,
  Pause,
  Play,
  Repeat,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { ActionLog } from "@/components/marketing/automation/action-log";
import { RuleDemo } from "@/components/marketing/automation/rule-demo";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { Container, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Automation rules",
  description:
    "Rules that watch spend, CPA, ROAS and more, then pause, activate or re-budget campaigns, ad groups and ads for you. Every rule starts in dry-run, and every change lands in the action log.",
};

const METRICS = ["Spend", "Conversions", "Revenue", "CPA", "ROAS", "CTR", "CPC", "CPM", "Impressions", "Clicks", "Frequency"];
const OPERATORS = [">", "≥", "<", "≤", "="];

const ACTIONS: { icon: LucideIcon; title: string; body: string; adLevel?: boolean }[] = [
  { icon: Pause, title: "Pause", body: "Stop a campaign, ad group or ad the moment it crosses your line.", adLevel: true },
  { icon: Play, title: "Activate", body: "Bring something back when the numbers recover.", adLevel: true },
  { icon: ArrowUpRight, title: "Increase budget", body: "Scale winners by a percentage, up to +200% per change." },
  { icon: ArrowDownRight, title: "Decrease budget", body: "Trim spend on campaigns that are getting expensive." },
  { icon: CircleDollarSign, title: "Set budget", body: "Put the daily budget at a fixed amount." },
  { icon: Bell, title: "Notify", body: "Just tell you, and leave the campaign alone.", adLevel: true },
];

const GUARDRAILS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FlaskConical, title: "Dry-run first", body: "Every new rule records what it would do and never touches the ad platform until you switch it live." },
  { icon: Hourglass, title: "Cooldowns", body: "Set how many minutes a rule waits before it can change the same thing again." },
  { icon: ListChecks, title: "Max changes per run", body: "Cap how much a single run can touch, so a bad threshold can’t sweep the account." },
  { icon: Repeat, title: "No double changes", body: "The same change is never applied twice in the same time slot." },
  { icon: ShieldCheck, title: "Schedules win", body: "If a dayparting schedule and a rule touch the same thing in the same hour, the schedule wins and the rule’s change is logged as skipped, with the reason." },
  { icon: Timer, title: "Checked every 5 minutes", body: "The scheduler checks every 5 minutes, and each rule runs on its own interval." },
];

export default function AutomationPage() {
  return (
    <>
      <PageHero
        eyebrow="Automation rules"
        title="Rules that guard your budget while you’re not looking."
        description="Tell Adwise what bad spend and good spend look like. It checks your numbers on a schedule, pauses what’s bleeding, scales what’s working, and shows you exactly what it did."
      >
        <RuleDemo />
      </PageHero>

      <section aria-labelledby="conditions-title" className="py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="conditions-title"
            eyebrow="Conditions"
            title="Write the rule the way you’d say it."
            description="Pick a level and a scope, stack conditions that must all match, and choose how many days to look back."
          />
          <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Reveal className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <Layers className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-base font-semibold text-fg">Level and scope</h3>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">Run at campaign, ad group or ad level, across the whole workspace, one ad account, or campaigns you pick.</p>
              <div className="mt-5 space-y-2 text-xs">
                {[
                  ["Level", ["Campaign", "Ad group", "Ad"]],
                  ["Scope", ["Workspace", "Ad account", "Selected"]],
                ].map(([label, opts]) => (
                  <div key={label as string} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-12 text-fg-subtle">{label}</span>
                    {(opts as string[]).map((o, i) => (
                      <span key={o} className={i === 0 ? "rounded-md bg-accent px-2 py-0.5 font-medium text-accent-fg" : "rounded-md border border-border px-2 py-0.5 text-fg-muted"}>
                        {o}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.05} className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <ListChecks className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-base font-semibold text-fg">Eleven metrics</h3>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">Compare against a fixed number with the operators you’d expect.</p>
              <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Metrics">
                {METRICS.map((m) => (
                  <li key={m} className="rounded-md border border-border bg-bg-subtle px-2 py-0.5 text-xs text-fg">{m}</li>
                ))}
              </ul>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Operators">
                {OPERATORS.map((o) => (
                  <li key={o} className="grid size-7 place-items-center rounded-md bg-accent font-mono text-xs text-accent-fg">{o}</li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.1} className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <ArrowUpRight className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-base font-semibold text-fg">Trends, not just thresholds</h3>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">Catch a metric that moved more than X% up or down versus the previous period of equal length.</p>
              <div className="mt-5 rounded-lg border border-border bg-bg-subtle p-3 text-xs">
                <p className="text-fg"><span className="font-medium">CPA</span> <span className="font-mono text-fg-muted">changed by more than</span> <span className="font-mono">30% up</span></p>
                <div className="mt-3 flex items-end gap-3" aria-hidden="true">
                  <div className="flex-1">
                    <div className="h-8 rounded-sm bg-chart-2/40" />
                    <p className="mt-1 text-fg-subtle">Prev. 7d · $21.40</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-12 rounded-sm bg-danger/60" />
                    <p className="mt-1 text-fg-subtle">Last 7d · $31.10</p>
                  </div>
                </div>
                <p className="mt-2 font-mono text-danger-fg">+45% · matches</p>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      <section aria-labelledby="actions-title" className="border-y border-border bg-bg-subtle py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="actions-title"
            eyebrow="Actions"
            title="Then do something about it."
            description="Pause, activate, move budgets or just get a heads-up. Ad-level rules stick to pause, activate and notify."
          />
          <ul className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ACTIONS.map((a, i) => (
              <li key={a.title}>
                <Reveal delay={i * 0.04} className="flex h-full gap-3 rounded-xl border border-border bg-surface p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
                    <a.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                      {a.title}
                      {a.adLevel ? <span className="rounded-full bg-bg-subtle px-1.5 py-px text-[0.625rem] font-medium text-fg-subtle">all levels</span> : null}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">{a.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="guardrails-title" className="py-24 sm:py-32">
        <Container>
          <SectionHeader
            id="guardrails-title"
            eyebrow="Guardrails"
            title="Built so a bad threshold can’t burn your account."
            description="Rules earn trust in dry-run, then run with limits you set."
          />
          <ul className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GUARDRAILS.map((g, i) => (
              <li key={g.title}>
                <Reveal delay={i * 0.04} className="h-full rounded-xl border border-border bg-surface p-5">
                  <g.icon className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold text-fg">{g.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{g.body}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="log-title" className="border-y border-border bg-bg-subtle py-24 sm:py-32">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <SectionHeader
              id="log-title"
              align="left"
              eyebrow="Action log"
              title="Every change, with the before and after."
              description="Each rule shows its last run, next run, matches and changes, in total and for the last 7 days. Every change it makes, or would make, lands in the action log with status and daily budget before and after, the reason, and where it came from."
            />
          </div>
          <Reveal delay={0.1} className="min-w-0">
            <ActionLog />
          </Reveal>
        </Container>
      </section>

      <div className="pt-24 sm:pt-32">
        <FinalCta />
      </div>
    </>
  );
}
