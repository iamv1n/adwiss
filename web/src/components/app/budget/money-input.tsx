"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { currencySymbol } from "@/components/app/analytics/format";
import { cn } from "@/lib/utils";

/** Number input with the currency symbol inside, e.g. "₹ 2,00,000". */
export function MoneyInput({ currency, className, ...props }: ComponentProps<typeof Input> & { currency: string }) {
  const symbol = currencySymbol(currency);
  return (
    <div className="relative w-full">
      {symbol ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-sm text-fg-muted"
        >
          {symbol}
        </span>
      ) : null}
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        {...props}
        className={cn(className)}
        style={{ paddingLeft: symbol ? `calc(${Math.max(symbol.length, 1)}ch + 1rem)` : undefined, ...props.style }}
      />
    </div>
  );
}
