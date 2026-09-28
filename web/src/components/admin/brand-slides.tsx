"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, FileDown, Images } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CanvasPreview,
  StylePicker,
  TEXTAREA_CLASS,
  THEMES,
  downloadPng,
  drawLine,
  drawLockup,
  drawMark,
  drawStack,
  fitStack,
  font,
  lockupWidth,
  renderCanvas,
  useFonts,
  type Block,
  type Fonts,
  type Stack,
  type Style,
} from "./brand-canvas";

/** 1920×1080 slide templates in the same visual system as the banners. */

// #region draw
export type Layout = "title" | "divider" | "content" | "two" | "number" | "quote" | "closing";
export type SlideFields = Record<string, string>;

export interface DeckOptions {
  style: Style;
  footer: boolean;
  numbers: boolean;
  footerText: string;
}

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

const items = (s: string | undefined, max: number) =>
  (s ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);

export function drawSlide(c: CanvasRenderingContext2D, layout: Layout, f: SlideFields, o: DeckOptions, n: number, fonts: Fonts) {
  const W = SLIDE_W;
  const H = SLIDE_H;
  // Section dividers use a strong brand background whatever the deck style.
  const t = layout === "divider" ? (o.style === "blue" ? THEMES.ink : THEMES.blue) : THEMES[o.style];
  c.clearRect(0, 0, W, H);
  t.bg(c, W, H);

  const px = 136;
  const py = 112;
  const maxW = W - px * 2;
  const bigLockup = layout === "title" || layout === "closing";

  // Footer: small lockup, footer text, slide number.
  const hasFooter = (o.footer && !bigLockup) || (o.numbers && n > 0);
  const fy = H - 72;
  if (o.footer && !bigLockup) {
    const lw = drawLockup(c, t, fonts, px, fy - 18, 36);
    drawLine(c, o.footerText, fonts, "sans", 26, t.sub, px + lw + 36, fy, maxW - lw - 200);
    c.save();
    c.fillStyle = t.line;
    c.fillRect(px + lw + 18, fy - 14, 2, 28);
    c.restore();
  }
  if (o.numbers && n > 0) drawLine(c, String(n).padStart(2, "0"), fonts, "sans", 26, t.sub, W - px, fy, 120, "right", 600);
  const top = py;
  const bottom = hasFooter ? H - 150 : H - py;
  const areaH = bottom - top;

  const bigMark = (alpha = t.decoAlpha) => {
    const s = H * 1.15;
    drawMark(c, W - s * 0.78, H * 0.02, s, t.deco, alpha);
  };
  const center = (s: Stack, y0 = top, h = areaH, bias = 0.5) => y0 + (h - s.h) * bias;

  if (layout === "title") {
    bigMark();
    drawLockup(c, t, fonts, px, py, 64);
    const presenter = (f.presenter ?? "").trim();
    const y0 = py + 64 + 48;
    const y1 = presenter ? H - py - 60 : bottom;
    const s = fitStack(
      c,
      [
        { kind: "text", text: f.title ?? "", face: "display", size: 116, lh: 1.06, maxLines: 3, color: t.text },
        { kind: "text", text: f.subtitle ?? "", face: "sans", size: 42, lh: 1.4, maxLines: 3, color: t.sub, gap: 36 },
      ],
      fonts,
      W * 0.64,
      y1 - y0 - 40,
    );
    drawStack(c, s, fonts, px, center(s, y0, y1 - y0, 0.5), W * 0.64);
    if (presenter) drawLine(c, presenter, fonts, "sans", 32, t.sub, px, H - py - 16, W * 0.64);
  } else if (layout === "divider") {
    bigMark(0.14);
    const s = fitStack(
      c,
      [
        { kind: "text", text: f.number ?? "", face: "display", size: 220, lh: 1.0, maxLines: 1, color: t.accent, min: 0.4 },
        { kind: "rule", w: 120, h: 10, color: t.accent, gap: 36 },
        { kind: "text", text: f.title ?? "", face: "display", size: 110, lh: 1.06, maxLines: 3, color: t.text, gap: 48 },
      ],
      fonts,
      W * 0.66,
      areaH,
    );
    drawStack(c, s, fonts, px, center(s), W * 0.66);
  } else if (layout === "content") {
    const mark = (f.mark ?? "") === "1";
    const colW = mark ? W * 0.6 : maxW;
    if (mark) {
      const s = 700;
      drawMark(c, W - s - px * 0.6, (H - s) / 2 - 20, s, t.deco, t.decoAlpha * 0.8);
    }
    const s = fitStack(
      c,
      [
        { kind: "text", text: f.title ?? "", face: "display", size: 76, lh: 1.1, maxLines: 2, color: t.text },
        { kind: "rule", w: 96, h: 8, color: t.accent, gap: 36 },
        { kind: "list", items: items(f.bullets, 6), face: "sans", size: 42, lh: 1.35, maxLines: 2, color: t.text, marker: t.accent, gap: 56, itemGap: 26, min: 0.75 },
      ],
      fonts,
      colW,
      areaH,
    );
    drawStack(c, s, fonts, px, center(s, top, areaH, 0.4), colW);
  } else if (layout === "two") {
    const gap = 112;
    const colW = (maxW - gap) / 2;
    const head = fitStack(
      c,
      [
        { kind: "text", text: f.title ?? "", face: "display", size: 76, lh: 1.1, maxLines: 2, color: t.text },
        { kind: "rule", w: 96, h: 8, color: t.accent, gap: 36 },
      ],
      fonts,
      maxW,
      areaH * 0.4,
    );
    const colTop = 72;
    const colH = areaH - head.h - colTop;
    const col = (h: string, b: string): Block[] => [
      { kind: "text", text: h, face: "display", size: 46, lh: 1.15, maxLines: 2, color: t.accent },
      { kind: "list", items: items(b, 5), face: "sans", size: 38, lh: 1.35, maxLines: 3, color: t.text, marker: t.accent, gap: 32, itemGap: 22, min: 0.75 },
    ];
    // Fit both columns, then lay both out at the smaller scale so they match.
    const a = fitStack(c, col(f.leftHead ?? "", f.left ?? ""), fonts, colW, colH);
    const b = fitStack(c, col(f.rightHead ?? "", f.right ?? ""), fonts, colW, colH);
    const k = Math.min(a.k, b.k);
    const A = fitStack(c, col(f.leftHead ?? "", f.left ?? ""), fonts, colW, colH, k);
    const B = fitStack(c, col(f.rightHead ?? "", f.right ?? ""), fonts, colW, colH, k);
    const total = head.h + colTop + Math.max(A.h, B.h);
    const y0 = top + (areaH - total) * 0.4;
    drawStack(c, head, fonts, px, y0, maxW);
    const cy = y0 + head.h + colTop;
    drawStack(c, A, fonts, px, cy, colW);
    drawStack(c, B, fonts, px + colW + gap, cy, colW);
    c.save();
    c.fillStyle = t.line;
    c.fillRect(px + colW + gap / 2 - 1, cy, 2, Math.max(A.h, B.h));
    c.restore();
  } else if (layout === "number") {
    bigMark();
    const source = (f.source ?? "").trim();
    const h = source ? areaH - 80 : areaH;
    const s = fitStack(
      c,
      [
        { kind: "text", text: f.number ?? "", face: "display", size: 260, lh: 1.02, maxLines: 1, color: t.accent, min: 0.3 },
        { kind: "rule", w: 120, h: 10, color: t.accent, gap: 32 },
        { kind: "text", text: f.caption ?? "", face: "display", size: 68, lh: 1.12, maxLines: 3, color: t.text, gap: 44 },
      ],
      fonts,
      W * 0.66,
      h,
    );
    drawStack(c, s, fonts, px, center(s, top, h), W * 0.66);
    if (source) drawLine(c, source, fonts, "sans", 28, t.sub, px, bottom - 14, W * 0.66);
  } else if (layout === "quote") {
    const q = 320;
    c.save();
    c.font = font(fonts, "display", q);
    c.fillStyle = t.accent;
    c.globalAlpha = o.style === "blue" ? 0.5 : 0.9;
    c.textBaseline = "top";
    c.fillText("“", px - q * 0.06, top - q * 0.14);
    c.restore();
    const y0 = top + q * 0.5;
    const s = fitStack(
      c,
      [
        { kind: "text", text: f.quote ?? "", face: "display", size: 72, lh: 1.2, maxLines: 6, color: t.text, min: 0.6 },
        { kind: "rule", w: 72, h: 6, color: t.accent, gap: 56 },
        { kind: "text", text: f.attribution ?? "", face: "sans", size: 36, lh: 1.35, maxLines: 2, color: t.sub, gap: 28 },
      ],
      fonts,
      W * 0.78,
      bottom - y0,
    );
    drawStack(c, s, fonts, px, center(s, y0, bottom - y0, 0.4), W * 0.78);
  } else {
    bigMark(t.decoAlpha * 0.7);
    const mk = 84;
    const s = fitStack(
      c,
      [
        { kind: "text", text: f.cta ?? "", face: "display", size: 112, lh: 1.08, maxLines: 3, color: t.text, align: "center" },
        { kind: "text", text: f.contact ?? "", face: "sans", size: 44, lh: 1.4, maxLines: 2, color: t.accent, gap: 44, align: "center", weight: 600 },
      ],
      fonts,
      W * 0.72,
      areaH - mk - 72,
    );
    const total = mk + 72 + s.h;
    const y0 = top + (areaH - total) / 2;
    drawLockup(c, t, fonts, (W - lockupWidth(c, fonts, mk)) / 2, y0, mk);
    drawStack(c, s, fonts, W * 0.14, y0 + mk + 72, W * 0.72);
  }
}

