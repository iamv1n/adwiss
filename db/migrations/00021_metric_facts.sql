-- +goose Up
-- Canonical metric facts (plan §8, §19): additive measures at the grain of one
-- explicit report (internal/reports). Derived metrics are never stored.
--
-- Design notes (see internal/metrics/doc.go for the full rationale):
--
-- * Identity. A fact is identified by (account_id, report, date, dims_hash).
--   Every dimension column is NOT NULL DEFAULT '' (a dimension the report does
--   not use is ''), and dims_hash is an md5 of hour + all dimension values,
--   computed by Postgres as a generated column so application code cannot
--   drift from it. The key stays ~60 bytes regardless of dimension length
--   (search terms can exceed btree's ~2.7 kB tuple limit), which keeps the
--   upsert index small and fast. account_id implies the organization.
--
-- * Partitioning. Range-partitioned by month on date. Every analytics query is
--   date-bounded, so the planner prunes to the months involved; retention is a
--   DROP of old partitions instead of a bulk DELETE; vacuum works per month.
--   Partitions are created by metric_facts_ensure_partition(), which the
--   writer calls for each month it is about to insert.
--
-- * No BRIN. Within a monthly partition, re-syncs of recent days (conversion
--   attribution restates them) rewrite tuples at the end of the heap, so the
--   physical/date correlation BRIN needs does not hold, and pruning already
--   bounds the scan. Two btree indexes cover the access paths:
--     - the primary key (account_id, report, date, ...) for upserts and
--       account-filtered dashboards;
--     - (organization_id, report, date) for organization-wide dashboards.
--
-- * Entities are referenced by provider external ID (sync order does not
--   matter and facts never need rewriting when entities change), scoped by
--   account_id. Join to campaigns etc. on (account_id, external_id).
--
-- * Currency is copied from the ad account at write time, so aggregation can
--   group by currency without a join and never sums across currencies.
CREATE TABLE metric_facts (
    organization_id         uuid NOT NULL,
    account_id              uuid NOT NULL,
    provider                ad_provider NOT NULL,
    report                  text NOT NULL,
    date                    date NOT NULL,     -- account timezone
    hour                    smallint CHECK (hour BETWEEN 0 AND 23), -- account timezone; NULL for daily grain

    campaign_external_id    text NOT NULL DEFAULT '',
    ad_group_external_id    text NOT NULL DEFAULT '',
    ad_external_id          text NOT NULL DEFAULT '',
    creative_external_id    text NOT NULL DEFAULT '',
    country                 text NOT NULL DEFAULT '',
    device                  text NOT NULL DEFAULT '',
    placement               text NOT NULL DEFAULT '',
    publisher_platform      text NOT NULL DEFAULT '',
    keyword                 text NOT NULL DEFAULT '',
    search_term             text NOT NULL DEFAULT '',

    currency                text NOT NULL,
    impressions             bigint NOT NULL DEFAULT 0,
    reach                   bigint,            -- not additive; never summed
    clicks                  bigint NOT NULL DEFAULT 0,
    spend_micros            bigint NOT NULL DEFAULT 0,
    conversions             double precision NOT NULL DEFAULT 0,
    conversion_value_micros bigint NOT NULL DEFAULT 0,

    provider_data           jsonb,
    updated_at              timestamptz NOT NULL DEFAULT now(), -- last time the measures changed

    dims_hash bytea GENERATED ALWAYS AS (decode(md5(
        coalesce(hour::text, '') || E'\x1f' ||
        campaign_external_id || E'\x1f' || ad_group_external_id || E'\x1f' ||
        ad_external_id || E'\x1f' || creative_external_id || E'\x1f' ||
        country || E'\x1f' || device || E'\x1f' || placement || E'\x1f' ||
        publisher_platform || E'\x1f' || keyword || E'\x1f' || search_term
    ), 'hex')) STORED,

    PRIMARY KEY (account_id, report, date, dims_hash),
    FOREIGN KEY (account_id, organization_id) REFERENCES ad_accounts (id, organization_id) ON DELETE CASCADE
) PARTITION BY RANGE (date);

CREATE INDEX metric_facts_org_report_date_idx ON metric_facts (organization_id, report, date);

-- Creates the monthly partition containing d if it does not exist. Serialized
-- with an advisory lock so concurrent writers cannot race on CREATE TABLE.
-- +goose StatementBegin
CREATE FUNCTION metric_facts_ensure_partition(d date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    start_date date := date_trunc('month', d)::date;
    end_date   date := (date_trunc('month', d) + interval '1 month')::date;
    part_name  text := 'metric_facts_' || to_char(start_date, 'YYYYMM');
BEGIN
    IF to_regclass(part_name) IS NOT NULL THEN
        RETURN;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('metric_facts_ensure_partition'));
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF metric_facts FOR VALUES FROM (%L) TO (%L)',
        part_name, start_date, end_date);
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
DO $$
DECLARE
    m date;
BEGIN
    FOR m IN SELECT generate_series(date '2024-01-01', date '2027-12-01', interval '1 month')::date LOOP
        PERFORM metric_facts_ensure_partition(m);
    END LOOP;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE metric_facts;
DROP FUNCTION metric_facts_ensure_partition(date);
