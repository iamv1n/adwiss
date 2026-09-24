-- +goose Up
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         citext NOT NULL UNIQUE,
    name          text NOT NULL,
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Opaque session tokens. Only the SHA-256 hash of the token is stored.
CREATE TABLE sessions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   bytea NOT NULL UNIQUE,
    user_agent   text NOT NULL DEFAULT '',
    ip_address   text NOT NULL DEFAULT '',
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE organizations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    slug       text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE organization_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE organization_users (
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role            organization_role NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX organization_users_user_id_idx ON organization_users (user_id);

CREATE TABLE organization_invitations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    email           citext NOT NULL,
    role            organization_role NOT NULL,
    token_hash      bytea NOT NULL UNIQUE,
    invited_by      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at      timestamptz NOT NULL,
    accepted_at     timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- At most one open invitation per email per organization.
CREATE UNIQUE INDEX organization_invitations_open_idx
    ON organization_invitations (organization_id, email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE audit_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
    actor_user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    action          text NOT NULL,
    entity_type     text NOT NULL,
    entity_id       text NOT NULL,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at DESC);

-- +goose Down
DROP TABLE audit_logs;
DROP TABLE organization_invitations;
DROP TABLE organization_users;
DROP TYPE organization_role;
DROP TABLE organizations;
DROP TABLE sessions;
DROP TABLE users;
