-- +goose Up
-- Instant leads (internal/integrations): Facebook Pages whose leadgen webhook
-- an organization subscribed the Meta app to. Meta then pushes each new
-- lead-form submission instead of the hourly import finding it. An
-- organization has instant leads on when it has at least one row.
CREATE TABLE lead_page_subscriptions (
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    page_id         text NOT NULL,
    page_name       text NOT NULL DEFAULT '',
    integration_id  uuid REFERENCES integrations (id) ON DELETE SET NULL,
    subscribed_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, page_id)
);

-- +goose Down
DROP TABLE lead_page_subscriptions;
