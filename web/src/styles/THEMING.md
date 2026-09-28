# Theming

Adwise owns its own design tokens. The entire color theme (light/dark mode and brand color) can be swapped without touching a component, while components are still styled with ordinary Tailwind utilities.

```
src/styles/tokens.css   ← primitives, semantics, theme selectors, shadcn mapping
src/app/globals.css     ← imports tokens, exposes them to Tailwind (@theme)
src/lib/brand.ts        ← brand list + no-flash init script
src/lib/use-brand.ts    ← useBrand() hook (persisted brand picker)
src/components/theme-toggle.tsx ← <ThemeToggle/> (light / dark / system)
```

## Token layers

### 1. Primitives (`tokens.css`, top of the file)

Raw OKLCH color scales. This is the **only** place literal colors live.

| Scale | Tokens | Notes |
| --- | --- | --- |
| Brand | `--brand-50 … --brand-950` | Generated from `--brand-hue` and `--brand-chroma` |
| Neutral | `--neutral-0, 50 … 950, 1000` | Slightly cool greys (`--neutral-hue`) |
| Status | `--success-*`, `--warning-*`, `--danger-*`, `--info-*` | Fixed across brands |
| Data viz | `--viz-teal`, `--viz-amber`, … | Categorical hues for chart series 2–8 |
| Other | `--radius-base`, `--font-*-stack`, `--skin-*` | |

### 2. Semantics (`tokens.css`, `:root, [data-theme="light"]` and `[data-theme="dark"]`)

Purpose-named tokens that point at primitives. Components only ever consume these.

| Group | Tokens |
| --- | --- |
| Surfaces | `--color-bg`, `--color-bg-subtle`, `--color-surface`, `--color-surface-raised`, `--color-overlay` |
| Text | `--color-fg`, `--color-fg-muted`, `--color-fg-subtle` |
| Lines | `--color-border`, `--color-border-strong`, `--color-input`, `--color-ring` |
| Brand | `--color-primary`, `--color-primary-fg`, `--color-primary-hover`, `--color-accent`, `--color-accent-fg` |
| Status | `--color-{success,warning,danger,info}`, `…-fg` (readable text on the page background), `…-subtle` (tinted background), `--color-on-status` (text on a solid status fill) |
| Charts | `--color-chart-1 … --color-chart-8` (series 1 = brand) |
| Heatmap | `--color-heat-0 … --color-heat-6` (low → high, derived from brand) |
| Illustrations | `--color-illus-{ink,line,soft,paper,mid}` |
| Elevation | `--shadow-xs/sm/md/lg` |

### 3. Tailwind exposure (`globals.css`)

`@theme inline reference { … }` registers every semantic token as a Tailwind color, so you get utilities such as:

```
bg-bg  bg-bg-subtle  bg-surface  bg-surface-raised
text-fg  text-fg-muted  text-fg-subtle
border-border  border-border-strong  ring-ring
bg-primary  hover:bg-primary-hover  text-primary-fg  bg-accent  text-accent-fg
bg-success-subtle  text-success-fg  bg-danger  text-on-status
fill-chart-1 … fill-chart-8   stroke-chart-3   bg-heat-0 … bg-heat-6
font-sans  font-display  font-mono   shadow-md   rounded-lg
```

Opacity modifiers work (`bg-primary/10`, `border-fg/5`) because Tailwind uses `color-mix()` on the variable.

- `inline` makes utilities reference the runtime variable (`background-color: var(--color-surface)`), so a theme switch needs no CSS rebuild.
- `reference` stops Tailwind from re-emitting the variables into `:root` (they would otherwise be self-referencing).
- `--color-*: initial` **removes Tailwind's default palette**, so `bg-blue-500`, `text-zinc-400`, `bg-white` and similar classes simply don't exist.

### 4. shadcn/ui compatibility

shadcn components use their own variable names (`--background`, `--primary`, `--muted-foreground`, …). The bottom block of `tokens.css` maps each one onto a semantic token, and `globals.css` exposes them to Tailwind (`bg-background`, `text-muted-foreground`, …). So shadcn components follow the theme automatically. In new code, prefer the Adwise names (`bg-bg`, `text-fg-muted`).

## Theme selectors

Both attributes live on `<html>`:

| Attribute | Values | Set by |
| --- | --- | --- |
| `data-theme` | `light`, `dark` | `next-themes` (`attribute="data-theme"`, supports `system`). It injects a pre-paint script, so the wrong theme never flashes. |
| `data-brand` | *(absent = adwise)*, `violet`, `emerald`, `amber` | `useBrand()`, persisted in `localStorage["adwise-brand"]`, applied before paint by `brandInitScript` in `app/layout.tsx` |

The Tailwind `dark:` variant is bound to `[data-theme="dark"]` (see `@custom-variant` in `globals.css`). Most components shouldn't need `dark:`: the semantic tokens already change per theme.

## How to…

### Change the default brand color
Edit the two primitives at the top of `tokens.css`:

```css
--brand-hue: 262;     /* OKLCH hue, 0–360 */
--brand-chroma: 1;    /* 1 = default saturation; lower for hues that clip (greens, yellows) */
```

The whole brand scale, primary buttons, focus rings, `chart-1` and the heatmap all follow.

For full control, you can replace the `--brand-50 … --brand-950` values with hand-tuned OKLCH values instead.

### Add a new brand theme
1. Add a block to `tokens.css`:
   ```css
   [data-brand="rose"] { --brand-hue: 10; --brand-chroma: 0.95; }
   ```
2. Add `{ id: "rose", label: "Rose" }` to `BRANDS` in `src/lib/brand.ts`. It then appears in the brand picker (Settings → Appearance) and is accepted by the init script.

### Add a new mode (e.g. high-contrast)
Add a `[data-theme="hc"] { … }` block that re-maps the **semantic** tokens (copy the dark block as a starting point). Then add `"hc"` to the `themes` prop of `ThemeProvider` in `src/components/providers.tsx`.

### Add a new semantic token
1. Define it in **both** the light and dark blocks in `tokens.css`, pointing at primitives.
2. Register it in `@theme inline reference` in `globals.css`: `--color-foo: var(--color-foo);`
3. Use `bg-foo` / `text-foo`.

## Rules

1. **No raw colors in components.** Don't use Tailwind palette classes (`bg-blue-500`, `text-zinc-400`, `bg-white`, `text-black`), hex, `rgb()`, `hsl()` or `oklch()` literals in `.tsx` files. Use semantic utilities, or `var(--color-…)` when you need a value in an inline style or SVG attribute (e.g. `fill="var(--color-chart-2)"` or `style={{ background: "var(--color-heat-3)" }}`).
2. Literal colors are allowed **only** in `src/styles/tokens.css`.
3. Charts use `chart-1…8`, and heatmaps use `heat-0…6`, so data viz re-themes too.
4. Don't key component styles off a specific brand. If a brand needs different behavior, express it as a token.

Check for violations before committing:

```bash
# Palette classes (should print nothing)
grep -rnE '\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|shadow|decoration|caret|accent)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b(-[0-9]+)?' src --include='*.tsx' --include='*.ts'

# Color literals (should print nothing)
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(' src --include='*.tsx' --include='*.ts'
```
