"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { countries, countryName } from "@/components/app/campaigns/meta-options";
import { cn } from "@/lib/utils";

/** Searchable multi-select of countries, shown as removable chips. */
export function CountryPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = countries();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase() === s);
  }, [all, q]);
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div className="grid gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" size="sm" className="justify-between font-normal">
            <span className={cn("truncate", value.length === 0 && "text-fg-muted")}>
              {value.length === 0
                ? "Choose countries"
                : value.length <= 3
                  ? value.map(countryName).join(", ")
                  : `${value.length} countries`}
            </span>
            <ChevronsUpDown aria-hidden="true" className="text-fg-subtle" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search countries"
              aria-label="Search countries"
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === "Enter" && list[0]) {
                  e.preventDefault();
                  toggle(list[0].code);
                  setQ("");
                }
              }}
            />
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label="Countries" className="max-h-64 overflow-y-auto p-1">
            {list.length === 0 && <li className="px-2 py-3 text-center text-sm text-fg-muted">No matches</li>}
            {list.map((c) => {
              const on = value.includes(c.code);
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(c.code)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded-[4px] border",
                        on ? "border-primary bg-primary text-primary-fg" : "border-input",
                      )}
                    >
                      {on && <Check className="size-3" aria-hidden="true" />}
                    </span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-fg-subtle">{c.code}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Selected countries">
          {value.map((code) => (
            <li key={code}>
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-subtle py-0.5 pr-1 pl-2 text-xs text-fg">
                {countryName(code)}
                <button
                  type="button"
                  onClick={() => toggle(code)}
                  aria-label={`Remove ${countryName(code)}`}
                  className="rounded-full p-0.5 text-fg-muted hover:bg-border hover:text-fg"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
