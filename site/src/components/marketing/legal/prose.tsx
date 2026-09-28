import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Readable long-form typography built from site tokens (no typography plugin). */
export function Prose({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "max-w-none text-[0.9375rem] leading-7 text-fg-muted sm:text-base",
        "[&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-fg [&>h2:first-child]:mt-0",
        "[&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-fg",
        "[&_p]:mt-4 [&_strong]:font-semibold [&_strong]:text-fg",
        "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:marker:text-fg-subtle",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary-hover",
        "[&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-bg-subtle [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-fg [&_code]:break-words",
        className,
      )}
      {...props}
    />
  );
}

/** Renders **bold** and `code` inline markup. */
export function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

/** Page body for legal documents: last-updated line + prose. */
export function LegalDocument({ updated, children }: { updated: string; children: ReactNode }) {
  return (
    <section className="px-4 pb-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface px-5 py-8 shadow-xs sm:px-10 sm:py-12">
        <p className="font-mono text-xs tracking-wider text-fg-subtle uppercase">Last updated: {updated}</p>
        <Prose className="mt-8">{children}</Prose>
      </div>
    </section>
  );
}
