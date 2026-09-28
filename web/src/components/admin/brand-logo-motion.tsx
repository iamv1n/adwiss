"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LOGO_GRADIENTS, LOGO_PATHS } from "@/components/app/logo";
import { cn } from "@/lib/utils";

/**
 * Animated logo: the three planes of the mark fold into place. One motion
 * function (`pose`) drives both exports, so the animated SVG and the video
 * match: the SVG's CSS keyframes are sampled from it, and the video draws it
 * frame by frame on a canvas.
 */

type Variant = "intro" | "loader";
type Bg = "ink" | "mist" | "blue" | "none";

const BG: Record<Bg, { fill: string | null; text: string; mono: boolean; label: string }> = {
  ink: { fill: "#030921", text: "#FFFFFF", mono: false, label: "Ink" },
  mist: { fill: "#EEF4FE", text: "#030921", mono: false, label: "Mist" },
  blue: { fill: "#005BFD", text: "#FFFFFF", mono: true, label: "Blue" },
  none: { fill: null, text: "#030921", mono: false, label: "Transparent" },
};

/** Piece order: the big left plane lands first, then the right plane, then the lower triangle. */
const PIECES = [
  { path: 2, origin: [190, 230], from: { x: -70, y: 45, r: -14, s: 0.92 }, delay: 0 },
  { path: 0, origin: [360, 220], from: { x: 60, y: -45, r: 12, s: 0.92 }, delay: 0.14 },
  { path: 1, origin: [305, 385], from: { x: 25, y: 80, r: -20, s: 0.8 }, delay: 0.28 },
] as const;

