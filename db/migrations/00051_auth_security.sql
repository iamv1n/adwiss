-- Account security: email verification, password reset, sign-in codes, 2FA
-- (TOTP + email OTP + recovery codes), phone number, known devices, risk-based
-- step-up and the security event log (plan/auth-security.md).

-- +goose Up
ALTER TABLE users
    ADD COLUMN email_verified_at   timestamptz,
    ADD COLUMN phone               text,
    ADD COLUMN phone_verified_at   timestamptz,
    ADD COLUMN totp_secret_enc     bytea,
    ADD COLUMN totp_enabled_at     timestamptz,
    ADD COLUMN totp_last_step      bigint,
    ADD COLUMN email_2fa_enabled   boolean NOT NULL DEFAULT false,
    ADD COLUMN password_changed_at timestamptz;

-- Existing users are grandfathered (invitees already proved their email).
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- One-time codes and reset-link tokens. Only SHA-256 hashes are stored.
CREATE TABLE auth_codes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid REFERENCES users (id) ON DELETE CASCADE,
    email       citext NOT NULL,
    purpose     text NOT NULL CHECK (purpose IN ('verify_email', 'login_email', 'reset_password', 'two_factor_email', 'verify_phone')),
    code_hash   bytea,
    token_hash  bytea UNIQUE,
    attempts    int NOT NULL DEFAULT 0,
    data        jsonb NOT NULL DEFAULT '{}',
    created_ip  text NOT NULL DEFAULT '',
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_codes_purpose_email_idx ON auth_codes (purpose, email, created_at DESC);
CREATE INDEX auth_codes_expires_at_idx ON auth_codes (expires_at);

-- A pending second factor after the first factor succeeded. The client holds
-- a random challenge token; only its hash is stored.
CREATE TABLE auth_challenges (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash      bytea NOT NULL UNIQUE,
    reason          text NOT NULL CHECK (reason IN ('two_factor', 'new_device', 'failed_attempts')),
    methods         text[] NOT NULL,
    remember_device boolean NOT NULL DEFAULT false,
    ip              text NOT NULL DEFAULT '',
    user_agent      text NOT NULL DEFAULT '',
    attempts        int NOT NULL DEFAULT 0,
    expires_at      timestamptz NOT NULL,
    consumed_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_challenges_user_id_idx ON auth_challenges (user_id);
CREATE INDEX auth_challenges_expires_at_idx ON auth_challenges (expires_at);

CREATE TABLE recovery_codes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  bytea NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_codes_user_id_idx ON recovery_codes (user_id);

-- Browsers that signed in, keyed by the SHA-256 of the adwise_device cookie.
CREATE TABLE known_devices (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_hash   bytea NOT NULL,
    label         text NOT NULL DEFAULT '',
    last_ip       text NOT NULL DEFAULT '',
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now(),
    trusted_until timestamptz,
    UNIQUE (user_id, device_hash)
);

-- Security log: lockout counting, unusual sign-in detection and the
-- "Recent security activity" list. Rows older than 180 days are pruned.
CREATE TABLE auth_events (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid REFERENCES users (id) ON DELETE CASCADE,
    email      citext NOT NULL DEFAULT '',
    type       text NOT NULL,
    ip         text NOT NULL DEFAULT '',
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_email_type_idx ON auth_events (email, type, created_at DESC);
CREATE INDEX auth_events_user_idx ON auth_events (user_id, created_at DESC);
CREATE INDEX auth_events_created_at_idx ON auth_events (created_at);

-- +goose Down
DROP TABLE auth_events;
DROP TABLE known_devices;
DROP TABLE recovery_codes;
DROP TABLE auth_challenges;
DROP TABLE auth_codes;
ALTER TABLE users
    DROP COLUMN email_verified_at,
    DROP COLUMN phone,
    DROP COLUMN phone_verified_at,
    DROP COLUMN totp_secret_enc,
    DROP COLUMN totp_enabled_at,
    DROP COLUMN totp_last_step,
    DROP COLUMN email_2fa_enabled,
    DROP COLUMN password_changed_at;
