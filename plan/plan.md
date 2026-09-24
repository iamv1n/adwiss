# Adwise

## Product Requirements & Technical Plan

**Version:** 1.1
**Status:** MVP Definition
**Platforms:** Meta Ads + Google Ads
**Product:** Advertising analytics, automation and optimization platform

---

# 1. Product Overview

**Adwise** is an advertising operating system for businesses and performance marketers managing paid advertising across Meta and Google.

Adwise connects advertising accounts, ingests granular performance data, normalizes provider-specific data into a common model, analyzes performance, identifies opportunities, and executes controlled actions.

The core product loop is:

**Connect → Ingest → Normalize → Analyze → Decide → Execute → Learn**

The MVP focuses on:

1. Meta Ads integration
2. Google Ads integration
3. Unified campaign analytics
4. Granular performance breakdowns
5. **Dayparting**
6. Rule-based automation
7. Budget and campaign controls
8. Alerts and anomaly detection
9. AI-assisted analysis
10. Complete action/audit history

---

# 2. Problem

Managing advertising across Meta and Google requires marketers to repeatedly:

* Switch between advertising platforms
* Compare different reporting models
* Manually analyze campaign performance
* Identify profitable hours and days
* Adjust budgets manually
* Pause or activate campaigns
* Monitor wasted spend
* Investigate anomalies
* Maintain separate automation systems

Adwise provides one system for understanding and operating advertising performance.

---

# 3. Target Users

### Primary

* DTC brands
* E-commerce businesses
* Performance marketers
* Growth teams
* Marketing agencies

### Secondary

* Founders managing paid acquisition
* Marketing analysts
* Media buying teams

---

# 4. MVP Goals

Adwise MVP should allow a user to:

### Connect

* Connect Meta Business / Ad Accounts
* Connect Google Ads accounts
* Import advertising entities

### Understand

* View campaign performance
* Compare periods
* Analyze spend and revenue
* Drill into campaigns, ad groups/ad sets, ads and creatives
* Analyze performance by hour/day/device/geography/placement where supported

### Optimize

* Identify high/low-performing time periods
* Configure dayparting schedules
* Automatically pause/activate campaigns
* Apply budget adjustments based on schedules
* Create rule-based automations

### Act

* Pause campaigns
* Activate campaigns
* Change budgets where supported
* Execute scheduled dayparting actions
* Review every automated action

### Ask

Use AI to answer questions such as:

> Which campaigns wasted the most money yesterday?

> What hours have the best ROAS?

> Which campaigns should have reduced budgets during the night?

> What changed compared with last week?

---

# 5. MVP Feature Scope

## 5.1 Authentication & Organization

Users can:

* Sign up
* Log in
* Create organization
* Invite members
* Assign roles

Initial roles:

* Owner
* Admin
* Member

---

# 6. Advertising Integrations

## 6.1 Meta

Support:

* OAuth
* Business/account discovery
* Ad account selection
* Campaign synchronization
* Ad set synchronization
* Ad synchronization
* Creative synchronization
* Insights ingestion
* Campaign pause/activate
* Budget updates where supported

## 6.2 Google

Support:

* OAuth
* Customer/account discovery
* Campaign synchronization
* Ad group synchronization
* Ad synchronization
* Asset/creative synchronization where required
* Reporting ingestion
* Campaign pause/activate
* Budget updates where supported

---

# 7. Canonical Advertising Model

Provider-specific terminology should be mapped into a common model.

| Adwise      | Meta       | Google              |
| ----------- | ---------- | ------------------- |
| Account     | Ad Account | Customer            |
| Campaign    | Campaign   | Campaign            |
| Ad Group    | Ad Set     | Ad Group            |
| Ad          | Ad         | Ad                  |
| Creative    | Creative   | Asset/Ad            |
| Metric Fact | Insights   | Reporting resources |

This allows the UI and analytics engine to remain provider-independent.

---

# 8. Analytics

## 8.1 Core Metrics

Store raw/additive measures wherever possible:

* Impressions
* Reach
* Clicks
* Spend
* Conversions
* Conversion value
* Revenue where available

Derived metrics:

* CTR
* CPC
* CPM
* CPA
* CVR
* ROAS
* ACOS

Derived metrics should generally be calculated from underlying measures rather than stored redundantly.

Example:

```text
ROAS = conversion_value / spend

ACOS = spend / conversion_value
```

---

# 9. Analytics Granularity

Adwise must retain enough granular data to answer future analytical questions.

Initial grains include:

