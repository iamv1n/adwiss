-- +goose Up
-- Automation rules can act on campaigns, ad sets / ad groups or single ads.
-- Ad-level rules only pause, activate or notify (ads have no budget).
-- Conditions may now compare a metric with the previous window of the same
-- length: {"metric": "ctr", "op": "change_lt", "value": -0.25}.
ALTER TABLE automation_rules
    ADD COLUMN level text NOT NULL DEFAULT 'campaign' CHECK (level IN ('campaign', 'ad_group', 'ad'));

-- +goose Down
ALTER TABLE automation_rules DROP COLUMN level;
