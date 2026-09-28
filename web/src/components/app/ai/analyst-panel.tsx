"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowUp, History, Loader2, Plus, Sparkles, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  aiKeys,
  fetchAiConversation,
  streamChat,
  TOOL_LABELS,
  TOOL_NOUNS,
  useAiConversations,
  useAiStatus,
  useDeleteAiConversation,
  type AiConversation,
} from "@/lib/ai-api";
import { useActiveOrg } from "@/lib/queries";
import { cn, timeAgo } from "@/lib/utils";

const SUGGESTIONS = [
  "How did we do this week compared with last week?",
  "Where am I wasting money?",
  "Which campaigns should I scale?",
  "What are my best hours to run ads?",
];

type Msg = { role: "user" | "assistant"; text: string; tools: string[]; error?: boolean };
type View = "chat" | "history";

/**
 * "Ask AI" in the app header and the analyst panel it opens. Conversations are
 * saved on the server; the open one lives here (not in the sheet) so closing
 * the panel keeps it. Without an API key on the server the panel still shows
 * saved conversations, but asking is off.
 */
export function AnalystButton() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const qc = useQueryClient();
  const status = useAiStatus(orgId);
  const enabled = !!status.data?.enabled;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const conversations = useAiConversations(orgId, open);

  useEffect(() => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setView("chat");
  }, [orgId]);

  useEffect(() => {
    if (view === "chat") endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, step, view]);

  if (!orgId) return null;

  function startNew() {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setView("chat");
  }

  async function openConversation(c: AiConversation) {
    abortRef.current?.abort();
    setView("chat");
    setConversationId(c.id);
    setMessages([]);
    setLoading(true);
    try {
      const full = await fetchAiConversation(orgId!, c.id);
      setMessages(full.messages.map((m) => ({ role: m.role, text: m.text, tools: m.tools, error: m.error })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open that conversation.");
      setConversationId(null);
    } finally {
      setLoading(false);
    }
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy || !enabled) return;
    setMessages((prev) => [...prev, { role: "user", text: q, tools: [] }, { role: "assistant", text: "", tools: [] }]);
    setDraft("");
    setBusy(true);
    setStep("Thinking");
    const ac = new AbortController();
    abortRef.current = ac;

    const patchLast = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);
    try {
      await streamChat(
        orgId!,
        conversationId,
        q,
        (e) => {
          if (e.type === "conversation") {
            setConversationId(e.conversation.id);
          } else if (e.type === "text") {
            setStep(null);
            patchLast((m) => ({ ...m, text: m.text + e.text }));
          } else if (e.type === "tool") {
            setStep(TOOL_LABELS[e.tool] ?? "Looking at your data");
            patchLast((m) => ({
              ...m,
              tools: [...m.tools, e.tool],
              text: m.text && !m.text.endsWith("\n\n") ? m.text + "\n\n" : m.text,
            }));
          } else if (e.type === "error") {
            patchLast((m) => ({ ...m, text: m.text ? `${m.text}\n\n${e.text}` : e.text, error: !m.text }));
          }
        },
        ac.signal,
      );
    } catch (err) {
      if (!ac.signal.aborted) {
        patchLast((m) => ({ ...m, text: err instanceof Error ? err.message : "Something went wrong.", error: true }));
      }
    } finally {
      setBusy(false);
      setStep(null);
      abortRef.current = null;
      qc.invalidateQueries({ queryKey: aiKeys.conversations(orgId!) });
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 font-normal text-fg-muted" aria-label="Ask the AI analyst">
          <Sparkles aria-hidden="true" />
          <span className="hidden sm:inline">Ask AI</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <div className="flex items-center gap-1 border-b border-border px-3 py-2.5 pr-12">
          {view === "history" ? (
            <Button variant="ghost" size="icon-sm" onClick={() => setView("chat")} aria-label="Back to conversation">
              <ArrowLeft aria-hidden="true" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 px-1">
            <SheetTitle className="text-sm">{view === "history" ? "Conversations" : "AI analyst"}</SheetTitle>
            <SheetDescription className="truncate text-xs">
              {view === "history" ? "Only you can see your conversations." : "Explains and suggests. Never changes your ads."}
            </SheetDescription>
          </div>
          {view === "chat" && (
            <Button variant="ghost" size="icon-sm" onClick={() => setView("history")} aria-label="Conversations" title="Conversations">
              <History aria-hidden="true" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={startNew} aria-label="New conversation" title="New conversation">
            <Plus aria-hidden="true" />
          </Button>
        </div>

        {view === "history" ? (
          <HistoryList
            orgId={orgId}
            items={conversations.data}
            loading={conversations.isLoading}
            error={conversations.isError}
            activeId={conversationId}
            onOpen={openConversation}
            onDeleted={(id) => id === conversationId && startNew()}
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={busy || loading}>
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-fg-subtle">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading conversation…
                </p>
              ) : messages.length === 0 ? (
                <EmptyState
                  enabled={enabled}
                  recent={conversations.data?.slice(0, 3) ?? []}
                  onAsk={ask}
                  onOpen={openConversation}
                  onAll={() => setView("history")}
                />
              ) : (
                <div className="grid gap-4">
                  {messages.map((m, i) =>
                    m.role === "user" ? (
                      <div
                        key={i}
                        className="ml-8 justify-self-end rounded-lg bg-accent px-3 py-2 text-sm whitespace-pre-wrap text-accent-fg"
                      >
                        {m.text}
                      </div>
                    ) : m.text ? (
                      <div key={i} className="grid gap-1.5">
                        <div className={cn("analyst-md text-sm text-fg", m.error && "text-danger-fg")}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                        </div>
                        {m.tools.length > 0 && !(busy && i === messages.length - 1) && (
                          <p className="text-xs text-fg-subtle">
                            Looked at {[...new Set(m.tools.map((t) => TOOL_NOUNS[t] ?? t))].join(", ")}
                          </p>
                        )}
                      </div>
                    ) : null,
                  )}
                  {step && (
                    <p className="flex items-center gap-2 text-xs text-fg-subtle">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      {step}…
                    </p>
                  )}
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form
              className="grid gap-1.5 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
            >
              {!enabled && status.isSuccess && (
                <p className="text-xs text-fg-subtle">
                  Asking is off: the server has no Anthropic API key. Saved conversations can still be read.
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(draft);
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  disabled={!enabled}
                  placeholder={enabled ? "Ask about your ads…" : "AI analyst isn't set up yet"}
                  aria-label="Your question"
                  className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
                />
                {busy ? (
                  <Button type="button" size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Stop">
                    <Square aria-hidden="true" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" disabled={!enabled || !draft.trim()} aria-label="Send">
                    <ArrowUp aria-hidden="true" />
                  </Button>
                )}
              </div>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyState({
  enabled,
  recent,
  onAsk,
  onOpen,
  onAll,
}: {
  enabled: boolean;
  recent: AiConversation[];
  onAsk: (q: string) => void;
  onOpen: (c: AiConversation) => void;
  onAll: () => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="text-sm text-fg-muted">Ask about spend, results, campaigns or timing. For example:</p>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={!enabled}
            onClick={() => onAsk(s)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-fg transition-colors enabled:hover:border-primary/60 disabled:opacity-60"
          >
            {s}
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Recent</h3>
            <button type="button" onClick={onAll} className="text-xs font-medium text-primary hover:underline">
              See all
            </button>
          </div>
          {recent.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c)}
              className="truncate rounded-md px-2 py-1.5 text-left text-sm text-fg hover:bg-accent"
            >
              {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryList({
  orgId,
  items,
  loading,
  error,
  activeId,
  onOpen,
  onDeleted,
}: {
  orgId: string;
  items: AiConversation[] | undefined;
  loading: boolean;
  error: boolean;
  activeId: string | null;
  onOpen: (c: AiConversation) => void;
  onDeleted: (id: string) => void;
}) {
  const del = useDeleteAiConversation(orgId);
  const [now] = useState(() => Date.now());

  if (loading)
    return (
      <p className="flex items-center gap-2 px-4 py-4 text-sm text-fg-subtle">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
      </p>
    );
  if (error) return <p className="px-4 py-4 text-sm text-danger-fg">Couldn&apos;t load your conversations.</p>;
  if (!items?.length) return <p className="px-4 py-4 text-sm text-fg-muted">No conversations yet.</p>;

  return (
    <ul className="flex-1 divide-y divide-border overflow-y-auto">
      {items.map((c) => (
        <li key={c.id} className={cn("group flex items-center gap-2 px-4 py-2.5", c.id === activeId && "bg-accent/50")}>
          <button type="button" onClick={() => onOpen(c)} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm text-fg">{c.title}</span>
            <span className="block text-xs text-fg-subtle">{timeAgo(c.updated_at, now)}</span>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-fg-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Delete “${c.title}”`}
            disabled={del.isPending}
            onClick={() =>
              del.mutate(c.id, {
                onSuccess: () => onDeleted(c.id),
                onError: () => toast.error("Couldn't delete that conversation."),
              })
            }
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
