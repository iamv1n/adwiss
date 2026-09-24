-- +goose Up
-- Canonical advertising entities (plan §7, §18). Rows are written by sync jobs
-- through ads.Store (internal/entities) as idempotent upserts keyed on the
-- provider's external IDs, which are unique per ad account.

CREATE TYPE ad_entity_status AS ENUM ('active', 'paused', 'archived', 'deleted', 'unknown');

-- A provider ad account (Meta ad account, Google Ads customer) discovered through
-- an integration. The same provider account connected by two organizations is
-- two rows: everything below is tenant-scoped.
CREATE TABLE ad_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    -- Nullable so that deleting an integration keeps historical data; a later
    -- reconnect re-links the account on its next UpsertAccounts.
    integration_id  uuid REFERENCES integrations (id) ON DELETE SET NULL,
    provider        ad_provider NOT NULL,
    external_id     text NOT NULL,
    name            text NOT NULL DEFAULT '',
    currency        text NOT NULL,             -- ISO 4217
    timezone        text NOT NULL,             -- IANA
    status          ad_entity_status NOT NULL DEFAULT 'unknown',
    -- Accounts are discovered with syncing off; an admin opts each one in.
    sync_enabled    boolean NOT NULL DEFAULT false,
    raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, provider, external_id),
    -- Target of the composite foreign keys below, which guarantee a child row
    -- can never belong to a different organization than its account.
    UNIQUE (id, organization_id),
    CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX ad_accounts_integration_idx ON ad_accounts (integration_id);

CREATE TABLE campaigns (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL,
    account_id             uuid NOT NULL,
    provider               ad_provider NOT NULL,
    external_id            text NOT NULL,
    name                   text NOT NULL DEFAULT '',
    status                 ad_entity_status NOT NULL DEFAULT 'unknown',
    objective              text NOT NULL DEFAULT '',
    daily_budget_micros    bigint,
    lifetime_budget_micros bigint,
    raw                    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, external_id),
    UNIQUE (id, organization_id),
    FOREIGN KEY (account_id, organization_id) REFERENCES ad_accounts (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX campaigns_org_name_idx ON campaigns (organization_id, name);

CREATE TABLE ad_groups (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL,
    account_id          uuid NOT NULL,
    campaign_id         uuid NOT NULL,
    provider            ad_provider NOT NULL,
    external_id         text NOT NULL,
    name                text NOT NULL DEFAULT '',
    status              ad_entity_status NOT NULL DEFAULT 'unknown',
    daily_budget_micros bigint,
    raw                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, external_id),
    UNIQUE (id, organization_id),
    FOREIGN KEY (account_id, organization_id) REFERENCES ad_accounts (id, organization_id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id, organization_id) REFERENCES campaigns (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX ad_groups_org_name_idx ON ad_groups (organization_id, name);
CREATE INDEX ad_groups_campaign_idx ON ad_groups (campaign_id);

CREATE TABLE creatives (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    account_id      uuid NOT NULL,
    provider        ad_provider NOT NULL,
    external_id     text NOT NULL,
    name            text NOT NULL DEFAULT '',
    type            text NOT NULL DEFAULT '',
    thumbnail_url   text NOT NULL DEFAULT '',
    raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, external_id),
    FOREIGN KEY (account_id, organization_id) REFERENCES ad_accounts (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX creatives_org_name_idx ON creatives (organization_id, name);

CREATE TABLE ads (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL,
    account_id           uuid NOT NULL,
    campaign_id          uuid NOT NULL,
    ad_group_id          uuid NOT NULL,
    provider             ad_provider NOT NULL,
    external_id          text NOT NULL,
    name                 text NOT NULL DEFAULT '',
    status               ad_entity_status NOT NULL DEFAULT 'unknown',
    -- Creatives sync after ads, so the link is by external ID within the
    -- account rather than a foreign key; join on (account_id, external_id).
    creative_external_id text NOT NULL DEFAULT '',
    raw                  jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, external_id),
    FOREIGN KEY (account_id, organization_id) REFERENCES ad_accounts (id, organization_id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id, organization_id) REFERENCES campaigns (id, organization_id) ON DELETE CASCADE,
    FOREIGN KEY (ad_group_id, organization_id) REFERENCES ad_groups (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX ads_org_name_idx ON ads (organization_id, name);
CREATE INDEX ads_campaign_idx ON ads (campaign_id);
CREATE INDEX ads_ad_group_idx ON ads (ad_group_id);
CREATE INDEX ads_creative_idx ON ads (account_id, creative_external_id);

-- Data freshness (plan §34/§35): when each sync scope last completed for an
-- account. Scope is chosen by the sync job, e.g. "entities" or
-- "metrics:campaign_hourly". data_freshness_lag = now() - last_synced_at.
CREATE TABLE ad_account_sync_state (
    account_id      uuid NOT NULL,
    scope           text NOT NULL,
    organization_id uuid NOT NULL,
    provider        ad_provider NOT NULL,
    last_synced_at  timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, scope),
    FOREIGN KEY (account_id, organization_id) REFERENCES ad_accounts (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX ad_account_sync_state_org_idx ON ad_account_sync_state (organization_id);

-- +goose Down
DROP TABLE ad_account_sync_state;
DROP TABLE ads;
DROP TABLE creatives;
DROP TABLE ad_groups;
DROP TABLE campaigns;
DROP TABLE ad_accounts;
DROP TYPE ad_entity_status;