```text
campaign × day

campaign × hour

campaign × day × hour

campaign × country × day

campaign × device × day

campaign × placement × day

ad × day

creative × day

keyword × day

search term × day
```

Not every provider supports every combination.

Therefore, reporting configurations must explicitly define valid provider queries.

---

# 10. Dayparting — MVP

Dayparting is a **core MVP capability**.

It has two distinct components:

### A. Dayparting Analytics

Understand when advertising performs best.

### B. Dayparting Automation

Automatically change advertising behavior according to a schedule.

---

## 10.1 Dayparting Analytics

Users can view:

* Performance by hour
* Performance by day of week
* Hour × day-of-week performance
* Spend by hour
* Revenue by hour
* ROAS by hour
* CPA by hour
* Conversions by hour
* CTR/CPC by hour

Example:

| Time        |  Spend | Revenue | ROAS |
| ----------- | -----: | ------: | ---: |
| 00:00–01:00 | ₹2,000 |  ₹3,200 | 1.60 |
| 01:00–02:00 | ₹1,200 |    ₹900 | 0.75 |
| 09:00–10:00 | ₹3,000 |  ₹8,400 | 2.80 |
| 18:00–19:00 | ₹4,200 | ₹11,300 | 2.69 |

The user should be able to visualize:

```text
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
Sunday
```

against:

```text
00:00 → 23:00
```

to create a performance heatmap.

---

# 11. Dayparting Rules

Users can configure schedules such as:

```text
Monday–Friday
09:00–18:00
Normal

Monday–Friday
18:00–22:00
+20% budget

Monday–Friday
22:00–06:00
Reduce / pause
```

Rules must be timezone-aware.

Example:

```json
{
  "timezone": "Asia/Kolkata",
  "schedule": [
    {
      "days": ["MON", "TUE", "WED", "THU", "FRI"],
      "start": "09:00",
      "end": "18:00",
      "action": "NORMAL"
    },
    {
      "days": ["MON", "TUE", "WED", "THU", "FRI"],
      "start": "18:00",
      "end": "22:00",
      "action": "BUDGET_ADJUSTMENT",
      "value": 20
    },
    {
      "days": ["MON", "TUE", "WED", "THU", "FRI"],
      "start": "22:00",
      "end": "06:00",
      "action": "PAUSE"
    }
  ]
}
```

---

# 12. Dayparting Execution

The Dayparting Engine runs continuously and evaluates active schedules.

Flow:

```text
Scheduler
    ↓
Find active dayparting rules
    ↓
Determine current timezone/time
    ↓
Evaluate applicable rule
    ↓
Check current provider state
    ↓
Validate action
    ↓
Execute provider mutation
    ↓
Record result
```

Every action must be idempotent.

For example, if a campaign is already paused:

```text
Desired state = PAUSED
Current state = PAUSED
```

Adwise should not repeatedly issue the same mutation.

---

# 13. Dayparting Safety

Dayparting must not blindly mutate campaigns.

Before execution:

```text
Rule
 ↓
Target validation
 ↓
Provider capability validation
 ↓
Current state check
 ↓
Conflict check
 ↓
Action
```

Conflicts should be detected between:

* Dayparting rules
* Other automation rules
* Manual changes
* Budget constraints

Example:

```text
Dayparting:
22:00 → Pause

Automation:
If ROAS > 3 → Increase budget
```

The automation engine must have deterministic precedence rules.

---

# 14. Automation Engine

Automation follows:

```text
Trigger
   ↓
Conditions
   ↓
Validation
   ↓
Action
   ↓
Execution
   ↓
Result
```

Example:

```text
IF
ROAS < 1.0
AND
Spend > ₹5,000
AND
Campaign has > 20 conversions

THEN
Reduce budget by 20%
```

MVP actions:

* Pause campaign
* Activate campaign
* Increase budget
* Decrease budget
* Set budget
* Send notification

---

# 15. Alerts

Adwise should detect:

* Spend spikes
* Conversion drops
* ROAS drops
* CPA increases
* Campaign inactivity
* Budget exhaustion
* Significant performance changes

Users can receive:

* In-app alerts
* Email notifications

---

# 16. AI Analyst

AI should initially be an **analyst and decision assistant**, not an unrestricted autonomous agent.

Example questions:

> Why did ROAS drop yesterday?

> Which campaigns should I investigate?

> What are my best-performing hours?

> Compare this week vs last week.

> Which campaigns are spending heavily without conversions?

AI tools should retrieve structured analytics rather than directly querying arbitrary databases.

Initial tools:

