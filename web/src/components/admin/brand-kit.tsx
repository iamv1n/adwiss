"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, Download, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { Logo, LogoMark } from "@/components/app/logo";
import { cn } from "@/lib/utils";
import { BannerStudio, DEFAULT_HEADLINE, DEFAULT_SUBLINE } from "./brand-banners";
import { BrandCopy } from "./brand-copy";
import { LogoMotion } from "./brand-logo-motion";
import { SocialStudio } from "./brand-social";
import { SlideStudio } from "./brand-slides";

/**
 * Brand kit: the logo files in public/brand, the palette read live from the
 * design tokens (so it can't drift from the app), type and usage rules.
 */

type Asset = { file: string; name: string; use: string; bg: "light" | "dark" | "check" };

const ASSETS: Asset[] = [
  { file: "adwise-mark.svg", name: "Mark · color", use: "Default. Headers, docs, anywhere on a plain light or dark background.", bg: "check" },
  { file: "adwise-icon-dark.svg", name: "App icon · dark", use: "Favicon, social avatar, app stores.", bg: "light" },
  { file: "adwise-icon-light.svg", name: "App icon · light", use: "Avatar or icon where a light tile fits better.", bg: "dark" },
  { file: "adwise-mark-black.svg", name: "Mark · black", use: "One-color print, faxes, embossing, light photos.", bg: "light" },
  { file: "adwise-mark-white.svg", name: "Mark · white", use: "On photos, video and dark or colored backgrounds.", bg: "dark" },
  { file: "adwise-icon-mono-dark.svg", name: "App icon · mono dark", use: "One-color contexts that need the tile.", bg: "light" },
  { file: "adwise-icon-mono-light.svg", name: "App icon · mono light", use: "One-color contexts on dark surfaces.", bg: "dark" },
];

/** The logo gradient, as drawn in public/brand/adwise-mark.svg. */
const LOGO_COLORS = [
  { hex: "#005BFD", name: "Adwise Blue", role: "Main plane, primary highlight" },
  { hex: "#6C84FE", name: "Sky", role: "Gradient highlight" },
  { hex: "#3351E4", name: "Royal", role: "Gradient mid tone" },
  { hex: "#1A60EA", name: "Signal", role: "Lower plane highlight" },
  { hex: "#1840C7", name: "Deep", role: "Gradient shade" },
  { hex: "#0F24A2", name: "Midnight", role: "Deepest shade" },
  { hex: "#030921", name: "Ink", role: "Dark tile / dark backgrounds" },
  { hex: "#EEF4FE", name: "Mist", role: "Light tile / light backgrounds" },
];

const BRAND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const UI_TOKENS = [
  { v: "--color-primary", name: "Primary", role: "Buttons, links, focus" },
  { v: "--color-accent", name: "Accent", role: "Selected and soft highlights" },
  { v: "--color-success", name: "Success", role: "Done, healthy, won" },
  { v: "--color-warning", name: "Warning", role: "Needs attention" },
  { v: "--color-danger", name: "Danger", role: "Errors, destructive" },
  { v: "--color-bg", name: "Background", role: "Page" },
  { v: "--color-surface", name: "Surface", role: "Cards, panels" },
  { v: "--color-fg", name: "Text", role: "Body text" },
  { v: "--color-fg-muted", name: "Muted text", role: "Secondary text" },
  { v: "--color-border", name: "Border", role: "Dividers, outlines" },
];

const CHART_TOKENS = Array.from({ length: 8 }, (_, i) => `--color-chart-${i + 1}`);

// --- helpers ---

