"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill, type PillTone } from "@/components/app/integrations/status-pill";
import { Markdown } from "@/components/app/changelog/markdown";
import { KIND_LABEL, SITE_CHANGELOG_URL, useChangelog, type ChangelogKind } from "@/lib/changelog-api";
import { formatDate } from "@/lib/utils";

const KIND_TONE: Record<ChangelogKind, PillTone> = { new: "success", improved: "info", fixed: "warning" };

export function KindPill({ kind }: { kind: ChangelogKind }) {
  return <StatusPill tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</StatusPill>;
}

/** Right-side panel listing recent product updates. */
export function WhatsNewSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading, isError, refetch } = useChangelog(20, open);
  const entries = data?.entries ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-display">What&apos;s new</SheetTitle>
          <SheetDescription>The latest improvements to Adwise.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="space-y-2 text-sm text-fg-muted">
              <p>Couldn&apos;t load updates.</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-fg-muted">No updates yet.</p>
          ) : (
            <ol className="space-y-6">
              {entries.map((e) => (
                <li key={e.id} className="space-y-2 border-b border-border pb-6 last:border-0">
                  <div className="flex items-center gap-2 text-xs text-fg-subtle">
                    <KindPill kind={e.kind} />
                    {e.published_at && <time dateTime={e.published_at}>{formatDate(e.published_at)}</time>}
                  </div>
                  <h3 className="font-display text-base font-semibold text-fg">{e.title}</h3>
                  <p className="text-sm text-fg">{e.summary}</p>
                  <Markdown source={e.body} />
                  {e.link_path && (
                    <Button asChild size="sm" variant="outline" className="mt-1">
                      <Link href={e.link_path} onClick={() => onOpenChange(false)}>
                        {e.link_label || "Try it"} <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="border-t border-border px-5 py-3">
          <a
            href={SITE_CHANGELOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View all updates <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
