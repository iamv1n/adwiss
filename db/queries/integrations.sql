-- name: UpsertIntegration :one
-- Reconnecting the same provider user re-activates the row with fresh tokens.
-- Google omits the refresh token on some re-consents, so an existing one is kept.
INSERT INTO integrations (
    organization_id, provider, status, external_user_id, display_name, scopes,
    access_token_encrypted, refresh_token_encrypted, token_expires_at, created_by
) VALUES (
    @organization_id, @provider, 'active', @external_user_id, @display_name, @scopes,
    @access_token_encrypted, sqlc.narg(refresh_token_encrypted), sqlc.narg(token_expires_at), @created_by
)
ON CONFLICT (organization_id, provider, external_user_id) DO UPDATE SET
    status                  = 'active',
    display_name            = EXCLUDED.display_name,
    scopes                  = EXCLUDED.scopes,
    access_token_encrypted  = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, integrations.refresh_token_encrypted),
    token_expires_at        = EXCLUDED.token_expires_at,
    last_error              = NULL,
    disconnected_at         = NULL,
    updated_at              = now()
RETURNING *;

-- name: ListIntegrations :many
SELECT * FROM integrations
WHERE organization_id = $1
ORDER BY created_at;

-- name: GetIntegration :one
SELECT * FROM integrations
WHERE id = $1 AND organization_id = $2;

-- name: GetIntegrationByID :one
SELECT * FROM integrations WHERE id = $1;

-- name: LockIntegration :one
SELECT * FROM integrations
WHERE id = $1 AND organization_id = $2
FOR UPDATE;

-- name: UpdateIntegrationTokens :exec
UPDATE integrations
SET access_token_encrypted  = @access_token_encrypted,
    refresh_token_encrypted = COALESCE(sqlc.narg(refresh_token_encrypted), refresh_token_encrypted),
    token_expires_at        = sqlc.narg(token_expires_at),
    updated_at              = now()
WHERE id = @id AND status = 'active';

-- name: MarkIntegrationNeedsReauth :exec
UPDATE integrations
SET status = 'needs_reauth', last_error = @last_error, updated_at = now()
WHERE id = @id AND status = 'active';

-- name: SetIntegrationError :exec
UPDATE integrations
SET last_error = sqlc.narg(last_error), updated_at = now()
WHERE id = @id;

-- name: DisconnectIntegration :exec
UPDATE integrations
SET status = 'disconnected',
    access_token_encrypted = NULL,
    refresh_token_encrypted = NULL,
    token_expires_at = NULL,
    disconnected_at = now(),
    updated_at = now()
WHERE id = @id AND organization_id = @organization_id;

-- name: RecordIntegrationDiscovery :exec
UPDATE integrations
SET metadata = @metadata, last_discovered_at = now(), last_error = NULL, updated_at = now()
WHERE id = @id;

-- name: ListSyncEnabledAccounts :many
-- Accounts an admin opted in to syncing (ad_accounts is owned by the entities package).
SELECT external_id FROM ad_accounts
WHERE integration_id = $1 AND organization_id = $2 AND sync_enabled
ORDER BY external_id;

-- name: CountIntegrationAccounts :many
SELECT integration_id, count(*)::bigint AS accounts, count(*) FILTER (WHERE sync_enabled)::bigint AS sync_enabled
FROM ad_accounts
WHERE organization_id = $1 AND integration_id IS NOT NULL
GROUP BY integration_id;

-- name: ListActiveIntegrations :many
SELECT id, organization_id FROM integrations
WHERE status = 'active'
ORDER BY id;
