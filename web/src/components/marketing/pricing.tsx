"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, CtaLink, SectionHeader } from "./primitives";

type Billing = "monthly" | "yearly";

const TIERS = [
  {
    name: "Starter",
    blurb: "For founders and solo marketers running their own ads.",
    monthly: 49,
    yearly: 41,
    cta: "Start free trial",
    featured: false,
    features: [
      "Up to 3 ad accounts",
      "Wasted-spend finder + anomaly alerts",
      "Dayparting heatmaps + 3 schedules",
      "10 automation rules",
      "Email + in-app alerts",
      "AI analyst · 100 questions/mo",
      "30-day audit history",
    ],
  },
  {
    name: "Growth",
    blurb: "For growth teams that want automation on every account.",
    monthly: 149,
    yearly: 124,
    cta: "Start free trial",
    featured: true,
    features: [
      "Up to 15 ad accounts",
      "Unlimited dayparting schedules",
      "Unlimited automation rules",
      "Budget + anomaly alerts",
      "AI analyst · 1,000 questions/mo",
      "Approval workflows + roles",
      "1-year audit history",
    ],
  },
  {
    name: "Agency",
    blurb: "For agencies operating many clients from one workspace.",
    monthly: 399,
    yearly: 332,
    cta: "Talk to us",
    featured: false,
    features: [
      "Unlimited ad accounts",
      "Client workspaces",
      "Everything in Growth",
      "AI analyst · unlimited",
      "Rule templates across clients",
      "Unlimited audit history + export",
      "Priority support",
    ],
  },
] as const;

export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <SectionHeader
          id="pricing-title"
          eyebrow="Pricing"
          title="Priced by accounts, not by ad spend."
          description="Every plan includes dayparting, alerts and the full safety layer. Start with a 14-day trial."
        />

        <div className="mt-10 flex justify-center">
          <div role="radiogroup" aria-label="Billing period" className="inline-flex items-center rounded-full border border-border bg-bg-subtle p-1">
            {(["monthly", "yearly"] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={billing === b}
                onClick={() => setBilling(b)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  billing === b ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
                )}
              >
                {b === "monthly" ? "Monthly" : "Yearly"}
                {b === "yearly" ? (
                  <span className="rounded-full bg-success-subtle px-1.5 py-px text-[0.6875rem] text-success-fg">−17%</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((t) => {
            const price = billing === "monthly" ? t.monthly : t.yearly;
            return (
              <li
                key={t.name}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-surface p-6 sm:p-8",
                  t.featured ? "border-primary/50 shadow-lg ring-1 ring-primary/30" : "border-border shadow-xs",
                )}
              >
                {t.featured ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-fg">
                    Most popular
                  </span>
                ) : null}
                <h3 className="font-display text-xl font-semibold text-fg">{t.name}</h3>
                <p className="mt-1.5 min-h-10 text-sm text-fg-muted">{t.blurb}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-semibold tracking-tight text-fg tabular-nums">${price}</span>
                  <span className="text-sm text-fg-subtle">/ month</span>
                </p>
                <p className="mt-1 h-5 text-xs text-fg-subtle" aria-live="polite">
                  {billing === "yearly" ? `Billed $${price * 12} yearly` : "Billed monthly"}
                </p>
                <CtaLink
                  href={t.name === "Agency" ? "mailto:sales@adwise.io" : "/signup"}
                  variant={t.featured ? "primary" : "secondary"}
                  size="lg"
                  className="mt-6 w-full"
                >
                  {t.cta}
                  <span className="sr-only"> for the {t.name} plan</span>
                </CtaLink>
                <ul className="mt-8 flex flex-col gap-3 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-fg-muted">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <p className="mt-8 text-center text-xs text-fg-subtle">
          Prices in USD, excluding taxes. Placeholder pricing; final plans may change before general availability.
        </p>
      </Container>
    </section>
  );
}
