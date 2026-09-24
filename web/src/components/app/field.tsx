import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  error?: string;
  hint?: string;
  labelAside?: React.ReactNode;
};

/** Labelled input with an accessible inline error / hint. */
export function Field({ label, error, hint, labelAside, className, id, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId}>{label}</Label>
        {labelAside}
      </div>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="h-10"
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-danger-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-fg"
    >
      {message}
    </div>
  );
}
