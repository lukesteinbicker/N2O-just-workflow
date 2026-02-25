# Subscription Management
> Admin-only CLI for tracking per-developer Claude subscription plans and costs over time.

| Field | Value |
|-------|-------|
| Status | Not Started |
| Owner | Wiley |
| Last Updated | 2026-02-25 |
| Sprint | — |

---

## Current State

- Token-based cost estimation exists via `rates.json` (per-model input/output pricing)
- `collect-transcripts.sh` calculates `estimated_cost_usd` per session using token counts
- `n2o stats` shows "Cost/Task" based on token-estimated cost
- No way to track actual org spend (subscription cost per seat)
- No way to detect subscription type programmatically (confirmed: no API/CLI exposes plan tier)
- Team members are on different plans (Pro, Max, Max 5x) at different price points

## Vision

An admin-restricted `n2o subscription` command that records who is on what plan, at what price, and when it took effect. Produces cost-per-task metrics based on actual subscription spend, not token estimates.

## Design

### Schema

`developer_subscriptions` table with time-series design — each row is a subscription period. Most recent `effective_date` for a developer is their current plan.

```sql
CREATE TABLE developer_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    developer TEXT NOT NULL,          -- matches developer_name / developers.name
    plan TEXT NOT NULL,               -- pro, max, max_5x, teams, enterprise, api
    monthly_usd REAL NOT NULL,        -- actual monthly cost for this seat
    effective_date DATE NOT NULL,     -- when this plan took effect (YYYY-MM-DD)
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (developer) REFERENCES developers(name)
);
```

### Views

- `current_subscription` — each developer's active plan (most recent effective_date <= today)
- `team_cost` — joins subscriptions with completed tasks for cost-per-task by developer

### CLI

```
n2o subscription set <developer> <plan> <monthly_usd> [--effective YYYY-MM-DD] [--notes "..."]
n2o subscription list
n2o subscription history [developer]
```

### Access Control

The `set` subcommand should be admin-only. Options:
1. **Config-based**: `admin_users` array in `.pm/config.json` — only listed users can run `set`
2. **Flag-based**: Require `--admin` flag that maps to a shared secret or env var
3. **File-based**: Check for `.pm/admin.json` that only admins have write access to

`list` and `history` are read-only and can be available to all users.

### Stats Integration

When subscription data exists, `n2o stats` should show:
- Team monthly spend (sum of current subscriptions)
- Subscription-based cost/task (monthly_usd / tasks completed that month)
- Both in terminal output and JSON output

## Open Questions

- ~~Can we detect subscription type programmatically?~~ No — confirmed no API, CLI, or config exposes plan tier.
- Which access control approach? Config-based is simplest and fits the existing pattern.
- Should subscription data live in the project DB or a central framework DB? Project DB is simpler; framework DB avoids duplication across projects.

## Verification

1. `n2o subscription set` restricted to admin users — non-admins get a clear error
2. `n2o subscription list` shows current plans and cost-per-task
3. `n2o subscription history` shows plan changes over time with effective dates
4. `n2o stats` includes subscription-based cost metrics when data exists
5. Plan changes (upgrades/downgrades) tracked with correct effective dates
6. All existing tests pass
