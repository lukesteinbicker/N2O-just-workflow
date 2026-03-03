# Dashboard Polish — Gantt UX + Data Fixes

> Fix broken task display (stale tasks, owner resolution, alignment), add Gantt interactivity (tooltips, click targets, collapse summaries, zoom), add activity log page, and update sidebar with logo.

| Field | Value |
|-------|-------|
| Status | Active |
| Owner | wiley |
| Last Updated | 2026-03-03 |

---

## Current State

- Gantt chart renders tasks with bars, dependency lines, sprint grouping, zoom controls
- Entire row is clickable (should be bars only)
- No hover tooltips on bars or dependency lines (Streams page has tooltips, Tasks doesn't)
- Collapsed sprints hide all bars (no summary)
- Default zoom ("All") spans earliest task → now, but bars bunch to the left because time range is too wide
- 3 tasks stuck in "red" for 6-9 days, showing "STALE" label
- Owner field stores agent IDs (`agent-MacBook-Pro-86278-...`) — resolver returns null because Developer loader can't find them
- Session transcripts stopped collecting after 2/24 (9 days ago) — Streams page shows stale warning
- Sidebar has 2 items (Streams, Tasks) — no activity log, no logo
- `workflow_events` table has 2292 rows — good data source for activity feed

## Vision

A polished dashboard where:
- Task bars have hover tooltips and only bars are clickable
- Dependency lines show relationship on hover
- Collapsed sprints show a summary time bar
- Zoom defaults to a useful range (not too wide)
- Stale/orphaned tasks are cleaned up
- Owner names display correctly (fallback for agent IDs)
- Activity log page shows chronological feed of all system events
- N2O logo in sidebar

## Design

### Gantt Bar Tooltips
Add `<Tooltip>` (same component as Streams page) wrapping each task bar. Show: title, status, owner, duration, blow-up ratio.

### Dependency Line Tooltips
SVG `<title>` elements on dependency line groups. Shows "Task #X → Task #Y" with status of each.

### Click Target Restriction
Move `onClick` from the row `<div>` to only the bar `<div>` and label `<button>`. Empty space in timeline should not open the Sheet.

### Collapsed Sprint Summary Bar
When sprint is collapsed, render a single bar from min(startedAt) to max(completedAt/now). Color by progress: green if all done, accent blue if mixed, gray if all pending.

### Default Zoom
Keep "All" as default but tighten the time range padding. The current 5% padding on each side creates too much whitespace when range is wide.

### Owner Resolution
In the task resolver, if Developer loader returns null, return a synthetic object `{ name: owner_string }` as fallback. For agent IDs, extract a short label (e.g., "agent-86278").

### Stale Task Cleanup
Update tasks #17, #30, #32 in coordination sprint to `blocked` status with reason "stale — paused 2026-03-03".

### Session Data Investigation
Check if transcript collection hooks are still running. The `SessionEnd` hook should be populating the transcripts table.

### Activity Log Page
New `/activity` page with sidebar entry. Pulls from `workflow_events` table via new GraphQL query. Reverse-chronological feed. Each entry shows: timestamp, event type, sprint/task context, details.

### N2O Logo
Convert provided logo to SVG for dark theme (white text on transparent). Place at top of sidebar.

## Implementation Plan

| # | Task | Done When |
|---|------|-----------|
| 1 | Fix stale tasks + owner resolution | 3 stale tasks marked blocked, owner resolver returns fallback name for agent IDs |
| 2 | Gantt UX polish — tooltips, click targets, alignment, collapse summaries, zoom | Bars have hover tooltips, dependency lines show relationship, only bars clickable, collapsed sprints show summary bar, zoom fits data |
| 3 | Investigate + fix session data staleness | Transcripts table has current data, Streams page doesn't show stale warning |
| 4 | Activity log page + sidebar logo | /activity page shows event feed, N2O logo in sidebar |

## Open Questions

1. ~~What should "close stale tasks" mean?~~ **Resolved**: Mark as blocked with reason.
2. ~~Where should activity log live?~~ **Resolved**: New sidebar page at /activity.
3. What format should the N2O logo be in? User provided black-on-white PNG — need to create inverted SVG or use CSS filter.