interface FieldDef {
  key: string;
  label: string;
  type?: "area" | "toggle";
  max?: number;
}

interface SlideDef {
  layout: Layout;
  name: string;
  fields: FieldDef[];
  defaults: SlideFields;
}

// Placeholders stay in [brackets]; nothing here invents numbers or quotes.
export const SLIDES: SlideDef[] = [
  {
    layout: "title",
    name: "Title",
    fields: [
      { key: "title", label: "Title", max: 80 },
      { key: "subtitle", label: "Subtitle", type: "area", max: 160 },
      { key: "presenter", label: "Presenter / date", max: 80 },
    ],
    defaults: {
      title: "Ads that pay off.",
      subtitle: "How Adwise helps growing businesses stop wasted spend and find what works.",
      presenter: "[Presenter name] · [Date]",
    },
  },
  {
    layout: "divider",
    name: "Section divider",
    fields: [
      { key: "number", label: "Section number", max: 6 },
      { key: "title", label: "Section title", max: 60 },
    ],
    defaults: { number: "01", title: "The problem" },
  },
  {
    layout: "content",
    name: "Content",
    fields: [
      { key: "title", label: "Title", max: 80 },
      { key: "bullets", label: "Bullets (one per line, up to 6)", type: "area", max: 600 },
      { key: "mark", label: "Faint mark on the right", type: "toggle" },
    ],
    defaults: {
      title: "Most ad accounts have a leak",
      bullets:
        "Campaigns that spend every day and never convert\nAds people have seen too often and stopped clicking\nAds running at hours that never bring sales\nLeads counted, but never tracked to a sale",
      mark: "1",
    },
  },
  {
    layout: "two",
    name: "Two columns",
    fields: [
      { key: "title", label: "Title", max: 80 },
      { key: "leftHead", label: "Left heading", max: 40 },
      { key: "left", label: "Left bullets (one per line)", type: "area", max: 400 },
      { key: "rightHead", label: "Right heading", max: 40 },
      { key: "right", label: "Right bullets (one per line)", type: "area", max: 400 },
    ],
    defaults: {
      title: "What Adwise does for your ads",
      leftHead: "Find what works",
      left: "Real results for every campaign, ad and hour\nLeads tracked from the ad to the sale\nAlerts when spend spikes or results drop",
      rightHead: "Stop wasted spend",
      right: "Pause campaigns that spend without results\nScale winners in safe 20% steps\nDry run first, and one-click undo",
    },
  },
  {
    layout: "number",
    name: "Big number",
    fields: [
      { key: "number", label: "Number", max: 16 },
      { key: "caption", label: "Caption", max: 100 },
      { key: "source", label: "Source line", max: 120 },
    ],
    defaults: { number: "₹[amount]", caption: "[What this number measures]", source: "Source: [where the number comes from]" },
  },
  {
    layout: "quote",
    name: "Quote",
    fields: [
      { key: "quote", label: "Quote", type: "area", max: 300 },
      { key: "attribution", label: "Attribution", max: 100 },
    ],
    defaults: {
      quote: "[The customer's exact words. Only use real quotes you have permission to share.]",
      attribution: "[Customer name], [Role, Company]",
    },
  },
  {
    layout: "closing",
    name: "Closing",
    fields: [
      { key: "cta", label: "Call to action", max: 80 },
      { key: "contact", label: "URL / contact", max: 80 },
    ],
    defaults: { cta: "Stop paying for ads that don't work.", contact: "adwise.io" },
  },
];
// #endregion draw

