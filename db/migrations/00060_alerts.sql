-- +goose Up
-- Alerts (internal/alerts): conditions the worker detects hourly from synced
-- data (spend spikes, ROAS drops, stopped delivery, reconnects, failed
-- actions). Every alert is shown in-app; email follows each user's preference.
CREATE TABLE alerts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    kind            text NOT NULL,
    severity        text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    -- The subject, when there is one. No foreign key: alerts outlive entities.
    entity_type     text,
    entity_id       uuid,
    entity_name     text,
    title           text NOT NULL,
    body            text NOT NULL DEFAULT '',
    data            jsonb NOT NULL DEFAULT '{}'::jsonb, -- evidence (numbers behind the alert)
    -- Identifies the condition, e.g. "spend_spike:<campaign>:<date>" (one per
    -- day) or "stopped_delivering:<campaign>" (one per open occurrence).
    dedupe_key      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    emailed_at      timestamptz, -- email delivery processed (sent or nobody wanted it)
    resolved_at     timestamptz
);
-- At most one open alert per condition; a resolved one may recur.
CREATE UNIQUE INDEX alerts_open_dedupe_idx ON alerts (organization_id, dedupe_key) WHERE resolved_at IS NULL;
CREATE INDEX alerts_org_created_idx ON alerts (organization_id, created_at DESC);

-- Per-user read state (absence = unread).
CREATE TABLE alert_reads (
    alert_id uuid NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
    user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    read_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, alert_id)
);
CREATE INDEX alert_reads_alert_idx ON alert_reads (alert_id);

-- Email preferences per user and organization. No row = role default
-- (owners/admins: warning and above; members: none).
CREATE TABLE alert_preferences (
    organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email_level          text NOT NULL CHECK (email_level IN ('all', 'warning', 'critical', 'none')),
    email_muted_kinds    text[] NOT NULL DEFAULT '{}',
    updated_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

-- +goose Down
DROP TABLE alert_preferences;
DROP TABLE alert_reads;
DROP TABLE alerts;
