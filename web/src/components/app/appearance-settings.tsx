"use client";

import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useMounted } from "@/components/theme-toggle";
import { BRANDS } from "@/lib/brand";
import { useBrand } from "@/lib/use-brand";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { brand, setBrand } = useBrand();
  const mounted = useMounted();

  return (
    <div className="grid gap-6">
      <fieldset>
        <legend className="text-sm font-medium text-fg">Mode</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
          {MODES.map(({ value, label, icon: Icon }) => {
            const checked = mounted && (theme ?? "system") === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                  checked ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:bg-bg-subtle",
                )}
              >
                <input
                  type="radio"
                  name="theme-mode"
                  value={value}
                  checked={checked}
                  onChange={() => setTheme(value)}
                  className="sr-only"
                />
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-fg">Brand color</legend>
        <p className="text-sm text-fg-muted">Saved in this browser. Applies to buttons, charts and heatmaps.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BRANDS.map((b) => {
            const checked = mounted && brand === b.id;
            return (
              <label
                key={b.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                  checked ? "border-primary text-fg" : "border-border text-fg-muted hover:bg-bg-subtle",
                )}
              >
                <input
                  type="radio"
                  name="brand"
                  value={b.id}
                  checked={checked}
                  onChange={() => setBrand(b.id)}
                  className="sr-only"
                />
                {/* Each swatch previews its brand by scoping data-brand to the chip. */}
                <span data-brand={b.id} className="grid size-6 place-items-center rounded-full bg-brand-swatch">
                  {checked && <Check className="size-3.5 text-on-status" aria-hidden="true" />}
                </span>
                {b.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