const fileName = (i: number, d: SlideDef, style: Style) => `adwise-slide-${String(i + 1).padStart(2, "0")}-${d.layout}-${style}.png`;

function SlideCard({
  d,
  index,
  fields,
  setField,
  opts,
  fonts,
}: {
  d: SlideDef;
  index: number;
  fields: SlideFields;
  setField: (key: string, v: string) => void;
  opts: DeckOptions;
  fonts: Fonts;
}) {
  const paint = useCallback((c: CanvasRenderingContext2D) => drawSlide(c, d.layout, fields, opts, index + 1, fonts), [d.layout, fields, opts, index, fonts]);

  return (
    <li className="grid overflow-hidden rounded-xl border border-border bg-surface shadow-xs lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="grid content-start gap-3 p-4">
        <p className="text-sm font-medium text-fg">
          <span className="font-mono text-fg-muted">{String(index + 1).padStart(2, "0")}</span> {d.name}
        </p>
        {d.fields.map((fd) => {
          const id = `slide-${d.layout}-${fd.key}`;
          if (fd.type === "toggle")
            return (
              <div key={fd.key} className="flex items-center gap-2">
                <Switch id={id} checked={fields[fd.key] === "1"} onCheckedChange={(v) => setField(fd.key, v ? "1" : "")} />
                <Label htmlFor={id} className="text-xs text-fg-muted">
                  {fd.label}
                </Label>
              </div>
            );
          return (
            <div key={fd.key} className="grid gap-1">
              <Label htmlFor={id} className="text-xs text-fg-muted">
                {fd.label}
              </Label>
              {fd.type === "area" ? (
                <textarea id={id} rows={3} className={TEXTAREA_CLASS} value={fields[fd.key] ?? ""} maxLength={fd.max} onChange={(e) => setField(fd.key, e.target.value)} />
              ) : (
                <Input id={id} value={fields[fd.key] ?? ""} maxLength={fd.max} onChange={(e) => setField(fd.key, e.target.value)} />
              )}
            </div>
          );
        })}
        <div className="pt-1">
          <Button size="sm" variant="outline" onClick={() => downloadPng(SLIDE_W, SLIDE_H, paint, fileName(index, d, opts.style))}>
            <Download aria-hidden="true" /> PNG
          </Button>
        </div>
      </div>
      <div className="grid place-items-center border-t border-border bg-bg-subtle p-3 lg:border-t-0 lg:border-l">
        <CanvasPreview w={SLIDE_W} h={SLIDE_H} paint={paint} max={720} label={`Slide ${index + 1}: ${d.name} preview`} />
      </div>
    </li>
  );
}

