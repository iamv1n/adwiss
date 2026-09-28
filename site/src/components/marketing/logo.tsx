"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Adwise mark: three folded planes forming an "A" / upward arrow. Same artwork
 * as the app (web/src/components/app/logo.tsx) and public/brand/adwise-mark.svg.
 */
export const LOGO_PATHS = [
  "M421.848 360.13C424.184 366.97 416.088 372.585 410.5 368L355.119 354.999L288 164.5L325.5 78.0001L421.848 360.13Z",
  "M236.952 324.837C240.723 315.035 251.432 309.82 261.474 312.895L417.404 360.642C420.411 361.563 421.675 365.127 419.919 367.736C419.599 368.213 419.139 368.579 418.603 368.785L206.634 450.144C198.547 453.247 190.607 445.301 193.718 437.217L236.952 324.837Z",
  "M242.162 295.924C239.851 301.967 234.883 306.608 228.697 308.502L52.3197 362.521C43.7294 365.152 37.01 354.955 42.8158 348.099L270.815 78.847C276.845 71.726 284.54 66.2033 293.216 62.769L295.708 61.7823C301.058 59.6647 306.99 59.5351 312.427 61.4172C315.401 62.4465 317.976 64.3828 319.791 66.9535L320.992 68.6549C322.325 70.5444 323.42 72.5919 324.25 74.7506L325.5 78.0001L242.162 295.924Z",
];

export const LOGO_GRADIENTS: { x1: number; y1: number; x2: number; y2: number; stops: [number, string][] }[] = [
  { x1: 421, y1: 123.9, x2: 323.5, y2: 326.6, stops: [[0, "#005BFD"], [0.534, "#1840C7"], [1, "#0F24A2"]] },
  { x1: 148.8, y1: 412.6, x2: 415.1, y2: 363.1, stops: [[0.135, "#0D1FA2"], [0.938, "#1A60EA"]] },
  { x1: 41, y1: 363, x2: 348.5, y2: 47, stops: [[0.183, "#3351E4"], [0.518, "#6C84FE"], [0.995, "#3352E5"]] },
];

export function LogoMark({ className, mono = false }: { className?: string; mono?: boolean }) {
  // Unique ids: the mark can appear several times on one page.
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="22 47.5 420 420" aria-hidden="true" className={cn("size-6 shrink-0", className)}>
      {!mono && (
        <defs>
          {LOGO_GRADIENTS.map((g, i) => (
            <linearGradient key={i} id={`${id}-g${i}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} gradientUnits="userSpaceOnUse">
              {g.stops.map(([o, c]) => (
                <stop key={o} offset={o} stopColor={c} />
              ))}
            </linearGradient>
          ))}
        </defs>
      )}
      {LOGO_PATHS.map((d, i) => (
        <path key={i} d={d} fill={mono ? "currentColor" : `url(#${id}-g${i})`} />
      ))}
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-7" />
      <span className="font-display text-lg font-semibold tracking-tight text-fg">Adwise</span>
    </span>
  );
}
