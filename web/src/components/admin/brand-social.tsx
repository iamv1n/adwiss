"use client";

import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
  useFonts,
  type Block,
  type Fonts,
  type Style,
} from "./brand-canvas";

/** Social post templates: tip, feature launch, customer quote and big number. */

// #region draw
export type SocialSize = "post" | "portrait" | "story";
export type SocialKind = "tip" | "feature" | "quote" | "stat";
export type Fields = Record<string, string>;

export const SOCIAL_SIZES: Record<SocialSize, { name: string; w: number; h: number }> = {
  post: { name: "Post", w: 1080, h: 1080 },
  portrait: { name: "Portrait", w: 1080, h: 1350 },
  story: { name: "Story", w: 1080, h: 1920 },
};

const lines = (s: string) => s.split("\n").map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim()).filter(Boolean);

export function drawSocial(c: CanvasRenderingContext2D, kind: SocialKind, size: SocialSize, style: Style, f: Fields, fonts: Fonts) {
  const { w: W, h: H } = SOCIAL_SIZES[size];
  const t = THEMES[style];
  c.clearRect(0, 0, W, H);
  t.bg(c, W, H);

  const pad = 88;
  // Stories: keep clear of the app's top bar and reply box.
  const top = size === "story" ? 250 : pad;
  const bottom = size === "story" ? 250 : pad;
  // Calm type scale (matches the banners); taller formats get larger type.
  const k0 = 0.88 * (size === "post" ? 1 : size === "portrait" ? 1.14 : 1.38);
  const maxW = W - pad * 2;

  // Decorative oversized mark bleeding off the top-right.
  if (kind !== "quote") {
    const s = W * 0.62;
    drawMark(c, W - s * 0.6, top - s * 0.52 - (size === "story" ? 60 : 0), s, t.deco, t.decoAlpha);
  }

  // Footer: lockup left, handle/URL right. The quote card moves the lockup
  // to the top-right corner instead.
  const markSize = 52;
  const footY = H - bottom - markSize;
  const handle = (f.handle ?? "").trim();
  if (kind !== "quote") {
    const lw = drawLockup(c, t, fonts, pad, footY, markSize);
    drawLine(c, handle, fonts, "sans", 30, t.sub, W - pad, footY + markSize / 2, maxW - lw - 48, "right");
  } else drawLine(c, handle, fonts, "sans", 30, t.sub, W - pad, footY + markSize / 2, maxW, "right");
  const areaTop = top;
  const areaBottom = footY - 64;
  const areaH = areaBottom - areaTop;

  const eyebrow = (text: string): Block => ({ kind: "text", text, face: "sans", weight: 600, size: 30, lh: 1.3, maxLines: 1, color: t.accent, caps: 0.1 });

  if (kind === "tip") {
    const n = (f.n ?? "").trim();
    const blocks: Block[] = [
      eyebrow(n ? `Ad tip #${n}` : "Ad tip"),
      { kind: "rule", w: 96, h: 8, color: t.accent, gap: 28 },
      { kind: "text", text: f.headline ?? "", face: "display", size: 84, lh: 1.1, maxLines: 5, color: t.text, gap: 48 },
      { kind: "text", text: f.body ?? "", face: "sans", size: 38, lh: 1.45, maxLines: 9, color: t.sub, gap: 36, min: 0.75 },
    ];
    const s = fitStack(c, blocks, fonts, maxW, areaH, k0);
    drawStack(c, s, fonts, pad, areaTop + (areaH - s.h) * (size === "story" ? 0.45 : 0.5), maxW);
  } else if (kind === "feature") {
    const cta = (f.cta ?? "").trim();
    const blocks: Block[] = [
      { kind: "pill", text: f.pill?.trim() || "New in Adwise", size: 28, bg: t.pillBg, fg: t.pillFg },
      { kind: "text", text: f.name ?? "", face: "display", size: 92, lh: 1.08, maxLines: 3, color: t.text, gap: 40 },
      { kind: "text", text: f.benefit ?? "", face: "sans", size: 40, lh: 1.4, maxLines: 3, color: t.sub, gap: 24 },
      { kind: "list", items: lines(f.bullets ?? "").slice(0, 4), face: "sans", size: 36, lh: 1.38, maxLines: 2, color: t.text, marker: t.accent, gap: 48, itemGap: 18 },
      { kind: "text", text: cta ? `${cta} →` : "", face: "display", size: 40, lh: 1.25, maxLines: 2, color: t.accent, gap: 52 },
    ];
    const s = fitStack(c, blocks, fonts, maxW, areaH, k0);
    drawStack(c, s, fonts, pad, areaTop + (areaH - s.h) * 0.5, maxW);
  } else if (kind === "quote") {
    const lockMark = 44;
    drawLockup(c, t, fonts, W - pad - lockupWidth(c, fonts, lockMark), top, lockMark);
    // Big decorative quote mark, top-left.
    const qSize = 300 * k0;
    c.save();
    c.font = font(fonts, "display", qSize);
    c.fillStyle = t.accent;
    c.globalAlpha = style === "blue" ? 0.5 : 0.9;
    c.textBaseline = "top";
    c.fillText("“", pad - qSize * 0.06, top - qSize * 0.12);
    c.restore();

    const name = (f.name ?? "").trim();
    const role = (f.role ?? "").trim();
    const initials = (f.initials ?? "").trim().slice(0, 3).toUpperCase();
    const ks = Math.min(k0, 1.2);
    const avatar = initials ? 104 * ks : 0;
    const attrH = name || role ? Math.max(avatar, 96 * ks) : 0;
    const qTop = top + qSize * 0.62;
    const gap = attrH ? 64 : 0;
    const blocks: Block[] = [{ kind: "text", text: f.quote ?? "", face: "display", size: 66, lh: 1.2, maxLines: 9, color: t.text, min: 0.6 }];
    const s = fitStack(c, blocks, fonts, maxW, areaBottom - qTop - attrH - gap, k0);
    const blockH = s.h + gap + attrH;
    const y0 = qTop + (areaBottom - qTop - blockH) * 0.45;
    drawStack(c, s, fonts, pad, y0, maxW);
    if (attrH) {
      const ay = y0 + s.h + gap;
      let tx = pad;
      if (avatar) {
        c.save();
        c.fillStyle = t.pillBg;
        c.beginPath();
        c.arc(pad + avatar / 2, ay + attrH / 2, avatar / 2, 0, Math.PI * 2);
        c.fill();
        c.restore();
        drawLine(c, initials, fonts, "display", 40 * ks, t.pillFg, pad + avatar / 2, ay + attrH / 2 + 2, avatar * 0.72, "center");
        tx += avatar + 28 * ks;
      }
      const tw = W - pad - tx;
      if (name && role) {
        drawLine(c, name, fonts, "display", 38 * ks, t.text, tx, ay + attrH / 2 - 22 * ks, tw);
        drawLine(c, role, fonts, "sans", 30 * ks, t.sub, tx, ay + attrH / 2 + 24 * ks, tw);
      } else drawLine(c, name || role, fonts, name ? "display" : "sans", (name ? 38 : 30) * ks, name ? t.text : t.sub, tx, ay + attrH / 2, tw);
    }
  } else {
    const blocks: Block[] = [
      eyebrow(f.eyebrow ?? ""),
      { kind: "text", text: f.number ?? "", face: "display", size: 250, lh: 1.05, maxLines: 1, color: t.accent, gap: 28, min: 0.3 },
      { kind: "rule", w: 96, h: 8, color: t.accent, gap: 24 },
      { kind: "text", text: f.label ?? "", face: "display", size: 62, lh: 1.12, maxLines: 3, color: t.text, gap: 40 },
      { kind: "text", text: f.context ?? "", face: "sans", size: 34, lh: 1.45, maxLines: 4, color: t.sub, gap: 28, min: 0.75 },
    ];
    const s = fitStack(c, blocks, fonts, maxW, areaH, k0);
    drawStack(c, s, fonts, pad, areaTop + (areaH - s.h) * 0.5, maxW);
  }
}
interface FieldDef {
  key: string;
  label: string;
  multiline?: boolean;
  max?: number;
  hint?: string;
}

