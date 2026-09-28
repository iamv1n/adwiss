"use client";

import { Fragment, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lightbulb, XCircle } from "lucide-react";
import { ColumnChart, LineChart } from "@/components/app/analytics/charts";
import { formatMoney, formatNumber, formatPercent, formatRoas } from "@/components/app/analytics/format";
import type { Block, ChartSpec, ChartUnit } from "@/lib/learn/types";
import { cn } from "@/lib/utils";
import { Diagram } from "./diagrams";

/** **bold** and `code`; everything else is plain text. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-fg">
            {p.slice(2, -2)}
          </strong>
        ) : p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="rounded bg-bg-subtle px-1 py-0.5 font-mono text-[0.85em]">
            {p.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function fmt(unit: ChartUnit, v: number | null) {
  if (v == null) return "—";
  switch (unit) {
    case "money":
      return formatMoney(v, "INR");
    case "percent":
      return formatPercent(v);
    case "ratio":
      return formatRoas(v);
    default:
      return formatNumber(v);
  }
}

function fmtAxis(unit: ChartUnit, v: number) {
  switch (unit) {
    case "money":
      return formatMoney(v, "INR", { compact: true });
    case "percent":
      return formatPercent(v, 1);
    case "ratio":
      return `${v}×`;
    default:
      return formatNumber(v, { compact: true });
  }
}

function Chart({ spec, title }: { spec: ChartSpec; title: string }) {
  if (spec.kind === "column") {
    return (
      <ColumnChart
        ariaLabel={title}
        columns={spec.columns.map((c, i) => ({ key: String(i), label: c.label, value: c.value }))}
        formatValue={(v) => fmt(spec.unit, v)}
        formatAxis={(v) => fmtAxis(spec.unit, v)}
        tickEvery={spec.columns.length > 12 ? 3 : 1}
      />
    );
  }
  return (
    <LineChart
      ariaLabel={title}
      dates={spec.x}
      formatX={(d) => d}
      series={spec.series.map((s, i) => ({ key: String(i), label: s.label, color: `var(--color-chart-${i + 1})`, values: s.values }))}
      formatValue={(v) => fmt(spec.unit, v)}
      formatAxis={(v) => fmtAxis(spec.unit, v)}
    />
  );
}

const CALLOUT = {
  tip: { icon: Lightbulb, cls: "border-primary/40 bg-accent/40", label: "Tip" },
  warn: { icon: AlertTriangle, cls: "border-warning/50 bg-warning-subtle", label: "Watch out" },
  info: { icon: Info, cls: "border-border bg-bg-subtle", label: "Good to know" },
} as const;

function Quiz({
  block,
  onAnswer,
}: {
  block: Extract<Block, { type: "quiz" }>;
  onAnswer?: (correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === block.answer;
  return (
    <section className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs" aria-label="Check your understanding">
      <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Check your understanding</p>
      <p className="font-medium text-fg">
        <Inline text={block.question} />
      </p>
      <div className="grid gap-2" role="radiogroup">
        {block.options.map((o, i) => {
          const isAnswer = i === block.answer;
          const isPicked = i === picked;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isPicked}
              disabled={answered}
              onClick={() => {
                setPicked(i);
                onAnswer?.(i === block.answer);
              }}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                !answered && "border-border hover:border-primary/60",
                answered && isAnswer && "border-success bg-success-subtle text-success-fg",
                answered && isPicked && !isAnswer && "border-danger bg-danger-subtle text-danger-fg",
                answered && !isAnswer && !isPicked && "border-border opacity-60",
              )}
            >
              {answered && isAnswer ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : answered && isPicked ? (
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <span className="mt-0.5 size-4 shrink-0 rounded-full border border-border-strong" aria-hidden="true" />
              )}
              <Inline text={o} />
            </button>
          );
        })}
      </div>
      {answered && (
        <div aria-live="polite" className="grid gap-2">
          <p className={cn("text-sm font-medium", correct ? "text-success-fg" : "text-danger-fg")}>
            {correct ? "Correct!" : "Not quite."}
          </p>
          <p className="text-sm text-fg-muted">
            <Inline text={block.explain} />
          </p>
          {!correct && (
            <button type="button" className="justify-self-start text-xs text-primary hover:underline" onClick={() => setPicked(null)}>
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function Blocks({ blocks, onQuizAnswer }: { blocks: Block[]; onQuizAnswer?: (correct: boolean) => void }) {
  return (
    <div className="grid gap-5 text-[15px] leading-relaxed text-fg-muted">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "p":
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
          case "h":
            return (
              <h2 key={i} className="mt-2 font-display text-lg font-semibold text-fg">
                {b.text}
              </h2>
            );
          case "list": {
            const L = b.ordered ? "ol" : "ul";
            return (
              <L key={i} className={cn("grid gap-1.5 pl-5", b.ordered ? "list-decimal" : "list-disc")}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </L>
            );
          }
          case "callout": {
            const c = CALLOUT[b.tone];
            return (
              <aside key={i} className={cn("flex gap-3 rounded-xl border p-4", c.cls)}>
                <c.icon className="mt-0.5 size-4 shrink-0 text-fg" aria-hidden="true" />
                <div className="grid gap-1 text-sm">
                  <p className="font-medium text-fg">{b.title ?? c.label}</p>
                  <p>
                    <Inline text={b.text} />
                  </p>
                </div>
              </aside>
            );
          }
          case "terms":
            return (
              <dl key={i} className="grid gap-2 sm:grid-cols-2">
                {b.terms.map((t) => (
                  <div key={t.term} className="rounded-lg border border-border bg-surface p-3">
                    <dt className="font-medium text-fg">{t.term}</dt>
                    <dd className="mt-1 text-sm">
                      <Inline text={t.def} />
                    </dd>
                    {t.formula && (
                      <dd className="mt-2 rounded bg-bg-subtle px-2 py-1 font-mono text-xs text-fg">{t.formula}</dd>
                    )}
                  </div>
                ))}
              </dl>
            );
          case "steps":
            return (
              <ol key={i} className="grid gap-3">
                {b.steps.map((s, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-fg">
                      {j + 1}
                    </span>
                    <div className="grid gap-0.5">
                      <p className="font-medium text-fg">
                        <Inline text={s.title} />
                      </p>
                      <p className="text-sm">
                        <Inline text={s.text} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            );
          case "diagram":
            return (
              <figure key={i} className="grid gap-2 rounded-xl border border-border bg-surface p-4">
                <Diagram id={b.id} />
                {b.caption && (
                  <figcaption className="text-center text-xs text-fg-subtle">
                    <Inline text={b.caption} />
                  </figcaption>
                )}
              </figure>
            );
          case "chart":
            return (
              <figure key={i} className="grid gap-3 rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-fg">{b.title}</p>
                <Chart spec={b.chart} title={b.title} />
                {b.caption && (
                  <figcaption className="text-xs text-fg-subtle">
                    <Inline text={b.caption} />
                  </figcaption>
                )}
              </figure>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-bg-subtle text-left text-xs text-fg-muted">
                    <tr>
                      {b.columns.map((c) => (
                        <th key={c} className="px-3 py-2 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-t border-border align-top">
                        {r.map((cell, k) => (
                          <td key={k} className={cn("px-3 py-2", k === 0 && "font-medium text-fg")}>
                            <Inline text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "quiz":
            return <Quiz key={i} block={b} onAnswer={onQuizAnswer} />;
        }
      })}
    </div>
  );
}
