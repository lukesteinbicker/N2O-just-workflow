# Merge ProjectSidebar + Gantt Label Column

> Unify the sidebar tree and gantt label column into a single left panel where each project row aligns 1:1 with its gantt bar, eliminating the duplicative project name columns.

| Field | Value |
|-------|-------|
| Status | Draft |
| Owner | Wiley |
| Last Updated | 2026-03-08 |
| Depends On | 01-capacity-planner-v1.md |

---

## Goal

The current layout has two places showing project names: the ProjectSidebar (250px, rich grouping tree with checkboxes/expand/collapse) and the GanttTimeline's label column (150px, flat project names). This creates visual redundancy and breaks the mental model — the sidebar tree doesn't align spatially with the gantt bars. Merging them creates a single source of truth for project identity, with each sidebar row directly adjacent to its gantt bar.

---

## Current State

- **ProjectSidebar** (1200 lines): Fixed 250px left panel with header controls (Views, GroupBy, Filter dropdowns), stage chips, and 5 rendering modes based on `groupOrder`/`groupEnabled`. Uses variable row heights.
- **GanttTimeline label column** (150px resizable): Flat list of project names at fixed ROW_H=28px, vertically scroll-synced with gantt bars.
- **Page layout**: `ProjectSidebar | GanttTimeline(labelCol + ganttBars + demandChart) | DetailPanel`
- **Scroll sync**: Label ↔ gantt (vertical), gantt ↔ demand (horizontal). Two separate scroll containers synced via `requestAnimationFrame`.

---

## Design

**Replace the two-panel split with a single shared scroll container.** The sidebar tree and gantt bars live in the same vertically-scrolling div, eliminating vertical scroll sync entirely.

### Layout structure

```
┌────────────────────────────────────────────────────┐
│ CapacityHeader (KPI bar)                           │
├──────────┬─────────────────────────────┬───────────┤
│ Controls │  (gantt header / tick labels)│           │
│ (fixed)  ├─────────────────────────────┤  Detail   │
│          │  Shared scroll container     │  Panel    │
│ Stage    │  ┌─────────┬───────────────┐│           │
│ chips    │  │ Tree    │ Gantt bars    ││           │
│          │  │ row     │ row           ││           │
│          │  │ co hdr  │ (empty/agg)   ││           │
│          │  │ row     │ row           ││           │
│          │  └─────────┴───────────────┘│           │
│          ├─────────────────────────────┤           │
│          │  Demand chart               │           │
│          │  (h-scroll synced)          │           │
├──────────┴─────────────────────────────┴───────────┤
│ Footer                                             │
└────────────────────────────────────────────────────┘
```

### Key decisions

1. **Fixed row heights for everything.** Project rows stay ROW_H (28px). Company headers: 30px. Stage headers: 24px. This ensures the tree and gantt bars stay in perfect alignment without sync.

2. **Single scroll container.** The sidebar tree and gantt bars are in the same vertically-scrolling div. The tree is `position: sticky; left: 0` so it stays visible during horizontal scroll. This eliminates the label↔gantt vertical scroll sync entirely.

3. **Sidebar controls stay fixed.** The header (PROJECTS label, dropdowns) and stage chips render above the scroll container, not inside it.

4. **Company/stage headers span the gantt area.** In the gantt column, company header rows are empty (no bar). Stage header rows render as thin colored dividers spanning the full width, providing visual grouping context.

5. **Gantt bars render per-row.** Each row in the shared container is either a project row (has a gantt bar) or a header row (no bar / just a divider). Bars are positioned within their row using the same left/width pixel calculations as today.

6. **Demand chart and axis labels.** Move below the shared scroll container. The demand axis labels slot into the sticky sidebar column. Horizontal scroll sync between the shared container and demand chart remains (it still needs two separate h-scroll containers).

7. **Label column resize.** Keep the drag handle on the sidebar edge. Min 180px, max 350px (wider default since this is now the only place project info appears).

### What changes per file

- **project-sidebar.tsx** → **Deleted.** Its rendering logic (5 grouping modes, CompanyGroup, ProjectRow, StageHeader, dropdowns) moves into a new component that renders inside the shared scroll container.
- **gantt-timeline.tsx** → **Major refactor.** Removes the label column. Adopts a "row list" model where it receives a structured row list (project rows + header rows) and renders them in a single scroll container. Tree content renders as sticky-left within each row.
- **page.tsx** → **Moderate changes.** Removes `<ProjectSidebar>` from the layout. Passes sidebar props directly to `<GanttTimeline>`. The outer layout becomes `GanttTimeline | DetailPanel`.
- **demand-chart.tsx** → **No changes.** Receives the same props.
- **capacity-utils.ts** → **No changes.** Same utilities.
- **capacity-data.ts** → **No changes.**

### Revert strategy

Create a git commit with the current working state before starting. A single `git revert <sha>` or `git checkout <sha> -- dashboard/src/app/capacity/` restores everything. No database migrations or external state changes.

---

## Steps

1. **Commit current state** — clean snapshot for easy revert.
2. **Build the row model** — Create a `buildRowList()` utility that takes the grouped/filtered companies and produces an ordered array of typed rows: `{ type: 'stage-header' | 'company-header' | 'project', ... }`. This is the single source of truth for what renders top-to-bottom.
3. **Merge tree into gantt** — Refactor gantt-timeline.tsx to render the row list in a single scroll container. Each row renders sidebar content (sticky-left) + gantt content side by side. Move dropdown controls, stage chips, and company/project tree rendering from project-sidebar.tsx into this structure.
4. **Remove ProjectSidebar** — Delete the import from page.tsx. Remove the separate `<ProjectSidebar>` element. Pass all sidebar state/callbacks to GanttTimeline.
5. **Fix demand chart alignment** — Update the demand axis labels area to match the new sidebar width.
6. **Visual polish** — Verify all 5 grouping modes work, hover highlighting crosses tree↔bar, expand/collapse hides both label and bar.

---

## Files

| File | Action |
|------|--------|
| `capacity/gantt-timeline.tsx` | Major refactor — absorb sidebar tree |
| `capacity/page.tsx` | Remove ProjectSidebar, pass props to GanttTimeline |
| `capacity/project-sidebar.tsx` | Delete (logic moves to gantt-timeline) |
| `capacity/demand-chart.tsx` | No changes |
| `capacity/capacity-utils.ts` | Add `buildRowList()` utility |
| `capacity/capacity-data.ts` | No changes |

---

## Verification

- [ ] All 5 grouping modes render correctly (stage+client, client+stage, stage-only, client-only, flat)
- [ ] Expand/collapse a company hides both tree row and gantt bar
- [ ] Hover a project in the tree highlights its gantt bar and vice versa
- [ ] Stage chips toggle visibility correctly
- [ ] Filter dropdown works
- [ ] Gantt horizontal scroll works with sidebar staying fixed (sticky)
- [ ] Demand chart horizontal scroll syncs with gantt
- [ ] Label column drag-resize works
- [ ] Detail panel opens on project/company click
- [ ] Crosshair hover shows correct data in header KPIs
- [ ] Timeline overlay bands still render correctly
- [ ] `git revert` cleanly restores the pre-merge state
