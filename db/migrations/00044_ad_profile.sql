-- +goose Up
-- What kinds of ads an organization runs (internal/leads setup). It decides
-- which setup steps apply: running Meta lead-form ads needs a Meta connection
-- that granted leads_retrieval. NULL row = the organization has not answered.
CREATE TABLE organization_ad_profiles (
    organization_id uuid PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
    ad_types        text[] NOT NULL,
    updated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE organization_ad_profiles;
