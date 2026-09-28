import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { Container, Provider } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/reveal";
import { TRACKS, guidesByTrack } from "@/lib/learn";

export const metadata: Metadata = {
  title: "Learn",
  description: "Plain-English guides to running Meta and Google ads: setup, tracking, first campaigns, optimization and scaling.",
};

export default function LearnPage() {
  return (
    <>
      <PageHero
        eyebrow="Learn"
        title="Run better ads, in plain English"
        description="Practical guides to Meta and Google ads, from a clean account setup and working conversion tracking to scaling what works. Free to read, no sign-up."
        cta={false}
      />
      <Container className="flex flex-col gap-16 pb-24 sm:gap-20">
        {TRACKS.map((track) => {
          const guides = guidesByTrack(track.id);
          return (
            <section key={track.id} aria-labelledby={`track-${track.id}`}>
              <Reveal className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id={`track-${track.id}`} className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-fg">
                    {track.label}
                    {track.id === "meta" ? <Provider name="Meta" /> : track.id === "google" ? <Provider name="Google" /> : null}
                  </h2>
                  <p className="mt-1 text-sm text-fg-muted">{track.description}</p>
                </div>
                <p className="font-mono text-xs text-fg-subtle">
                  {guides.length} guide{guides.length === 1 ? "" : "s"}
                </p>
              </Reveal>
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {guides.map((guide, i) => (
                  <li key={guide.slug} className="flex">
                    <Reveal delay={i * 0.06} className="flex w-full">
                      <Link
                        href={`/learn/${guide.slug}`}
                        className="group relative isolate flex w-full flex-col overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-xs transition-[transform,border-color,box-shadow] duration-300 ease-out outline-none hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
                        />
                        <span
                          aria-hidden="true"
                          className="absolute -top-16 -right-16 -z-10 size-40 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                        />
                        <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] text-fg-subtle">
                          <Clock aria-hidden="true" className="size-3" />
                          {guide.minutes} min read
                        </span>
                        <h3 className="mt-3 font-display text-lg leading-snug font-semibold text-balance text-fg">{guide.title}</h3>
                        <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{guide.summary}</p>
                        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                          Read guide
                          <ArrowRight
                            aria-hidden="true"
                            className="size-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
                          />
                        </span>
                      </Link>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Container>
      <FinalCta />
    </>
  );
}