```text
get_account_summary
get_campaign_metrics
compare_periods
get_hourly_performance
get_dayparting_analysis
get_creative_performance
get_budget_changes
get_recent_actions
get_anomalies
```

AI recommendations should initially require user approval before mutations.

---

# 17. Data Architecture

The core architecture:

```text
                  META
                    │
                  GOOGLE
                    │
                    ▼
             Provider APIs
                    │
                    ▼
             Go Ingestion
               Workers
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
    Raw Provider Data    Canonical Data
          │                   │
          └─────────┬─────────┘
                    ▼
                PostgreSQL
                    │
             Query / Analytics
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
      Dashboard          Decision Engine
                              │
                              ▼
                       Action Engine
                              │
                       Provider APIs
```

---

# 18. Database Strategy

## PostgreSQL

PostgreSQL is the initial system of record.

It stores:

### Business entities

```text
organizations
users
organization_users
integrations
ad_accounts
campaigns
ad_groups
ads
creatives
```

### Operational state

```text
automation_rules
dayparting_rules
actions
notifications
audit_logs
```

### Analytics

```text
metric_facts
```

### Provider-specific information

Use:

```text
JSONB
```

where provider payloads contain fields that don't belong in the canonical schema.

---

# 19. Raw vs Canonical Data

Adwise should not throw away provider-specific information.

Conceptually:

```text
Provider Response
       ↓
Raw / provider payload
       ↓
Cleaning + validation
       ↓
Canonical metric facts
       ↓
Analytics
```

A metric fact may contain:

```text
organization_id
provider
account_id

date
hour

campaign_id
ad_group_id
ad_id
creative_id

country
device
placement
publisher_platform
keyword

impressions
clicks
spend
conversions
conversion_value

provider_data JSONB
```

The exact dimensions depend on the report.

---

# 20. Report Definition System

Do not implement one generic "sync everything" query.

Instead, define explicit reports.

Example:

```go
type ReportDefinition struct {
    Provider   Provider
    Name       string
    Resource   string
    Dimensions []string
    Metrics    []string
    Grain      Grain
}
```

Examples:

```text
campaign_daily
campaign_hourly
campaign_country_daily
campaign_device_daily
ad_daily
keyword_daily
search_term_daily
```

Each provider adapter translates these definitions into valid Meta/Google queries.

---

# 21. Provider Adapter

Create a provider-independent interface:

```go
type AdsProvider interface {
    GetAccounts(ctx context.Context) ([]Account, error)

    SyncCampaigns(ctx context.Context, accountID string) error

    SyncAdGroups(ctx context.Context, accountID string) error

    SyncAds(ctx context.Context, accountID string) error

    FetchReport(
        ctx context.Context,
        definition ReportDefinition,
        accountID string,
    ) ([]MetricFact, error)

    PauseCampaign(ctx context.Context, campaignID string) error

    ActivateCampaign(ctx context.Context, campaignID string) error

    UpdateBudget(
        ctx context.Context,
        campaignID string,
        budget float64,
    ) error
}
```

Implement:

```text
MetaProvider
GoogleProvider
```

---

# 22. Data Ingestion Pipeline

```text
Scheduler
    ↓
Create sync job
    ↓
Redis queue
    ↓
Go worker
    ↓
Provider adapter
    ↓
Provider API
    ↓
Raw response
    ↓
Parse
    ↓
Validate
    ↓
Normalize
    ↓
Batch insert/upsert
```

Use idempotency keys such as:

```text
provider
+
account
+
report
+
date
+
dimensions
+
entity
```

---

# 23. Redis

Redis is used for:

* Job queues
* Distributed locks
* Provider rate-limit coordination
* Caching
* Short-lived state

Initial queues:

```text
account_sync
campaign_sync
metric_sync
automation_evaluation
dayparting_evaluation
action_execution
notifications
```

Kafka is **not required for MVP**.

---

# 24. Dayparting Scheduler Architecture

The scheduler should not create one timer per campaign.

Instead:

```text
Every minute
    ↓
Fetch rules whose next evaluation is due
    ↓
Evaluate schedules
    ↓
Generate action jobs
    ↓
Redis
    ↓
Action workers
```

This scales significantly better.

A rule contains:

```text
timezone
days
start_time
end_time
action
target
configuration
enabled
```

The scheduler determines whether the rule is active at the current time.

---

# 25. Action System

Every provider mutation gets an action record.

```text
actions
-------
id
organization_id
provider
account_id

entity_type
entity_id

action_type

requested_state
before_state
after_state

source
rule_id

status
provider_response
error

created_at
executed_at
```

Statuses:

