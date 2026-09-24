-- +goose Up
CREATE TYPE ad_provider AS ENUM ('meta', 'google');

CREATE TYPE integration_status AS ENUM ('active', 'needs_reauth', 'disconnected');

-- One OAuth connection to a provider, owned by an organization.
-- Tokens are encrypted by the application (AES-256-GCM); never stored in plaintext.
CREATE TABLE integrations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    provider                ad_provider NOT NULL,
    status                  integration_status NOT NULL DEFAULT 'active',
    external_user_id        text NOT NULL,   -- provider user who granted access
    display_name            text NOT NULL DEFAULT '',
    scopes                  text[] NOT NULL DEFAULT '{}',
    access_token_encrypted  bytea NOT NULL,
    refresh_token_encrypted bytea,
    token_expires_at        timestamptz,
    last_error              text,
    created_by              uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, provider, external_user_id)
);
CREATE INDEX integrations_org_idx ON integrations (organization_id);

-- +goose Down
DROP TABLE integrations;
DROP TYPE integration_status;
DROP TYPE ad_provider;
