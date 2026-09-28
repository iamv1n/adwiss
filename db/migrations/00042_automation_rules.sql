-- +goose Up
-- Automation rules (plan §14): conditions over a lookback window of
-- metric_facts, and one action applied to each matching campaign.
CREATE TABLE automation_rules (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name                   text NOT NULL,
    -- org: every campaign; account: campaigns in scope_ids accounts;
    -- campaigns: the campaigns in scope_ids.
    scope_type             text NOT NULL DEFAULT 'org' CHECK (scope_type IN ('org', 'account', 'campaigns')),
    scope_ids              uuid[] NOT NULL DEFAULT '{}',
    -- [{"metric": "spend", "op": "gt", "value": 500}, ...], all must hold.
    conditions             jsonb NOT NULL,
    lookback_days          integer NOT NULL DEFAULT 3 CHECK (lookback_days BETWEEN 1 AND 90),
    -- {"type": "pause" | "activate" | "increase_budget" | "decrease_budget" | "set_budget" | "notify", "value": 20}
    action                 jsonb NOT NULL,
    check_interval_minutes integer NOT NULL DEFAULT 60 CHECK (check_interval_minutes BETWEEN 15 AND 10080),
    cooldown_minutes       integer NOT NULL DEFAULT 1440 CHECK (cooldown_minutes BETWEEN 0 AND 43200),
    max_changes_per_run    integer NOT NULL DEFAULT 10 CHECK (max_changes_per_run BETWEEN 1 AND 500),
    enabled                boolean NOT NULL DEFAULT false,
    dry_run                boolean NOT NULL DEFAULT true,
    created_by             uuid REFERENCES users (id) ON DELETE SET NULL,
    last_run_at            timestamptz,
    last_run_matched       integer NOT NULL DEFAULT 0,
    last_run_changes       integer NOT NULL DEFAULT 0,
    next_run_at            timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_rules_org_idx ON automation_rules (organization_id, created_at);
CREATE INDEX automation_rules_due_idx ON automation_rules (next_run_at) WHERE enabled;

-- +goose Down
DROP TABLE automation_rules;
