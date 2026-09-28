"use client";

/**
 * Course diagrams, drawn as inline SVG with the design tokens so they follow
 * the theme and dark mode. Each is laid out on a fixed viewBox and scrolls
 * sideways on narrow screens rather than shrinking its text below legibility.
 */

import { useId } from "react";
import type { DiagramId } from "@/lib/learn/types";

const C = {
  fg: "var(--color-fg)",
  muted: "var(--color-fg-muted)",
  subtle: "var(--color-fg-subtle)",
  border: "var(--color-border-strong)",
  surface: "var(--color-surface)",
  soft: "var(--color-bg-subtle)",
  primary: "var(--color-primary)",
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  danger: "var(--color-danger)",
  chart: (n: number) => `var(--color-chart-${n})`,
};

function Frame({ w, h, label, children }: { w: number; h: number; label: string; children: (arrow: string) => React.ReactNode }) {
  const id = useId().replace(/:/g, "");
  const arrow = `arrow-${id}`;
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={label}
        className="mx-auto block h-auto w-full"
        style={{ minWidth: Math.min(w, 460), maxWidth: w }}
        fontFamily="inherit"
      >
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={C.muted} />
          </marker>
        </defs>
        {children(`url(#${arrow})`)}
      </svg>
    </div>
  );
}

function Box({
  x, y, w, h, title, sub, tone = "surface", align = "middle",
}: {
  x: number; y: number; w: number; h: number; title: string; sub?: string;
  tone?: "surface" | "primary" | "soft" | "success" | "danger"; align?: "middle" | "start";
}) {
  const fill = tone === "primary" ? C.primary : tone === "soft" ? C.soft : C.surface;
  const stroke = tone === "success" ? C.success : tone === "danger" ? C.danger : tone === "primary" ? C.primary : C.border;
  const text = tone === "primary" ? "var(--color-primary-foreground, #fff)" : C.fg;
  const sub2 = tone === "primary" ? "var(--color-primary-foreground, #fff)" : C.muted;
  const tx = align === "middle" ? x + w / 2 : x + 12;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1.25} />
      <text x={tx} y={sub ? y + h / 2 - 3 : y + h / 2 + 5} textAnchor={align} fontSize={14} fontWeight={600} fill={text}>
        {title}
      </text>
      {sub && (
        <text x={tx} y={y + h / 2 + 15} textAnchor={align} fontSize={12} fill={sub2} opacity={tone === "primary" ? 0.9 : 1}>
          {sub}
        </text>
      )}
    </g>
  );
}

function Line({ d, marker, dashed }: { d: string; marker?: string; dashed?: boolean }) {
  return <path d={d} fill="none" stroke={C.muted} strokeWidth={1.5} markerEnd={marker} strokeDasharray={dashed ? "4 4" : undefined} />;
}

function Label({ x, y, children, anchor = "middle", size = 12, color = C.muted, weight }: {
  x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end"; size?: number; color?: string; weight?: number;
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={color} fontWeight={weight}>
      {children}
    </text>
  );
}

// --- diagrams ---

function MetricsFlow() {
  const stages = [
    { t: "Impressions", s: "ad shown" },
    { t: "Clicks", s: "people tap" },
    { t: "Conversions", s: "they act" },
    { t: "Revenue", s: "money in" },
  ];
  const between = ["CTR = clicks ÷ impr.", "CVR = conv. ÷ clicks", "value per conv."];
  const w = 140, gap = 48, y = 40;
  return (
    <Frame w={4 * w + 3 * gap + 20} h={200} label="Impressions lead to clicks, conversions and revenue; each step has a rate">
      {(m) => (
        <>
          {stages.map((s, i) => (
            <Box key={s.t} x={10 + i * (w + gap)} y={y} w={w} h={56} title={s.t} sub={s.s} tone={i === 3 ? "primary" : "surface"} />
          ))}
          {between.map((b, i) => {
            const x1 = 10 + i * (w + gap) + w;
            return (
              <g key={b}>
                <Line d={`M${x1 + 4},${y + 28} L${x1 + gap - 4},${y + 28}`} marker={m} />
                <Label x={x1 + gap / 2} y={y - 10} size={11}>{b}</Label>
              </g>
            );
          })}
          <rect x={10} y={130} width={4 * w + 3 * gap} height={56} rx={8} fill={C.soft} />
          <Label x={30} y={153} anchor="start" size={13} color={C.fg} weight={600}>What each costs</Label>
          <Label x={30} y={173} anchor="start" size={12}>CPM = spend ÷ impressions × 1000 · CPC = spend ÷ clicks · CPA = spend ÷ conversions · ROAS = revenue ÷ spend</Label>
        </>
      )}
    </Frame>
  );
}

