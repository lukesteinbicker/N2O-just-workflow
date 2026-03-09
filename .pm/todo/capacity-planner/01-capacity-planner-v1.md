# Port Capacity Planner to Dashboard

> Bring the existing capacity planner prototype (platform/reference/) into the Next.js dashboard as a full-bleed page at `/capacity`, using JSON data and matching the Palantir theme.

| Field | Value |
|-------|-------|
| Status | Draft |
| Owner | Wiley |
| Last Updated | 2026-03-08 |
| Depends On | None |
| Enables | Attio pipeline sync, dynamic supply model, assignment tracking |

---

## Goal

Give Wiley a live capacity planner inside the N2O dashboard that answers three questions at a glance: (1) how many engineers are needed and when, (2) which projects require a "not yet" conversation if hiring lags, and (3) where flex capacity exists for internal work. The prototype already works as a standalone JSX file — this spec ports it into the dashboard's component architecture with proper theming.

---

## Current State

- **Prototype exists**: `platform/reference/n2o-capacity-planner.jsx` — 490-line monolithic component with inline data, inline styles, its own color system (#060B10 bg)
- **Data exists**: `platform/reference/n2o-capacity-data.json` — 12 companies, ~15 projects with seats/probability/dates
- **Strategic docs exist**: `n2o-capacity-plan.md` (demand analysis) and `n2o-supply-capacity-tracking.md` (supply model + roadmap)
- **Dashboard has patterns**: Full-bleed pages (ontology), KPI cards, sidebars, detail panels, Palantir theme
- **No database schema yet**: Capacity data is not in the platform GraphQL API

---

## Design

**Port the prototype faithfully, adapting only what's needed for dashboard integration.** The user has thought through the UX extensively — the reference design is the spec.

### What changes from the prototype

1. **Theme adaptation** — Replace the prototype's custom dark palette (#060B10 bg, #0C1220 panel) with the dashboard's Palantir variables (#1C2127 bg, #252A31 surface). Keep the probability color system (green → yellow → orange → red → purple) as-is — it's domain-specific and well-designed.

2. **Component decomposition** — Break the monolith into proper files:

   ```
   dashboard/src/app/capacity/
   ├── page.tsx              # Main container, state, layout (full-bleed)
   ├── capacity-data.ts      # TypeScript types + JSON data import
   ├── capacity-utils.ts     # Date math, color helpers, tick generation
   ├── capacity-header.tsx   # KPI bar with hover-reactive metrics
   ├── project-sidebar.tsx   # Left sidebar (company/status grouping, checkboxes)
   ├── gantt-timeline.tsx    # Gantt chart with project bars + label column
   ├── demand-chart.tsx      # Stacked area SVG chart with supply line
   └── detail-panel.tsx      # Right sidebar (company overview / project editor)
   ```

3. **Font** — Use Geist Sans (dashboard's font) instead of DM Sans. Remove the Google Fonts import.

4. **Scrollbar** — Use the dashboard's `scrollbar-thin` class instead of custom `::-webkit-scrollbar` styles.

5. **Navigation** — Add `/capacity` to the sidebar nav with a lucide icon.

### What stays the same

- **Layout structure**: Header → (Sidebar | Center [Gantt + Demand] | Detail Panel). Full-bleed, fills viewport.
- **Gantt chart**: Project bars on a shared pixel-aligned timeline with tick marks adapting per granularity (monthly/weekly/daily).
- **Stacked area demand chart**: Raw SVG with probability-colored layers, supply line, today marker, crosshair hover with gap badge.
- **Left sidebar**: Company/status group toggle, expand/collapse, checkboxes with tri-state (all/some/none), project rows with probability dots.
- **Right detail panel**: Company overview with project tabs → project detail with editable fields. Appears on selection.
- **Crosshair interaction**: Hover either panel, see date + KPIs update in header. Dot on demand curve, gap badge at supply line.
- **Granularity dropdown**: Monthly / Weekly / Daily with timeline width adjusting via pixels-per-day.
- **Label column resize**: Draggable divider between labels and timeline.
- **Data shape**: Same JSON structure from `n2o-capacity-data.json`.
- **Probability color scale**: 100%=green, 90%=light-green, 80%=yellow, 70%=orange, 40%=red, 20%=deep-red, 10%=purple.

### Data layer (v1)

For v1, the JSON data file is imported directly — no GraphQL, no database. The data is copied from `platform/reference/n2o-capacity-data.json` into `capacity-data.ts` as a typed constant.

#### Timeline overlays

The data model includes an `overlays` array for notable periods that display as shaded regions on the Gantt timeline and demand chart. These are purely visual — they don't modify the supply line or any calculations. They exist so you can see "finals start here" or "summer break runs through here" and make staffing decisions yourself.

```ts
interface TimelineOverlay {
  id: string;
  label: string;       // e.g. "Final Exams", "Summer Break"
  start: string;       // ISO date
  end: string;         // ISO date
  color?: string;      // optional override; defaults to a subtle neutral
  notes?: string;
}
```

Overlays render as translucent vertical bands spanning both the Gantt and demand chart, with a small label at the top. The actual capacity impact of each period varies per person (some students gain availability in summer, finals hit different schools at different times), so the overlay is context for the human — not an input to the model.

**Initial overlays:**

```ts
overlays: [
  { id: "finals-sp26", label: "Finals", start: "2026-05-04", end: "2026-05-15", notes: "Spring semester final exams" },
  { id: "summer-26", label: "Summer Break", start: "2026-05-16", end: "2026-08-24", notes: "Summer vacation period" },
  { id: "finals-fa26", label: "Finals", start: "2026-12-07", end: "2026-12-18", notes: "Fall semester final exams" },
]
```

Future iterations will:
- Add a `capacity_projects` table to the platform database
- Expose it via GraphQL
- Sync from Attio CRM

### Out of scope (future specs)

- **Unified sidebar + gantt labels** — Merge the ProjectSidebar and gantt label column into a single left panel where each project row aligns 1:1 with its gantt bar. Stage headers ("ACTIVE CLIENTS", "PROSPECTIVE") become thin dividers spanning both the sidebar and gantt. Company headers expand/collapse their children in both panels simultaneously. Eliminates the duplicative project name columns. This is the "Option B" approach — most polished result but a meaningful layout refactor touching ProjectSidebar, GanttTimeline, and scroll sync logic.
- Dynamic supply model (per-person availability curves, academic calendar adjustments) → future spec
- Attio CRM integration → future spec
- Variable seat phases → future spec
- Assignment tracking (who is on what) → future spec
- Scenario save/load → future spec
- Project milestones + due dates (per-project milestone tracking with deadlines) → future spec
- Churn modeling → future spec

---

## Implementation Plan

| # | Task | Done When |
|---|------|-----------|
| 1 | Create data layer + utilities | `capacity-data.ts` exports typed DATA constant + TypeScript interfaces. `capacity-utils.ts` exports date math, color helpers, tick generation, daily builder. All pure functions from the reference extracted and typed. |
| 2 | Build the page shell + header + sidebars | `page.tsx` renders full-bleed layout with all state management. `capacity-header.tsx` renders KPI bar with hover-reactive metrics. `project-sidebar.tsx` renders left sidebar with company/status grouping. `detail-panel.tsx` renders right panel with company overview and project editor. Navigation updated in sidebar.tsx. Page is visually correct with static layout. |
| 3 | Build the Gantt timeline + demand chart | `gantt-timeline.tsx` renders project bars on pixel-aligned timeline with tick marks, today marker, crosshair. `demand-chart.tsx` renders stacked area SVG with supply line, probability-colored layers, hover dot + gap badge. Crosshair hover syncs across both panels and updates header KPIs. Granularity toggle works (monthly/weekly/daily). Label column resize works. |
| 4 | Integration test + theme polish | All components wired together. Theme adapted to Palantir palette. Font is Geist Sans. Scrollbars use `scrollbar-thin`. Full interactive walkthrough: hover crosshair, toggle projects, switch grouping, edit project details, change granularity. Visual parity with the reference prototype. |

---

## Open Questions

1. ~~Which lucide icon for the nav?~~ **Resolved**: `BarChart3`.
2. ~~Should the prototype's slightly darker bg (#060B10) be preserved as a page-specific override, or fully adopt the dashboard's #1C2127?~~ **Resolved**: Use dashboard's #1C2127 — full consistency.

---

## References

- Reference prototype: `platform/reference/n2o-capacity-planner.jsx`
- Reference data: `platform/reference/n2o-capacity-data.json`
- Demand analysis: `platform/reference/n2o-capacity-plan.md`
- Supply model + roadmap: `platform/reference/n2o-supply-capacity-tracking.md`
- Ontology page (full-bleed pattern): `dashboard/src/app/ontology/page.tsx`
- Dashboard theme: `dashboard/src/app/globals.css`
