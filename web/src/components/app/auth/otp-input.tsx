"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once all boxes are filled (typing or paste). */
  onComplete?: (value: string) => void;
  length?: number;
  label?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Six single-digit boxes that behave like one field: typing advances, Backspace
 * goes back, arrows move, and pasting (or SMS/email autofill into the first box)
 * fills every box at once.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label = "Verification code",
  error,
  disabled,
  autoFocus,
  className,
}: OtpInputProps) {
  const id = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const [focused, setFocused] = useState<number | null>(null);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function focus(i: number) {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  }

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  }

  function setAt(i: number, raw: string) {
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) return;
    if (incoming.length > 1) {
      // Autofill / paste into one box: spread from this box on.
      const merged = (value.slice(0, i) + incoming).slice(0, length);
      commit(merged);
      focus(merged.length);
      return;
    }
    const arr = digits.slice();
    arr[i] = incoming;
    const next = arr.join("").slice(0, length);
    commit(next);
    if (i < length - 1) focus(i + 1);
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  }

  function onPaste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    e.preventDefault();
    const merged = (value.slice(0, i) + text).slice(0, length);
    commit(merged);
    focus(merged.length);
  }

  const errorId = `${id}-error`;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div role="group" aria-labelledby={`${id}-label`} className="flex justify-between gap-2">
        <span id={`${id}-label`} className="sr-only">
          {label}
        </span>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={i === 0 ? length : 1}
            aria-label={`${label}, digit ${i + 1} of ${length}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={disabled}
            value={d}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => {
              setFocused(i);
              e.currentTarget.select();
            }}
            onBlur={() => setFocused(null)}
            className={cn(
              "h-12 w-full min-w-0 rounded-lg border border-input bg-surface text-center font-mono text-xl font-semibold text-fg tabular-nums shadow-xs transition-[border-color,box-shadow,transform] outline-none sm:h-13",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
              d && focused !== i && "border-fg-subtle/60",
              error && "border-danger ring-danger/20",
            )}
          />
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
