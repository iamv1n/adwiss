"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RANGE_PRESETS, type RangePreset } from "@/lib/analytics-api";

export function RangePicker({ value, onChange }: { value: RangePreset; onChange: (v: RangePreset) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={String(value)}
      onValueChange={(v) => v && onChange(Number(v) as RangePreset)}
      aria-label="Date range"
    >
      {RANGE_PRESETS.map((d) => (
        <ToggleGroupItem key={d} value={String(d)} aria-label={`Last ${d} days`} className="text-xs">
          {d}d
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Shown only when the org's accounts report in several currencies. */
export function CurrencyPicker({
  currencies,
  value,
  onChange,
}: {
  currencies: string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value ?? ""}
      onValueChange={(v) => v && onChange(v)}
      aria-label="Currency"
    >
      {currencies.map((c) => (
        <ToggleGroupItem key={c} value={c} className="font-mono text-xs">
          {c}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
