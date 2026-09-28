-- +goose Up
-- Platform admins operate Adwise itself (all organizations). Granted only via
-- cmd/admin, never through the API.
ALTER TABLE users ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;

-- An impersonation session belongs to the impersonated user; this column is
-- the platform admin acting as them.
ALTER TABLE sessions ADD COLUMN impersonator_user_id uuid REFERENCES users (id) ON DELETE CASCADE;

-- Cross-organization activity feeds in the admin console.
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_created_idx ON audit_logs (actor_user_id, created_at DESC);

-- +goose Down
DROP INDEX audit_logs_actor_created_idx;
DROP INDEX audit_logs_created_idx;
ALTER TABLE sessions DROP COLUMN impersonator_user_id;
ALTER TABLE users DROP COLUMN is_platform_admin;
