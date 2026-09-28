"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { THEMES, drawMark, downloadPng, StylePicker, useFonts, wrap, type Fonts, type Style } from "./brand-canvas";

/**
 * Header/banner generator. Drawn with the Canvas 2D API (not SVG) so the
 * app's loaded web fonts are used in the exported PNGs.
 */

interface Preset {
  id: string;
  name: string;
  w: number;
  h: number;
  note?: string;
  /** Area guaranteed visible on every device (centered), e.g. YouTube. */
  safe?: { w: number; h: number };
}

const PRESETS: Preset[] = [
  { id: "og", name: "Link preview (Open Graph)", w: 1200, h: 630, note: "Website, WhatsApp, Slack, LinkedIn link cards" },
  { id: "linkedin-company", name: "LinkedIn company cover", w: 1128, h: 191 },
  { id: "linkedin-personal", name: "LinkedIn profile banner", w: 1584, h: 396, note: "The profile photo covers the bottom-left" },
  { id: "x", name: "X (Twitter) header", w: 1500, h: 500, note: "The profile photo covers the bottom-left" },
  { id: "facebook", name: "Facebook page cover", w: 1640, h: 624, note: "Mobile crops the sides" },
  { id: "youtube", name: "YouTube channel banner", w: 2560, h: 1440, safe: { w: 1546, h: 423 }, note: "Text stays in the 1546×423 safe area" },
  { id: "ig-post", name: "Instagram / Facebook post", w: 1080, h: 1080 },
  { id: "story", name: "Instagram / WhatsApp story", w: 1080, h: 1920 },
  { id: "email", name: "Email header", w: 1200, h: 300, note: "Shown at 600×150 (2× for sharp screens)" },
  { id: "slide", name: "Slide / video title", w: 1920, h: 1080 },
];

function draw(c: CanvasRenderingContext2D, p: Preset, style: Style, headline: string, sub: string, fonts: Fonts) {
  const { w, h } = p;
  const t = THEMES[style];
  c.clearRect(0, 0, w, h);
  t.bg(c, w, h);

  // Content box: the safe area when there is one, else the canvas with padding.
  const box = p.safe ? { w: p.safe.w, h: p.safe.h, x: (w - p.safe.w) / 2, y: (h - p.safe.h) / 2 } : { w, h, x: 0, y: 0 };
  const wide = box.w / box.h >= 1.6;
  const pad = wide ? box.h * 0.16 : box.w * 0.09;

  // Decorative oversized mark, bleeding off the edge.
  if (wide) {
    const s = h * 1.15;
    drawMark(c, w - s * 0.78, h * 0.02, s, t.deco, t.decoAlpha);
  } else {
    const s = w * 0.95;
    drawMark(c, w - s * 0.62, h - s * 0.72, s, t.deco, t.decoAlpha);
  }

  // Scale type to the box (short banners are height-bound, tall ones
  // width-bound), then shrink everything until the block fits vertically.
  const vPad = Math.min(pad, box.h * 0.12);
  let unit = wide ? box.h : box.w * 0.62;
  let markSize = 0, wordSize = 0, headSize = 0, subPx = 0, lockupW = 0;
  let headLH = 0, subLH = 0, gapLock = 0, gapSub = 0, blockH = 0;
  let lines: string[] = [];
  let subLines: string[] = [];
  const subSize = () => subPx;
  for (let fit = 0; fit < 12; fit++) {
    markSize = Math.round(unit * (wide ? 0.17 : 0.14));
    wordSize = markSize * 0.7;
    headSize = unit * (wide ? 0.145 : 0.135);
    subPx = headSize * 0.4;
    const textMaxW = wide ? box.w * 0.62 - pad : box.w - pad * 2;

    // Shrink the headline until it fits in at most two lines (wide) or three.
    for (let i = 0; i < 20; i++) {
      c.font = `600 ${headSize}px ${fonts.display}`;
      lines = wrap(c, headline, textMaxW);
      if (lines.length <= (wide ? 2 : 3)) break;
      headSize *= 0.92;
    }

    // Subline: shrink (down to 70%) to fit its line budget, then ellipsize —
    // never drop words silently. Skipped on banners too short to read it.
    const maxSubLines = wide ? 2 : 3;
    subLines = [];
    if (sub && box.h >= 240) {
      const floor = subPx * 0.7;
      for (;;) {
        c.font = `400 ${subPx}px ${fonts.sans}`;
        subLines = wrap(c, sub, textMaxW);
        if (subLines.length <= maxSubLines || subPx * 0.94 < floor) break;
        subPx *= 0.94;
      }
      if (subLines.length > maxSubLines) {
        subLines = subLines.slice(0, maxSubLines);
        let last = subLines[maxSubLines - 1];
        while (last && c.measureText(`${last}…`).width > textMaxW) last = last.slice(0, last.lastIndexOf(" "));
        subLines[maxSubLines - 1] = `${last.replace(/[,.;:]$/, "")}…`;
      }
    }

    c.font = `600 ${wordSize}px ${fonts.display}`;
    lockupW = markSize * 1.33 + c.measureText("Adwise").width;
    headLH = headSize * 1.08;
    subLH = subSize() * 1.35;
    gapLock = markSize * 0.9;
    gapSub = headSize * 0.35;
    blockH = markSize + gapLock + lines.length * headLH + (subLines.length ? gapSub + subLines.length * subLH : 0);
    if (blockH <= box.h - vPad * 2) break;
    unit *= 0.92;
  }

  // Wide: left-aligned at the padding. Square/tall: everything centered.
  const x0 = box.x + pad;
  const centered = !wide;
  let y = box.y + (box.h - blockH) / 2;

  // Lockup.
  const lockX = centered ? box.x + (box.w - lockupW) / 2 : x0;
  if (t.mark === "color") drawMark(c, lockX, y, markSize, "color");
  else drawMark(c, lockX, y, markSize, "#FFFFFF");
  c.font = `600 ${wordSize}px ${fonts.display}`;
  c.fillStyle = t.text;
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.fillText("Adwise", lockX + markSize * 1.33, y + markSize / 2 + wordSize * 0.04);
  y += markSize + gapLock;

  // Headline.
  c.textBaseline = "alphabetic";
  c.textAlign = centered ? "center" : "left";
  const tx = centered ? box.x + box.w / 2 : x0;
  c.font = `600 ${headSize}px ${fonts.display}`;
  c.fillStyle = t.text;
  for (const l of lines) {
    y += headLH;
    c.fillText(l, tx, y - headLH * 0.2);
  }

  // Subline.
  if (subLines.length) {
    y += gapSub;
    c.font = `400 ${subSize()}px ${fonts.sans}`;
    c.fillStyle = t.sub;
    for (const l of subLines) {
      y += subLH;
      c.fillText(l, tx, y - subLH * 0.25);
    }
  }
}