```text
PENDING
RUNNING
SUCCESS
FAILED
SKIPPED
```

Sources:

```text
MANUAL
AUTOMATION
DAYPARTING
AI
```

This creates a complete audit trail.

---

# 26. API

Initial endpoints:

```text
POST   /v1/integrations/meta
POST   /v1/integrations/google

GET    /v1/accounts
GET    /v1/campaigns
GET    /v1/ad-groups
GET    /v1/ads
GET    /v1/creatives

GET    /v1/analytics/overview
GET    /v1/analytics/campaigns
GET    /v1/analytics/hourly
GET    /v1/analytics/dayparting
GET    /v1/analytics/breakdowns

GET    /v1/automations
POST   /v1/automations

GET    /v1/dayparting/rules
POST   /v1/dayparting/rules
PATCH  /v1/dayparting/rules/:id

GET    /v1/actions

POST   /v1/campaigns/:id/pause
POST   /v1/campaigns/:id/activate
POST   /v1/campaigns/:id/budget
```

---

# 27. Frontend

Technology:

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
Zustand
```

Core screens:

```text
Dashboard
Campaigns
Campaign Details
Creative Performance
Analytics
Dayparting
Automations
Actions
Integrations
Settings
```

---

# 28. Dayparting UI

The MVP Dayparting page should contain:

### Performance Heatmap

```text
             Mon Tue Wed Thu Fri Sat Sun

00:00         ░   ░   ░   ░   ░   ░   ░
01:00         ░   ░   ░   ░   ░   ░   ░
...
09:00         █   █   █   █   █   ░   ░
...
18:00         █   █   █   █   █   █   █
...
23:00         ░   ░   ░   ░   ░   ░   ░
```

Metric selector:

```text
ROAS
Spend
Revenue
CPA
Conversions
CTR
CPC
```

### Schedule Builder

```text
Days:
[Mon] [Tue] [Wed] [Thu] [Fri] [Sat] [Sun]

Time:
09:00 → 18:00

Action:
Normal
Increase Budget
Decrease Budget
Pause
Activate
```

### Rule Preview

Before enabling:

```text
This rule will affect:

3 accounts
18 campaigns

Monday–Friday
22:00–06:00
Action: Pause
Timezone: Asia/Kolkata
```

---

# 29. Tech Stack

## Frontend

```text
Next.js
TypeScript
Tailwind
shadcn/ui
TanStack Query
Zustand
```

## Backend

```text
Go
HTTP API
Go workers
```

Suggested libraries:

```text
net/http
chi
pgx
sqlc
go-playground/validator
golang.org/x/oauth2
slog
OpenTelemetry
testify
```

## Data

```text
PostgreSQL
Redis
```

## AI

```text
OpenAI API
```

## Infrastructure

```text
AWS
ECS/Fargate
RDS PostgreSQL
ElastiCache Redis
CloudFront
S3
Terraform
```

---

# 30. Repository Structure

```text
adwise/

├── apps/
│   ├── api/
│   └── worker/
│
├── internal/
│   ├── auth/
│   ├── organizations/
│   ├── integrations/
│   ├── accounts/
│   ├── campaigns/
│   ├── adgroups/
│   ├── ads/
│   ├── creatives/
│   ├── metrics/
│   ├── analytics/
│   ├── automation/
│   ├── dayparting/
│   ├── actions/
│   ├── notifications/
│   └── ai/
│
├── pkg/
│   ├── providers/
│   │   ├── meta/
│   │   └── google/
│   ├── queue/
│   ├── auth/
│   └── telemetry/
│
├── migrations/
│
└── deployments/
```

---

# 31. MVP Architecture Principle

Do not start with microservices.

Deploy:

```text
adwise-api
adwise-worker
```

from the same Go repository.

Scale independently when necessary.

Do not introduce:

```text
Kafka
Kubernetes
ClickHouse
MongoDB
Data Lake
Spark
```

until actual product/data requirements justify them.

---

# 32. Future Analytics Architecture

If metric volume and analytical query requirements grow substantially:

```text
                  PostgreSQL
               Business State
                     │
                     │
                 Metric Data
                     ▼
                 ClickHouse
                     │
              Heavy Analytics
