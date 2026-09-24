"use client";

import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, Clock, Flame, Gauge, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Provider, WindowFrame } from "./primitives";

type Tone = "danger" | "success" | "warning";

const INSIGHTS: { icon: LucideIcon; label: string; value: string; note: string; tone: Tone }[] = [
  { icon: Flame, label: "Wasted spend yesterday", value: "₹42,930", note: "3 campaigns · 0.46× ROAS", tone: "danger" },
  { icon: Clock, label: "Best hours this week", value: "19:00–22:00", note: "3.4× ROAS vs 2.3× avg", tone: "success" },
  { icon: Gauge, label: "Budget at risk", value: "Out by 16:00", note: "PMax · Catalog · 92% spent", tone: "warning" },
];

const TONE_ICON: Record<Tone, string> = {
  danger: "bg-danger-subtle text-danger-fg",
  success: "bg-success-subtle text-success-fg",
  warning: "bg-warning-subtle text-warning-fg",
};

const OPPORTUNITIES = [
  {
    title: "Pause 3 low-ROAS campaigns overnight, 23:00–05:00",
    provider: null,
    impact: "Saves ~₹9.8K/wk",
    status: "Awaiting approval",
    tone: "primary",
  },
  {
    title: "PMax · Catalog runs out before the evening peak",
    provider: "Google",
    impact: "+20% budget suggested",
    status: "Alert",
    tone: "warning",
  },
  {
    title: "CPA up 38% on Retargeting · 7d viewers",
    provider: "Meta",
    impact: "Since 06:00 today",
    status: "Anomaly",
    tone: "danger",
  },
  {
    title: "Brand Search · Exact is your most efficient spend",
    provider: "Google",
    impact: "5.1× ROAS · headroom",
    status: "Insight",
    tone: "success",
  },
] as const;

const STATUS: Record<(typeof OPPORTUNITIES)[number]["tone"], string> = {
  primary: "bg-accent text-accent-fg",
  warning: "bg-warning-subtle text-warning-fg",
  danger: "bg-danger-subtle text-danger-fg",
  success: "bg-success-subtle text-success-fg",
};

// ROAS by hour (last 7 days), 00..23.
const HOURLY = [1.1, 0.8, 0.6, 0.5, 0.5, 0.7, 1.2, 1.6, 2.1, 2.6, 2.8, 2.7, 2.6, 2.5, 2.4, 2.4, 2.5, 2.7, 3.0, 3.3, 3.5, 3.4, 2.2, 1.4];
const MAX = 3.6;

export function HeroDashboard() {
  const reduce = useReducedMotion();

  return (
    <WindowFrame title="app.adwise.io/today" className="text-left">
      <div className="grid grid-cols-1 lg:grid-cols-[9.5rem_1fr]">
        <div className="hidden border-r border-border bg-bg-subtle/60 p-3 lg:block" aria-hidden="true">
          <div className="mb-3 h-2 w-16 rounded bg-border-strong" />
          {["Today", "Campaigns", "Creatives", "Dayparting", "Automations", "Alerts", "Audit log"].map((item, i) => (
            <div
              key={item}
              className={cn(
                "mb-1 rounded-md px-2 py-1.5 text-[0.6875rem]",
                i === 0 ? "bg-surface font-medium text-fg shadow-xs" : "text-fg-subtle",
              )}
            >
              {item}
            </div>
          ))}
        </div>

        <div className="min-w-0 p-3 sm:p-4">
          <div className="mb-3">
            <p className="text-xs font-semibold text-fg">Today’s opportunities</p>
            <p className="text-[0.6875rem] text-fg-subtle">Saffron Home · Tue 09:12 IST</p>
          </div>

          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {INSIGHTS.map((k) => (
              <div key={k.label} className="flex gap-2.5 rounded-lg border border-border bg-surface p-2.5">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", TONE_ICON[k.tone])}>
                  <k.icon className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="truncate text-[0.6875rem] text-fg-subtle">{k.label}</dt>
                  <dd className="font-mono text-sm font-semibold tracking-tight text-fg tabular-nums">{k.value}</dd>
                  <dd className="truncate text-[0.625rem] text-fg-muted">{k.note}</dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <p className="border-b border-border bg-bg-subtle px-2.5 py-1.5 text-[0.6875rem] font-medium text-fg-subtle">
                Ranked by impact
              </p>
              <ol className="divide-y divide-border">
                {OPPORTUNITIES.map((o, i) => (
                  <li key={o.title} className="flex items-start gap-2 px-2.5 py-2">
                    <span className="mt-px font-mono text-[0.625rem] text-fg-subtle">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.6875rem] font-medium text-fg">{o.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[0.625rem] text-fg-muted">
                        {o.provider ? <Provider name={o.provider} /> : null}
                        <span className="truncate">{o.impact}</span>
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[0.5625rem] font-medium", STATUS[o.tone])}>
                      {o.status}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-2">
              <figure className="rounded-lg border border-border bg-surface p-2.5">
                <figcaption className="mb-2 flex items-center justify-between text-[0.6875rem]">
                  <span className="font-medium text-fg">ROAS by hour</span>
                  <span className="text-fg-subtle">last 7 days</span>
                </figcaption>
                <div
                  className="flex h-16 items-end gap-px"
                  role="img"
                  aria-label="ROAS by hour of day: lowest around 03:00 at 0.5×, highest between 19:00 and 22:00 at up to 3.5×."
                >
                  {HOURLY.map((v, h) => (
                    <motion.span
                      key={h}
                      className={cn(
                        "flex-1 origin-bottom rounded-t-[2px]",
                        h >= 19 && h <= 21 ? "bg-chart-1" : v < 1 ? "bg-danger/50" : "bg-chart-1/35",
                      )}
                      style={{ height: `${(v / MAX) * 100}%` }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={reduce ? { duration: 0 } : { duration: 0.7, delay: 0.5 + h * 0.025, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ))}
                </div>
                <div aria-hidden="true" className="mt-1 flex justify-between font-mono text-[0.5625rem] text-fg-subtle">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>23</span>
                </div>
              </figure>

              <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5">
                <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-fg">
                  <AlertTriangle className="size-3 text-warning" aria-hidden="true" />
                  Suggested: night pause · 3 campaigns
                </p>
                <p className="mt-1 text-[0.625rem] text-fg-muted">Dry-run: 3 campaigns, 2 accounts, no conflicts.</p>
                <div className="mt-2 flex gap-1.5">
                  <span className="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[0.625rem] font-medium text-primary-fg">
                    <Check className="size-3" aria-hidden="true" /> Approve
                  </span>
                  <span className="inline-flex h-6 items-center rounded-md border border-border bg-surface px-2 text-[0.625rem] font-medium text-fg">
                    Review
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}