function Funnel() {
  const rows = [
    { t: "Awareness", s: "Reach new people · CPM, reach, video views", w: 520 },
    { t: "Consideration", s: "Get them interested · CTR, CPC, engagement", w: 400 },
    { t: "Conversion", s: "Get the sale or lead · CPA, ROAS", w: 280 },
  ];
  return (
    <Frame w={560} h={230} label="Marketing funnel: awareness, consideration, conversion">
      {() => (
        <>
          {rows.map((r, i) => {
            const x = (560 - r.w) / 2, y = 12 + i * 72, next = rows[i + 1]?.w ?? r.w - 120;
            const x2 = (560 - next) / 2;
            return (
              <g key={r.t}>
                <path d={`M${x},${y} L${x + r.w},${y} L${x2 + next},${y + 64} L${x2},${y + 64} Z`} fill={C.chart(i + 1)} opacity={0.18} stroke={C.chart(i + 1)} />
                <Label x={280} y={y + 28} size={15} color={C.fg} weight={600}>{r.t}</Label>
                <Label x={280} y={y + 47} size={12}>{r.s}</Label>
              </g>
            );
          })}
        </>
      )}
    </Frame>
  );
}

function Tree({ label, root, mid, leaves }: {
  label: string;
  root: { t: string; s: string };
  mid: { t: string; s: string };
  leaves: { t: string; s: string }[];
}) {
  const W = 620;
  return (
    <Frame w={W} h={290} label={label}>
      {(m) => (
        <>
          <Box x={W / 2 - 130} y={10} w={260} h={56} title={root.t} sub={root.s} tone="primary" />
          {[0, 1].map((i) => {
            const x = i === 0 ? 40 : W - 280;
            return (
              <g key={i}>
                <Line d={`M${W / 2},${66} C${W / 2},${90} ${x + 120},${86} ${x + 120},${108}`} marker={m} />
                <Box x={x} y={110} w={240} h={56} title={`${mid.t} ${i + 1}`} sub={mid.s} />
                {leaves.map((lf, j) => {
                  const lx = x + j * 124 - 2;
                  return (
                    <g key={j}>
                      <Line d={`M${x + 120},${166} C${x + 120},${188} ${lx + 58},${186} ${lx + 58},${206}`} marker={m} />
                      <Box x={lx} y={208} w={116} h={56} title={lf.t} sub={lf.s} tone="soft" />
                    </g>
                  );
                })}
              </g>
            );
          })}
          <Label x={W / 2} y={284} size={11}>Settings flow down: each level inherits from the one above it</Label>
        </>
      )}
    </Frame>
  );
}

function MetaStructure() {
  return (
    <Tree
      label="Meta structure: a campaign contains ad sets, each ad set contains ads"
      root={{ t: "Campaign", s: "Objective · budget (Advantage campaign budget)" }}
      mid={{ t: "Ad set", s: "Audience · placements · schedule" }}
      leaves={[{ t: "Ad", s: "Image/video, text" }, { t: "Ad", s: "Another creative" }]}
    />
  );
}