```

Raw provider payloads can eventually move to:

```text
S3 / Parquet
```

The application should hide the underlying analytical store behind:

```go
type MetricsRepository interface {
    Query(...)
    Aggregate(...)
}
```

This allows PostgreSQL to be replaced by ClickHouse without rewriting the product.

---

# 33. Security

Requirements:

* OAuth-based provider authentication
* Encrypt provider tokens
* Tenant isolation
* Organization-level authorization
* RBAC
* Audit logging
* Secret management
* API rate limiting
* Idempotent mutations

AI must never receive unrestricted database access.

AI actions should go through the same action engine as human/automation actions.

---

# 34. Observability

Use:

```text
OpenTelemetry
Sentry
structured logging
```

Track:

* API latency
* Provider API latency
* Provider errors
* Sync duration
* Sync failures
* Queue depth
* Worker failures
* Automation execution
* Dayparting execution
* Action success/failure
* Data freshness

Important metric:

```text
data_freshness_lag
```

Example:

```text
Google Ads
Last synced: 08:03
Current: 08:10
Lag: 7 minutes
```

---

# 35. MVP Data Freshness

Initial target:

### Entity synchronization

Every few hours or on-demand.

### Performance data

Daily data:

```text
hourly / daily synchronization
```

### Dayparting

Hourly data should be ingested frequently enough to support the scheduling and analytical requirements.

The exact frequency should depend on provider reporting latency and API limits.

---

# 36. MVP Automation Safety

Every mutation should have:

* Current-state validation
* Desired-state validation
* Provider capability validation
* Idempotency
* Audit record
* Error handling
* Retry policy
* Optional dry-run mode

For example:

```text
User enables rule
        ↓
Dry Run
        ↓
Show expected campaigns/actions
        ↓
User confirms
        ↓
Rule becomes active
```

---

# 37. MVP Success Metrics

Product metrics:

* Connected ad accounts
* Active organizations
* Daily active users
* Daily synced accounts
* Analytics query latency
* Automation execution rate
* Action success rate
* Dayparting rule adoption
* Automated actions per account
* User retention

Technical targets:

```text
API p95 < 500ms
Analytics p95 < 2s for normal dashboard queries
Action success > 99%
No duplicate mutations
High data freshness reliability
```

---

# 38. Development Phases

## Phase 1 — Foundation

* Repository
* Authentication
* Organizations
* RBAC
* PostgreSQL
* Redis
* API/worker architecture
* Observability

## Phase 2 — Integrations

* Meta OAuth
* Google OAuth
* Account discovery
* Entity synchronization
* Provider adapters

## Phase 3 — Data Platform

* Metric fact model
* Report definitions
* Daily metrics
* Hourly metrics
* Data validation
* Idempotent ingestion

## Phase 4 — Analytics

* Dashboard
* Campaign analytics
* Period comparison
* Hourly analytics
* Breakdown analytics
* Creative analytics

## Phase 5 — Dayparting

**MVP-critical**

* Hourly data pipeline
* Day-of-week analysis
* Hourly heatmap
* Schedule builder
* Timezone handling
* Pause/activate schedules
* Budget adjustments where provider supports them
* Rule conflicts
* Scheduler
* Action execution
* Audit trail
* Dry-run preview

## Phase 6 — Automation

* Rule builder
* Conditions
* Thresholds
* Budget rules
* Campaign rules
* Alerts
* Action history

## Phase 7 — AI

* Analytics tools
* Account summaries
* Performance explanations
* Dayparting recommendations
* Anomaly explanations
* Human-approved actions

---

# 39. Explicitly Out of MVP

Do not build initially:

* TikTok Ads
* LinkedIn Ads
* Snapchat Ads
* Amazon Ads
* Full attribution platform
* MMM
* Autonomous campaign creation
* Autonomous creative generation
* Fully autonomous AI agent
* Kafka
* Kubernetes
* ClickHouse
* Large-scale data lake
* Complex experimentation platform

These can be added after the core Meta + Google + analytics + automation + dayparting loop is working.

---

# 40. The Core Adwise Architecture

The most important abstraction is:

```text
                    PROVIDERS
                 /             \
              META            GOOGLE
                \               /
                 \             /
                  ▼           ▼
               Provider Adapters
                       │
                       ▼
                Canonical Data
                       │
                       ▼
                 Metric Facts
                       │
              ┌────────┴────────┐
              ▼                 ▼
          Analytics          Decision Engine
              │                 │
              │          ┌──────┴──────┐
              │          ▼             ▼
              │      Automation     Dayparting
              │          │             │
              └──────────┴──────┬──────┘
                                ▼
                         Action Engine
                                │
                         ┌──────┴──────┐
                         ▼             ▼
                       META          GOOGLE
```

The fundamental design principle is:

> **Store granular facts; derive contextual metrics; make decisions from those metrics; execute mutations through one controlled action engine.**

This lets Adwise start simple with PostgreSQL while preserving a path toward a much larger analytical system.
