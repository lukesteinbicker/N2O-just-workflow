# Activity Streams Dashboard

> Two new dashboard pages — a session timeline (gantt bars per developer) and a task board — so a manager can see what every agent is doing right now.

| Field | Value |
|-------|-------|
| Status | Active |
| Owner | wiley |
| Last Updated | 2025-03-03 |
| Depends On | Existing platform API (sessionTimeline, tasks queries) |
| Enables | Real-time team visibility for 12:30 engineering meeting |

---

## Current State

- **Done**: Platform API serves `sessionTimeline` (sessions grouped with subagents, developer, task linkage) and `tasks` (filterable by sprint/status/owner/horizon)
- **Done**: Dashboard has 5 pages (Observatory, Velocity, Skills, Team, Activity) with Palantir dark theme, Apollo Client, sidebar nav
- **Done**: 102 transcripts with `started_at`/`ended_at` timestamps, 2,292 workflow events
- **Not started**: No timeline/gantt visualization of session activity
- **Not started**: No dedicated task board page

---

## Vision

A manager opens the dashboard before a standup and sees two things: (1) a timeline showing when each developer's agents were active, what they worked on, and how dense the activity was, and (2) a task board showing the current sprint state. Both pages use existing data — no new collection pipelines.

---

## Design

**This spec covers:**
- `/streams` page — session timeline with horizontal gantt bars per developer
- `/tasks` page — active task board across sprints
- Sidebar navigation updates (2 new entries)

**Out of scope:**
- Real-time/WebSocket updates (future)
- Supabase cloud sync (separate concern)
- New data collection pipelines
- Modifications to existing API resolvers

### Streams Page (`/streams`)

**The streams page is a horizontal timeline where each row is a developer and each bar is a session.**

Data source: `sessionTimeline` GraphQL query (already exists in `analytics.ts`). Returns sessions with `startedAt`, `endedAt`, developer info, task linkage, subagent list, model, token counts.

Layout:
- **Header row**: Page title + time range display (auto-computed from data)
- **Timeline area**: Y-axis = developers (grouped by name), X-axis = time
- **Each bar**: Horizontal rectangle spanning `startedAt` → `endedAt` (or now if still active)
- **Bar content**: Task title (if linked), model badge, token count
- **Bar color**: By status — active sessions (no `endedAt`) get accent blue, completed get muted
- **Hover tooltip**: Session details (duration, tokens, tool calls, task, subagent count)

Implementation: Pure CSS/HTML with `position: relative` container and `position: absolute` bars. No charting library needed — this is simpler and more controllable than Recharts for gantt-style layout.

### Tasks Page (`/tasks`)

**The tasks page is a gantt chart showing task timing, status, and dependencies.**

Data source: `tasks` GraphQL query (already exists). Shows all tasks across sprints.

Layout:
- **KPI row**: Total active (status!=green), In Progress (red), Blocked, Pending
- **Task gantt chart**:
  - Y-axis = tasks grouped by sprint (sprint name as section header)
  - X-axis = time (auto-scaled from earliest started_at to now)
  - Each bar = one task, from started_at → completed_at (or now if active)
  - Pending tasks: empty/outline bar at current time
  - Bar color by status: pending=#404854, red=#EC9A3C, green=#238551, blocked=#CD4246
  - Bar label: task title (truncated) + owner badge
  - **Dependency lines**: thin connecting lines from end of dependency → start of dependent task (SVG overlay)
  - Hover tooltip: title, owner, status, type, complexity, duration

### Sidebar Updates

Add two new nav items to the existing sidebar array:
- `{ href: "/streams", icon: Radio, label: "Streams" }` — after Activity
- `{ href: "/tasks", icon: ListTodo, label: "Tasks" }` — after Streams

---

## Implementation Plan

| # | Task | Done When | Depends On |
|---|------|-----------|------------|
| 1 | Reinstall Playwright + fix dashboard port to 4001 | Playwright installed, config targets :4001, smoke screenshot works | — |
| 2 | Build Streams timeline (gantt bars per developer) | `/streams` renders session gantt, Playwright screenshot is clean | 1 |
| 3 | Build Tasks gantt (dependency lines + timing) | `/tasks` renders task gantt with dep lines, Playwright screenshot is clean | 1 |

**Verification approach**: Each page task includes a Playwright screenshot iteration loop — build, screenshot, read screenshot, fix, repeat until the visual is clean.

---

## Open Questions

1. ~~Do we need new API resolvers?~~ **Resolved**: No. `sessionTimeline` and `tasks` queries already return everything we need.
2. ~~Charting library for gantt?~~ **Resolved**: Pure CSS positioning. Simpler, faster, no new dependency.
3. ~~How to verify visual output?~~ **Resolved**: Playwright screenshot loop — iterative visual TDD.
