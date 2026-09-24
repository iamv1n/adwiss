import { cn } from "@/lib/utils";

/** Adwise mark: a 3×3 dayparting grid with a lit diagonal. Pure tokens. */
export function LogoMark({ className }: { className?: string }) {
  const lit = new Set([2, 4, 5, 7]);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6", className)}>
      <rect width="24" height="24" rx="6" className="fill-primary" />
      {Array.from({ length: 9 }, (_, i) => {
        const x = 5 + (i % 3) * 5;
        const y = 5 + Math.floor(i / 3) * 5;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width="4"
            height="4"
            rx="1"
            className="fill-primary-fg"
            opacity={lit.has(i) ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {!collapsed && (
        <span className="font-display text-lg font-semibold tracking-tight text-fg">Adwise</span>
      )}
    </span>
  );
}
