"use client";

import { Globe, ImageIcon, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import { CTAS } from "@/components/app/campaigns/meta-options";
import type { CallToAction } from "@/lib/manage-api";

function domain(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "YOUR-SITE.COM";
  }
}

/** Approximate Facebook feed preview; updates as the ad form is filled in. */
export function AdPreview({
  pageName,
  pagePicture,
  imageUrl,
  videoUrl,
  count,
  message,
  headline,
  description,
  link,
  cta,
  postId,
}: {
  pageName?: string;
  pagePicture?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  /** Carousel / flexible: how many media there are ("1 / 4"). */
  count?: number;
  message: string;
  headline: string;
  description: string;
  link: string;
  cta: CallToAction;
  postId?: string;
}) {
  const ctaLabel = CTAS.find((c) => c.value === cta)?.label ?? "Learn more";
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-surface text-[13px] shadow-xs" aria-label="Ad preview">
      <div className="flex items-center gap-2 px-3 pt-3">
        {pagePicture ? (
          // eslint-disable-next-line @next/next/no-img-element -- provider-hosted page picture
          <img src={pagePicture} alt="" className="size-8 rounded-full border border-border object-cover" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-fg">
            {(pageName ?? "P").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold text-fg">{pageName || "Your Page"}</p>
          <p className="flex items-center gap-1 text-[11px] text-fg-muted">
            Sponsored · <Globe className="size-3" aria-hidden="true" />
          </p>
        </div>
      </div>
      {postId ? (
        <div className="m-3 grid place-items-center rounded-md border border-dashed border-border px-3 py-10 text-center text-xs text-fg-muted">
          Promoting existing post
          <span className="mt-1 font-mono text-fg">{postId}</span>
        </div>
      ) : (
        <>
          <p className="px-3 py-2 whitespace-pre-line text-fg">{message || <span className="text-fg-subtle">Primary text</span>}</p>
          {videoUrl ? (
            <div className="relative">
              <video src={videoUrl} muted playsInline controls className="aspect-square w-full bg-black object-contain" />
              {count && count > 1 ? <MediaCount n={count} /> : null}
            </div>
          ) : imageUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL / uploaded image preview */}
              <img src={imageUrl} alt="Ad image preview" className="aspect-square w-full bg-bg-subtle object-cover" />
              {count && count > 1 ? <MediaCount n={count} /> : null}
            </div>
          ) : (
            <div className="grid aspect-square w-full place-items-center bg-bg-subtle text-fg-subtle">
              <ImageIcon className="size-8" aria-hidden="true" />
            </div>
          )}
          <div className="flex items-center gap-3 bg-bg-subtle px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-fg-muted">{domain(link)}</p>
              <p className="truncate font-semibold text-fg">{headline || <span className="text-fg-subtle">Headline</span>}</p>
              {description && <p className="truncate text-xs text-fg-muted">{description}</p>}
            </div>
            <span className="shrink-0 rounded-md bg-border px-3 py-1.5 text-xs font-semibold text-fg">{ctaLabel}</span>
          </div>
        </>
      )}
      <div className="flex justify-around border-t border-border px-3 py-1.5 text-xs text-fg-muted" aria-hidden="true">
        <span className="flex items-center gap-1">
          <ThumbsUp className="size-3.5" /> Like
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="size-3.5" /> Comment
        </span>
        <span className="flex items-center gap-1">
          <Share2 className="size-3.5" /> Share
        </span>
      </div>
    </figure>
  );
}

function MediaCount({ n }: { n: number }) {
  return (
    <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white tabular-nums">
      1 / {n}
    </span>
  );
}
