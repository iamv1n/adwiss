import { cn } from "@/lib/utils";
import { LEGEND, slotClass, slotLabel } from "./schedule-data";

export function ScheduleLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.6875rem] text-fg-muted", className)}>
      {LEGEND.map((v) => (
        <li key={v} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-2.5 rounded-sm", slotClass(v))} />
          <span className="font-mono">{slotLabel(v)}</span>
        </li>
      ))}
    </ul>
  );
}