interface Template {
  id: SocialKind;
  name: string;
  note: string;
  fields: FieldDef[];
  defaults: Fields;
}

const HANDLE = { key: "handle", label: "Handle or URL", max: 40 };

// Defaults are placeholders or clearly marked examples: never real-sounding
// claims, numbers or testimonials.
export const SOCIAL_TEMPLATES: Template[] = [
  {
    id: "tip",
    name: "Tip card",
    note: "Weekly ad tips and quick lessons.",
    fields: [
      { key: "n", label: "Tip number", max: 4 },
      { key: "headline", label: "Tip", max: 90 },
      { key: "body", label: "Body (1–3 lines)", multiline: true, max: 240 },
      HANDLE,
    ],
    defaults: {
      n: "1",
      headline: "Judge your ads by cost per sale, not cost per lead.",
      body: "Example: ₹150 per lead looks great. But if only 1 in 40 leads buys, each sale costs you ₹6,000. Track leads to the sale to see the real number.",
      handle: "adwise.io",
    },
  },
  {
    id: "feature",
    name: "Feature launch",
    note: "Announce something new in the product.",
    fields: [
      { key: "pill", label: "Label", max: 30 },
      { key: "name", label: "Feature name", max: 60 },
      { key: "benefit", label: "One-line benefit", max: 120 },
      { key: "bullets", label: "Bullet points (one per line, 2–4)", multiline: true, max: 320 },
      { key: "cta", label: "Call to action", max: 60 },
      HANDLE,
    ],
    defaults: {
      pill: "New in Adwise",
      name: "Dayparting",
      benefit: "Turn your ads off at the hours that never convert.",
      bullets: "See results for every hour of the day\nPause ads automatically in hours that waste spend\nStarts in dry run, so nothing changes until you're sure",
      cta: "Available now",
      handle: "adwise.io",
    },
  },
  {
    id: "quote",
    name: "Customer quote",
    note: "Only use real quotes you have permission to share.",
    fields: [
      { key: "quote", label: "Quote (their exact words)", multiline: true, max: 280 },
      { key: "name", label: "Name", max: 50 },
      { key: "role", label: "Role, company", max: 70 },
      { key: "initials", label: "Avatar initials (optional)", max: 3 },
      HANDLE,
    ],
    defaults: {
      quote: "[Paste the customer's exact words here. Keep it to one or two sentences about what changed for their ads.]",
      name: "[Customer name]",
      role: "[Role, Company]",
      initials: "CN",
      handle: "adwise.io",
    },
  },
  {
    id: "stat",
    name: "Big number",
    note: "One number with a label and where it comes from.",
    fields: [
      { key: "eyebrow", label: "Label above (optional)", max: 40 },
      { key: "number", label: "Number", max: 16 },
      { key: "label", label: "What it measures", max: 80 },
      { key: "context", label: "Context line", multiline: true, max: 160 },
      HANDLE,
    ],
    defaults: {
      eyebrow: "By the numbers",
      number: "₹[amount]",
      label: "of wasted ad spend paused",
      context: "[Where the number comes from, e.g. one account over 30 days. Only share real, checked numbers.]",
      handle: "adwise.io",
    },
  },
];
// #endregion draw

