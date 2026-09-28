-- +goose Up
-- Action log (plan §25): every proposed or executed change to an ad entity,
-- whether it came from a person (manual), a dayparting schedule, an
-- automation rule or a revert. Rows are written by internal/automation.
--
-- idempotency_key makes evaluation safe to repeat: the scheduler derives it
-- from (source, source id, entity, time slot), so re-running an evaluation for
-- the same slot never creates a second row, and therefore never a second
-- provider mutation.
CREATE TABLE actions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    source          text NOT NULL CHECK (source IN ('manual', 'schedule', 'rule', 'revert')),
    -- The schedule or rule (or, for a revert, the reverted action). No foreign
    -- key: it is polymorphic and the log must outlive deleted rules.
    source_id       uuid,
    source_name     text NOT NULL DEFAULT '',
    actor_user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    provider        ad_provider,
    account_id      uuid,
    entity_type     text NOT NULL CHECK (entity_type IN ('campaign', 'ad_group', 'ad', 'account')),
    entity_id       uuid NOT NULL,
    entity_name     text NOT NULL DEFAULT '',
    currency        text NOT NULL DEFAULT '',
    action_type     text NOT NULL CHECK (action_type IN ('pause', 'activate', 'set_budget', 'notify', 'archive', 'update')),
    -- {"status": "active", "daily_budget": 500} in major currency units.
    before_state    jsonb NOT NULL DEFAULT '{}'::jsonb,
    after_state     jsonb NOT NULL DEFAULT '{}'::jsonb,
    status          text NOT NULL CHECK (status IN ('dry_run', 'pending', 'running', 'succeeded', 'failed', 'skipped')),
    reason          text NOT NULL DEFAULT '',
    error           text NOT NULL DEFAULT '',
    idempotency_key text,
    slot_start      timestamptz,
    reverted_by     uuid REFERENCES actions (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    executed_at     timestamptz,
    UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX actions_org_created_idx ON actions (organization_id, created_at DESC);
CREATE INDEX actions_source_idx ON actions (source_id, entity_id, created_at DESC);
CREATE INDEX actions_entity_idx ON actions (entity_id, created_at DESC);

-- +goose Down
DROP TABLE actions;
