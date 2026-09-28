-- +goose Up
-- Recommendations inbox (internal/recommendations): suggested changes a
-- person approves with one click. Accepting one records and executes a manual
-- action (actions table), so it shows in the log and can be reverted.
CREATE TABLE recommendations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    -- creative_fatigue | scale_winner | wasted_spend | losing_money
    kind            text NOT NULL,
    entity_type     text NOT NULL CHECK (entity_type IN ('campaign', 'ad_group', 'ad')),
    entity_id       uuid NOT NULL,
    entity_name     text NOT NULL DEFAULT '',
    account_id      uuid,
    provider        ad_provider,
    currency        text NOT NULL DEFAULT '',
    title           text NOT NULL,
    reason          text NOT NULL DEFAULT '',
    -- Numbers behind the suggestion: both windows, targets used, thresholds.
    evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- {"type": "pause" | "activate" | "set_budget", "value": 1200, "before": 1000}
    proposed_action jsonb NOT NULL,
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'expired', 'failed')),
    action_id       uuid REFERENCES actions (id) ON DELETE SET NULL,
    error           text NOT NULL DEFAULT '',
    -- kind:entity:action; one open row per key, and the generator does not
    -- re-create a key that was dismissed or accepted recently.
    dedupe_key      text NOT NULL,
    decided_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    decided_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL
);
CREATE UNIQUE INDEX recommendations_open_key ON recommendations (organization_id, dedupe_key) WHERE status = 'open';
CREATE INDEX recommendations_org_status_idx ON recommendations (organization_id, status, created_at DESC);
CREATE INDEX recommendations_key_idx ON recommendations (organization_id, dedupe_key, decided_at DESC);

-- +goose Down
DROP TABLE recommendations;
