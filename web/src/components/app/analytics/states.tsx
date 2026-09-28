import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function errorMessage(e: unknown) {
  return isApiError(e) ? e.message : "Something went wrong loading this data.";
}

/** Inline error for a card or section, with retry. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-border bg-bg-subtle/60 p-4 text-sm sm:flex-row sm:items-center",
        className,
      )}
    >
      <AlertCircle className="size-4 shrink-0 text-danger-fg" aria-hidden="true" />
      <p className="flex-1 text-fg">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden="true" /> Retry
        </Button>
      )}
    </div>
  );
}

/** Quiet in-card message for "nothing here". */
export function InlineEmpty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("py-8 text-center text-sm text-fg-muted", className)}>{children}</p>;
}

/** Section card matching the app's surfaces. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  titleId,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className={cn("rounded-2xl border border-border bg-surface p-4 shadow-xs sm:p-5", className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-lg font-semibold text-fg">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
