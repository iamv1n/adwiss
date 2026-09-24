import { cn } from "@/lib/utils";

/**
 * Adwise mark: an original glyph — a rising "A" formed by two bars of a
 * chart meeting at a peak, with a dot for the decision point.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M8.5 23 15 9.5a1.1 1.1 0 0 1 2 0L23.5 23"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-fg"
      />
      <path d="M12 18.5h5" strokeWidth="3" strokeLinecap="round" className="stroke-primary-fg/55" />
      <circle cx="22.5" cy="10.5" r="2.25" className="fill-primary-fg" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight text-fg">Adwise</span>
    </span>
  );
}