function GoogleStructure() {
  return (
    <Tree
      label="Google structure: a campaign contains ad groups, each with keywords and ads"
      root={{ t: "Campaign", s: "Type · budget · bidding · locations" }}
      mid={{ t: "Ad group", s: "One theme of searches" }}
      leaves={[{ t: "Keywords", s: "What people search" }, { t: "Ads", s: "Responsive search ad" }]}
    />
  );
}

function Auction() {
  const ads = [
    { n: "Ad A", bid: 40, rate: 0.9, q: 1.0 },
    { n: "Ad B", bid: 60, rate: 0.4, q: 0.8 },
    { n: "Ad C", bid: 30, rate: 0.7, q: 1.2 },
  ].map((a) => ({ ...a, score: a.bid * a.rate * a.q }));
  const max = Math.max(...ads.map((a) => a.score));
  const winner = ads.find((a) => a.score === max)!;
  return (
    <Frame w={600} h={230} label="Auction: the highest total value wins, not the highest bid">
      {() => (
        <>
          <rect x={10} y={10} width={580} height={40} rx={8} fill={C.soft} />
          <Label x={300} y={35} size={14} color={C.fg} weight={600}>Total value = bid × chance they act × ad quality</Label>
          {ads.map((a, i) => {
            const y = 70 + i * 50, bw = (a.score / max) * 300;
            const win = a === winner;
            return (
              <g key={a.n}>
                <Label x={20} y={y + 20} anchor="start" size={13} color={C.fg} weight={600}>{a.n}</Label>
                <Label x={20} y={y + 36} anchor="start" size={11}>{`₹${a.bid} × ${a.rate} × ${a.q}`}</Label>
                <rect x={170} y={y + 6} width={bw} height={24} rx={4} fill={win ? C.primary : C.chart(4)} opacity={win ? 1 : 0.45} />
                <Label x={176 + bw} y={y + 23} anchor="start" size={12} color={C.fg}>
                  {`${a.score.toFixed(1)}${win ? "  · wins" : ""}`}
                </Label>
              </g>
            );
          })}
          <Label x={300} y={222} size={11}>Ad B bid the most but loses: fewer people are likely to act on it</Label>
        </>
      )}
    </Frame>
  );
}

function LearningPhase() {
  const W = 600;
  return (
    <Frame w={W} h={200} label="Learning phase: around 50 results within 7 days to exit learning">
      {(m) => (
        <>
          <rect x={20} y={40} width={330} height={44} rx={8} fill={C.chart(3)} opacity={0.18} stroke={C.chart(3)} />
          <Label x={185} y={60} size={14} color={C.fg} weight={600}>Learning</Label>
          <Label x={185} y={76} size={12}>Results unstable, costs higher</Label>
          <rect x={350} y={40} width={230} height={44} rx={8} fill={C.success} opacity={0.15} stroke={C.success} />
          <Label x={465} y={60} size={14} color={C.fg} weight={600}>Active (stable)</Label>
          <Label x={465} y={76} size={12}>Costs settle</Label>
          <Line d={`M20,110 L580,110`} marker={m} />
          {["Day 1", "Day 3", "Day 5", "Day 7"].map((d, i) => (
            <Label key={d} x={20 + i * 110} y={128} anchor="start" size={11}>{d}</Label>
          ))}
          <Label x={350} y={128} anchor="middle" size={11} color={C.fg} weight={600}>~50 results</Label>
          <rect x={20} y={146} width={560} height={44} rx={8} fill={C.soft} />
          <Label x={34} y={165} anchor="start" size={12} color={C.fg} weight={600}>Resets learning:</Label>
          <Label x={34} y={181} anchor="start" size={12}>big budget jumps, new targeting, new creative, changing the optimization event, pausing a week+</Label>
        </>
      )}
    </Frame>
  );
}

