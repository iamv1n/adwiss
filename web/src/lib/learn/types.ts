/**
 * Learn: the in-app ad-knowledge course. Content is static (lib/learn/content),
 * progress is per user on the server (internal/learn).
 *
 * A lesson's global id is `${module.id}.${lesson.id}`; ids are kebab-case and
 * must never change once shipped, because progress is stored against them.
 */

export type Track = "basics" | "meta" | "google" | "adwise";

/**
 * Diagrams are hand-drawn SVG components (components/app/learn/diagrams.tsx):
 *
 * - metrics-flow      impressions → clicks → conversions → revenue, with CTR, CVR, CPC, CPA, ROAS between
 * - funnel            awareness → consideration → conversion, with the objective and metric for each stage
 * - meta-structure    Meta campaign → ad sets → ads, and what is set at each level
 * - google-structure  Google account → campaign → ad groups → keywords + ads
 * - auction           how an ad auction picks the winner (bid × expected action rate × quality)
 * - learning-phase    Meta learning phase: ~50 results in 7 days, and what resets it
 * - attribution       click and view attribution windows on a timeline
 * - match-types       Google keyword match types as nested circles (broad ⊃ phrase ⊃ exact)
 * - lead-pipeline     lead → contacted → qualified → won, with drop-off at each step
 * - scaling           raising a budget in ~20% steps every few days vs one big jump
 * - adwise-loop       Adwise's loop: connect → sync → analyze → decide → act → learn
 */
export type DiagramId =
  | "metrics-flow"
  | "funnel"
  | "meta-structure"
  | "google-structure"
  | "auction"
  | "learning-phase"
  | "attribution"
  | "match-types"
  | "lead-pipeline"
  | "scaling"
  | "adwise-loop";

/** How chart values are formatted. Money is shown in ₹. */
export type ChartUnit = "money" | "percent" | "number" | "ratio";

export type ChartSpec =
  | {
      kind: "line";
      /** Category labels along the x axis, e.g. "Day 1" or "Mon". */
      x: string[];
      /** At most 3 series, all in the same unit. Percent values are fractions (0.012 = 1.2%). */
      series: { label: string; values: number[] }[];
      unit: ChartUnit;
    }
  | {
      kind: "column";
      columns: { label: string; value: number }[];
      unit: ChartUnit;
    };

/**
 * Text fields support **bold** and `code` inline; nothing else is parsed.
 */
export type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "callout"; tone: "tip" | "warn" | "info"; title?: string; text: string }
  | { type: "terms"; terms: { term: string; def: string; formula?: string }[] }
  | { type: "steps"; steps: { title: string; text: string }[] }
  | { type: "diagram"; id: DiagramId; caption?: string }
  | { type: "chart"; title: string; chart: ChartSpec; caption?: string }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "quiz"; question: string; options: string[]; answer: number; explain: string };

export interface Lesson {
  id: string;
  title: string;
  /** Reading time in minutes. */
  minutes: number;
  summary: string;
  blocks: Block[];
}

export interface Module {
  id: string;
  track: Track;
  title: string;
  summary: string;
  lessons: Lesson[];
}