const FOLD = 0.62; // seconds for one piece to land
const TIMING: Record<Variant, { total: number; outAt?: number }> = {
  intro: { total: 3.2 },
  loader: { total: 2.4, outAt: 1.75 },
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Ease-out with a small overshoot: the "fold" settling. */
const easeOutBack = (t: number) => {
  const c1 = 1.25, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const easeInCubic = (t: number) => t * t * t;

interface Pose {
  x: number;
  y: number;
  r: number;
  s: number;
  o: number;
}

/** Where piece `i` is at time `t` (seconds) in the variant's cycle. */
function pose(variant: Variant, i: number, t: number): Pose {
  const p = PIECES[i];
  const { outAt } = TIMING[variant];
  let k: number; // 0 = away, 1 = in place
  if (outAt != null && t >= outAt) {
    // Fold out in reverse order.
    const d = (PIECES.length - 1 - i) * 0.08;
    k = 1 - easeInCubic(clamp((t - outAt - d) / 0.4));
  } else {
    k = easeOutBack(clamp((t - p.delay) / FOLD));
  }
  const inv = 1 - k;
  return {
    x: p.from.x * inv,
    y: p.from.y * inv,
    r: p.from.r * inv,
    s: 1 - (1 - p.from.s) * inv,
    o: clamp(k * 1.6),
  };
}

/** Wordmark reveal for the intro (0..1). */
const wordReveal = (t: number) => clamp((t - 0.85) / 0.5);

// --- animated SVG export ---

// A square canvas around the mark (centre 232, 257.5) with room for the
// pieces to fly in from outside it.
const VB = 540;
const VB_X = 232 - VB / 2;
const VB_Y = 257.5 - VB / 2;

function animatedSvg(variant: Variant, bg: Bg) {
  const { total } = TIMING[variant];
  const b = BG[bg];
  const steps = 48;
  const css: string[] = [];
  PIECES.forEach((p, i) => {
    const frames = Array.from({ length: steps + 1 }, (_, n) => {
      const t = (n / steps) * total;
      const q = pose(variant, i, t);
      return `${((n / steps) * 100).toFixed(2)}%{transform:translate(${q.x.toFixed(2)}px,${q.y.toFixed(2)}px) rotate(${q.r.toFixed(2)}deg) scale(${q.s.toFixed(3)});opacity:${q.o.toFixed(3)}}`;
    }).join("");
    css.push(
      `@keyframes aw${i}{${frames}}`,
      // With transform-box:view-box the origin is measured from the viewBox's
      // top-left corner (VB_X, VB_Y), not from user-space 0,0.
      `.aw${i}{transform-box:view-box;transform-origin:${p.origin[0] - VB_X}px ${p.origin[1] - VB_Y}px;animation:aw${i} ${total}s linear ${variant === "loader" ? "infinite" : "1 both"}}`,
    );
  });
  css.push("@media (prefers-reduced-motion:reduce){.aw0,.aw1,.aw2{animation:none}}");
  const defs = b.mono
    ? ""
    : `<defs>${LOGO_GRADIENTS.map(
        (g, i) =>
          `<linearGradient id="awg${i}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" gradientUnits="userSpaceOnUse">${g.stops
            .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
            .join("")}</linearGradient>`,
      ).join("")}</defs>`;
  const paths = PIECES.map(
    (p, i) => `<path class="aw${i}" d="${LOGO_PATHS[p.path]}" fill="${b.mono ? "#FFFFFF" : `url(#awg${p.path})`}"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB_X} ${VB_Y} ${VB} ${VB}" width="${VB}" height="${VB}" role="img" aria-label="Adwise">
<style>${css.join("")}</style>${defs}${b.fill ? `<rect x="${VB_X}" y="${VB_Y}" width="${VB}" height="${VB}" fill="${b.fill}"/>` : ""}${paths}</svg>`;
}

// --- canvas (video) ---

function drawFrame(c: CanvasRenderingContext2D, w: number, h: number, variant: Variant, bg: Bg, t: number, displayFont: string) {
  const b = BG[bg];
  c.clearRect(0, 0, w, h);
  if (b.fill) {
    c.fillStyle = b.fill;
    c.fillRect(0, 0, w, h);
  }
  const markSize = h * 0.34;
  const showWord = variant === "intro";
  const wordSize = markSize * 0.62;
  c.font = `600 ${wordSize}px ${displayFont}`;
  const wordW = showWord ? c.measureText("Adwise").width : 0;
  const gap = markSize * 0.3;
  const reveal = showWord ? easeOutBack(wordReveal(t)) : 0;
  // The lockup slides from "mark centered" to "mark + wordmark centered".
  const fullW = markSize + gap + wordW;
  const startX = (w - markSize) / 2;
  const endX = (w - fullW) / 2;
  const mx = startX + (endX - startX) * reveal;
  const my = (h - markSize) / 2;

  PIECES.forEach((p, i) => {
    const q = pose(variant, i, t);
    c.save();
    c.globalAlpha = q.o;
    c.translate(mx, my);
    c.scale(markSize / 420, markSize / 420);
    c.translate(-22, -47.5);
    c.translate(p.origin[0] + q.x, p.origin[1] + q.y);
    c.rotate((q.r * Math.PI) / 180);
    c.scale(q.s, q.s);
    c.translate(-p.origin[0], -p.origin[1]);
    if (b.mono) c.fillStyle = "#FFFFFF";
    else {
      const g = LOGO_GRADIENTS[p.path];
      const lg = c.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
      g.stops.forEach(([o, col]) => lg.addColorStop(o, col));
      c.fillStyle = lg;
    }
    c.fill(new Path2D(LOGO_PATHS[p.path]));
    c.restore();
  });

  if (showWord && reveal > 0) {
    c.save();
    c.globalAlpha = clamp(wordReveal(t) * 1.4);
    c.fillStyle = b.text;
    c.textBaseline = "middle";
    c.fillText("Adwise", mx + markSize + gap - (1 - reveal) * markSize * 0.25, h / 2 + wordSize * 0.04);
    c.restore();
  }
}

function useDisplayFont() {
  const [font, setFont] = useState<string | null>(null);
  useEffect(() => {
    const f = getComputedStyle(document.documentElement).getPropertyValue("--font-display-face").trim() || "sans-serif";
    document.fonts
      .load(`600 40px ${f}`)
      .catch(() => undefined)
      .then(() => setFont(f));
  }, []);
  return font;
}

async function recordVideo(variant: Variant, bg: Bg, font: string, size: { w: number; h: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const c = canvas.getContext("2d")!;
  const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("This browser can't record video");
  const stream = canvas.captureStream(60);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((ok) => (rec.onstop = () => ok(new Blob(chunks, { type }))));
  // Loader: record two cycles so it loops cleanly when played on repeat.
  const duration = TIMING[variant].total * (variant === "loader" ? 2 : 1) + 0.3;
  drawFrame(c, size.w, size.h, variant, bg === "none" ? "ink" : bg, 0, font);
  rec.start();
  const start = performance.now();
  await new Promise<void>((ok) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const cycle = variant === "loader" ? t % TIMING.loader.total : Math.min(t, TIMING.intro.total);
      drawFrame(c, size.w, size.h, variant, bg === "none" ? "ink" : bg, cycle, font);
      if (t < duration) requestAnimationFrame(tick);
      else ok();
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  const blob = await done;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `adwise-logo-${variant}-${bg === "none" ? "ink" : bg}-${size.w}x${size.h}.${type.includes("mp4") ? "mp4" : "webm"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// --- UI ---

function Preview({ variant, bg, font, playKey }: { variant: Variant; bg: Bg; font: string; playKey: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const c = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 640, h = 360;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const cycle = reduce ? TIMING[variant].outAt ?? TIMING[variant].total : variant === "loader" ? t % TIMING.loader.total : Math.min(t, TIMING.intro.total);
      drawFrame(c, w, h, variant, bg, cycle, font);
      if (!reduce && (variant === "loader" || t < TIMING.intro.total)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [variant, bg, font, playKey]);
  return (
    <canvas
      ref={ref}
      className={cn(
        "aspect-video w-full rounded-xl border border-border",
        bg === "none" &&
          "bg-[conic-gradient(var(--color-bg-subtle)_25%,var(--color-surface)_0_50%,var(--color-bg-subtle)_0_75%,var(--color-surface)_0)] bg-[length:16px_16px]",
      )}
      aria-label={`Animated Adwise logo, ${variant}`}
    />
  );
}

export function LogoMotion() {
  const font = useDisplayFont();
  const [variant, setVariant] = useState<Variant>("intro");
  const [bg, setBg] = useState<Bg>("ink");
  const [playKey, setPlayKey] = useState(0);
  const [recording, setRecording] = useState<string | null>(null);
  const svg = useMemo(() => animatedSvg(variant, bg), [variant, bg]);

  const downloadSvg = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = `adwise-logo-${variant}-${bg}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const video = async (w: number, h: number) => {
    if (!font) return;
    const id = `${w}x${h}`;
    setRecording(id);
    try {
      await recordVideo(variant, bg, font, { w, h });
      toast.success("Video saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record the video");
    } finally {
      setRecording(null);
    }
  };

  const seg = <T extends string>(value: T, set: (v: T) => void, opts: [T, string][], label: string) => (
    <div className="grid gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
        {opts.map(([id, l]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => {
              set(id);
              setPlayKey((k) => k + 1);
            }}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium",
              value === id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:bg-bg-subtle",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-2">
        {font ? <Preview variant={variant} bg={bg} font={font} playKey={playKey} /> : <p className="text-sm text-fg-muted">Loading…</p>}
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setPlayKey((k) => k + 1)}>
          <RotateCcw aria-hidden="true" /> Replay
        </Button>
      </div>
      <div className="grid content-start gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
        {seg(variant, setVariant, [["intro", "Intro"], ["loader", "Loader (loops)"]], "Animation")}
        {seg(bg, setBg, (Object.keys(BG) as Bg[]).map((k) => [k, BG[k].label]), "Background")}
        <p className="text-xs text-fg-muted">
          {variant === "intro"
            ? "The planes fold in, then the wordmark slides out beside the mark. For video intros, outros and splash screens."
            : "Folds in, holds, folds out, and repeats. For loading screens and spinners; keep it under 2 seconds of waiting where you can."}
        </p>
        <div className="grid gap-2">
          <p className="text-xs font-medium text-fg">Animated SVG</p>
          <p className="text-xs text-fg-muted">
            Mark only, plays anywhere an SVG shows (websites, docs). Respects reduced-motion settings.
          </p>
          <Button size="sm" variant="outline" className="justify-self-start" onClick={downloadSvg}>
            <Download aria-hidden="true" /> Download SVG
          </Button>
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-medium text-fg">Video</p>
          <p className="text-xs text-fg-muted">
            Recorded in your browser in real time (a few seconds), as WebM. Transparent isn&apos;t supported in video, so it uses Ink.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              [1920, 1080, "1080p"],
              [1080, 1080, "Square"],
              [1080, 1920, "Vertical"],
            ].map(([w, h, label]) => (
              <Button
                key={label}
                size="sm"
                variant="outline"
                disabled={!font || recording !== null}
                onClick={() => video(Number(w), Number(h))}
              >
                {recording === `${w}x${h}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Film aria-hidden="true" />}
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
