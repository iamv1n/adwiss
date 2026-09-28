"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Countdown for "Resend code" buttons. `start()` begins a fresh cooldown. */
export function useCooldown(seconds = 60, startActive = false) {
  const [until, setUntil] = useState<number>(() => (startActive ? Date.now() + seconds * 1000 : 0));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until, now]);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  const start = useCallback(() => {
    const n = Date.now();
    setNow(n);
    setUntil(n + seconds * 1000);
  }, [seconds]);
  return { remaining, active: remaining > 0, start };
}

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

/** Cheap heuristic strength estimate — the server has the final say (`weak_password`). */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 2) score++;
  if (classes >= 3 && pw.length >= 12) score++;
  if (/^(.)\1+$/.test(pw) || /^(password|qwerty|123456|letmein|adwise)/i.test(pw)) score = 0;
  if (pw.length < 10) score = Math.min(score, 1);
  const s = Math.min(4, score) as Strength["score"];
  return { score: s, label: ["Too weak", "Weak", "Fair", "Good", "Strong"][s] };
}

const BAR_TONES = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

export function StrengthMeter({ password, className }: { password: string; className?: string }) {
  const { score, label } = passwordStrength(password);
  return (
    <div className={cn("grid gap-1.5", className)} aria-live="polite">
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-colors duration-300",
              password && score >= i ? BAR_TONES[score] : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-fg-subtle">
        {password ? (
          <>
            Strength: <span className="font-medium text-fg-muted">{label}</span>
          </>
        ) : (
          "At least 10 characters. A few unrelated words works well."
        )}
      </p>
    </div>
  );
}
