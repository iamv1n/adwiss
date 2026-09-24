import { FlaskConical, Fingerprint, ScrollText, UserCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SecurityIllustration } from "./illustrations/security-on";
import { Container, SectionHeader, WindowFrame } from "./primitives";
import { Reveal } from "./reveal";

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FlaskConical,
    title: "Dry-run everything",
    body: "Every rule and schedule shows exactly which campaigns it would touch, and how, before you turn it on.",
  },
  {
    icon: Fingerprint,
    title: "Idempotent actions",
    body: "Desired state is compared with current state first. If a campaign is already paused, nothing is sent.",
  },
  {
    icon: UserCheck,
    title: "Human approval",
    body: "AI suggestions never mutate on their own. Someone on your team approves, and their name is recorded.",
  },
  {
    icon: ScrollText,
    title: "Complete audit log",
    body: "Trigger, actor, before/after state and provider response for every action, kept and searchable.",
  },
];

type Tone = "success" | "warning" | "muted" | "primary";

const LOG: { time: string; actor: string; action: string; target: string; result: string; tone: Tone }[] = [
  { time: "22:00:04", actor: "Schedule · Night pause", action: "Pause", target: "Late-night · Advantage+", result: "Applied", tone: "success" },
  { time: "22:00:04", actor: "Schedule · Night pause", action: "Pause", target: "Retargeting · 30d", result: "Skipped: already paused", tone: "muted" },
  { time: "18:00:02", actor: "Rule · Evening boost", action: "Budget ₹8,000 → ₹9,600", target: "Prospecting · Broad · IN", result: "Applied", tone: "success" },
  { time: "14:31:10", actor: "Priya S. approved AI", action: "Pause", target: "Lookalike 3% · Video", result: "Applied", tone: "primary" },
  { time: "11:05:48", actor: "Rule · ROAS guard", action: "Budget −20%", target: "PMax · Catalog", result: "Blocked: conflicts with schedule", tone: "warning" },
];

const TONE: Record<Tone, string> = {
  success: "bg-success-subtle text-success-fg",
  warning: "bg-warning-subtle text-warning-fg",
  muted: "bg-bg-subtle text-fg-subtle",
  primary: "bg-accent text-accent-fg",
};

export function Safety() {
  return (
    <section id="safety" aria-labelledby="safety-title" className="scroll-mt-20 border-y border-border bg-bg-subtle py-24 sm:py-32">
      <Container>
        <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-[1fr_auto]">
          <SectionHeader
            id="safety-title"
            align="left"
            eyebrow="Safety & control"
            title="Automation you can explain afterwards."
            description="Adwise checks targets, provider capabilities, current state and conflicts before it changes anything, and then records what it did."
          />
          <SecurityIllustration className="hidden h-36 w-auto lg:block" />
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {PILLARS.map((p, i) => (
              <li key={p.title}>
                <Reveal delay={i * 0.05} className="flex h-full gap-3 rounded-xl border border-border bg-surface p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
                    <p.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-fg">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">{p.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>

          <Reveal delay={0.1} className="min-w-0">
            <WindowFrame title="Audit log · Today" className="flex h-full flex-col">
              <ol aria-label="Example audit log entries" className="divide-y divide-border">
                {LOG.map((e, i) => (
                  <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-4 py-3 text-xs sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <time className="font-mono text-fg-subtle tabular-nums">{e.time}</time>
                    <div className="min-w-0">
                      <p className="truncate text-fg">
                        <span className="font-medium">{e.action}</span>
                        <span className="text-fg-subtle"> · </span>
                        {e.target}
                      </p>
                      <p className="truncate text-fg-subtle">{e.actor}</p>
                    </div>
                    <span className={cn("col-start-2 justify-self-start rounded-full px-2 py-0.5 text-[0.6875rem] font-medium sm:col-start-3 sm:justify-self-end", TONE[e.tone])}>
                      {e.result}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-auto flex items-center justify-between border-t border-border bg-bg-subtle px-4 py-2.5 text-[0.6875rem] text-fg-subtle">
                <span>Showing 5 of 1,284 events</span>
                <span className="hidden font-mono sm:inline">before/after · actor · provider response</span>
              </p>
            </WindowFrame>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
