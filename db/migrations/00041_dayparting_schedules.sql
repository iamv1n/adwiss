-- +goose Up
-- Dayparting schedules (plan §11–13, §24). A schedule applies a weekly
-- 7×24 grid (Monday first, hour 0–23 in the schedule's timezone, or in each
-- target's account timezone when timezone is NULL) to a set of campaigns or
-- ad sets. Each cell is 0 (off: pause), 1 (on: normal) or a positive budget
-- multiplier (e.g. 1.2 = +20% daily budget during that hour).
CREATE TABLE dayparting_schedules (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name              text NOT NULL,
    level             text NOT NULL DEFAULT 'campaign' CHECK (level IN ('campaign', 'ad_group')),
    target_ids        uuid[] NOT NULL DEFAULT '{}',
    timezone          text,
    grid              jsonb NOT NULL,
    enabled           boolean NOT NULL DEFAULT false,
    dry_run           boolean NOT NULL DEFAULT true,
    created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    last_evaluated_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dayparting_schedules_org_idx ON dayparting_schedules (organization_id, created_at);
CREATE INDEX dayparting_schedules_enabled_idx ON dayparting_schedules (enabled) WHERE enabled;

-- What a schedule has done to each target, so it only undoes its own changes:
-- it re-activates only what it paused, and restores the budget it captured
-- before applying a multiplier.
CREATE TABLE dayparting_entity_state (
    schedule_id         uuid NOT NULL REFERENCES dayparting_schedules (id) ON DELETE CASCADE,
    entity_id           uuid NOT NULL,
    paused_by_schedule  boolean NOT NULL DEFAULT false,
    base_budget_micros  bigint,
    applied_multiplier  double precision NOT NULL DEFAULT 1,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (schedule_id, entity_id)
);

-- +goose Down
DROP TABLE dayparting_entity_state;
DROP TABLE dayparting_schedules;
