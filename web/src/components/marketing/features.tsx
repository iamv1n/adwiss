import {
  Bot,
  BellRing,
  Clock,
  Flame,
  Gauge,
  Image as ImageIcon,
  Search,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HEAT_BG, heatLevels } from "./heatmap-data";
import { Container, SectionHeader } from "./primitives";
import { Reveal } from "./reveal";

function WasteVisual() {
  const rows = [
    ["Late-night · Adv+", 88, "0 conv"],
    ["Generic · Broad", 66, "0.6×"],
    ["Lookalike 3%", 46, "0.3×"],
  ] as const;
  return (
    <ul className="flex h-full flex-col justify-center gap-2 text-[0.625rem]" aria-hidden="true">
      {rows.map(([name, w, tag]) => (
        <li key={name} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
          <span className="truncate text-fg-muted">{name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-bg-subtle">
            <span className="block h-full rounded-full bg-danger/70" style={{ width: `${w}%` }} />
          </span>
          <span className="font-mono font-medium text-danger-fg">{tag}</span>
        </li>
      ))}
    </ul>
  );
}

function DaypartingVisual() {
  const levels = heatLevels("roas");
  const hours = [6, 8, 10, 12, 14, 16, 18, 19, 20, 21, 22, 23];
  return (
    <div className="grid h-full grid-rows-7 gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
        <div key={d} className="grid grid-cols-12 gap-0.5">
          {hours.map((h) => (
            <div key={h} className={cn("rounded-[2px]", HEAT_BG[levels[d * 24 + h]])} />
          ))}
        </div>
      ))}
    </div>
  );
}

function BudgetVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 text-[0.625rem]" aria-hidden="true">
      <div className="flex items-baseline justify-between">
        <span className="text-fg-muted">PMax · Catalog</span>
        <span className="font-mono font-medium text-warning-fg">92% by 15:00</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-bg-subtle">
        <span className="absolute inset-y-0 left-0 w-[92%] rounded-full bg-warning/70" />
        <span className="absolute -top-1 -bottom-1 left-[62.5%] w-px bg-fg/40" />
      </div>
      <div className="flex justify-between font-mono text-[0.5625rem] text-fg-subtle">
        <span>00:00</span>
        <span>now 15:00</span>
        <span>24:00</span>
      </div>
      <p className="text-fg-muted">Out by ~16:00, before the 19:00 peak.</p>
    </div>
  );
}

function AlertsVisual() {
  const pts = [34, 38, 33, 40, 36, 42, 39, 12, 35, 41];
  const step = 100 / (pts.length - 1);
  const y = (v: number) => 100 - v * 1.8;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const ax = 7 * step;
  return (
    <div className="relative h-full" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <rect x="0" y={y(44)} width="100" height={y(30) - y(44)} className="fill-primary/10" />
        <path
          d={d}
          fill="none"
          className="stroke-chart-1"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger ring-4 ring-danger/20"
        style={{ left: `${ax}%`, top: `${y(12)}%` }}
      />
      <span className="absolute top-0 right-0 rounded-md bg-danger-subtle px-1.5 py-0.5 font-mono text-[0.625rem] font-medium text-danger-fg">
        conversions −62%
      </span>
      <span className="absolute bottom-0 left-0 font-mono text-[0.5625rem] text-fg-subtle">expected band</span>
    </div>
  );
}

function CreativeVisual() {
  const items = [
    ["bg-chart-1/70", 92, "4.1×"],
    ["bg-chart-2/70", 64, "2.8×"],
    ["bg-chart-3/70", 38, "1.6×"],
    ["bg-chart-4/60", 14, "0.4×"],
  ] as const;
  return (
    <div className="grid h-full grid-cols-4 items-end gap-2" aria-hidden="true">
      {items.map(([tone, w, roas], i) => (
        <div key={i} className="flex flex-col gap-1">
          <span className={cn("aspect-[4/5] rounded-md", tone)} />
          <span className="h-1 overflow-hidden rounded-full bg-bg-subtle">
            <span className="block h-full rounded-full bg-fg/60" style={{ width: `${w}%` }} />
          </span>
          <span className={cn("text-center font-mono text-[0.5625rem]", i === 3 ? "text-danger-fg" : "text-fg-muted")}>
            {roas}
          </span>
        </div>
      ))}
    </div>
  );
}

