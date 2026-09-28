import type { ReactNode } from "react";
import { ACCESS_HREF } from "@/lib/site";
import { ArrowRight } from "lucide-react";
import { Container, CtaLink, Eyebrow, Glow, GridBackdrop } from "./primitives";
import { Reveal } from "./reveal";

/** Top section for inner pages: eyebrow, headline, lede, CTAs, and an optional visual below. */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
  cta = true,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  cta?: boolean;
}) {
  return (
    <section aria-labelledby="page-title" className="relative isolate overflow-hidden pt-14 pb-16 sm:pt-20 lg:pb-24">
      <GridBackdrop />
      <Glow className="top-[-12rem] left-1/2 h-[26rem] w-[44rem] -translate-x-1/2" />
      <Container className="flex flex-col items-center text-center">
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h1
            id="page-title"
            className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-tight text-balance text-fg sm:text-5xl lg:text-6xl lg:leading-[1.05]"
          >
            {title}
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">{description}</p>
        </Reveal>
        {cta ? (
          <Reveal delay={0.15} className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <CtaLink href={ACCESS_HREF} size="lg" className="w-full sm:w-auto">
              Request beta access <ArrowRight aria-hidden="true" />
            </CtaLink>
            <CtaLink href="/#beta" variant="secondary" size="lg" className="w-full sm:w-auto">
              How access works
            </CtaLink>
          </Reveal>
        ) : null}
        {children ? (
          <Reveal delay={0.2} y={32} className="relative mt-14 w-full max-w-5xl text-left">
            <div aria-hidden="true" className="absolute -inset-x-6 -inset-y-4 -z-10 rounded-3xl bg-linear-to-b from-primary/10 via-primary/5 to-transparent blur-2xl" />
            {children}
          </Reveal>
        ) : null}
      </Container>
    </section>
  );
}
