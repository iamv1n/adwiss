import { ArrowRight, ShieldCheck } from "lucide-react";
import { HeroDashboard } from "./hero-dashboard";
import { Container, CtaLink, Glow, GridBackdrop } from "./primitives";
import { Reveal } from "./reveal";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-14 pb-20 sm:pt-20 lg:pb-28">
      <GridBackdrop />
      <Glow className="top-[-12rem] left-1/2 h-[28rem] w-[48rem] -translate-x-1/2" />
      <Container className="flex flex-col items-center text-center">
        <Reveal>
          <a
            href="#dayparting"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pr-3 pl-1 text-xs text-fg-muted shadow-xs backdrop-blur outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-fg">New</span>
            Dayparting with dry-run previews
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
        </Reveal>
        <Reveal delay={0.05}>
          <h1
            id="hero-title"
            className="mt-6 max-w-4xl font-display text-4xl font-semibold tracking-tight text-balance text-fg sm:text-6xl lg:text-7xl lg:leading-[1.02]"
          >
            Stop wasting ad spend.{" "}
            <span className="bg-linear-to-r from-primary to-chart-5 bg-clip-text text-transparent">
              Back the hours that pay.
            </span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">
            Adwise finds the campaigns burning budget, shows you the hours and days that actually convert,
            and flags problems before they cost you. Then it acts on your schedules and rules, with a
            dry-run first and your approval on every AI suggestion.
          </p>
        </Reveal>
        <Reveal delay={0.15} className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <CtaLink href="/signup" size="lg" className="w-full sm:w-auto">
            Start free <ArrowRight aria-hidden="true" />
          </CtaLink>
          <CtaLink href="#features" variant="secondary" size="lg" className="w-full sm:w-auto">
            See what it finds
          </CtaLink>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
              Read-only until you approve an action
            </span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span>Works with Meta Ads and Google Ads</span>
          </p>
        </Reveal>

        <Reveal delay={0.25} y={32} className="relative mt-14 w-full max-w-5xl sm:mt-16">
          <div aria-hidden="true" className="absolute -inset-x-6 -inset-y-4 -z-10 rounded-3xl bg-linear-to-b from-primary/10 via-primary/5 to-transparent blur-2xl" />
          <HeroDashboard />
        </Reveal>
      </Container>
    </section>
  );
}
