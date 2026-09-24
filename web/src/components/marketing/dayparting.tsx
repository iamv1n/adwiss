"use client";

import { useState } from "react";
import { CalendarClock, CircleCheck, Eye, FlaskConical, Globe, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DaypartingHeatmap } from "./dayparting-heatmap";
import { DAYS } from "./heatmap-data";
import { TimeManagementIllustration } from "./illustrations/time-management";
import { Container, Eyebrow } from "./primitives";
import { Reveal } from "./reveal";

const AFFECTED = [
  { account: "Saffron Home · India", provider: "Meta", campaigns: 9 },
  { account: "Saffron Home · India", provider: "Google", campaigns: 6 },
  { account: "Saffron Export", provider: "Meta", campaigns: 3 },
] as const;

export function Dayparting() {
  const [overlay, setOverlay] = useState(true);
  const [enabled, setEnabled] = useState(false);

  return (
    <section
      id="dayparting"
      aria-labelledby="dayparting-title"
      className="relative isolate scroll-mt-20 overflow-hidden border-y border-border bg-bg-subtle py-24 sm:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_80%_0%,color-mix(in_oklch,var(--color-primary)_12%,transparent),transparent)]"
      />
      <Container>
        <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-[1fr_auto]">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>Dayparting</Eyebrow>
            <h2
              id="dayparting-title"
              className="font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
            >
              Find the hours that pay. Stop paying for the ones that don’t.
            </h2>
            <p className="text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">
              See ROAS, spend and CPA for every hour of every weekday, so you know exactly when your ads earn. Then turn
              what you see into a timezone-aware schedule that pauses, activates or re-budgets campaigns
              automatically, with a dry-run before anything goes live.
            </p>
          </div>
          <TimeManagementIllustration className="hidden h-40 w-auto lg:block" />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Reveal className="min-w-0">
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
              <DaypartingHeatmap showOverlay={overlay} />
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <article
              aria-labelledby="rule-title"
              className="flex h-full flex-col rounded-2xl border border-border bg-surface shadow-sm"
            >
              <header className="flex items-start justify-between gap-3 border-b border-border p-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
                    <Moon className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 id="rule-title" className="text-sm font-semibold text-fg">Night pause</h3>
                    <p className="text-xs text-fg-subtle">Schedule rule</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
                    enabled ? "bg-success-subtle text-success-fg" : "bg-warning-subtle text-warning-fg",
                  )}
                  aria-live="polite"
                >
                  {enabled ? <CircleCheck className="size-3" aria-hidden="true" /> : <FlaskConical className="size-3" aria-hidden="true" />}
                  {enabled ? "Active" : "Dry run"}
                </span>
              </header>

              <div className="flex flex-col gap-4 p-5 text-sm">
                <p className="rounded-lg bg-bg-subtle px-3 py-2 font-mono text-xs text-fg">
                  Mon–Fri 22:00–06:00 → <span className="font-semibold text-warning-fg">Pause</span>{" "}
                  <span className="whitespace-nowrap text-fg-muted">· Asia/Kolkata</span>
                </p>

                <div>
                  <p className="mb-1.5 text-xs text-fg-subtle" id="rule-days">Days</p>
                  <ul aria-labelledby="rule-days" className="flex gap-1">
                    {DAYS.map((d, i) => (
                      <li
                        key={d}
                        className={cn(
                          "flex-1 rounded-md border py-1 text-center text-[0.6875rem] font-medium",
                          i < 5 ? "border-primary/30 bg-primary/10 text-fg" : "border-border text-fg-subtle line-through",
                        )}
                      >
                        {d}
                        <span className="sr-only">{i < 5 ? " (included)" : " (excluded)"}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="mb-1.5 flex items-center justify-between text-xs text-fg-subtle">
                    <span>Window</span>
                    <span className="inline-flex items-center gap-1">
                      <Globe className="size-3" aria-hidden="true" /> IST (UTC+05:30)
                    </span>
                  </p>
                  <div
                    className="relative h-6 overflow-hidden rounded-md bg-success-subtle"
                    role="img"
                    aria-label="Paused from 22:00 to 06:00, running from 06:00 to 22:00"
                  >
                    <span className="absolute inset-y-0 left-0 w-1/4 bg-warning/30" />
                    <span className="absolute inset-y-0 right-0 w-1/12 bg-warning/30" />
                    <span className="absolute inset-y-0 left-1/4 flex items-center pl-2 font-mono text-[0.625rem] text-success-fg">
                      running
                    </span>
                    <span className="absolute inset-y-0 left-1 flex items-center font-mono text-[0.625rem] text-warning-fg">
                      paused
                    </span>
                  </div>
                  <div aria-hidden="true" className="relative mt-1 h-3 font-mono text-[0.5625rem] text-fg-subtle">
                    {[0, 6, 12, 18, 22].map((h) => (
                      <span
                        key={h}
                        className={cn("absolute", h === 0 ? "" : "-translate-x-1/2")}
                        style={{ left: `${(h / 24) * 100}%` }}
                      >
                        {String(h).padStart(2, "0")}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-border-strong p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                    <Eye className="size-3.5 text-primary" aria-hidden="true" /> Dry-run preview
                  </p>
                  <p className="mt-1.5 text-sm text-fg">
                    Affects <strong className="font-semibold">18 campaigns</strong> across{" "}
                    <strong className="font-semibold">3 accounts</strong>
                  </p>
                  <ul className="mt-2.5 flex flex-col gap-1 text-xs">
                    {AFFECTED.map((a) => (
                      <li key={a.account + a.provider} className="flex items-center justify-between gap-2 text-fg-muted">
                        <span className="truncate">
                          {a.account} <span className="text-fg-subtle">· {a.provider}</span>
                        </span>
                        <span className="font-mono text-fg tabular-nums">{a.campaigns}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 border-t border-border pt-2.5 text-xs text-fg-muted">
                    Est. spend avoided at 0.8× ROAS:{" "}
                    <span className="font-mono font-medium text-success-fg">₹41,600/wk</span>
                  </p>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
                  <input
                    type="checkbox"
                    checked={overlay}
                    onChange={(e) => setOverlay(e.target.checked)}
                    className="size-3.5 accent-primary"
                  />
                  Show rule on heatmap
                </label>
              </div>

              <footer className="mt-auto flex items-center gap-2 border-t border-border p-5">
                <button
                  type="button"
                  onClick={() => setEnabled((v) => !v)}
                  aria-pressed={enabled}
                  className={cn(
                    "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    enabled
                      ? "border border-border bg-surface text-fg hover:bg-bg-subtle"
                      : "bg-primary text-primary-fg hover:bg-primary-hover",
                  )}
                >
                  <CalendarClock className="size-4" aria-hidden="true" />
                  {enabled ? "Next run 22:00 IST · Undo" : "Confirm & enable"}
                </button>
              </footer>
            </article>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
