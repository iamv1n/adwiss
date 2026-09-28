/**
 * A tiny, safe markdown renderer for changelog bodies. It builds React
 * elements (never HTML strings), so all text is escaped by React. Supported:
 * paragraphs (blank-line separated), "- " bullet lists, **bold**, `code` and
 * [text](url) where url is http(s), a root-relative path or a #fragment.
 * Anything else renders as plain text. Mirrors web/src/components/app/changelog/markdown.tsx.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Returns href when it is safe to link to, else null. */
export function safeHref(url: string): string | null {
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
  if (url.startsWith("#")) return url;
  return null;
}

function inline(text: string, key: string, allowNested = true): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) {
      out.push(
        <strong key={k} className="font-semibold text-fg">
          {allowNested ? inline(m[1], k, false) : m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      out.push(
        <code key={k} className="rounded bg-bg-subtle px-1 py-0.5 font-mono text-[0.85em]">
          {m[2]}
        </code>,
      );
    } else {
      const href = safeHref(m[4]);
      if (href) {
        const external = /^https?:/i.test(href);
        out.push(
          <a
            key={k}
            href={href}
            className="font-medium text-primary underline underline-offset-2"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {m[3]}
          </a>,
        );
      } else {
        out.push(m[3]);
      }
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list?.length) blocks.push({ type: "ul", items: list });
    list = null;
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (/^[-*] /.test(line)) {
      flushPara();
      list ??= [];
      list.push(line.slice(2).trim());
    } else if (list && /^\s{2,}/.test(raw)) {
      list[list.length - 1] += ` ${line}`;
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  if (!blocks.length) return null;
  return (
    <div className={cn("space-y-3 text-[0.9375rem] leading-relaxed text-fg-muted", className)}>
      {blocks.map((b, i) =>
        b.type === "p" ? (
          <p key={i}>{inline(b.text, `p${i}`)}</p>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `l${i}-${j}`)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
