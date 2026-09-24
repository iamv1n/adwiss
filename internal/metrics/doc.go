// Package metrics stores and aggregates canonical metric facts (plan §8, §19,
// §32).
//
// Storage (db/migrations/00021_metric_facts.sql):
//
//   - One row per (account_id, report, date, hour, dimension values). Every
//     dimension column is NOT NULL DEFAULT (empty string) and the key is a Postgres-generated
//     md5 of hour + dimensions (dims_hash), giving a compact, fixed-width
//     primary key (account_id, report, date, dims_hash) that application code
//     cannot compute inconsistently and that works for long search terms.
//   - Range-partitioned by month on date: analytics queries are date-bounded
//     so they prune to a few partitions, and retention is DROP TABLE.
//   - Indexes: the primary key serves upserts and account-filtered queries;
//     (organization_id, report, date) serves organization-wide dashboards.
//     No BRIN: restatement upserts break physical date order within a month.
//   - Currency is copied from the ad account onto each fact. Aggregations
//     group by currency and money is never summed across currencies.
//
// Reading: every query targets exactly one report (see internal/reports), so
// facts at different grains are never double counted. Derived metrics are
// computed from summed measures (Compute) and are null when a denominator is 0.
//
// Time: date and hour are in the ad account's own timezone, as reported by the
// providers. Hour-of-day and day-of-week analytics therefore use account-local
// clock time, which is what dayparting schedules execute in.
package metrics
