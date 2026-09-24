import { cn } from "@/lib/utils";

interface EmptyStateProps {
  illustration?: React.ReactNode;
  icon?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  illustration,
  icon,
  title,
  description,
  actions,
  className,
  children,
}: EmptyStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-bg-subtle/60 px-6 py-12 text-center sm:px-10 sm:py-16",
        className,
      )}
    >
      {illustration && (
        <div className="mb-8 w-full max-w-[15rem] sm:max-w-[18rem]" aria-hidden="true">
          {illustration}
        </div>
      )}
      {icon && !illustration && (
        <div className="mb-5 grid size-12 place-items-center rounded-xl bg-accent text-accent-fg">
          {icon}
        </div>
      )}
      <h2 className="font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-md text-pretty text-fg-muted">{description}</p>
      {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      {children}
    </section>
  );
}
