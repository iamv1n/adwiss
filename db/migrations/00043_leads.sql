-- +goose Up
-- Leads (internal/leads): lead-form submissions imported from Meta Lead Ads and
-- leads entered by hand, with the sales outcome the team records against them.
-- A won lead's value is revenue attributed to the campaign / ad that produced
-- it, so lead businesses see cost per lead, cost per deal and real ROAS.
--
-- Imports never overwrite what the team entered (status, value, notes); they
-- only refresh the submission itself.
CREATE TABLE leads (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    source            text NOT NULL CHECK (source IN ('meta_form', 'manual')),
    provider          ad_provider,
    -- Provider lead ID; NULL for manual leads.
    external_id       text,
    account_id        uuid REFERENCES ad_accounts (id) ON DELETE SET NULL,
    campaign_id       uuid REFERENCES campaigns (id) ON DELETE SET NULL,
    ad_group_id       uuid REFERENCES ad_groups (id) ON DELETE SET NULL,
    ad_id             uuid REFERENCES ads (id) ON DELETE SET NULL,
    form_id           text NOT NULL DEFAULT '',
    is_organic        boolean NOT NULL DEFAULT false,
    name              text NOT NULL DEFAULT '',
    email             text NOT NULL DEFAULT '',
    phone             text NOT NULL DEFAULT '',
    -- Every form answer: {"full_name": "…", "which_city?": "…"}.
    fields            jsonb NOT NULL DEFAULT '{}'::jsonb,
    status            text NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost')),
    -- Deal value in major units of currency; set when won.
    value             numeric(16, 2) CHECK (value >= 0),
    currency          text NOT NULL DEFAULT '',
    notes             text NOT NULL DEFAULT '',
    lead_created_at   timestamptz NOT NULL,
    status_changed_at timestamptz,
    won_at            timestamptz,
    created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, provider, external_id)
);
CREATE INDEX leads_org_created_idx ON leads (organization_id, lead_created_at DESC);
CREATE INDEX leads_org_status_idx ON leads (organization_id, status);
CREATE INDEX leads_campaign_idx ON leads (campaign_id);
CREATE INDEX leads_account_idx ON leads (account_id, lead_created_at DESC);

-- +goose Down
DROP TABLE leads;
