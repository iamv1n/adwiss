-- +goose Up
-- Tokens are wiped (set to NULL) when an integration is disconnected.
ALTER TABLE integrations ALTER COLUMN access_token_encrypted DROP NOT NULL;

ALTER TABLE integrations
    -- Provider-specific, non-secret settings, e.g. Google's
    -- {"login_customer_ids": {"<customer>": "<manager>"}} learned during discovery.
    ADD COLUMN metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN last_discovered_at timestamptz,
    ADD COLUMN disconnected_at   timestamptz;

-- +goose Down
ALTER TABLE integrations
    DROP COLUMN disconnected_at,
    DROP COLUMN last_discovered_at,
    DROP COLUMN metadata;
DELETE FROM integrations WHERE access_token_encrypted IS NULL;
ALTER TABLE integrations ALTER COLUMN access_token_encrypted SET NOT NULL;
