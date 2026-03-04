# Data Health Page

> A single `/health` page on the dashboard showing a status table of all 5 core data streams — confirms data is flowing and fresh at a glance.

| Field | Value |
|-------|-------|
| Status | Active |
| Owner | wiley |
| Last Updated | 2025-03-03 |
| Depends On | Existing platform API, dashboard sidebar |
| Enables | Quick verification that transcript/event/task imports are working |

---

## Current State

- **Done**: Platform API serves analytics from 5 core tables (transcripts, workflow_events, tasks, developer_context, skill_versions) plus 27 SQL views
- **Done**: Dashboard has 3 pages (Streams, Tasks, Activity) with Palantir dark theme, Apollo Client, sidebar nav
- **Not started**: No unified view of data pipeline health across all tables

---

## Vision

Open one page, scan 5 rows, know instantly whether all data streams are healthy. Green = fresh data flowing. Yellow = stale. Red = no data or critically stale. No clicking, no drilling — just a traffic light per stream.

---

## Design

**This spec covers:**
- `/health` page — status table with one row per core data stream
- New `dataHealth` GraphQL query + resolver
- Sidebar navigation update (add Health entry)

**Out of scope:**
- Derived SQL view monitoring (27 views) — future enhancement
- Alerting / notifications on unhealthy streams
- Historical health trends

### Health Page (`/health`)

**The health page is a single status table with 5 rows — one per core data stream.**

Layout:
- **Page title**: "Data Health" with a live/polling indicator
- **Status table**: 5 rows, 5 columns

| Column | Source | Purpose |
|--------|--------|---------|
| Stream | Hardcoded names | Which table |
| Status | Computed from `lastUpdated` | Traffic light: green/yellow/red |
| Count | `SELECT COUNT(*)` | Total records in table |
| Last Updated | `SELECT MAX(timestamp_col)` | Most recent record (relative time) |
| Rate (1h) | `SELECT COUNT(*) WHERE timestamp > now - 1h` | Recent activity level |

**Status logic:**
- **Green**: Last updated within expected freshness (transcripts: 1h, workflow_events: 1h, tasks: 24h, developer_context: 7d, skill_versions: 30d)
- **Yellow**: 2x expected freshness window
- **Red**: >3x expected freshness OR zero records

**Polling**: Refetch every 30 seconds.

**Timestamp columns per table:**
- `transcripts` → `started_at`
- `workflow_events` → `timestamp`
- `tasks` → `created_at` (or `updated_at` if available, else `started_at`)
- `developer_context` → `recorded_at`
- `skill_versions` → `introduced_at`

### Sidebar Update

Add one entry to the nav array:
- `{ href: "/health", icon: HeartPulse, label: "Health" }` — at the bottom of the nav list

---

## Implementation Plan

| # | Task | Done When | Depends On |
|---|------|-----------|------------|
| 1 | Add `dataHealth` GraphQL query + resolver | Query returns count, lastUpdated, recentCount for all 5 tables; unit test passes | — |
| 2 | Build `/health` page with status table + sidebar entry | Page renders 5-row table with traffic lights, polling works, HeartPulse icon in sidebar | 1 |

---

## Open Questions

1. ~~Table or cards?~~ **Resolved**: Status table. Dense, scannable, minimal.
2. ~~Include derived views?~~ **Resolved**: No. Core streams only (5 rows). Can add views later.
3. ~~Where in nav?~~ **Resolved**: New `/health` page, bottom of sidebar.