function SearchTermsVisual() {
  const rows = [
    ["free shipping", "₹6,200", "0"],
    ["saffron jobs", "₹2,450", "0"],
    ["king bedsheet", "₹3,900", "14"],
  ] as const;
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5 font-mono text-[0.625rem]" aria-hidden="true">
      {rows.map(([term, spend, conv]) => (
        <li key={term} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1">
          <span className="truncate text-fg">{term}</span>
          <span className="ml-auto text-fg-muted">{spend}</span>
          <span className={cn("w-5 text-right", conv === "0" ? "text-danger-fg" : "text-success-fg")}>{conv}</span>
        </li>
      ))}
    </ul>
  );
}

function RulesVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 font-mono text-[0.625rem] leading-5" aria-hidden="true">
      <p>
        <span className="rounded bg-accent px-1.5 py-0.5 text-accent-fg">IF</span>{" "}
        <span className="text-fg">ROAS &lt; 1.0</span> <span className="text-fg-subtle">and</span>{" "}
        <span className="text-fg">spend &gt; ₹5k</span>
      </p>
      <p>
        <span className="rounded bg-success-subtle px-1.5 py-0.5 text-success-fg">THEN</span>{" "}
        <span className="text-fg">budget −20%</span>
      </p>
      <p className="text-fg-subtle">↳ dry-run: 4 campaigns match</p>
    </div>
  );
}

function AiVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 text-[0.625rem]" aria-hidden="true">
      <p className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-primary px-2.5 py-1.5 text-primary-fg">
        What should I fix today?
      </p>
      <p className="max-w-[92%] rounded-lg rounded-bl-sm border border-border bg-bg-subtle px-2.5 py-1.5 text-fg-muted">
        <span className="block"><span className="font-medium text-fg">1.</span> Night-pause 3 campaigns</span>
        <span className="block"><span className="font-medium text-fg">2.</span> Raise PMax budget 20%</span>
      </p>
    </div>
  );
}

const FEATURES: { icon: LucideIcon; title: string; body: string; visual: ReactNode; soon?: boolean }[] = [
  {
    icon: Flame,
    title: "Wasted-spend finder",
    body: "See which campaigns are spending without converting, or at a ROAS that loses money, before the month is gone.",
    visual: <WasteVisual />,
  },
  {
    icon: Clock,
    title: "Best hours",
    body: "An hour × weekday heatmap shows when your ads convert. Schedule around it so budget goes to the hours that pay.",
    visual: <DaypartingVisual />,
  },
  {
    icon: Gauge,
    title: "Budget alerts",
    body: "Know when a budget is about to run out before the day’s best hours, not after they’ve passed.",
    visual: <BudgetVisual />,
  },
  {
    icon: BellRing,
    title: "Anomaly alerts",
    body: "ROAS drops, CPA spikes, spend spikes and conversion drops get flagged in-app or by email while you can still act.",
    visual: <AlertsVisual />,
  },
  {
    icon: ImageIcon,
    title: "Creative performance",
    body: "See which ads and creatives are carrying results, and which are spending without pulling their weight.",
    visual: <CreativeVisual />,
  },
  {
    icon: Search,
    title: "Search-term insights",
    body: "Find the Google Ads search terms and keywords that eat budget without converting, so you know what to exclude.",
    visual: <SearchTermsVisual />,
    soon: true,
  },
  {
    icon: Workflow,
    title: "Rules with dry-run",
    body: "Turn the checks you do by hand into rules. Every rule shows exactly what it would change before it runs.",
    visual: <RulesVisual />,
  },
  {
    icon: Bot,
    title: "AI analyst",
    body: "Ask “what should I fix today?” and get a ranked answer from your own data. Any change waits for your approval.",
    visual: <AiVisual />,
  },
];

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <SectionHeader
          id="features-title"
          eyebrow="Features"
          title="Built to find what’s costing you, and fix it."
          description="Each feature answers a practical question: where is money leaking, when do your ads convert, what broke overnight, and what should change today."
        />
        <ul className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <li key={f.title}>
              <Reveal delay={(i % 4) * 0.05} className="h-full">
                <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xs transition-colors hover:border-border-strong">
                  <div className="mb-5 h-28 rounded-xl border border-border bg-bg-subtle/60 p-3.5">{f.visual}</div>
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
                      <f.icon className="size-4" aria-hidden="true" />
                    </span>
                    <h3 className="font-display text-base font-semibold text-fg">{f.title}</h3>
                    {f.soon ? (
                      <span className="ml-auto rounded-full border border-border px-2 py-px text-[0.625rem] font-medium text-fg-subtle">
                        Soon
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-fg-muted">{f.body}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
