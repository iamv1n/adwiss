# AI agents and MCP (design)

Status: phase 1 built (2026-09-27), untested against the live model until an
API key is configured. Code: `internal/ai`, `web/src/components/app/ai`,
migration `00070_ai_conversations.sql`.

Note: a recommendations inbox with accept/dismiss (`internal/recommendations`)
now exists and covers most of phase 2's proposals; the analyst reads it.

## Summary

Adwise gets AI agents that analyse ad accounts and propose changes, plus an MCP
server that exposes the same capabilities to Claude, ChatGPT and Cursor. Both
are built on one Go tool layer: write it once, serve it twice.

The AI never changes an ad account on its own. Every change it suggests becomes
a proposal in the existing `actions` table, a person approves it in Adwise, and
the executor that already runs rules and dayparting applies it. This follows
plan.md §16 ("analyst and decision assistant, not an unrestricted autonomous
agent").

## Goals and non-goals

Goals

- Answer questions about account performance in plain language, citing the
  numbers behind each answer.
- Find wasted spend and winning campaigns every day, and turn them into
  one-click suggestions.
- Let users act on suggestions safely: every change is approved by a person,
  logged and reversible.
- Serve the same capabilities to users' own AI assistants through MCP.

Non-goals for now

- Autonomous changes with no approval step.
- Creating campaigns or writing ad copy. The manage API can create campaigns,
  but an AI that launches them is a later decision.
- Free-form SQL or raw database access for the model.
- Google write actions: Google has no management adapter yet, so it stays
  read-only for agents.

## Architecture

```
  Adwise app                          User's AI assistant
  (chat, briefings, suggestions)      (Claude, ChatGPT, Cursor)
          │                                     │
  Agent runtime                          MCP server
  (API + worker, Claude API tool use)    (remote /mcp, Adwise OAuth)
          └──────────────┬──────────────────────┘
                   Tool layer  (internal/ai/tools)
         scoped to org + user role + chosen ad accounts
          ┌──────────────┴──────────────┐
     Read tools                     Propose tools
          │                              │ proposal
  Existing services              Person approves in Adwise
  (analytics, entities,          (admin/owner; limits checked)
   automation, actions)                  │ approved
                                 Actions executor → Meta
                                 (logged, revertible)
```

Design rules

1. **The AI never writes to an ad account directly.** Propose tools only create
   proposals. The existing executor applies approved ones, so audit, the
   Actions page and revert work unchanged.
2. **Tools call Go services, not SQL.** Keeps org isolation and the rule that
   each analytics query reads exactly one report.
3. **Ad data is data, not instructions.** Campaign names and ad copy come from
   Meta and can carry text aimed at the model. They appear only in tool
   results, never in the system prompt. Since tools can only propose, a
   successful injection still can't spend money.
4. **Hard limits live in code, not the prompt.** Budget change size, spend
   caps and who may approve are enforced by the tool layer and the approval
   endpoint.

## Tool layer

A Go package (`internal/ai/tools`) where each tool has a name, a JSON schema,
a description written for the model, and a handler that calls an existing
service with the caller's org and role. Results are trimmed (top N rows,
rounded numbers, currency labelled) to keep tokens down.

| Tool | Kind | Backed by |
|---|---|---|
| `get_account_summary` | read | analytics service (overview) |
| `compare_periods` | read | analytics service (range vs previous) |
| `get_campaign_metrics` | read | entities service (list + metrics, filters, sort) |
| `get_breakdown` | read | analytics breakdowns: country, device, placement, publisher platform |
| `get_dayparting_heatmap` | read | `GET /analytics/dayparting` |
| `list_rules`, `list_schedules` | read | automation service |
| `get_recent_actions` | read | actions (source, status, entity) |
| `get_anomalies` | read | new: simple z-score on daily series (shared with alerts) |
| `propose_status_change` | propose | → proposal: pause / activate campaign or ad set |
| `propose_budget_change` | propose | → proposal: new daily budget |
| `propose_dayparting_schedule` | propose | → draft schedule (disabled, dry run) |
| `propose_rule` | propose | → draft automation rule (disabled) |

Schedules and rules proposed by the AI are saved disabled and in dry run, which
the existing models already default to; the user turns them on.

## Proposals and approval

Extend `actions` (migration `00040_actions.sql`) instead of adding a table:

- `source`: add `'ai'`.
- `status`: add `'proposed'` and `'dismissed'`.
- New columns: `rationale text` (the model's one-paragraph reason, with the
  numbers it used), `conversation_id uuid null`, `expires_at timestamptz`.

