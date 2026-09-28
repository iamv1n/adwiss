import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 0 = off, 1 = on, >1 or <1 = budget multiplier
function cell(d: number, h: number): number {
  if (h < 6) return 0;
  if (h >= 18 && h <= 21) return d >= 5 ? 1.5 : 1.3;
  if (h >= 12 && h <= 13) return 1.2;
  if (h === 23 || (h < 8 && d >= 5)) return 0.5;
  return 1;
}

export function DayGrid() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-medium text-fg">Weekly schedule</p>
        <p className="text-fg-subtle">Account timezone · America/New_York</p>
      </div>
      <div className="mt-4 space-y-1" role="img" aria-label="Example weekly dayparting grid: off overnight, boosted budget in the evenings">
        {DAYS.map((day, d) => (
          <div key={day} className="flex items-center gap-1.5">
            <span className="w-7 shrink-0 font-mono text-[0.625rem] text-fg-subtle">{day}</span>
            <div className="grid flex-1 grid-cols-24 gap-px">
              {Array.from({ length: 24 }, (_, h) => {
                const v = cell(d, h);
                return (
                  <span
                    key={h}
                    className={cn(
                      "h-3.5 rounded-[2px] sm:h-4",
                      v === 0 && "bg-bg-subtle",
                      v === 1 && "bg-primary/35",
                      v > 1 && "bg-primary",
                      v > 0 && v < 1 && "bg-primary/15",
                    )}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-3 text-[0.6875rem] text-fg-subtle">
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-bg-subtle ring-1 ring-border" />Off</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-primary/15" />0.5×</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-primary/35" />On</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-primary" />1.2×–1.5×</li>
      </ul>
    </div>
  );
}
