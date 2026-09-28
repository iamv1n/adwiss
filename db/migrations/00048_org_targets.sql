-- +goose Up
-- An organization's performance targets (internal/recommendations). Used by
-- the recommendations generator and the automation rule templates. Money is
-- in major units of currency; a target only applies to ad accounts in that
-- currency.
CREATE TABLE organization_targets (
    organization_id uuid PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
    currency        text NOT NULL DEFAULT '',
    target_cpa      numeric(14, 2) CHECK (target_cpa > 0),
    target_roas     numeric(8, 3) CHECK (target_roas > 0),
    updated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE organization_targets;