Flow: propose tool inserts `status='proposed'` → UI shows it → an admin or
owner approves (`POST /orgs/{id}/actions/{actionID}/approve`) → status becomes
`pending` and the existing executor runs it → result recorded as today.
Dismiss sets `dismissed`. Proposals expire after 48 hours, because the data
behind them goes stale.

Limits checked at propose time and again at approve time:

- Budget change at most ±30% per proposal, and never above the account spend cap.
- One open proposal per entity; a new one supersedes the old.
- Entities controlled by an enabled dayparting schedule can't be proposed for
  status changes (schedules take precedence, as they do over rules today).
- Members can see proposals; only admins and owners approve.

UI: a "Suggested" list on the dashboard and on the Actions page, each card
showing the change, the rationale and Approve / Dismiss. Approved AI actions
appear in Actions with source "AI" and can be reverted like any other.

## Agents

One runtime; an agent is a system prompt, a tool subset and a trigger.

| Agent | Trigger | Tools | Output |
|---|---|---|---|
| Analyst | user chat | all read + propose | streamed answer with numbers, optional proposals |
| Daily briefing | worker, 08:00 org time | read only | 5-line summary on dashboard + email |
| Optimizer | worker, after the daily sync | read + propose_status/budget | Suggested cards |
| Rule auditor | weekly or on demand | list_rules, list_schedules, read | gaps, conflicts, rules that never fire; may propose_rule |
| Dayparting / budget assistant | button on those pages | heatmap, breakdowns, propose_dayparting_schedule | pre-filled builder the user reviews |

Learning loop: when a user approves the same kind of optimizer suggestion
three times, offer to turn it into an automation rule.

## Account brief

A per-org settings record every agent reads first:

- Goal metric and target (target CPA or target ROAS).
- Margin % (gives break-even ROAS; also used later for profit-based rules).
- Monthly budget.
- Things never to touch (campaign IDs or name patterns).
- Free-text notes ("Diwali sale 20–27 Oct").

Stored in a new `org_ai_brief` table, edited on Settings. Missing fields are
fine; agents say what they assumed.

## Runtime

- **Chat endpoint:** `POST /orgs/{id}/ai/chat` streams server-sent events
  (text deltas, tool-call steps, proposals created). The API runs the tool-use
  loop with the Claude API.
- **Scheduled agents** run in the worker on a new `ai` queue, one task per
  org, so a slow model call never blocks sync queues.
- **Models:** a small, cheap model for briefings; a stronger model for chat
  and the optimizer. Configured in env so they can change without code.
- **Storage:** `ai_conversations`, `ai_messages` (including tool calls and
  results) so any suggestion can be traced back to the data it used.
- **Cost:** record input/output tokens per org per day; enforce a daily cap
  per plan.
- **Guardrails:** at most 12 tool calls per turn, 30 s per tool, per-org rate
  limit on chat, and a clear error when the cap is hit.

## MCP server

- Remote MCP over streamable HTTP at `/mcp` on the API.
- Auth: OAuth 2.1 with Adwise as the authorisation server (the MCP spec's
  flow). On consent the user picks the org and which ad accounts the assistant
  may see; the token carries those scopes.
- Tools: the same tool layer, same schemas. Read tools return data.
  Propose tools return "Proposal created, approve in Adwise: <link>", so
  outside assistants go through the same approval queue.
- Tokens are revocable from Settings, and every MCP call is logged with the
  token's id.

## Security and safety

- Org scoping enforced in the tool layer from the authenticated membership,
  never from model-supplied IDs alone: every entity ID a model passes is
  checked against the org and allowed accounts.
- Tool results are data. The system prompt tells the model so, and nothing a
  tool returns can widen its permissions.
- No secrets, tokens or other orgs' data ever reach the model.
- Every proposal and approval is audited with actor and source.
- Kill switch: an org setting and a global env flag that disable all AI
  features.

## Build phases

1. **Tool layer + Analyst chat (read only).** Tool package with the read
   tools, chat endpoint with streaming, chat panel in the app shell,
   conversation storage, token accounting. No writes, so no risk.
2. **Proposals + Optimizer + approval UI.** `actions` migration, propose
   tools, approve/dismiss endpoints, Suggested cards, worker optimizer job.
3. **Daily briefing.** Worker job + email template, reusing 1 and 2.
4. **Account brief.** Table, Settings UI, injected into every agent.
5. **MCP server.** OAuth, `/mcp` transport, token management UI.
6. **Rule auditor, dayparting and budget assistants.**

## Open questions

- Which plan tiers get AI, and what daily token cap per tier?
- Should briefings go by email by default, or only on the dashboard?
- Do we let members (not just admins) create proposals from chat?
- MCP: support multiple orgs per token for agencies, or one org per token?
- Where to show AI cost to the org owner, if at all?
