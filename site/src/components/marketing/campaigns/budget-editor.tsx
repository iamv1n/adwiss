"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useTicker } from "../automation/use-ticker";
import { AnimatedMoney } from "./campaigns-demo";

const FIELDS = [
  { label: "Daily budget", from: 250, to: 320 },
  { label: "Spend cap", from: 6000, to: 7500 },
];

export function BudgetEditor() {
  const { ref, step } = useTicker(4, 1800);
  const applied = step >= 2;
  return (
    <div ref={ref} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm font-semibold text-fg">Retargeting · 14d</p>
      <p className="text-xs text-fg-subtle">Campaign · edit</p>
      <dl className="mt-4 space-y-3">
        {FIELDS.map((f) => (
          <div key={f.label} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-2">
            <dt className="text-xs text-fg-muted">{f.label}</dt>
            <dd className="font-mono text-sm font-semibold text-fg">
              <AnimatedMoney value={applied ? f.to : f.from} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 h-6 text-xs">
        <AnimatePresence>
          {applied ? (
            <motion.p
              key="ok"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2 py-0.5 font-medium text-success-fg"
            >
              <Check className="size-3" aria-hidden="true" /> Saved · recorded in action log
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
