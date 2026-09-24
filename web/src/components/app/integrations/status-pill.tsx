import { cn } from "@/lib/utils";

export type PillTone = "success" | "warning" | "danger" | "info" | "muted";

const TONES: Record<PillTone, string> = {
  success: "bg-success-subtle text-success-fg",
  warning: "bg-warning-subtle text-warning-fg",
  danger: "bg-danger-subtle text-danger-fg",
  info: "bg-accent text-accent-fg",
  muted: "bg-bg-subtle text-fg-muted",
};

const DOTS: Record<PillTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-primary",
  muted: "bg-fg-subtle",
};

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", DOTS[tone])} />
      {children}
    </span>
  );
}