function Attribution() {
  const W = 620, x0 = 60, day = 70;
  return (
    <Frame w={W} h={210} label="Attribution windows: a click counts for 7 days, a view for 1 day">
      {(m) => (
        <>
          <Line d={`M${x0},150 L${x0 + day * 7 + 30},150`} marker={m} />
          {Array.from({ length: 8 }, (_, i) => (
            <g key={i}>
              <path d={`M${x0 + i * day},146 L${x0 + i * day},154`} stroke={C.muted} />
              <Label x={x0 + i * day} y={172} size={11}>{`Day ${i}`}</Label>
            </g>
          ))}
          <rect x={x0} y={40} width={day * 7} height={30} rx={6} fill={C.primary} opacity={0.18} stroke={C.primary} />
          <Label x={x0 + 10} y={60} anchor="start" size={13} color={C.fg} weight={600}>Click → purchase within 7 days: counted</Label>
          <rect x={x0} y={86} width={day} height={30} rx={6} fill={C.chart(2)} opacity={0.25} stroke={C.chart(2)} />
          <Label x={x0 + day + 10} y={106} anchor="start" size={13} color={C.fg} weight={600}>View only → purchase within 1 day: counted</Label>
          <circle cx={x0 + day * 4.5} cy={150} r={6} fill={C.success} />
          <Label x={x0 + day * 4.5} y={198} size={12} color={C.fg}>Purchase on day 4 after a click ✓</Label>
        </>
      )}
    </Frame>
  );
}

function MatchTypes() {
  return (
    <Frame w={600} h={270} label="Keyword match types: broad contains phrase contains exact">
      {() => (
        <>
          <circle cx={200} cy={135} r={125} fill={C.chart(1)} opacity={0.12} stroke={C.chart(1)} />
          <circle cx={200} cy={150} r={82} fill={C.chart(2)} opacity={0.16} stroke={C.chart(2)} />
          <circle cx={200} cy={165} r={42} fill={C.chart(3)} opacity={0.22} stroke={C.chart(3)} />
          <Label x={200} y={36} size={13} color={C.fg} weight={600}>Broad</Label>
          <Label x={200} y={88} size={13} color={C.fg} weight={600}>&quot;Phrase&quot;</Label>
          <Label x={200} y={170} size={13} color={C.fg} weight={600}>[Exact]</Label>
          <Label x={350} y={60} anchor="start" size={13} color={C.fg} weight={600}>Keyword: 2bhk flat pune</Label>
          <Label x={350} y={92} anchor="start" size={12}>[Exact] → “2bhk flat pune”, “2 bhk flats in pune”</Label>
          <Label x={350} y={122} anchor="start" size={12}>&quot;Phrase&quot; → + “ready 2bhk flat pune price”</Label>
          <Label x={350} y={152} anchor="start" size={12}>Broad → + “apartments near hinjewadi”</Label>
          <Label x={350} y={196} anchor="start" size={12} color={C.fg}>Wider reach ↑ · less control ↓</Label>
          <Label x={350} y={216} anchor="start" size={12}>Use negatives to block the searches</Label>
          <Label x={350} y={234} anchor="start" size={12}>you never want (e.g. “rent”, “jobs”)</Label>
        </>
      )}
    </Frame>
  );
}

function LeadPipeline() {
  const steps = [
    { t: "Leads", n: 400 },
    { t: "Contacted", n: 280 },
    { t: "Qualified", n: 90 },
    { t: "Won", n: 12 },
  ];
  const max = steps[0].n;
  return (
    <Frame w={600} h={230} label="Lead pipeline: most leads drop off before they are won">
      {(m) => (
        <>
          {steps.map((s, i) => {
            const y = 14 + i * 50, w = Math.max(40, (s.n / max) * 420);
            return (
              <g key={s.t}>
                <Label x={20} y={y + 22} anchor="start" size={13} color={C.fg} weight={600}>{s.t}</Label>
                <rect x={120} y={y + 4} width={w} height={28} rx={4} fill={i === 3 ? C.success : C.chart(1)} opacity={i === 3 ? 0.9 : 0.35 + i * 0.12} />
                <Label x={128 + w} y={y + 23} anchor="start" size={12} color={C.fg}>
                  {`${s.n}${i > 0 ? ` (${Math.round((s.n / steps[i - 1].n) * 100)}%)` : ""}`}
                </Label>
                {i < steps.length - 1 && <Line d={`M100,${y + 34} L100,${y + 50}`} marker={m} />}
              </g>
            );
          })}
          <Label x={300} y={222} size={12}>Cost per lead ₹150 looks cheap. Cost per sale = ₹60,000 ÷ 12 = ₹5,000</Label>
        </>
      )}
    </Frame>
  );
}

