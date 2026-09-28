"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Provider, WindowFrame } from "../primitives";
import { CountUp } from "./count-up";

type Metric = {
  id: string;
  label: string;
  total: number;
  prev: number;
  fmt: (n: number) => string;
  /** true when lower is better (CPA, CPC) */
  inverse?: boolean;
  current: number[];
  previous: number[];
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const METRICS: Metric[] = [
  {
    id: "revenue",
    label: "Revenue",
    total: 84210,
    prev: 67380,
    fmt: usd,
    current: [2100, 2400, 2250, 2800, 3100, 2900, 3300, 2700, 2950, 3400, 3600, 3200, 3800, 4100],
    previous: [2000, 2150, 2300, 2100, 2400, 2500, 2350, 2200, 2600, 2450, 2700, 2550, 2800, 2750],
  },
  {
    id: "roas",
    label: "ROAS",
    total: 3.42,
    prev: 2.91,
    fmt: (n) => `${n.toFixed(2)}×`,
    current: [2.8, 3.0, 2.9, 3.2, 3.5, 3.3, 3.6, 3.1, 3.3, 3.7, 3.8, 3.5, 3.9, 4.0],
    previous: [2.7, 2.9, 3.0, 2.8, 3.0, 3.1, 2.9, 2.8, 3.0, 2.9, 3.1, 2.8, 3.0, 2.9],
  },
  {
    id: "cpa",
    label: "CPA",
    total: 18.6,
    prev: 22.4,
    fmt: (n) => `$${n.toFixed(2)}`,
    inverse: true,
    current: [23, 22, 22.5, 21, 20, 20.5, 19, 20, 19.2, 18, 17.5, 18.2, 17, 16.4],
    previous: [22, 23, 22.5, 23.4, 22, 21.8, 22.6, 23, 22, 22.4, 21.6, 22.8, 22.1, 22.5],
  },
];

const KPIS = [
  { label: "Spend", value: 24620, prev: 23150, fmt: usd },
  { label: "Clicks", value: 31480, prev: 27900, fmt: (n: number) => Math.round(n).toLocaleString("en-US") },
  { label: "CTR", value: 2.84, prev: 2.51, fmt: (n: number) => `${n.toFixed(2)}%` },
  { label: "CPC", value: 0.78, prev: 0.83, fmt: (n: number) => `$${n.toFixed(2)}`, inverse: true },
];

const W = 560;
const H = 180;
const PAD = 8;

function toPath(values: number[], min: number, max: number) {
  return values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Delta({ value, prev, inverse }: { value: number; prev: number; inverse?: boolean }) {
  const pct = ((value - prev) / prev) * 100;
  const good = inverse ? pct < 0 : pct > 0;
  const Icon = pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center font-mono text-[0.6875rem] tabular-nums", good ? "text-success-fg" : "text-danger-fg")}>
      <Icon className="size-3" aria-hidden="true" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function PerformanceChart() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % METRICS.length), 4200);
    return () => clearInterval(t);
  }, [inView, reduce]);

  const m = METRICS[idx];
  const all = [...m.current, ...m.previous];
  const min = Math.min(...all) * 0.92;
  const max = Math.max(...all) * 1.04;
  const cur = toPath(m.current, min, max);
  const prev = toPath(m.previous, min, max);
  const draw = reduce ? { duration: 0 } : { duration: 1.4, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div ref={ref}>
      <WindowFrame title="app.adwise.io/analytics">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border bg-bg-subtle px-2 py-0.5 font-mono text-fg">Sep 13 – Sep 26</span>
            <span className="text-fg-subtle">vs previous 14 days</span>
          </div>
          <div className="flex gap-1">
            <Provider name="Meta" />
            <Provider name="Google" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
          {KPIS.map((k) => (
            <div key={k.label} className="bg-surface px-4 py-3">
              <p className="text-[0.6875rem] text-fg-subtle">{k.label}</p>
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-lg font-semibold text-fg tabular-nums">
                <CountUp value={k.value} format={k.fmt} />
                <Delta value={k.value} prev={k.prev} inverse={k.inverse} />
              </p>
            </div>
          ))}
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex gap-1" role="tablist" aria-label="Chart metric">
                {METRICS.map((x, i) => (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    aria-selected={i === idx}
                    onClick={() => setIdx(i)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      i === idx ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle",
                    )}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 flex items-baseline gap-2 font-mono text-2xl font-semibold text-fg tabular-nums">
                <CountUp value={m.total} format={m.fmt} duration={0.9} />
                <Delta value={m.total} prev={m.prev} inverse={m.inverse} />
              </p>
            </div>
            <div className="flex items-center gap-3 text-[0.6875rem] text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-primary" /> This period
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-0 w-4 border-t border-dashed border-fg-subtle" /> Previous
              </span>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-4 h-40 w-full sm:h-48"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${m.label}: ${m.fmt(m.total)} this period vs ${m.fmt(m.prev)} in the previous period`}
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <AnimatePresence mode="wait">
              <g key={m.id}>
                <motion.path
                  d={`${cur} L${W - PAD},${H} L${PAD},${H} Z`}
                  className="fill-primary/10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.5 }}
                />
                <motion.path
                  d={prev}
                  fill="none"
                  className="stroke-fg-subtle"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.5 }}
                />
                <motion.path
                  d={cur}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: inView || reduce ? 1 : 0 }}
                  exit={{ opacity: 0 }}
                  transition={draw}
                />
              </g>
            </AnimatePresence>
          </svg>
          <div aria-hidden="true" className="mt-1 flex justify-between font-mono text-[0.625rem] text-fg-subtle">
            <span>Sep 13</span>
            <span>Sep 19</span>
            <span>Sep 26</span>
          </div>
        </div>
      </WindowFrame>
    </div>
  );
}