/** Resolves any CSS color (incl. oklch and var()) to #RRGGBB via a canvas. */
function useResolvedColors(vars: string[]) {
  const [out, setOut] = useState<Record<string, string>>({});
  useEffect(() => {
    const resolve = () => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      const probe = document.createElement("span");
      document.body.appendChild(probe);
      const next: Record<string, string> = {};
      for (const v of vars) {
        probe.style.color = `var(${v})`;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = getComputedStyle(probe).color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        next[v] = `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      }
      probe.remove();
      setOut(next);
    };
    resolve();
    // Re-read when the theme or brand changes.
    const obs = new MutationObserver(resolve);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-brand", "class"] });
    return () => obs.disconnect();
  }, [vars]);
  return out;
}

async function copy(text: string, what = text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error("Couldn't copy to the clipboard");
  }
}

async function downloadPng(file: string, size: number) {
  try {
    const svg = await (await fetch(`/brand/${file}`)).text();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("load"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = file.replace(".svg", `-${size}.png`);
    a.click();
  } catch {
    toast.error("Couldn't create the PNG");
  }
}

async function copySvg(file: string) {
  try {
    await copy(await (await fetch(`/brand/${file}`)).text(), "SVG code");
  } catch {
    toast.error("Couldn't load the SVG");
  }
}

const CHECKER =
  "bg-[conic-gradient(var(--color-bg-subtle)_25%,var(--color-surface)_0_50%,var(--color-bg-subtle)_0_75%,var(--color-surface)_0)] bg-[length:16px_16px]";

/** Fired by "Expand all" / "Collapse all"; detail = open. */
const TOGGLE_ALL = "brandkit:toggle-all";

/**
 * A collapsible section. It opens when the URL hash points at it (the section
 * nav), and follows Expand all / Collapse all.
 */
function Section({
  id,
  title,
  description,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const onHash = () => window.location.hash === `#${id}` && setOpen(true);
    const onAll = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    onHash();
    window.addEventListener("hashchange", onHash);
    window.addEventListener(TOGGLE_ALL, onAll);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(TOGGLE_ALL, onAll);
    };
  }, [id]);
  return (
    <section aria-labelledby={id} className="grid scroll-mt-6 gap-4 border-t border-border pt-6 first-of-type:border-0 first-of-type:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="group flex w-full items-start gap-3 text-left"
      >
        <ChevronRight
          className={cn("mt-1.5 size-4 shrink-0 text-fg-subtle transition-transform group-hover:text-fg", open && "rotate-90")}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <h2 id={id} className="font-display text-xl font-semibold text-fg">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        </span>
      </button>
      {open && (
        <div id={`${id}-body`} className="grid gap-4 pl-7 max-sm:pl-0">
          {children}
        </div>
      )}
    </section>
  );
}

function Swatch({ color, name, value, role }: { color: string; name: string; value: string; role?: string }) {
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className="group grid overflow-hidden rounded-xl border border-border bg-surface text-left shadow-xs transition-colors hover:border-primary/60"
      aria-label={`Copy ${name} ${value}`}
    >
      <span className="h-16 w-full border-b border-border" style={{ background: color }} />
      <span className="grid gap-0.5 p-2.5">
        <span className="flex items-center justify-between gap-2 text-sm font-medium text-fg">
          {name}
          <Copy className="size-3.5 text-fg-subtle opacity-0 group-hover:opacity-100" aria-hidden="true" />
        </span>
        <span className="font-mono text-xs text-fg-muted">{value || "…"}</span>
        {role && <span className="text-xs text-fg-subtle">{role}</span>}
      </span>
    </button>
  );
}

// --- page ---

