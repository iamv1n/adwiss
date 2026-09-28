"use client";

import { LayoutGroup, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "../analytics/count-up";
import { WindowFrame } from "../primitives";

type Stage = "new" | "contacted" | "qualified" | "won" | "lost";

const STAGES: { id: Stage; label: string; dot: string }[] = [
  { id: "new", label: "New", dot: "bg-info" },
  { id: "contacted", label: "Contacted", dot: "bg-chart-2" },
  { id: "qualified", label: "Qualified", dot: "bg-warning" },
  { id: "won", label: "Won", dot: "bg-success" },
  { id: "lost", label: "Lost", dot: "bg-danger" },
];

type Lead = { id: number; name: string; campaign: string; value: number; stage: Stage; outcome: "won" | "lost" };

const POOL = [
  { name: "Priya S.", campaign: "Lead gen · Demo", value: 2400, outcome: "won" },
  { name: "Marco R.", campaign: "Retarget · 30d", value: 900, outcome: "lost" },
  { name: "Aisha K.", campaign: "Lookalike 2%", value: 1800, outcome: "won" },
  { name: "Tom B.", campaign: "Lead gen · Demo", value: 3200, outcome: "won" },
  { name: "Lena M.", campaign: "Broad · Video", value: 600, outcome: "lost" },
  { name: "Diego F.", campaign: "Lookalike 2%", value: 1500, outcome: "won" },
  { name: "Sara L.", campaign: "Broad · Video", value: 700, outcome: "lost" },
  { name: "Omar H.", campaign: "Lead gen · Demo", value: 2100, outcome: "won" },
] as const;

const INITIAL: Lead[] = [
  { id: 0, ...POOL[0], stage: "qualified" },
  { id: 1, ...POOL[1], stage: "contacted" },
  { id: 2, ...POOL[2], stage: "new" },
  { id: 3, ...POOL[3], stage: "won" },
  { id: 4, ...POOL[4], stage: "lost" },
];

const NEXT: Record<Stage, Stage | null> = { new: "contacted", contacted: "qualified", qualified: null, won: null, lost: null };
const SPEND_PER_LEAD = 38;
const BASE = { leads: 142, won: 27, wonValue: 48600, spend: 5396 };

export function LeadPipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [leads, setLeads] = useState<Lead[]>(INITIAL);
  const tick = useRef(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => {
      tick.current += 1;
      const n = tick.current;
      setLeads((prev) => {
        // Every fourth beat a new lead arrives from a lead form.
        if (n % 4 === 0) {
          const nextId = prev.reduce((m, l) => Math.max(m, l.id), 0) + 1;
          const p = POOL[nextId % POOL.length];
          return [...prev, { id: nextId, ...p, stage: "new" }];
        }
        const target = prev.find((l) => l.stage !== "won" && l.stage !== "lost");
        if (!target) return prev;
        const to = NEXT[target.stage] ?? target.outcome;
        return prev.map((l) => (l.id === target.id ? { ...l, stage: to } : l));
      });
    }, 1700);
    return () => clearInterval(t);
  }, [inView, reduce]);

  const extraLeads = leads.reduce((m, l) => Math.max(m, l.id), 0) - 4;
  const wonNow = leads.filter((l) => l.stage === "won");
  const totalLeads = BASE.leads + extraLeads;
  const spend = BASE.spend + extraLeads * SPEND_PER_LEAD;
  const won = BASE.won + wonNow.length - 1;
  const wonValue = BASE.wonValue + wonNow.reduce((s, l) => s + l.value, 0) - POOL[3].value;
  const cpl = spend / totalLeads;
  const winRate = (won / totalLeads) * 100;

  const kpis = [
    { label: "Leads", value: totalLeads, fmt: (n: number) => Math.round(n).toString() },
    { label: "Cost per lead", value: cpl, fmt: (n: number) => `$${n.toFixed(2)}` },
    { label: "Won value", value: wonValue, fmt: (n: number) => `$${Math.round(n).toLocaleString("en-US")}` },
    { label: "Win rate", value: winRate, fmt: (n: number) => `${n.toFixed(1)}%` },
  ];

  return (
    <div ref={ref}>
      <WindowFrame title="app.adwise.io/leads">
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-surface px-4 py-3">
              <p className="text-[0.6875rem] text-fg-subtle">{k.label}</p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-fg tabular-nums">
                <CountUp value={k.value} format={k.fmt} duration={0.8} />
              </p>
            </div>
          ))}
        </div>
        <LayoutGroup>
          <div className="grid grid-cols-5 gap-1 p-2 sm:gap-2 sm:p-4" aria-label="Lead pipeline board" role="img">
            {STAGES.map((s) => {
              const all = leads.filter((l) => l.stage === s.id);
              // Closed columns show only the latest cards so the board stays compact.
              const items = s.id === "won" || s.id === "lost" ? all.slice(-3).reverse() : all;
              return (
                <div key={s.id} className="flex min-h-56 min-w-0 flex-col gap-1.5 rounded-lg bg-bg-subtle p-1 sm:p-2">
                  <p className="flex items-center gap-1 truncate px-0.5 text-[0.5625rem] font-medium text-fg-muted sm:text-xs">
                    <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", s.dot)} />
                    <span className="truncate">{s.label}</span>
                    <span className="ml-auto font-mono text-fg-subtle tabular-nums">{all.length}</span>
                  </p>
                  {items.map((l) => (
                    <motion.div
                      key={l.id}
                      layoutId={`lead-${l.id}`}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 34 }}
                      className={cn(
                        "min-w-0 rounded-md border border-border bg-surface p-1 shadow-xs sm:p-2",
                        s.id === "won" && "border-success/40",
                        s.id === "lost" && "opacity-60",
                      )}
                    >
                      <p className="truncate text-[0.5625rem] font-medium text-fg sm:text-xs">{l.name}</p>
                      <p className="hidden truncate text-[0.625rem] text-fg-subtle sm:block">{l.campaign}</p>
                      <p className="truncate font-mono text-[0.5625rem] text-fg-muted tabular-nums sm:text-[0.6875rem]">
                        ${l.value.toLocaleString("en-US")}
                      </p>
                    </motion.div>
                  ))}
                </div>
              );
            })}
          </div>
        </LayoutGroup>
      </WindowFrame>
    </div>
  );
}
