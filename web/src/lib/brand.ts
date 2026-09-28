export const BRANDS = [
  { id: "adwise", label: "Adwise" },
  { id: "violet", label: "Violet" },
  { id: "emerald", label: "Emerald" },
  { id: "amber", label: "Amber" },
] as const;

export type BrandId = (typeof BRANDS)[number]["id"];

export const DEFAULT_BRAND: BrandId = "adwise";
export const BRAND_STORAGE_KEY = "adwise-brand";

export function isBrand(value: unknown): value is BrandId {
  return BRANDS.some((b) => b.id === value);
}

/** Applies the brand to <html>. The default brand removes the attribute. */
export function applyBrand(brand: BrandId) {
  const root = document.documentElement;
  if (brand === DEFAULT_BRAND) root.removeAttribute("data-brand");
  else root.setAttribute("data-brand", brand);
}

/**
 * Inline script that runs before first paint so a persisted brand never
 * flashes the default one. Kept tiny and dependency-free.
 */
export const brandInitScript = `(function(){try{var b=localStorage.getItem(${JSON.stringify(
  BRAND_STORAGE_KEY,
)});if(b&&b!==${JSON.stringify(DEFAULT_BRAND)}&&${JSON.stringify(
  BRANDS.map((b) => b.id),
)}.indexOf(b)>-1){document.documentElement.setAttribute("data-brand",b)}}catch(e){}})();`;
