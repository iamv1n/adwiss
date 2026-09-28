import Link from "next/link";
import { ArrowRight, Link2 } from "lucide-react";
import { appHref, formatDate, KIND_LABEL, type ChangelogEntry, type ChangelogKind } from "@/lib/changelog";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

const KIND_CLASS: Record<ChangelogKind, string> = {
  new: "bg-success-subtle text-success-fg",
  improved: "bg-info-subtle text-info-fg",
  fixed: "bg-warning-subtle text-warning-fg",
};

export function KindPill({ kind }: { kind: ChangelogKind }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", KIND_CLASS[kind])}>
      {KIND_LABEL[kind]}
    </span>
  );
}

/** One entry. `standalone` renders the title as the page heading. */
export function ChangelogArticle({ entry, standalone = false }: { entry: ChangelogEntry; standalone?: boolean }) {
  const Heading = standalone ? "h1" : "h3";
  const href = entry.link_path ? appHref(entry.link_path) : null;
  return (
    <article id={entry.slug} className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-fg-subtle">
        <KindPill kind={entry.kind} />
        <time dateTime={entry.published_at}>{formatDate(entry.published_at)}</time>
        {!standalone && (
          <Link
            href={`/changelog/${entry.slug}`}
            className="ml-auto inline-flex items-center gap-1 rounded-sm text-xs hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Permalink to ${entry.title}`}
          >
            <Link2 className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      <Heading
        className={cn(
          "mt-3 font-display font-semibold tracking-tight text-fg",
          standalone ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl",
        )}
      >
        {standalone ? entry.title : <Link href={`/changelog/${entry.slug}`} className="hover:underline">{entry.title}</Link>}
      </Heading>
      <p className="mt-2 text-base text-fg">{entry.summary}</p>
      {entry.body && <Markdown source={entry.body} className="mt-4" />}
      {href && (
        <a
          href={href}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {entry.link_label || "Try it in Adwise"} <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}