export function BrandKit() {
  const brandVars = BRAND_STEPS.map((s) => `--brand-${s}`);
  const [allVars] = useState(() => [...brandVars, ...UI_TOKENS.map((t) => t.v), ...CHART_TOKENS]);
  const hex = useResolvedColors(allVars);
  const [headline, setHeadline] = useState(DEFAULT_HEADLINE);
  const [sub, setSub] = useState(DEFAULT_SUBLINE);

  return (
    <div className="grid gap-12">
      <PageHeader
        title="Brand kit"
        description="Logos, colors, type and rules for Adwise. Colors below are read live from the app's theme, so they always match what ships."
      />

      <nav aria-label="Brand kit sections" className="-mt-6 flex flex-wrap gap-1 text-sm">
        {[
          ["logo", "Logo"],
          ["motion", "Animated logo"],
          ["space", "Clear space & sizes"],
          ["color", "Color"],
          ["type", "Typography"],
          ["banners", "Headers & banners"],
          ["social", "Social posts"],
          ["slides", "Slides"],
          ["copy", "Copy & messaging"],
          ["usage", "Usage"],
          ["voice", "Name & voice"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md px-2.5 py-1 text-fg-muted hover:bg-bg-subtle hover:text-fg">
            {label}
          </a>
        ))}
        <span className="ml-auto flex gap-1">
          {[
            [true, "Expand all", ChevronsUpDown],
            [false, "Collapse all", ChevronsDownUp],
          ].map(([open, label, Icon]) => {
            const I = Icon as typeof ChevronsUpDown;
            return (
              <Button
                key={String(label)}
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => window.dispatchEvent(new CustomEvent(TOGGLE_ALL, { detail: open }))}
              >
                <I aria-hidden="true" /> {String(label)}
              </Button>
            );
          })}
        </span>
      </nav>

      <Section id="logo" title="Logo" description="Three folded planes forming an “A” and an upward arrow: launching ads, and growth. Always use these files; never redraw the mark.">
        <div className="grid gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:grid-cols-2">
          <div className="grid place-items-center gap-2 rounded-xl bg-bg-subtle p-8">
            <Logo className="scale-150" />
            <p className="mt-4 text-xs text-fg-muted">Lockup · mark + wordmark</p>
          </div>
          <div className="grid place-items-center gap-2 rounded-xl p-8" style={{ background: "#030921" }}>
            <span className="inline-flex scale-150 items-center gap-2">
              <LogoMark />
              <span className="font-display text-lg font-semibold tracking-tight text-white">Adwise</span>
            </span>
            <p className="mt-4 text-xs text-white/70">Lockup on Ink</p>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ASSETS.map((a) => (
            <li key={a.file} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
              <div
                className={cn("grid h-40 place-items-center p-6", a.bg === "check" && CHECKER)}
                style={a.bg === "dark" ? { background: "#030921" } : a.bg === "light" ? { background: "#F7F9FC" } : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- static SVG files, no optimisation needed */}
                <img src={`/brand/${a.file}`} alt={a.name} className="h-24 w-24 object-contain" />
              </div>
              <div className="grid flex-1 gap-1 border-t border-border p-3">
                <p className="text-sm font-medium text-fg">{a.name}</p>
                <p className="text-xs text-fg-muted">{a.use}</p>
                <p className="font-mono text-[11px] text-fg-subtle">{a.file}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                    <a href={`/brand/${a.file}`} download>
                      <Download aria-hidden="true" /> SVG
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadPng(a.file, 1024)}>
                    <Download aria-hidden="true" /> PNG 1024
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copySvg(a.file)}>
                    <Copy aria-hidden="true" /> Copy SVG
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="motion"
        defaultOpen={false}
        title="Animated logo"
        description="The three planes fold into place. Download an animated SVG for the web, or record a video for intros and loading screens."
      >
        <LogoMotion />
      </Section>

      <Section id="space" defaultOpen={false} title="Clear space & minimum sizes" description="Keep empty space around the mark equal to a quarter of its width. Don't go below the minimum sizes; use the app icon under 24px.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid place-items-center rounded-xl border border-border bg-surface p-8 shadow-xs">
            <div className="relative p-6 outline outline-1 outline-dashed outline-primary/60">
              <LogoMark className="size-24" />
              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-medium text-primary">¼</span>
              <span className="absolute top-1/2 left-1 -translate-y-1/2 text-[10px] font-medium text-primary">¼</span>
            </div>
            <p className="mt-4 text-xs text-fg-muted">Clear space = ¼ of the mark width on every side</p>
          </div>
          <div className="grid gap-4 rounded-xl border border-border bg-surface p-6 shadow-xs">
            <div className="flex flex-wrap items-end gap-6">
              {[16, 20, 24, 32, 48, 64].map((size) => (
                <div key={size} className="grid justify-items-center gap-2">
                  {size < 24 ? (
                    // eslint-disable-next-line @next/next/no-img-element -- static SVG
                    <img src="/brand/adwise-icon-dark.svg" alt="" style={{ width: size, height: size }} />
                  ) : (
                    <span style={{ width: size, height: size }} className="grid place-items-center">
                      <LogoMark className="size-full" />
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-fg-muted">{size}px</span>
                </div>
              ))}
            </div>
            <ul className="grid gap-1 text-sm text-fg-muted">
              <li>
                <strong className="text-fg">Mark:</strong> 24px minimum on screen, 8mm in print.
              </li>
              <li>
                <strong className="text-fg">App icon:</strong> for 16–20px (favicons); the tile keeps it legible.
              </li>
              <li>
                <strong className="text-fg">Lockup:</strong> the wordmark sits at the mark&apos;s height with a gap of ⅓ of the mark.
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="color" title="Color" description="Click any swatch to copy its hex. The brand scale and UI colors follow the theme and brand selected in Appearance settings.">
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-fg">Logo gradient</h3>
          <div
            className="h-14 rounded-xl border border-border"
            style={{ background: "linear-gradient(90deg,#0F24A2,#1840C7 20%,#3351E4 40%,#005BFD 60%,#6C84FE 85%,#EEF4FE)" }}
            aria-hidden="true"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {LOGO_COLORS.map((c) => (
              <Swatch key={c.hex} color={c.hex} name={c.name} value={c.hex} role={c.role} />
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-fg">Brand scale</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-11">
            {BRAND_STEPS.map((s) => (
              <Swatch key={s} color={`var(--brand-${s})`} name={String(s)} value={hex[`--brand-${s}`] ?? ""} role={s === 600 ? "Primary" : undefined} />
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-fg">Interface</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {UI_TOKENS.map((t) => (
              <Swatch key={t.v} color={`var(${t.v})`} name={t.name} value={hex[t.v] ?? ""} role={t.role} />
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-fg">Charts</h3>
          <p className="text-xs text-fg-muted">Series colors, in order. Series 1 is always the brand.</p>
          <div className="grid grid-cols-4 gap-2 xl:grid-cols-8">
            {CHART_TOKENS.map((v, i) => (
              <Swatch key={v} color={`var(${v})`} name={`Series ${i + 1}`} value={hex[v] ?? ""} />
            ))}
          </div>
        </div>
      </Section>

      <Section id="type" defaultOpen={false} title="Typography" description="Two families plus a mono. All free, loaded from Google Fonts by the app.">
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            {
              name: "Bricolage Grotesque",
              cls: "font-display",
              role: "Display: page titles, headings, the wordmark. Semibold, tight tracking.",
              sample: <p className="font-display text-4xl font-semibold tracking-tight text-fg">Ads that pay off.</p>,
            },
            {
              name: "Geist",
              cls: "font-sans",
              role: "Text: interface, body copy, tables. Regular and medium.",
              sample: <p className="font-sans text-lg text-fg">Pause campaigns that spend without results, automatically.</p>,
            },
            {
              name: "Geist Mono",
              cls: "font-mono",
              role: "Numbers in code, IDs, formulas and technical values.",
              sample: <p className="font-mono text-base text-fg">ROAS = revenue ÷ spend</p>,
            },
          ].map((f) => (
            <div key={f.name} className="grid content-start gap-3 rounded-xl border border-border bg-surface p-5 shadow-xs">
              <p className={cn("text-xs font-medium tracking-wide text-fg-subtle uppercase")}>{f.name}</p>
              {f.sample}
              <p className={cn(f.cls, "text-sm text-fg-muted")}>Aa Bb Cc 0123456789 ₹ %</p>
              <p className="text-xs text-fg-muted">{f.role}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {[
            ["Page title", "font-display text-3xl font-semibold tracking-tight", "30 / Display semibold"],
            ["Section heading", "font-display text-xl font-semibold", "20 / Display semibold"],
            ["Body", "text-[15px]", "15 / Geist regular"],
            ["Label", "text-sm font-medium", "14 / Geist medium"],
            ["Caption", "text-xs text-fg-muted", "12 / Geist regular, muted"],
          ].map(([label, cls, spec]) => (
            <div key={label} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3 last:border-0">
              <span className={cn("text-fg", cls)}>{label}</span>
              <span className="font-mono text-xs text-fg-subtle">{spec}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="banners"
        defaultOpen={false}
        title="Headers & banners"
        description="Ready-sized images for social profiles, link previews, email and slides. Edit the text, pick a style and download each as a PNG at its exact size."
      >
        <BannerStudio headline={headline} setHeadline={setHeadline} sub={sub} setSub={setSub} />
      </Section>

      <Section
        id="social"
        defaultOpen={false}
        title="Social post templates"
        description="Tip cards, feature launches, customer quotes and big numbers. Pick a size and style, edit the text and download a PNG at full size. Replace anything in [brackets]; only share real quotes and numbers."
      >
        <SocialStudio />
      </Section>

      <Section
        id="slides"
        defaultOpen={false}
        title="Slide templates"
        description="1920×1080 slides for decks and talks. Edit each slide, then download PNGs one by one, all at once, or as a PDF."
      >
        <SlideStudio />
      </Section>

      <Section
        id="copy"
        defaultOpen={false}
        title="Copy & messaging"
        description="Ready-to-use taglines, bios, pitches and post templates. Character counts are checked against each platform's limit."
      >
        <BrandCopy onHeadline={setHeadline} />
      </Section>

      <Section id="usage" title="Usage">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid content-start gap-2 rounded-xl border border-success/40 bg-success-subtle/40 p-5">
            <p className="flex items-center gap-2 font-medium text-success-fg">
              <Check className="size-4" aria-hidden="true" /> Do
            </p>
            <ul className="grid list-disc gap-1.5 pl-5 text-sm text-fg">
              <li>Use the color mark on white, Mist or Ink backgrounds.</li>
              <li>Use the white mark on photos, video and saturated colors.</li>
              <li>Use the app icon for favicons, avatars and anything under 24px.</li>
              <li>Keep clear space of ¼ the mark width on every side.</li>
              <li>Scale proportionally, from the SVG files.</li>
            </ul>
          </div>
          <div className="grid content-start gap-2 rounded-xl border border-danger/40 bg-danger-subtle/40 p-5">
            <p className="flex items-center gap-2 font-medium text-danger-fg">
              <X className="size-4" aria-hidden="true" /> Don&apos;t
            </p>
            <ul className="grid list-disc gap-1.5 pl-5 text-sm text-fg">
              <li>Recolor the gradient, or put the color mark on a blue background.</li>
              <li>Stretch, rotate, outline or add shadows or effects to the mark.</li>
              <li>Separate or rearrange the three planes.</li>
              <li>Place the mark on busy images without the white version.</li>
              <li>Set the wordmark in another typeface.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="voice" title="Name & voice">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid content-start gap-2 rounded-xl border border-border bg-surface p-5 shadow-xs">
            <p className="text-sm font-medium text-fg">Writing the name</p>
            <p className="text-sm text-fg-muted">
              Always <strong className="text-fg">Adwise</strong>: one word, capital A. Never AdWise, ADWISE, Ad-wise or adwise (except in URLs and code).
            </p>
          </div>
          <div className="grid content-start gap-2 rounded-xl border border-border bg-surface p-5 shadow-xs">
            <p className="text-sm font-medium text-fg">How we sound</p>
            <ul className="grid list-disc gap-1 pl-5 text-sm text-fg-muted">
              <li>
                <strong className="text-fg">Plain.</strong> Explain ad terms the first time; no jargon for its own sake.
              </li>
              <li>
                <strong className="text-fg">Practical.</strong> Say what to do next, with real numbers.
              </li>
              <li>
                <strong className="text-fg">Honest.</strong> Show where numbers come from; never overpromise results.
              </li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