function TemplateCard({ tpl, size, style, fonts }: { tpl: Template; size: SocialSize; style: Style; fonts: Fonts }) {
  const [fields, setFields] = useState<Fields>(tpl.defaults);
  const dim = SOCIAL_SIZES[size];
  const paint = useCallback((c: CanvasRenderingContext2D) => drawSocial(c, tpl.id, size, style, fields, fonts), [tpl.id, size, style, fields, fonts]);
  const set = (key: string, v: string) => setFields((f) => ({ ...f, [key]: v }));

  return (
    <li className="grid overflow-hidden rounded-xl border border-border bg-surface shadow-xs md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3 p-4">
        <div>
          <p className="text-sm font-medium text-fg">{tpl.name}</p>
          <p className="text-xs text-fg-subtle">{tpl.note}</p>
        </div>
        {tpl.fields.map((fd) => {
          const id = `social-${tpl.id}-${fd.key}`;
          return (
            <div key={fd.key} className="grid gap-1">
              <Label htmlFor={id} className="text-xs text-fg-muted">
                {fd.label}
              </Label>
              {fd.multiline ? (
                <textarea id={id} rows={3} className={TEXTAREA_CLASS} value={fields[fd.key] ?? ""} maxLength={fd.max} onChange={(e) => set(fd.key, e.target.value)} />
              ) : (
                <Input id={id} value={fields[fd.key] ?? ""} maxLength={fd.max} onChange={(e) => set(fd.key, e.target.value)} />
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => downloadPng(dim.w, dim.h, paint, `adwise-${tpl.id}-${size}-${style}-${dim.w}x${dim.h}.png`)}>
            <Download aria-hidden="true" /> PNG {dim.w}×{dim.h}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFields(tpl.defaults)}>
            Reset text
          </Button>
        </div>
      </div>
      <div className="grid place-items-center border-t border-border bg-bg-subtle p-3 md:border-t-0 md:border-l">
        <CanvasPreview w={dim.w} h={dim.h} paint={paint} max={720} label={`${tpl.name} preview`} className="max-h-[28rem]" />
      </div>
    </li>
  );
}

export function SocialStudio() {
  const fonts = useFonts();
  const [style, setStyle] = useState<Style>("ink");
  const [size, setSize] = useState<SocialSize>("post");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
        <div className="grid gap-1">
          <span className="text-xs text-fg-muted">Size</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Size">
            {(Object.keys(SOCIAL_SIZES) as SocialSize[]).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={size === id}
                onClick={() => setSize(id)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium",
                  size === id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:bg-bg-subtle",
                )}
              >
                {SOCIAL_SIZES[id].name} <span className="font-mono opacity-70">{SOCIAL_SIZES[id].w}×{SOCIAL_SIZES[id].h}</span>
              </button>
            ))}
          </div>
        </div>
        <StylePicker style={style} setStyle={setStyle} />
      </div>
      {fonts ? (
        <ul className="grid gap-3">
          {SOCIAL_TEMPLATES.map((tpl) => (
            <TemplateCard key={tpl.id} tpl={tpl} size={size} style={style} fonts={fonts} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">Loading fonts…</p>
      )}
    </div>
  );
}
