"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LOGO_GRADIENTS, LOGO_PATHS } from "@/components/app/logo";
import { cn } from "@/lib/utils";

/**
 * Shared Canvas 2D helpers for the Brand kit image generators (banners,
 * social posts, slides). Drawn with canvas (not SVG) so the app's loaded web
 * fonts end up in the exported PNGs.
 */

// #region draw
export type Style = "ink" | "mist" | "blue";

export interface Fonts {
  display: string;
  sans: string;
}

export interface Theme {
  bg: (c: CanvasRenderingContext2D, w: number, h: number) => void;
  text: string;
  sub: string;
  mark: "color" | "white";
  deco: string;
  decoAlpha: number;
  /** Highlight color for labels, numbers, bullets and CTAs. */
  accent: string;
  pillBg: string;
  pillFg: string;
  /** Hairlines and faint fills. */
  line: string;
}

export const THEMES: Record<Style, Theme> = {
  ink: {
    bg: (c, w, h) => {
      c.fillStyle = "#030921";
      c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, Math.max(w, h) * 0.8);
      g.addColorStop(0, "rgba(0,91,253,0.35)");
      g.addColorStop(1, "rgba(0,91,253,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
    text: "#FFFFFF",
    sub: "rgba(214,226,255,0.78)",
    mark: "color",
    deco: "color",
    decoAlpha: 0.22,
    accent: "#6C84FE",
    pillBg: "#005BFD",
    pillFg: "#FFFFFF",
    line: "rgba(214,226,255,0.18)",
  },
  mist: {
    bg: (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#FFFFFF");
      g.addColorStop(1, "#EEF4FE");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
    text: "#030921",
    sub: "#3B4660",
    mark: "color",
    deco: "color",
    decoAlpha: 0.14,
    accent: "#005BFD",
    pillBg: "#005BFD",
    pillFg: "#FFFFFF",
    line: "rgba(3,9,33,0.12)",
  },
  blue: {
    bg: (c, w, h) => {
      const g = c.createLinearGradient(0, h, w, 0);
      g.addColorStop(0, "#0F24A2");
      g.addColorStop(0.55, "#005BFD");
      g.addColorStop(1, "#3351E4");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
    text: "#FFFFFF",
    sub: "rgba(255,255,255,0.82)",
    mark: "white",
    deco: "#FFFFFF",
    decoAlpha: 0.12,
    accent: "#FFFFFF",
    pillBg: "#FFFFFF",
    pillFg: "#0F24A2",
    line: "rgba(255,255,255,0.24)",
  },
};

/** Draws the mark with its top-left at (x, y), `size` px square. */
export function drawMark(c: CanvasRenderingContext2D, x: number, y: number, size: number, fill: "color" | string, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.scale(size / 420, size / 420);
  c.translate(-22, -47.5);
  LOGO_PATHS.forEach((d, i) => {
    if (fill === "color") {
      const g = LOGO_GRADIENTS[i];
      const lg = c.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
      g.stops.forEach(([o, col]) => lg.addColorStop(o, col));
      c.fillStyle = lg;
    } else c.fillStyle = fill;
    c.fill(new Path2D(d));
  });
  c.restore();
}

export function wrap(c: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Wraps keeping explicit line breaks (blank lines are dropped). */
function wrapParas(c: CanvasRenderingContext2D, text: string, maxW: number) {
  return text.split(/\n+/).flatMap((p) => wrap(c, p, maxW));
}

/** Shortens `line` with an ellipsis until it fits `maxW`. */
function ellipsize(c: CanvasRenderingContext2D, line: string, maxW: number, force = false) {
  if (!force && c.measureText(line).width <= maxW) return line;
  let s = line;
  while (s && c.measureText(`${s}…`).width > maxW) s = s.includes(" ") ? s.slice(0, s.lastIndexOf(" ")) : s.slice(0, -1);
  return `${s.replace(/[\s,.;:–-]+$/, "")}…`;
}

function setSpacing(c: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

export type Face = "display" | "sans";

export function font(fonts: Fonts, face: Face, px: number, weight = face === "display" ? 600 : 400) {
  return `${weight} ${px}px ${face === "display" ? fonts.display : fonts.sans}`;
}

/**
 * Wraps `text` into at most `maxLines`, shrinking from `px` down to `minPx`
 * first and ellipsizing only as a last resort. Never returns a line wider
 * than `maxW`.
 */
export function fitText(c: CanvasRenderingContext2D, text: string, mk: (px: number) => string, px: number, minPx: number, maxW: number, maxLines: number) {
  let lines: string[] = [];
  for (;;) {
    c.font = mk(px);
    lines = wrapParas(c, text, maxW);
    const fits = lines.length <= maxLines && lines.every((l) => c.measureText(l).width <= maxW);
    if (fits || px * 0.95 < minPx) break;
    px *= 0.95;
  }
  const cut = lines.length > maxLines;
  lines = lines.slice(0, maxLines).map((l, i, a) => ellipsize(c, l, maxW, cut && i === a.length - 1));
  return { lines, px };
}

/** A vertical stack of text blocks laid out with one shared scale factor. */
export type Block =
  | {
      kind: "text";
      text: string;
      face: Face;
      weight?: number;
      size: number;
      lh: number;
      maxLines: number;
      color: string;
      gap?: number;
      /** Smallest size, as a fraction of `size`, before ellipsizing. */
      min?: number;
      /** Uppercase eyebrow with letter spacing (em). */
      caps?: number;
      align?: "left" | "center";
    }
  | { kind: "list"; items: string[]; face: Face; size: number; lh: number; maxLines: number; color: string; marker: string; gap?: number; itemGap: number; min?: number }
  | { kind: "pill"; text: string; size: number; bg: string; fg: string; gap?: number; align?: "left" | "center" }
  | { kind: "rule"; w: number; h: number; color: string; gap?: number; align?: "left" | "center" }
  | { kind: "space"; h: number };

interface Laid {
  b: Block;
  px: number;
  gap: number;
  lines: string[][];
  h: number;
}

export interface Stack {
  items: Laid[];
  h: number;
  /** The scale the stack was laid out at. */
  k: number;
}

function layout(c: CanvasRenderingContext2D, blocks: Block[], fonts: Fonts, maxW: number, k: number): Stack {
  let total = 0;
  const items: Laid[] = [];
  blocks.forEach((b, i) => {
    const gap = i === 0 || b.kind === "space" ? 0 : (b.gap ?? 0) * k;
    let px = 0;
    let lines: string[][] = [];
    let h = 0;
    if (b.kind === "text") {
      if (!b.text.trim()) return;
      const text = b.caps ? b.text.toUpperCase() : b.text;
      setSpacing(c, b.caps ? b.size * k * b.caps : 0);
      const r = fitText(c, text, (p) => font(fonts, b.face, p, b.weight), b.size * k, b.size * k * (b.min ?? 0.8), maxW, b.maxLines);
      setSpacing(c, 0);
      px = r.px;
      lines = [r.lines];
      h = r.lines.length * px * b.lh;
    } else if (b.kind === "list") {
      const items = b.items.map((s) => s.trim()).filter(Boolean);
      if (!items.length) return;
      // One size for every item so the list reads evenly.
      px = b.size * k;
      const minPx = px * (b.min ?? 0.8);
      for (;;) {
        const indent = px * 1.2;
        const r = items.map((s) => fitText(c, s, (p) => font(fonts, b.face, p), px, px, maxW - indent, b.maxLines));
        const over = items.some((s) => {
          c.font = font(fonts, b.face, px);
          return wrapParas(c, s, maxW - indent).length > b.maxLines;
        });
        lines = r.map((x) => x.lines);
        if (!over || px * 0.95 < minPx) break;
        px *= 0.95;
      }
      h = lines.reduce((s, l) => s + l.length * px * b.lh, 0) + (lines.length - 1) * b.itemGap * (px / b.size);
    } else if (b.kind === "pill") {
      if (!b.text.trim()) return;
      px = b.size * k;
      h = px * 2.1;
    } else if (b.kind === "rule") {
      h = b.h * k;
    } else h = b.h * k;
    items.push({ b, px, gap, lines, h });
    total += gap + h;
  });
  return { items, h: total, k };
}

/** Lays out `blocks` to fit `maxW` × `maxH`, shrinking everything together. */
export function fitStack(c: CanvasRenderingContext2D, blocks: Block[], fonts: Fonts, maxW: number, maxH: number, k = 1): Stack {
  let s = layout(c, blocks, fonts, maxW, k);
  for (let i = 0; i < 30 && s.h > maxH; i++) {
    k *= 0.94;
    s = layout(c, blocks, fonts, maxW, k);
  }
  return s;
}

export function drawStack(c: CanvasRenderingContext2D, s: Stack, fonts: Fonts, x: number, y: number, maxW: number) {
  c.save();
  c.textBaseline = "middle";
  for (const { b, px, gap, lines, h } of s.items) {
    y += gap;
    if (b.kind === "text") {
      const center = b.align === "center";
      c.textAlign = center ? "center" : "left";
      c.font = font(fonts, b.face, px, b.weight);
      c.fillStyle = b.color;
      setSpacing(c, b.caps ? px * b.caps : 0);
      const lh = px * b.lh;
      lines[0].forEach((l, i) => c.fillText(l, center ? x + maxW / 2 : x, y + lh * i + lh / 2 + px * 0.04));
      setSpacing(c, 0);
    } else if (b.kind === "list") {
      c.textAlign = "left";
      c.font = font(fonts, b.face, px);
      const lh = px * b.lh;
      let yy = y;
      lines.forEach((item, idx) => {
        c.fillStyle = b.marker;
        c.beginPath();
        c.arc(x + px * 0.28, yy + lh / 2, px * 0.17, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = b.color;
        item.forEach((l, i) => c.fillText(l, x + px * 1.2, yy + lh * i + lh / 2 + px * 0.04));
        yy += item.length * lh + (idx < lines.length - 1 ? b.itemGap * (px / b.size) : 0);
      });
    } else if (b.kind === "pill") {
      c.font = font(fonts, "sans", px, 600);
      const tw = c.measureText(b.text).width;
      const pw = Math.min(tw + px * 1.8, maxW);
      const px0 = b.align === "center" ? x + (maxW - pw) / 2 : x;
      c.fillStyle = b.bg;
      c.beginPath();
      c.roundRect(px0, y, pw, h, h / 2);
      c.fill();
      c.fillStyle = b.fg;
      c.textAlign = "center";
      c.fillText(ellipsize(c, b.text, pw - px * 1.8), px0 + pw / 2, y + h / 2 + px * 0.04);
    } else if (b.kind === "rule") {
      const rw = b.w * (h / b.h);
      c.fillStyle = b.color;
      c.beginPath();
      c.roundRect(b.align === "center" ? x + (maxW - rw) / 2 : x, y, rw, h, h / 2);
      c.fill();
    }
    y += h;
  }
  c.restore();
}

/** Mark + "Adwise" wordmark. (x, y) is the top-left; returns the width. */
export function lockupWidth(c: CanvasRenderingContext2D, fonts: Fonts, markSize: number) {
  c.font = font(fonts, "display", markSize * 0.7);
  return markSize * 1.33 + c.measureText("Adwise").width;
}

export function drawLockup(c: CanvasRenderingContext2D, t: Theme, fonts: Fonts, x: number, y: number, markSize: number) {
  drawMark(c, x, y, markSize, t.mark === "color" ? "color" : "#FFFFFF");
  c.save();
  c.font = font(fonts, "display", markSize * 0.7);
  c.fillStyle = t.text;
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.fillText("Adwise", x + markSize * 1.33, y + markSize / 2 + markSize * 0.7 * 0.04);
  c.restore();
  return lockupWidth(c, fonts, markSize);
}

/** Single line of text, shrunk (then ellipsized) to fit `maxW`. */
export function drawLine(
  c: CanvasRenderingContext2D,
  text: string,
  fonts: Fonts,
  face: Face,
  px: number,
  color: string,
  x: number,
  y: number,
  maxW: number,
  align: CanvasTextAlign = "left",
  weight?: number,
) {
  if (!text.trim() || maxW <= 0) return;
  const r = fitText(c, text.replace(/\s+/g, " "), (p) => font(fonts, face, p, weight), px, px * 0.75, maxW, 1);
  c.save();
  c.font = font(fonts, face, r.px, weight);
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillText(r.lines[0] ?? "", x, y);
  c.restore();
}
// #endregion draw

export function useFonts() {
  const [fonts, setFonts] = useState<Fonts | null>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const f = {
      display: css.getPropertyValue("--font-display-face").trim() || "sans-serif",
      sans: css.getPropertyValue("--font-geist-sans").trim() || "sans-serif",
    };
    // Make sure the faces are loaded before drawing with them.
    Promise.all([document.fonts.load(`600 40px ${f.display}`), document.fonts.load(`400 20px ${f.sans}`), document.fonts.load(`600 20px ${f.sans}`)])
      .catch(() => undefined)
      .then(() => setFonts(f));
  }, []);
  return fonts;
}

/** Renders at full size into an offscreen canvas. */
export function renderCanvas(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  return canvas;
}

/** Renders at full size and downloads as a PNG. */
export function downloadPng(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void, filename: string) {
  renderCanvas(w, h, paint).toBlob((blob) => {
    if (!blob) return toast.error("Couldn't create the image");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
}

/** Live, scaled-down preview of a canvas drawing. */
export function CanvasPreview({
  w,
  h,
  paint,
  max = 720,
  label,
  className,
}: {
  w: number;
  h: number;
  paint: (c: CanvasRenderingContext2D) => void;
  max?: number;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scale = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const c = canvas.getContext("2d")!;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    paint(c);
  }, [w, h, paint, max]);
  return <canvas ref={ref} role="img" className={cn("h-auto w-auto max-w-full rounded-md shadow-sm", className)} aria-label={label} />;
}

export function StylePicker({ style, setStyle }: { style: Style; setStyle: (s: Style) => void }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-fg-muted">Style</span>
      <div className="flex gap-1" role="radiogroup" aria-label="Style">
        {(
          [
            ["ink", "Ink", "#030921"],
            ["mist", "Mist", "#EEF4FE"],
            ["blue", "Blue", "#005BFD"],
          ] as const
        ).map(([id, label, color]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={style === id}
            onClick={() => setStyle(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium",
              style === id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:bg-bg-subtle",
            )}
          >
            <span className="size-3 rounded-full border border-border" style={{ background: color }} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Textarea styled like the Input component. */
export const TEXTAREA_CLASS =
  "min-h-16 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";
