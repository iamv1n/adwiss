-- Canonical entities (internal/entities). Writes from sync jobs use pgx batch
-- upserts in internal/entities/store.go; these are the read paths for the API.

-- name: ListAdAccounts :many
SELECT sqlc.embed(ad_accounts), integrations.status AS integration_status
FROM ad_accounts
LEFT JOIN integrations ON integrations.id = ad_accounts.integration_id
WHERE ad_accounts.organization_id = @organization_id
  AND (sqlc.narg('provider')::ad_provider IS NULL OR ad_accounts.provider = sqlc.narg('provider'))
ORDER BY ad_accounts.provider, ad_accounts.name, ad_accounts.id;

-- name: GetAdAccount :one
SELECT sqlc.embed(ad_accounts), integrations.status AS integration_status
FROM ad_accounts
LEFT JOIN integrations ON integrations.id = ad_accounts.integration_id
WHERE ad_accounts.organization_id = @organization_id AND ad_accounts.id = @id;

-- name: SetAdAccountSyncEnabled :one
UPDATE ad_accounts
SET sync_enabled = @sync_enabled, updated_at = now()
WHERE organization_id = @organization_id AND id = @id
RETURNING *;

-- name: ListAccountSyncStates :many
SELECT * FROM ad_account_sync_state
WHERE organization_id = @organization_id
ORDER BY account_id, scope;

-- name: ListCampaigns :many
SELECT sqlc.embed(campaigns),
       ad_accounts.name AS account_name, ad_accounts.currency, ad_accounts.timezone,
       count(*) OVER () AS total
FROM campaigns
JOIN ad_accounts ON ad_accounts.id = campaigns.account_id
WHERE campaigns.organization_id = @organization_id
  AND (sqlc.narg('account_id')::uuid IS NULL OR campaigns.account_id = sqlc.narg('account_id'))
  AND (sqlc.narg('provider')::ad_provider IS NULL OR campaigns.provider = sqlc.narg('provider'))
  AND (sqlc.narg('status')::ad_entity_status IS NULL OR campaigns.status = sqlc.narg('status'))
  AND (sqlc.narg('campaign_id')::uuid IS NULL OR campaigns.id = sqlc.narg('campaign_id'))
  AND (sqlc.narg('search')::text IS NULL
       OR campaigns.name ILIKE '%' || sqlc.narg('search') || '%'
       OR campaigns.external_id = sqlc.narg('search_exact'))
ORDER BY campaigns.name, campaigns.id
LIMIT @row_limit OFFSET @row_offset;

-- name: GetCampaign :one
SELECT sqlc.embed(campaigns), ad_accounts.currency, ad_accounts.timezone
FROM campaigns
JOIN ad_accounts ON ad_accounts.id = campaigns.account_id
WHERE campaigns.organization_id = @organization_id AND campaigns.id = @id;

-- name: ListAdGroups :many
SELECT sqlc.embed(ad_groups),
       campaigns.name AS campaign_name, campaigns.external_id AS campaign_external_id,
       ad_accounts.name AS account_name, ad_accounts.currency, ad_accounts.timezone,
       count(*) OVER () AS total
FROM ad_groups
JOIN campaigns ON campaigns.id = ad_groups.campaign_id
JOIN ad_accounts ON ad_accounts.id = ad_groups.account_id
WHERE ad_groups.organization_id = @organization_id
  AND (sqlc.narg('account_id')::uuid IS NULL OR ad_groups.account_id = sqlc.narg('account_id'))
  AND (sqlc.narg('provider')::ad_provider IS NULL OR ad_groups.provider = sqlc.narg('provider'))
  AND (sqlc.narg('status')::ad_entity_status IS NULL OR ad_groups.status = sqlc.narg('status'))
  AND (sqlc.narg('campaign_id')::uuid IS NULL OR ad_groups.campaign_id = sqlc.narg('campaign_id'))
  AND (sqlc.narg('search')::text IS NULL
       OR ad_groups.name ILIKE '%' || sqlc.narg('search') || '%'
       OR ad_groups.external_id = sqlc.narg('search_exact'))
ORDER BY ad_groups.name, ad_groups.id
LIMIT @row_limit OFFSET @row_offset;

-- name: ListAds :many
SELECT sqlc.embed(ads),
       campaigns.name AS campaign_name, campaigns.external_id AS campaign_external_id,
       ad_groups.name AS ad_group_name, ad_groups.external_id AS ad_group_external_id,
       ad_accounts.name AS account_name, ad_accounts.currency, ad_accounts.timezone,
       creatives.id AS creative_id,
       count(*) OVER () AS total
FROM ads
JOIN campaigns ON campaigns.id = ads.campaign_id
JOIN ad_groups ON ad_groups.id = ads.ad_group_id
JOIN ad_accounts ON ad_accounts.id = ads.account_id
LEFT JOIN creatives ON creatives.account_id = ads.account_id
                   AND creatives.external_id = ads.creative_external_id
WHERE ads.organization_id = @organization_id
  AND (sqlc.narg('account_id')::uuid IS NULL OR ads.account_id = sqlc.narg('account_id'))
  AND (sqlc.narg('provider')::ad_provider IS NULL OR ads.provider = sqlc.narg('provider'))
  AND (sqlc.narg('status')::ad_entity_status IS NULL OR ads.status = sqlc.narg('status'))
  AND (sqlc.narg('campaign_id')::uuid IS NULL OR ads.campaign_id = sqlc.narg('campaign_id'))
  AND (sqlc.narg('ad_group_id')::uuid IS NULL OR ads.ad_group_id = sqlc.narg('ad_group_id'))
  AND (sqlc.narg('search')::text IS NULL
       OR ads.name ILIKE '%' || sqlc.narg('search') || '%'
       OR ads.external_id = sqlc.narg('search_exact'))
ORDER BY ads.name, ads.id
LIMIT @row_limit OFFSET @row_offset;

-- name: ListCreatives :many
-- campaign_id matches creatives used by at least one ad in that campaign.
SELECT sqlc.embed(creatives),
       ad_accounts.name AS account_name, ad_accounts.currency, ad_accounts.timezone,
       count(*) OVER () AS total
FROM creatives
JOIN ad_accounts ON ad_accounts.id = creatives.account_id
WHERE creatives.organization_id = @organization_id
  AND (sqlc.narg('account_id')::uuid IS NULL OR creatives.account_id = sqlc.narg('account_id'))
  AND (sqlc.narg('provider')::ad_provider IS NULL OR creatives.provider = sqlc.narg('provider'))
  AND (sqlc.narg('campaign_id')::uuid IS NULL OR EXISTS (
        SELECT 1 FROM ads
        WHERE ads.campaign_id = sqlc.narg('campaign_id')
          AND ads.account_id = creatives.account_id
          AND ads.creative_external_id = creatives.external_id))
  AND (sqlc.narg('search')::text IS NULL
       OR creatives.name ILIKE '%' || sqlc.narg('search') || '%'
       OR creatives.external_id = sqlc.narg('search_exact'))
ORDER BY creatives.name, creatives.id
LIMIT @row_limit OFFSET @row_offset;
