import { ArrowRight } from "lucide-react";
import { LaunchingIllustration } from "./illustrations/launching";
import { Container, CtaLink, GridBackdrop } from "./primitives";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-4 pb-24 sm:px-6 sm:pb-32 lg:px-8">
      <Reveal>
        <Container className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface px-6 py-14 shadow-sm sm:px-12 sm:py-16">
          <GridBackdrop className="[mask-image:radial-gradient(ellipse_80%_80%_at_100%_50%,black_20%,transparent_70%)]" />
          <div
            aria-hidden="true"
            className="absolute -bottom-32 -left-24 -z-10 size-96 rounded-full bg-primary/15 blur-3xl"
          />
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="flex flex-col items-start gap-5">
              <h2
                id="cta-title"
                className="font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl lg:text-5xl"
              >
                Stop paying for 3 a.m. clicks.
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
                Connect your ad account in a few minutes, look at your first heatmap today, and dry-run your first
                schedule before lunch.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <CtaLink href="/signup" size="lg">
                  Get started free <ArrowRight aria-hidden="true" />
                </CtaLink>
                <CtaLink href="/login" variant="secondary" size="lg">
                  Log in
                </CtaLink>
              </div>
            </div>
            <LaunchingIllustration className="mx-auto hidden h-56 w-auto sm:block" />
          </div>
        </Container>
      </Reveal>
    </section>
  );
}
