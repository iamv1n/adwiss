-- +goose Up
-- Budget planner (plan/budget-planner.md): one total for a period, paced day
-- by day and split across campaigns with a campaign-level daily budget.
-- Evaluated by internal/automation; changes go through the actions log with
-- source 'plan'.
CREATE TABLE budget_plans (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name            text NOT NULL,
    total_budget    numeric(14, 2) NOT NULL CHECK (total_budget > 0),
    currency        text NOT NULL,
    -- Inclusive, account-local calendar days.
    start_date      date NOT NULL,
    end_date        date NOT NULL,
    -- NULL = the first campaign's account timezone.
    timezone        text,
    curve           text NOT NULL DEFAULT 'even' CHECK (curve IN ('even', 'front_loaded', 'back_loaded', 'custom')),
    -- One positive weight per day when curve = 'custom'.
    custom_weights  jsonb,
    allocation_mode text NOT NULL DEFAULT 'manual' CHECK (allocation_mode IN ('manual', 'past_spend', 'roas')),
    reallocate      boolean NOT NULL DEFAULT true,
    enabled         boolean NOT NULL DEFAULT false,
    dry_run         boolean NOT NULL DEFAULT true,
    created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    last_run_at     timestamptz,
    next_run_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date AND end_date - start_date < 92)
);
CREATE INDEX budget_plans_org_idx ON budget_plans (organization_id, created_at);
CREATE INDEX budget_plans_due_idx ON budget_plans (next_run_at) WHERE enabled;

CREATE TABLE budget_plan_campaigns (
    plan_id          uuid NOT NULL REFERENCES budget_plans (id) ON DELETE CASCADE,
    campaign_id      uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    share_pct        numeric(5, 2) NOT NULL CHECK (share_pct >= 0 AND share_pct <= 100),
    min_daily_budget numeric(14, 2) NOT NULL DEFAULT 0 CHECK (min_daily_budget >= 0),
    PRIMARY KEY (plan_id, campaign_id)
);
CREATE INDEX budget_plan_campaigns_campaign_idx ON budget_plan_campaigns (campaign_id);

-- What was planned, set and spent per campaign per day: drives the delivery
-- report and chart. planned is re-paced on each evaluation for today and
-- later days; past days keep their last plan.
CREATE TABLE budget_plan_days (
    plan_id     uuid NOT NULL REFERENCES budget_plans (id) ON DELETE CASCADE,
    campaign_id uuid NOT NULL,
    day         date NOT NULL,
    planned     numeric(14, 2) NOT NULL DEFAULT 0,
    budget_set  numeric(14, 2),
    spent       numeric(14, 2),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_id, campaign_id, day)
);

ALTER TABLE actions DROP CONSTRAINT actions_source_check;
ALTER TABLE actions ADD CONSTRAINT actions_source_check
    CHECK (source IN ('manual', 'schedule', 'rule', 'revert', 'plan'));

-- +goose Down
DELETE FROM actions WHERE source = 'plan';
ALTER TABLE actions DROP CONSTRAINT actions_source_check;
ALTER TABLE actions ADD CONSTRAINT actions_source_check
    CHECK (source IN ('manual', 'schedule', 'rule', 'revert'));
DROP TABLE budget_plan_days;
DROP TABLE budget_plan_campaigns;
DROP TABLE budget_plans;
