import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

export interface AiConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error: boolean;
  created_at: string;
}

export type ChatEvent =
  | { type: "conversation"; conversation: AiConversation }
  | { type: "text"; text: string }
  | { type: "tool"; tool: string }
  | { type: "error"; text: string }
  | { type: "done"; usage?: { input_tokens: number; output_tokens: number } };

const enc = encodeURIComponent;

export const aiKeys = {
  status: (orgId: string) => ["orgs", orgId, "ai", "status"] as const,
  conversations: (orgId: string) => ["orgs", orgId, "ai", "conversations"] as const,
  conversation: (orgId: string, id: string) => ["orgs", orgId, "ai", "conversations", id] as const,
};

/** Whether the server has an AI analyst configured (an API key is set). */
export function useAiStatus(orgId: string | undefined) {
  return useQuery({
    queryKey: aiKeys.status(orgId ?? ""),
    queryFn: () => request<{ enabled: boolean }>("GET", `/orgs/${enc(orgId!)}/ai/status`),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

/** The signed-in user's conversations in this org, most recent first. */
export function useAiConversations(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: aiKeys.conversations(orgId ?? ""),
    queryFn: async () =>
      (await request<{ conversations: AiConversation[] }>("GET", `/orgs/${enc(orgId!)}/ai/conversations`)).conversations,
    enabled: !!orgId && enabled,
  });
}

export async function fetchAiConversation(orgId: string, id: string) {
  return (
    await request<{ conversation: AiConversation & { messages: AiMessage[] } }>(
      "GET",
      `/orgs/${enc(orgId)}/ai/conversations/${enc(id)}`,
    )
  ).conversation;
}

export function useDeleteAiConversation(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>("DELETE", `/orgs/${enc(orgId)}/ai/conversations/${enc(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.conversations(orgId) }),
  });
}

/**
 * Asks `message` in a conversation (a new one when `conversationId` is null),
 * calling `onEvent` for each server-sent event until the answer is done. The
 * first event names the conversation the answer is saved in. Throws on HTTP
 * errors, with the server's message.
 */
export async function streamChat(
  orgId: string,
  conversationId: string | null,
  message: string,
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/v1/orgs/${enc(orgId)}/ai/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ conversation_id: conversationId ?? undefined, message }),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = "The analyst is unavailable right now.";
    try {
      const body = await res.json();
      msg = body?.error?.message ?? msg;
      if (body?.error?.code === "rate_limited") msg = "You've asked a lot of questions this hour. Try again shortly.";
    } catch {}
    throw new Error(msg.charAt(0).toUpperCase() + msg.slice(1));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as ChatEvent);
      } catch {}
    }
  }
}

/** Plain-language label for a tool the analyst is using. */
export const TOOL_LABELS: Record<string, string> = {
  get_overview: "Checking account totals",
  list_campaigns: "Looking at campaigns",
  get_breakdown: "Breaking down by segment",
  get_dayparting_heatmap: "Checking hour-by-hour performance",
  find_wasted_spend: "Looking for wasted spend",
  list_automations: "Reviewing rules and schedules",
  list_recent_actions: "Checking recent changes",
  list_alerts: "Checking alerts",
  list_recommendations: "Reading recommendations",
};

/** Short label for what an answer looked at ("Looked at campaigns, alerts"). */
export const TOOL_NOUNS: Record<string, string> = {
  get_overview: "account totals",
  list_campaigns: "campaigns",
  get_breakdown: "breakdowns",
  get_dayparting_heatmap: "hourly performance",
  find_wasted_spend: "wasted spend",
  list_automations: "automations",
  list_recent_actions: "recent changes",
  list_alerts: "alerts",
  list_recommendations: "recommendations",
};
