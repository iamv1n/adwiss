import { Brain, Database, GitBranch, Plug, Repeat, Zap, type LucideIcon } from "lucide-react";
import { Container, SectionHeader } from "./primitives";
import { Reveal } from "./reveal";

const STEPS: { icon: LucideIcon; title: string; body: string; detail: string }[] = [
  {
    icon: Plug,
    title: "Connect",
    body: "OAuth into Meta Business and Google Ads. Pick the accounts you want.",
    detail: "Read-only by default",
  },
  {
    icon: Database,
    title: "Ingest",
    body: "Performance data syncs hourly, down to campaign, ad, creative and hour of day.",
    detail: "Hourly sync",
  },
  {
    icon: Brain,
    title: "Analyze",
    body: "Breakdowns, period comparisons, heatmaps, anomalies and AI answers.",
    detail: "Campaign × day × hour",
  },
  {
    icon: GitBranch,
    title: "Decide",
    body: "Rules, schedules and AI suggestions are checked for conflicts and previewed.",
    detail: "Dry-run first",
  },
  {
    icon: Zap,
    title: "Execute",
    body: "Changes go out through provider APIs, and only when the state actually needs to change.",
    detail: "Idempotent actions",
  },
  {
    icon: Repeat,
    title: "Learn",
    body: "Every outcome is recorded and feeds the next analysis. Then the loop runs again.",
    detail: "Full audit history",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <SectionHeader
          id="how-title"
          eyebrow="How it works"
          title="A closed loop, from data to decision."
          description="Adwise runs the loop you already do by hand, only continuously, and keeps a record of every step."
        />

        <ol className="relative mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-3">
          {/* Connecting rail (desktop) */}
          <span
            aria-hidden="true"
            className="absolute top-6 right-[8%] left-[8%] hidden h-px bg-linear-to-r from-transparent via-border-strong to-transparent lg:block"
          />
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <Reveal delay={i * 0.07} className="flex h-full flex-col items-start gap-3 lg:items-center lg:text-center">
                <span className="relative grid size-12 place-items-center rounded-xl border border-border bg-surface text-primary shadow-sm">
                  <s.icon className="size-5" aria-hidden="true" />
                  <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-primary font-mono text-[0.625rem] font-semibold text-primary-fg">
                    {i + 1}
                  </span>
                </span>
                <h3 className="font-display text-base font-semibold text-fg">{s.title}</h3>
                <p className="text-sm leading-relaxed text-fg-muted">{s.body}</p>
                <p className="mt-auto rounded-full border border-border bg-bg-subtle px-2.5 py-0.5 font-mono text-[0.625rem] text-fg-subtle">
                  {s.detail}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="mx-auto mt-10 flex max-w-md items-center justify-center gap-2 text-xs text-fg-subtle">
          <Repeat className="size-3.5 text-primary" aria-hidden="true" />
          <span>Learn feeds back into Analyze, so each cycle starts with better data.</span>
        </Reveal>
      </Container>
    </section>
  );
}
