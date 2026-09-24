import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Only allow same-origin relative redirects (blocks `//evil.com`, `https://…`). */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

export function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, opts).format(d);
}

const RTF_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "5 minutes ago", "just now". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown";
  const secs = Math.round((t - now) / 1000);
  const abs = Math.abs(secs);
  if (abs < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of RTF_UNITS) {
    if (abs >= size) return rtf.format(Math.round(secs / size), unit);
  }
  return rtf.format(Math.round(secs / 60), "minute");
}
