import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Clock, Lightbulb } from "lucide-react";
import { Inline, Prose } from "@/components/marketing/legal/prose";
import { Container, CtaLink, Eyebrow, Glow, GridBackdrop } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/reveal";
import { GUIDES, ORDERED_GUIDES, TRACKS, getGuide, type GuideBlock } from "@/lib/learn";
import { ACCESS_HREF } from "@/lib/site";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.summary,
    openGraph: { type: "article", title: guide.title, description: guide.summary },
  };
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case "list":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="mt-6 flex flex-col gap-4">
          {block.items.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg-subtle font-mono text-xs font-medium text-fg">
                {i + 1}
              </span>
              <div className="pt-0.5">
                <p className="!mt-0 font-medium text-fg">{step.title}</p>
                <p className="!mt-1">
                  <Inline text={step.text} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      );
    case "terms":
      return (
        <dl className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {block.items.map((t) => (
            <div key={t.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="font-medium text-fg">{t.term}</dt>
              <dd>
                <Inline text={t.def} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case "callout": {
      const Icon = block.tone === "warning" ? AlertTriangle : Lightbulb;
      return (
        <aside
          className={cn(
            "mt-6 flex gap-3 rounded-xl border px-4 py-4",
            block.tone === "warning" ? "border-warning/30 bg-warning-subtle" : "border-primary/25 bg-primary/5",
          )}
        >
          <Icon
            aria-hidden="true"
            className={cn("mt-1 size-4 shrink-0", block.tone === "warning" ? "text-warning" : "text-primary")}
          />
          <div>
            <p className="!mt-0 font-medium text-fg">{block.title}</p>
            <p className="!mt-1">
              <Inline text={block.text} />
            </p>
          </div>
        </aside>
      );
    }
  }
}

export default async function GuidePage({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const track = TRACKS.find((t) => t.id === guide.track);
  const index = ORDERED_GUIDES.findIndex((g) => g.slug === guide.slug);
  const prev = index > 0 ? ORDERED_GUIDES[index - 1] : undefined;
  const next = index < ORDERED_GUIDES.length - 1 ? ORDERED_GUIDES[index + 1] : undefined;

  return (
    <article aria-labelledby="guide-title">
      <header className="relative isolate overflow-hidden pt-12 pb-10 sm:pt-16 sm:pb-14">
        <GridBackdrop />
        <Glow className="top-[-12rem] left-1/2 h-[22rem] w-[40rem] -translate-x-1/2" />
        <Container className="max-w-3xl">
          <Reveal>
            <Link
              href="/learn"
              className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> All guides
            </Link>
          </Reveal>
          <Reveal delay={0.05} className="mt-6">
            <Eyebrow>{track?.label ?? "Guide"}</Eyebrow>
            <h1
              id="guide-title"
              className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl lg:text-5xl lg:leading-[1.1]"
            >
              {guide.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">{guide.summary}</p>
            <p className="mt-4 flex items-center gap-1.5 font-mono text-xs text-fg-subtle">
              <Clock aria-hidden="true" className="size-3.5" /> {guide.minutes} min read
            </p>
          </Reveal>
        </Container>
      </header>

      <Container className="grid grid-cols-1 gap-10 pb-16 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-16">
        <div className="mx-auto w-full max-w-3xl lg:mx-0 lg:justify-self-end">
          <Prose>
            {guide.sections.map((section) => (
              <section key={section.id} aria-labelledby={section.id}>
                <h2 id={section.id}>{section.heading}</h2>
                {section.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </section>
            ))}
          </Prose>

          <div className="mt-14 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-8">
            <h2 className="font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl">
              Put this into practice with Adwise
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted sm:text-base">
              Connect your Meta or Google ad account, see where spend is wasted by hour and placement, and dry-run
              automation rules before anything goes live.
            </p>
            <CtaLink href={ACCESS_HREF} size="lg" className="mt-5 w-full sm:w-auto">
              Request beta access <ArrowRight aria-hidden="true" />
            </CtaLink>
          </div>

          <nav aria-label="More guides" className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`/learn/${prev.slug}`}
                className="group flex flex-col gap-1 rounded-xl border border-border p-4 transition-colors hover:border-border-strong hover:bg-bg-subtle"
              >
                <span className="flex items-center gap-1 text-xs text-fg-subtle">
                  <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
                  Previous
                </span>
                <span className="text-sm font-medium text-fg">{prev.title}</span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next ? (
              <Link
                href={`/learn/${next.slug}`}
                className="group flex flex-col items-end gap-1 rounded-xl border border-border p-4 text-right transition-colors hover:border-border-strong hover:bg-bg-subtle"
              >
                <span className="flex items-center gap-1 text-xs text-fg-subtle">
                  Next
                  <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="text-sm font-medium text-fg">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        </div>

        <aside aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="font-mono text-xs font-medium tracking-wider text-fg-subtle uppercase">On this page</p>
            <ol className="mt-3 flex flex-col gap-1 border-l border-border">
              {guide.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-3 text-sm text-fg-muted transition-colors hover:border-primary hover:text-fg"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </Container>
    </article>
  );
}
