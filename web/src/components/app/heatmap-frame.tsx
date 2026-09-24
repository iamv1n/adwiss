"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const METRICS = ["ROAS", "Spend", "Revenue", "CPA", "Conversions", "CTR", "CPC"] as const;
const HEAT = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
  "bg-heat-6",
] as const;

/**
 * The hour × weekday heatmap frame. With no connected accounts, every cell is
 * empty (heat-0). No sample data is shown inside the app.
 */
export function HeatmapFrame() {
  const [metric, setMetric] = useState<(typeof METRICS)[number]>("ROAS");

  return (
    <section aria-labelledby="heatmap-heading" className="rounded-2xl border border-border bg-surface p-4 shadow-xs sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 id="heatmap-heading" className="font-display text-lg font-semibold text-fg">
            Performance heatmap
          </h2>
          <p className="text-sm text-fg-muted">
            {metric} by hour and weekday, in your account time zone. There&apos;s no data yet.
          </p>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={metric}
          onValueChange={(v) => v && setMetric(v as (typeof METRICS)[number])}
          aria-label="Heatmap metric"
          className="flex-wrap"
        >
          {METRICS.map((m) => (
            <ToggleGroupItem key={m} value={m} className="px-2.5 text-xs">
              {m}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mt-6 overflow-x-auto pb-2">
        <div
          className="grid min-w-[38rem] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-1"
          role="img"
          aria-label={`Empty ${metric} heatmap: 7 weekdays by 24 hours. Connect an ad account to populate it.`}
        >
          <span />
          {HOURS.map((h) => (
            <span key={h} className="text-center font-mono text-[0.625rem] text-fg-subtle">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
          {DAYS.map((d) => (
            <div key={d} className="contents">
              <span className="self-center text-xs text-fg-muted">{d}</span>
              {HOURS.map((h) => (
                <span key={h} className="aspect-square rounded-[3px] bg-heat-0" />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-xs text-fg-subtle">
        <span>Low</span>
        <span className="flex gap-0.5" aria-hidden="true">
          {HEAT.map((c) => (
            <span key={c} className={`size-3 rounded-[3px] ${c}`} />
          ))}
        </span>
        <span>High</span>
      </div>
    </section>
  );
}
