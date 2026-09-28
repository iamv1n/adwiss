"use client";

import { ChevronRight, Copy, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COPY_GROUPS, type CopyItem } from "./brand-copy-data";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy to the clipboard");
  }
}

/** Characters as platforms count them (emoji = one). */
const length = (s: string) => [...s].length;

function CopyCard({ item, onHeadline }: { item: CopyItem; onHeadline?: (t: string) => void }) {
  const n = length(item.text);
  const over = item.limit != null && n > item.limit;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-xs">
      {item.note && <p className="text-xs font-medium text-fg-subtle">{item.note}</p>}
      <p className="flex-1 text-sm whitespace-pre-line text-fg">{item.text}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("mr-auto font-mono text-[11px] tabular-nums", over ? "font-semibold text-danger-fg" : "text-fg-subtle")}>
          {n}
          {item.limit != null && ` / ${item.limit}`} chars
        </span>
        {onHeadline && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onHeadline(item.text)}>
            <ImagePlus aria-hidden="true" /> Use in banners
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(item.text)}>
          <Copy aria-hidden="true" /> Copy
        </Button>
      </div>
    </li>
  );
}

export function BrandCopy({ onHeadline }: { onHeadline: (text: string) => void }) {
  return (
    <div className="grid gap-6">
      <nav aria-label="Copy groups" className="flex flex-wrap gap-1 text-xs">
        {COPY_GROUPS.map((g) => (
          <a
            key={g.id}
            href={`#copy-${g.id}`}
            onClick={() => {
              const el = document.getElementById(`copy-${g.id}`);
              if (el instanceof HTMLDetailsElement) el.open = true;
            }}
            className="rounded-md border border-border px-2 py-1 text-fg-muted hover:bg-bg-subtle hover:text-fg">
            {g.title}
          </a>
        ))}
      </nav>
      {COPY_GROUPS.map((g, gi) => (
        // Native disclosure: collapsible per group, and the browser opens it
        // when the chip link above targets it.
        <details key={g.id} id={`copy-${g.id}`} open={gi < 2} className="group/copy scroll-mt-20 rounded-xl border border-border bg-bg-subtle/40">
          <summary className="flex cursor-pointer list-none items-start gap-2 p-3 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform group-open/copy:rotate-90" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-fg">
                {g.title} <span className="font-normal text-fg-subtle">· {g.items.length}</span>
              </span>
              {g.description && <span className="block text-xs text-fg-muted">{g.description}</span>}
            </span>
          </summary>
          <ul
            className={cn(
              "grid gap-2 px-3 pb-3",
              g.id === "about" || g.id === "pitch" || g.id === "posts" ? "md:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3",
            )}
          >
            {g.items.map((item, i) => (
              <CopyCard
                key={i}
                item={item}
                onHeadline={
                  g.headline
                    ? (t) => {
                        onHeadline(t);
                        // Opens the (collapsible) banners section via its hash, then scrolls to it.
                        if (window.location.hash === "#banners") window.dispatchEvent(new HashChangeEvent("hashchange"));
                        else window.location.hash = "banners";
                        requestAnimationFrame(() =>
                          document.getElementById("banners")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                        );
                        toast.success("Headline set in Headers & banners");
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