function Scaling() {
  const W = 600, H = 220, x0 = 50, y0 = 180, dx = 70;
  const steady = [1000, 1200, 1440, 1730, 2070, 2490, 2990];
  const jump = [1000, 1000, 3000, 3000, 3000, 3000, 3000];
  const sy = (v: number) => y0 - (v / 3200) * 150;
  const stepPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x0 + i * dx},${sy(v)} L${x0 + (i + 1) * dx},${sy(v)}`).join(" ");
  return (
    <Frame w={W} h={H} label="Scaling: raise budgets about 20% every few days instead of one big jump">
      {() => (
        <>
          <path d={`M${x0},${y0} L${x0 + 7 * dx},${y0}`} stroke={C.border} />
          <path d={stepPath(jump)} fill="none" stroke={C.danger} strokeWidth={2} strokeDasharray="5 4" />
          <path d={stepPath(steady)} fill="none" stroke={C.primary} strokeWidth={2.5} />
          {Array.from({ length: 7 }, (_, i) => (
            <Label key={i} x={x0 + i * dx + dx / 2} y={y0 + 18} size={11}>{`Day ${i * 3 + 1}`}</Label>
          ))}
          <Label x={x0 + 2 * dx + 6} y={sy(3000) - 8} anchor="start" size={12} color={C.danger}>₹1,000 → ₹3,000 overnight: learning resets, costs spike</Label>
          <Label x={x0 + 4 * dx} y={sy(2000) + 34} anchor="start" size={12} color={C.primary} weight={600}>+20% every 3 days: stable</Label>
        </>
      )}
    </Frame>
  );
}

function AdwiseLoop() {
  const steps = ["Connect", "Sync", "Analyze", "Decide", "Act", "Learn"];
  const subs = ["Meta & Google", "data every hour", "what's working", "rules & schedules", "pause, budget", "action log"];
  const cx = 300, cy = 150, r = 105;
  return (
    <Frame w={600} h={300} label="The Adwise loop: connect, sync, analyze, decide, act, learn">
      {(m) => (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeDasharray="4 5" />
          {steps.map((s, i) => {
            const a = (i / steps.length) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            const a2 = ((i + 0.5) / steps.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <g key={s}>
                <path
                  d={`M${cx + Math.cos(a2 - 0.18) * r},${cy + Math.sin(a2 - 0.18) * r} A${r},${r} 0 0 1 ${cx + Math.cos(a2 + 0.12) * r},${cy + Math.sin(a2 + 0.12) * r}`}
                  fill="none" stroke={C.muted} strokeWidth={1.5} markerEnd={m}
                />
                <Box x={x - 62} y={y - 24} w={124} h={48} title={s} sub={subs[i]} tone={i === 0 ? "primary" : "surface"} />
              </g>
            );
          })}
          <Label x={cx} y={cy + 5} size={14} color={C.fg} weight={600}>Adwise</Label>
        </>
      )}
    </Frame>
  );
}

const DIAGRAMS: Record<DiagramId, () => React.ReactElement> = {
  "metrics-flow": MetricsFlow,
  funnel: Funnel,
  "meta-structure": MetaStructure,
  "google-structure": GoogleStructure,
  auction: Auction,
  "learning-phase": LearningPhase,
  attribution: Attribution,
  "match-types": MatchTypes,
  "lead-pipeline": LeadPipeline,
  scaling: Scaling,
  "adwise-loop": AdwiseLoop,
};

export function Diagram({ id }: { id: DiagramId }) {
  const D = DIAGRAMS[id];
  return D ? <D /> : null;
}
