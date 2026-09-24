import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs font-medium tracking-wider text-primary uppercase",
        className,
      )}
    >
      <span aria-hidden="true" className="h-px w-5 bg-primary/60" />
      {children}
    </p>
  );
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-4",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className="font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
      >
        {title}
      </h2>
      {description ? (
        <p className="text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}

const ctaBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg [&_svg]:size-4 [&_svg]:shrink-0";

const ctaVariants = {
  primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-fg shadow-xs hover:border-border-strong hover:bg-bg-subtle",
  ghost: "text-fg-muted hover:bg-bg-subtle hover:text-fg",
} as const;

const ctaSizes = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
  lg: "h-11 px-5 text-[0.9375rem]",
} as const;

export function ctaClasses(
  variant: keyof typeof ctaVariants = "primary",
  size: keyof typeof ctaSizes = "md",
  className?: string,
) {
  return cn(ctaBase, ctaVariants[variant], ctaSizes[size], className);
}

export function CtaLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: keyof typeof ctaVariants;
  size?: keyof typeof ctaSizes;
}) {
  return <Link className={ctaClasses(variant, size, className)} {...props} />;
}

/** Faint grid built from the border token, faded out with a radial mask. */
export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-size-[56px_56px] opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_75%)]",
        className,
      )}
    />
  );
}

/** Soft brand glow for section backgrounds. */
export function Glow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -z-10 rounded-full bg-primary/15 blur-3xl",
        className,
      )}
    />
  );
}

export function Provider({ name, className }: { name: "Meta" | "Google"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[0.625rem] font-medium leading-4",
        name === "Meta"
          ? "border-chart-7/30 bg-chart-7/10 text-fg"
          : "border-chart-3/40 bg-chart-3/10 text-fg",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", name === "Meta" ? "bg-chart-7" : "bg-chart-3")}
      />
      {name}
    </span>
  );
}

/** Browser/app window chrome for code-rendered product mockups. */
export function WindowFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface shadow-lg ring-1 ring-fg/5",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border bg-bg-subtle px-3 py-2">
        <div aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
        </div>
        <div className="mx-auto flex min-w-0 max-w-xs flex-1 items-center justify-center truncate rounded-md border border-border bg-surface px-3 py-0.5 font-mono text-[0.6875rem] text-fg-subtle">
          {title}
        </div>
        <div aria-hidden="true" className="w-10.5" />
      </div>
      {children}
    </div>
  );
}
