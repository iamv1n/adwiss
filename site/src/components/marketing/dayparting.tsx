"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CircleCheck, FlaskConical, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DaypartingHeatmap } from "./dayparting-heatmap";
import { TimeManagementIllustration } from "./illustrations/time-management";
import { Container, Eyebrow } from "./primitives";
import { Reveal } from "./reveal";

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

        <Reveal className="mt-12 min-w-0">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="p-4 sm:p-6">
              <DaypartingHeatmap showOverlay={overlay} />
            </div>

            {/* The schedule the heatmap suggests, as one compact bar. */}
            <div className="flex flex-col gap-4 border-t border-border bg-bg-subtle/60 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
                  <Moon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                    Night pause
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
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-fg-muted">
                    Mon–Fri 22:00–06:00 → <span className="font-semibold text-warning-fg">Pause</span> · Asia/Kolkata
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs lg:ml-auto lg:flex lg:items-center">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-fg-subtle">Affects</dt>
                  <dd className="font-medium text-fg">18 campaigns · 3 accounts</dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-fg-subtle">Spend avoided</dt>
                  <dd className="font-mono font-medium text-success-fg">₹41,600/wk</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
                  <input
                    type="checkbox"
                    checked={overlay}
                    onChange={(e) => setOverlay(e.target.checked)}
                    className="size-3.5 accent-primary"
                  />
                  Show on heatmap
                </label>
                <button
                  type="button"
                  onClick={() => setEnabled((v) => !v)}
                  aria-pressed={enabled}
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    enabled
                      ? "border border-border bg-surface text-fg hover:bg-bg-subtle"
                      : "bg-primary text-primary-fg hover:bg-primary-hover",
                  )}
                >
                  <CalendarClock className="size-4" aria-hidden="true" />
                  {enabled ? "Enabled · Undo" : "Confirm & enable"}
                </button>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-6 text-center">
          <Link
            href="/dayparting"
            className="group inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            See how dayparting works
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </Reveal>
      </Container>
    </section>
  );
}
