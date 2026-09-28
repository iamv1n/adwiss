-- +goose Up
-- AI analyst conversations (plan/ai-agents-and-mcp.md). A conversation is
-- private to the user who started it, inside one organization.
CREATE TABLE ai_conversations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title           text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_owner_idx ON ai_conversations (organization_id, user_id, updated_at DESC);

-- One row per visible message. Tool calls are not replayed: each question is
-- answered from fresh data, so only the tools' names are kept, for display
-- and to trace where an answer came from. Token counts are on assistant rows
-- and feed the per-org daily cap.
CREATE TABLE ai_messages (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   uuid NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
    organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    role              text NOT NULL CHECK (role IN ('user', 'assistant')),
    text              text NOT NULL,
    tools             text[] NOT NULL DEFAULT '{}',
    error             boolean NOT NULL DEFAULT false,
    model             text NOT NULL DEFAULT '',
    input_tokens      bigint NOT NULL DEFAULT 0,
    output_tokens     bigint NOT NULL DEFAULT 0,
    cache_read_tokens bigint NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx ON ai_messages (conversation_id, created_at);
CREATE INDEX ai_messages_org_usage_idx ON ai_messages (organization_id, created_at) WHERE role = 'assistant';

-- +goose Down
DROP TABLE ai_messages;
DROP TABLE ai_conversations;
