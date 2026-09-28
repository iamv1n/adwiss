# Budget planner

Set one number for a period ("₹2,00,000 this month", "₹50,000 for Diwali week"). Adwise paces it
day by day, splits it across campaigns, moves unused budget to where it's needed, and reports
delivery. Built inside `internal/automation` so it reuses the scheduler tick, `set_budget`
execution through `internal/manage`, dry-run, idempotency slots, and the actions log.

## Scope (v1)

- Targets: **campaigns with a campaign-level daily budget** (pacing status not `no_budget`).
  Ad-set/ad-group budgets and lifetime budgets are out of scope for v1.
- One currency per plan: every campaign in a plan must belong to accounts with the plan's currency.
- A campaign can be in at most one **enabled** plan at a time.

## Model

`budget_plans` (migration `00050_budget_plans.sql`)

| column | notes |
|---|---|
| id, organization_id, name, created_by, created_at, updated_at | as other automation tables |
| total_budget numeric(14,2) > 0, currency text | |
| start_date, end_date date (end ≥ start, ≤ 92 days) | inclusive; account-local days |
| timezone text null | null = first account's timezone |
| curve text | `even` \| `front_loaded` \| `back_loaded` \| `custom` |
| custom_weights jsonb null | one positive number per day when curve = custom |
| allocation_mode text | `manual` \| `past_spend` \| `roas` (how % were auto-filled; % always stored) |
| reallocate boolean default true | move unused budget between campaigns |
| enabled boolean default false, dry_run boolean default true | same semantics as rules |
| last_run_at, next_run_at | |

`budget_plan_campaigns`: plan_id, campaign_id (entity uuid), share_pct numeric(5,2) (sum = 100),
min_daily_budget numeric(14,2) default 0. PK (plan_id, campaign_id).

`budget_plan_days`: plan_id, campaign_id, day date, planned numeric, budget_set numeric null,
spent numeric null. Snapshot of what was planned/set per day; drives delivery report and the chart.

`actions.source` CHECK gains `'plan'`.

## Pacing math

Curve weights for day i of N (t = i/(N-1), 0..1): even = 1; front_loaded = 1.5 − t; back_loaded = 0.5 + t;
custom = custom_weights[i]. Normalise to sum 1.

Each evaluation **re-paces**: `remaining = total − spent_to_date` (spent from metric facts, full days before
today plus today so far), spread over the remaining days (today..end) by their curve weights, so over- or
under-delivery self-corrects. Today's plan budget = remaining × weight(today)/Σweights(remaining days).

Split: campaign budget = today's budget × share_pct, then raise any below `min_daily_budget` to the minimum,
taking the difference proportionally from the campaigns above their minimum.

Reallocation (when `reallocate`), from the previous full day:
- **Capped**: spent ≥ 95% of the budget set. **Underspent**: spent < 70% of the budget set.
- Take the unspent amount from underspent campaigns (never below their minimum) and give it to capped
  campaigns, weighted by ROAS over the last 7 days (equal weights when there's no ROAS).
- The change is recorded as today's effective shares (the stored share_pct is not rewritten), with the reason
  in the action (e.g. "reallocated $38 from Prospecting — spent 52% yesterday").

## Execution

- Runs on the existing 5-minute tick: a plan is due once per account-local day (first tick after 00:05 local)
  and again on manual "Run now". Task `budget_plan:evaluate`, task id `plan:{id}:{date}`.
- For each campaign whose computed budget differs from its current daily budget by ≥ 1% → a `set_budget`
  action, source `plan`, slot = the day. Dry-run records actions with status `dry_run` and never calls the platform.
- Dayparting interaction: when the campaign is also in an enabled dayparting schedule, the plan sets the
  schedule's **base** budget for that campaign (the one multipliers apply to) instead of the live budget, and
  lets the schedule apply the multiplier on its next hour. Rules touching the same campaign that hour are
  skipped as today (schedule/plan precedence) with a logged reason.
- Plan ends: after end_date the plan stops (enabled stays, status `completed`); budgets are left as last set.

## API (`/orgs/{orgID}/budget-plans`)

- `GET /` → `{ plans: PlanSummary[] }`
- `POST /` body `PlanInput` → `Plan`
- `GET /{id}` → `Plan` (with campaigns, days, delivery)
- `PATCH /{id}` body partial `PlanInput` (+ `enabled`, `dry_run`) → `Plan`
- `DELETE /{id}`
- `POST /{id}/run` → `{ actions: Action[] }` (evaluate now; honours dry_run)
- `POST /preview` body `PlanInput` → `{ days: DayPlan[], campaigns: CampaignPlan[] }` (pure: no writes)
- `GET /suggest-split?campaign_ids=…&mode=past_spend|roas&days=30` → `{ shares: {campaign_id, share_pct}[] }`

```ts
type Curve = "even" | "front_loaded" | "back_loaded" | "custom";
type PlanInput = {
  name: string; total_budget: number; currency: string;
  start_date: string; end_date: string; timezone?: string | null;
  curve: Curve; custom_weights?: number[] | null;
  allocation_mode: "manual" | "past_spend" | "roas"; reallocate: boolean;
  campaigns: { campaign_id: string; share_pct: number; min_daily_budget: number }[];
};
type PlanSummary = {
  id: string; name: string; total_budget: number; currency: string;
  start_date: string; end_date: string; curve: Curve;
  enabled: boolean; dry_run: boolean;
  status: "draft" | "scheduled" | "active" | "completed";
  campaign_count: number;
  spent_to_date: number; planned_to_date: number;
  delivery_pct: number | null;   // spent_to_date / planned_to_date * 100
  last_run_at: string | null; next_run_at: string | null;
};
type DayPlan = { day: string; planned: number; spent: number | null; budget_set: number | null };
type CampaignPlan = {
  campaign_id: string; name: string; provider: "meta" | "google";
  share_pct: number; min_daily_budget: number;
  current_daily_budget: number | null;
  planned_today: number; planned_total: number; spent_to_date: number; roas_7d: number | null;
};
type Plan = PlanSummary & PlanInput & {
  days: DayPlan[]; campaigns: CampaignPlan[]; recent_actions: Action[]; // Action as in automation-api.ts
};
```

## Web

- Nav: "Budget planner" (`/app/budget`, icon `Wallet`) in the Optimize section, above Dayparting.
- List: plan cards with total, period, delivery % ring, status/dry-run badges.
- Builder (dialog or page): amount + currency, period with presets (this month, next 7 days, custom),
  curve picker with a live preview chart of daily budgets (editable per day → switches to custom),
  campaign picker + split table (auto-fill from past spend / ROAS, per-campaign minimum, sum check),
  reallocate toggle, dry-run/enable toggles. Preview uses `POST /preview`.
- Detail: planned vs spent cumulative chart, "96.4% of planned spend delivered", per-campaign table,
  change log (actions with source `plan`), Run now.
