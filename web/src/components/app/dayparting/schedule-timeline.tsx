"use client";

import { formatMoney } from "@/components/app/analytics/format";
import type { PreviewTarget, SimulatedHour } from "@/lib/automation-api";
import { cn } from "@/lib/utils";

const hourFmt = (iso: string, tz: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
};

/**
 * Next 24 h per target: one cell per hour, hatched when paused, darker when
 * the budget is raised, lighter when lowered. Hover shows state and budget.
 */
export function ScheduleTimeline({
  targets,
  timeline,
}: {
  targets: (PreviewTarget & { timezone_used: string })[];
  timeline: Record<string, SimulatedHour[]>;
}) {
  if (!targets.length) return null;
  const first = timeline[targets[0].id] ?? [];
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[44rem] text-xs">
        <thead className="bg-bg-subtle text-fg-subtle">
          <tr>
            <th className="h-7 w-48 px-2 text-left font-medium">Next 24 h</th>
            {first.map((h, i) => (
              <th key={h.at} className="px-0 text-center font-mono text-[0.5625rem] font-normal tabular-nums">
                {i % 3 === 0 ? hourFmt(h.at, targets[0].timezone_used).slice(0, 2) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {targets.slice(0, 40).map((t) => {
            const hours = timeline[t.id] ?? [];
            const base = hours.find((h) => h.value === 1)?.daily_budget ?? t.daily_budget;
            return (
              <tr key={t.id} className="h-7 border-t border-border">
                <td className="max-w-48 truncate px-2 font-medium text-fg" title={`${t.name} · ${t.account_name}`}>
                  {t.name}
                </td>
                {hours.map((h) => {
                  const paused = h.status !== "active";
                  const up = !paused && base != null && h.daily_budget != null && h.daily_budget > base;
                  const down = !paused && base != null && h.daily_budget != null && h.daily_budget < base;
                  return (
                    <td key={h.at} className="px-[1px]">
                      <div
                        title={`${hourFmt(h.at, t.timezone_used)} · ${h.status}${h.daily_budget != null ? ` · ${formatMoney(h.daily_budget, t.currency)}/day` : ""}`}
                        className={cn(
                          "h-4 rounded-[2px]",
                          paused
                            ? "bg-bg-subtle bg-[repeating-linear-gradient(135deg,var(--color-fg)_0_1px,transparent_1px_4px)] opacity-60"
                            : up
                              ? "bg-heat-5"
                              : down
                                ? "bg-heat-2"
                                : "bg-heat-3",
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-2 py-1.5 text-[0.6875rem] text-fg-subtle">
        <Legend className="bg-heat-3">Running</Legend>
        <Legend className="bg-heat-5">Budget raised</Legend>
        <Legend className="bg-heat-2">Budget lowered</Legend>
        <Legend className="bg-bg-subtle bg-[repeating-linear-gradient(135deg,var(--color-fg)_0_1px,transparent_1px_4px)]">Paused</Legend>
        <span>Times in {targets[0].timezone_used}. Assumes every change succeeds.</span>
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-3 rounded-[2px]", className)} />
      {children}
    </span>
  );
}