const PREVIEW_MAX = 720;

function BannerCard({ p, style, headline, sub, fonts }: { p: Preset; style: Style; headline: string; sub: string; fonts: Fonts }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scale = Math.min(1, PREVIEW_MAX / p.w);
    canvas.width = Math.round(p.w * scale);
    canvas.height = Math.round(p.h * scale);
    const c = canvas.getContext("2d")!;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    draw(c, p, style, headline, sub, fonts);
  }, [p, style, headline, sub, fonts]);

  const download = () => downloadPng(p.w, p.h, (c) => draw(c, p, style, headline, sub, fonts), `adwise-${p.id}-${style}-${p.w}x${p.h}.png`);

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="relative grid place-items-center bg-bg-subtle p-3">
        <canvas ref={ref} className="h-auto max-h-72 w-auto max-w-full rounded-md shadow-sm" aria-label={`${p.name} preview`} />
        {p.safe && (
          <span className="pointer-events-none absolute text-[10px] text-fg-subtle" style={{ bottom: 6 }}>
            safe area centered
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2 border-t border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">{p.name}</p>
          <p className="font-mono text-xs text-fg-muted">
            {p.w}×{p.h}
          </p>
          {p.note && <p className="text-xs text-fg-subtle">{p.note}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={download}>
          <Download aria-hidden="true" /> PNG
        </Button>
      </div>
    </li>
  );
}

export const DEFAULT_HEADLINE = "Ads that pay off.";
export const DEFAULT_SUBLINE = "Analytics, automation and leads for Meta and Google Ads.";

/** Headline and subline are owned by the Brand kit page so copy can feed them. */
export function BannerStudio({
  headline,
  setHeadline,
  sub,
  setSub,
}: {
  headline: string;
  setHeadline: (v: string) => void;
  sub: string;
  setSub: (v: string) => void;
}) {
  const fonts = useFonts();
  const [style, setStyle] = useState<Style>("ink");

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="grid gap-1">
          <Label htmlFor="banner-headline" className="text-xs text-fg-muted">
            Headline
          </Label>
          <Input id="banner-headline" value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="banner-sub" className="text-xs text-fg-muted">
            Subline (optional)
          </Label>
          <Input id="banner-sub" value={sub} maxLength={140} onChange={(e) => setSub(e.target.value)} />
        </div>
        <StylePicker style={style} setStyle={setStyle} />
      </div>
      {fonts ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {PRESETS.map((p) => (
            <BannerCard key={p.id} p={p} style={style} headline={headline.trim() || "Adwise"} sub={sub.trim()} fonts={fonts} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">Loading fonts…</p>
      )}
    </div>
  );
}
