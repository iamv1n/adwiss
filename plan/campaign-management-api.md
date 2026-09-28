# Campaign management API (contract)

Shared contract between the Go API (`internal/manage`) and the web app
(`web/src/lib/manage-api.ts`). Meta is fully supported; Google supports only
what `ads.Client` already does (campaign status and daily budget) and returns
`422 unsupported` for the rest.

All routes are under `/v1/orgs/{orgID}` and require organization role
**admin or owner**. Members get `403 forbidden`, and the UI hides controls for
them (`Organization.role`).

## Conventions

- IDs in paths and bodies are **Adwise UUIDs** (`campaigns.id`,
  `ad_groups.id`, `ads.id`, `ad_accounts.id`), never provider IDs.
- Money is in the account currency's **major units** as a JSON number
  (`500` = ₹500.00), the same as `daily_budget` in the entities list
  responses. The server converts to provider units.
- Times are RFC 3339 strings. `null` clears an optional value where the provider allows it.
- `status` values: `"active" | "paused" | "archived"`. `archived` is
  Meta's ARCHIVED: it stops delivery and cannot be undone.
- Everything created starts **paused** unless the body says `"status": "active"`.
- Every mutation is written to the provider **synchronously**. The server then
  re-reads the entity from the provider, upserts it locally and returns it in
  the same shape as the entities list endpoints (`GET /campaigns`,
  `/ad-groups`, `/ads`). Every mutation writes an audit entry
  (`campaign.updated`, `campaign.created`, `ad_group.updated`, …) with
  `before` and `after` in its metadata.
- Archiving (DELETE, or `status: "archived"`) is audited as `campaign.archived`
  / `ad_group.archived` / `ad.archived`; account spend-cap changes as
  `ad_account.spend_cap_updated`.
- Errors use the usual shape `{ "error": { code, message, fields? } }`
  (unknown JSON fields or wrong JSON types are `400 invalid_json`, as elsewhere in the API):
  - `422 validation_failed`: bad input
  - `422 unsupported`: the provider or budget setup doesn't allow it, e.g. a
    budget on a campaign whose budget lives on its ad sets
  - `409 reauth_required`: reconnect the integration
  - `502 provider_error`: the provider rejected the change, with its message
    passed through

## Update

`PATCH /campaigns/{campaignID}`
```json
{ "status": "paused", "name": "…", "daily_budget": 750, "lifetime_budget": null,
  "spend_cap": 20000, "end_time": "2026-10-31T23:59:00+05:30" }
```
All fields are optional; send only what changes. Only one of `daily_budget` or
`lifetime_budget` may be set, and it must match the campaign's current budget
type (or the campaign uses ad set budgets → `422 unsupported`). Setting
`spend_cap: null` removes the campaign spend cap. → `{ "campaign": Campaign }`

`PATCH /ad-groups/{adGroupID}`: Meta ad set
```json
{ "status": "active", "name": "…", "daily_budget": 300, "lifetime_budget": null,
  "bid_amount": 12.5, "end_time": null }
```
→ `{ "ad_group": AdGroup }`

`PATCH /ads/{adID}`
```json
{ "status": "paused", "name": "…" }
```
→ `{ "ad": Ad }`

`DELETE /campaigns/{id}`, `/ad-groups/{id}`, `/ads/{id}`: archive (Meta
ARCHIVED). Returns `204`.

`POST /bulk/status`: pause, activate or archive many entities at once
```json
{ "level": "campaign", "ids": ["uuid", "…"], "status": "paused" }
```
`level` is `campaign | ad_group | ad`; at most 100 ids. → `{ "results": [{ "id": "uuid", "ok": true }, { "id": "uuid", "ok": false, "error": "…" }] }`
(always 200; partial failures are reported per item)

## Create (Meta)