export function SlideStudio() {
  const fonts = useFonts();
  const [style, setStyle] = useState<Style>("ink");
  const [footer, setFooter] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [footerText, setFooterText] = useState("adwise.io");
  const [deck, setDeck] = useState<SlideFields[]>(() => SLIDES.map((s) => ({ ...s.defaults })));
  const [busy, setBusy] = useState(false);
  // One object per option set so previews only redraw when it changes.
  const memo = useMemo<DeckOptions>(() => ({ style, footer, numbers, footerText }), [style, footer, numbers, footerText]);

  const setField = (i: number) => (key: string, v: string) => setDeck((d) => d.map((f, j) => (j === i ? { ...f, [key]: v } : f)));
  const render = (i: number) => renderCanvas(SLIDE_W, SLIDE_H, (c) => drawSlide(c, SLIDES[i].layout, deck[i], memo, i + 1, fonts!));

  const downloadAll = async () => {
    if (!fonts) return;
    setBusy(true);
    try {
      for (let i = 0; i < SLIDES.length; i++) {
        downloadPng(SLIDE_W, SLIDE_H, (c) => drawSlide(c, SLIDES[i].layout, deck[i], memo, i + 1, fonts), fileName(i, SLIDES[i], style));
        // Browsers drop rapid back-to-back downloads; space them out.
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      setBusy(false);
    }
  };

  const printPdf = () => {
    if (!fonts) return;
    // Open synchronously so popup blockers allow it, then fill it.
    const win = window.open("", "_blank");
    if (!win) return toast.error("Allow pop-ups to save as PDF");
    const imgs = SLIDES.map((_, i) => `<img src="${render(i).toDataURL("image/png")}" alt="Slide ${i + 1}">`).join("");
    win.document.write(`<!doctype html><html><head><title>Adwise slides</title><style>
@page { size: 1920px 1080px; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
img { display: block; width: 1920px; height: 1080px; page-break-after: always; break-after: page; }
img:last-child { page-break-after: auto; break-after: auto; }
@media screen { body { background: #888; } img { width: 100%; height: auto; margin: 0 0 12px; } }
</style></head><body>${imgs}<script>
Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => { setTimeout(() => window.print(), 100); });
<\/script></body></html>`);
    win.document.close();
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs md:grid-cols-[auto_auto_1fr] md:items-end">
        <StylePicker style={style} setStyle={setStyle} />
        <div className="flex flex-wrap items-center gap-4 pb-1.5">
          <div className="flex items-center gap-2">
            <Switch id="slide-footer" checked={footer} onCheckedChange={setFooter} />
            <Label htmlFor="slide-footer" className="text-xs text-fg-muted">
              Footer
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="slide-numbers" checked={numbers} onCheckedChange={setNumbers} />
            <Label htmlFor="slide-numbers" className="text-xs text-fg-muted">
              Slide numbers
            </Label>
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="slide-footer-text" className="text-xs text-fg-muted">
            Footer text
          </Label>
          <Input id="slide-footer-text" value={footerText} maxLength={80} disabled={!footer} onChange={(e) => setFooterText(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Button size="sm" variant="outline" disabled={!fonts || busy} onClick={downloadAll}>
            <Images aria-hidden="true" /> {busy ? "Downloading…" : `Download all (${SLIDES.length} PNGs)`}
          </Button>
          <Button size="sm" variant="outline" disabled={!fonts} onClick={printPdf}>
            <FileDown aria-hidden="true" /> Save as PDF
          </Button>
          <p className="self-center text-xs text-fg-subtle">PDF opens the print dialog: choose “Save as PDF”.</p>
        </div>
      </div>
      {fonts ? (
        <ul className="grid gap-3">
          {SLIDES.map((d, i) => (
            <SlideCard key={d.layout} d={d} index={i} fields={deck[i]} setField={setField(i)} opts={memo} fonts={fonts} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">Loading fonts…</p>
      )}
    </div>
  );
}