`POST /campaigns`
```json
{ "account_id": "uuid", "name": "Adwise – Traffic", "objective": "OUTCOME_TRAFFIC",
  "status": "paused",
  "daily_budget": 500, "lifetime_budget": null, "end_time": null,
  "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
  "special_ad_categories": [] }
```
`objective`: `OUTCOME_AWARENESS | OUTCOME_TRAFFIC | OUTCOME_ENGAGEMENT |
OUTCOME_LEADS | OUTCOME_APP_PROMOTION | OUTCOME_SALES`. A budget on the
campaign means Advantage campaign budget. With no budget, each ad set carries
its own. `lifetime_budget` requires `end_time`. → `201 { "campaign": Campaign }`

`POST /ad-groups`: Meta ad set
```json
{ "campaign_id": "uuid", "name": "India 18–45", "status": "paused",
  "daily_budget": 300, "lifetime_budget": null,
  "start_time": null, "end_time": null,
  "optimization_goal": "LINK_CLICKS", "billing_event": "IMPRESSIONS", "bid_amount": null,
  "destination_type": "WEBSITE",
  "targeting": { "countries": ["IN"], "age_min": 18, "age_max": 45, "genders": [] ,
                 "advantage_audience": true } }
```
`genders`: `[]` = all, `[1]` = men, `[2]` = women. Only send a budget when the
campaign has none. `advantage_audience` defaults to `true`; with it on, Meta
requires `age_min` ≤ 25 and fixes `age_max` at 65, so a lower `age_max` is sent
as a suggested age range.

Optional `"promoted_object": { "pixel_id": "…", "custom_event_type": "PURCHASE" }`
(string map passed to Meta: `page_id`, `pixel_id`, `custom_event_type`,
`application_id`, `object_store_url`, …). It is **required** when the
campaign objective is `OUTCOME_SALES`, `OUTCOME_LEADS` or
`OUTCOME_APP_PROMOTION` (`422 validation_failed` on `promoted_object`
otherwise). → `201 { "ad_group": AdGroup }`

`POST /ads`
```json
{ "ad_group_id": "uuid", "name": "Owl creative 1", "status": "paused",
  "page_id": "1234567890",
  "creative": { "image_hash": "abc…", "link": "https://adwise.app",
                "message": "Primary text", "headline": "Stop wasting ad spend",
                "description": "", "call_to_action": "LEARN_MORE" } }
```
Or, instead of `creative`, `"object_story_id": "<pageid>_<postid>"` to
promote an existing Page post. `call_to_action`: `LEARN_MORE | SHOP_NOW |
SIGN_UP | CONTACT_US | DOWNLOAD | GET_OFFER | BOOK_TRAVEL | SUBSCRIBE`.
→ `201 { "ad": Ad }`

## Supporting reads and uploads

`GET /accounts/{accountID}/pages` returns the Facebook Pages this connection
can advertise as:
`{ "pages": [{ "id": "…", "name": "…", "picture_url": "…" }] }`

`POST /accounts/{accountID}/images` takes `multipart/form-data` with a
`file` field (jpg/png, ≤ 8 MB) and uploads it to the ad account's image
library. → `{ "image": { "hash": "…", "url": "…" } }`

`GET /accounts/{accountID}/limits` returns
`{ "spend_cap": 50000 | null, "amount_spent": 1234.5, "currency": "INR", "balance": 0 }`

`PATCH /accounts/{accountID}/limits` sets the account-wide spend limit (Meta
ad account `spend_cap`): `{ "spend_cap": 50000 }` or `{ "spend_cap": null }`
to remove it. → the same body as GET.

## Series for sparklines and charts

`GET /analytics/series?level=campaign|ad_group|ad&ids=uuid,uuid&from=YYYY-MM-DD&to=YYYY-MM-DD`
(at most 200 ids; the range is capped at 400 days)
```json
{ "currency_by_id": { "uuid": "INR" },
  "series": { "uuid": [ { "date": "2026-09-20", "spend": 120.5, "impressions": 5400,
                          "clicks": 80, "conversions": 3, "conversion_value": 2400 } ] } }
```
Days with no data are included with zeros, so each series has one point per day.
Unlike the other routes here, series is a read and is open to every
organization member. IDs that are not in the organization are omitted from
both maps. `ad_group` series are summed from `ad_daily` facts, matching the
entity list metrics.
