# Dashboard Vision

> What the dashboard should accomplish, page by page — three core pages, one data model explorer, and two side panels.

| Field | Value |
|-------|-------|
| Status | Draft |
| Owner | whsimonds |
| Last Updated | 2025-03-04 |

---

## Recent Changes

| Date | What changed | Section |
|------|-------------|---------|
| 2025-03-04 | Resolved remaining questions; cross-project deps same as in-sprint; Streams ASCII mockup with timeline scrubber; Ontology auto-generated + editable; Health both footer and ontology; Activity search = filters + full-text; Ask recommends views + generates charts inline; past chat reference TBD | All |
| 2025-03-04 | Resolved most open questions; added Ontology page; Health → footer/integrated; dependency hover; Gantt primary + table secondary; cards replace Gantt on Streams; one panel at a time; Ask uses Opus | All |
| 2025-03-04 | Cut Developers page (deferred); scope down to Tasks, Streams, Health + Activity/Ask panels | All |
| 2025-03-04 | Initial draft | All |

---

## The Platform's Job

Three questions the dashboard must answer at a glance:

1. **What is everybody working on?**
2. **Who is blocked?**
3. **What needs to be done moving forward?**

Everything else is in service of those three questions. If a page or component doesn't help answer them, it doesn't belong.

### Audiences

| Audience | Core question | What they do with the answer |
|----------|--------------|------------------------------|
| **Developers** | "What should I work on next?" | Claim tasks, see blockers, understand context |
| **Engineering leads** | "Is the team on track?" | Re-prioritize, unblock, assign work |

---

## Pages

Three pages + one explorer in the sidebar. Two side panels accessible from anywhere. Health appears both as a footer and integrated into Ontology.

| Page | Sidebar label | Purpose |
|------|--------------|---------|
| Tasks | Tasks | Coordination: what's being worked on, by whom, blockers, dependencies |
| Streams | Streams | Live sessions: who's coding now, concurrency, token cost |
| Ontology | Ontology | Data model explorer: entities, relationships, health, and eventually rules |
| Health | (footer + Ontology) | Data pipeline status — footer indicator on all pages + per-entity dots in Ontology |
| Activity | (side panel) | Session conversation feed, expandable like Ask |
| Ask | (side panel) | Natural language queries with page context, view recommendations, inline charts |

**Default landing page:** Tasks (the coordination view).

**Deferred:** Developers (performance, velocity, skills, online time), Velocity, Team, Skills — add later once coordination views are solid.

---

## Global Filters

A persistent filter bar visible on all pages:

| Filter | Behavior |
|--------|----------|
| **Person** | Filter everything to one developer's work |
| **Project** | Filter to one project/workstream |

These filters carry across page navigation. Selecting "ada" on Tasks and switching to Streams shows only ada's sessions. Clearing a filter shows everything.

### Dynamic Group By

A "Group by" control in the header area (dropdown or toggle) that changes how the main content is organized:

| Group by | Effect |
|----------|--------|
| **Project** | Project → Sprint → Task hierarchy (default for leads) |
| **Developer** | Developer → their tasks across all projects (default for devs) |
| **Status** | Blocked / In Progress / Pending / Done buckets |

The group-by applies to the Tasks page primarily but could extend to Streams as well.

---

## Page-by-Page Goals

### 1. Tasks — Coordination View

**Current state:** Gantt chart grouped by sprint. No project hierarchy, no developer view, no claiming, no time-in-status.

**What it should answer:**

| Question | For whom |
|----------|----------|
| What is everyone working on right now? | Lead, Developer |
| How long has this task been in progress? | Lead |
| What's blocked and why? | Lead, Developer |
| What can I claim next? | Developer |
| What depends on what? | Lead, Developer |
| Which project is behind? | Lead |
| What's the blow-up rate on this task? | Lead |

**Decisions made:**
- **Gantt is the primary visualization.** Table is the secondary — toggle in top left to switch.
- **Leads can assign** tasks to developers (push). **Developers can claim** available tasks (pull). Both directions supported.
- Claiming is **self-serve** — any developer can claim an available task
- Break out by **project and by developer** (via group-by toggle)
- **Remove** contributors table
- Time-in-status visible on in-progress tasks
- Blow-up rate visible per task (actual vs estimated, easy to scan)
- **Horizontal zoom by date** with a well-configured x-axis (smart tick intervals)
- **Hover over dependency lines** to see which task blocks which
- **Visual distinction** between dependencies (this needs to finish first) and blocking dependencies (this is actively blocked). Different line styles or colors.
- **Cross-project dependencies** rendered the same as in-sprint dependencies — a dependency arrow from sprint A to sprint B looks and behaves identically to one within the same sprint.
- **No blocker-clearing notification** — users can see state changes via the live view
- **URL sharing** — deep links to specific tasks, filtered views

---

### 2. Streams — Live Sessions

**Current state:** Gantt timeline of sessions by developer. KPIs: parent sessions, active now, peak concurrency, total tokens.

**What it should answer:**

| Question | For whom |
|----------|----------|
| Who is actively coding right now? | Lead, Developer |
| What is each session doing? (which task, which tool) | Lead |
| What tools are being used, at what frequency, by whom? | Lead |
| How much parallel work is happening? | Lead |
| What's the token cost? | Lead |
| What was happening at a specific point in time? | Lead |

**Layout — live cards + concurrency timeline with time scrubber:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Streams                                    [Person ▾] [Proj ▾] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Active: 7 sessions    Online: 3 devs    Tokens: 142k ($4.20)  │
│                                                                 │
│  Sessions by Developer Over Time                                │
│  6 ┤         ░░                                                 │
│  4 ┤    ░░░░░██░░       ░░░░                             ▼      │
│  2 ┤  ░░████████░░    ░░████░░░░       ░░░░            [NOW]    │
│  0 ┤──████████████░░██████████████░░██████████──────────────│── │
│    └──9am───10am───11am───12pm───1pm───2pm───3pm───4pm──┘      │
│                                                   ▲              │
│                                          drag to scrub           │
│                                                                 │
│  ░ = other devs    █ = filtered dev (or all if no filter)       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ▾ whsimonds (3 sessions)                                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ coordination/#7  │ │ coordination/#12 │ │ rollout/#3      │   │
│  │ Build notif sys  │ │ Wire realtime    │ │ Schema migrate  │   │
│  │ ● ACTIVE  1h 23m │ │ ● ACTIVE  0h 45m │ │ ○ IDLE   0h 12m │   │
│  │ Edit Bash Read   │ │ Read Grep        │ │ Bash            │   │
│  │ 12.4k ($0.37)   │ │ 8.1k  ($0.24)   │ │ 2.1k  ($0.06)  │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│                                                                 │
│  ▾ ada (2 sessions)                                             │
│  ┌─────────────────┐ ┌─────────────────┐                       │
│  │ ask-intel/#4     │ │ dashboard/#2     │                       │
│  │ Query optimizer  │ │ Chart component  │                       │
│  │ ● ACTIVE  2h 10m │ │ ● ACTIVE  0h 33m │                       │
│  │ Read Edit Bash   │ │ Edit Write       │                       │
│  │ 28.3k ($0.85)   │ │ 5.7k  ($0.17)   │                       │
│  └─────────────────┘ └─────────────────┘                       │
│                                                                 │
│  ▾ luke (2 sessions)                                            │
│  ┌─────────────────┐ ┌─────────────────┐                       │
│  │ tech-debt/#3     │ │ tech-debt/#5     │                       │
│  │ Split analytics  │ │ Add purpose docs │                       │
│  │ ● ACTIVE  0h 55m │ │ ○ IDLE   0h 15m  │                       │
│  │ Edit Grep Read   │ │ (no activity)    │                       │
│  │ 9.8k  ($0.29)   │ │ 3.2k  ($0.10)   │                       │
│  └─────────────────┘ └─────────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**How the time scrubber works:**
- Default position: **NOW** (right edge). Shows live active sessions.
- Drag the scrubber left → cards update to show sessions that were active at that historical point.
- The stacked area chart shows session count per developer over time.
- Useful for: "what was happening at 10am?" or "when was peak concurrency?"

**Inactive session detection:**
- A session is **IDLE** if it has no tool calls in the last N minutes but hasn't ended.
- Key signal: the developer has **other active sessions** while this one is idle. That means the developer is online but not working on this particular task — worth surfacing.
- Example: Luke has tech-debt/#3 active (recent tool calls) but tech-debt/#5 idle (no activity for 15m). The card shows this clearly.

**Clicking a card** → opens the Activity side panel scoped to that session.

**Decisions made:**
- Cards **replace** the Gantt timeline on Streams
- Concurrency timeline with **draggable time scrubber** for historical exploration
- Show both **token cost ($) and token counts**
- Tool usage frequency by person visible on cards
- Concurrency per engineer shown in KPI row and as stacked chart
- IDLE = no tool calls recently while session is still open. Highlighted when developer has other active sessions.

**Open questions:**
1. What's the right idle threshold? (5min? 15min? 30min?)
2. Should the concurrency chart be stacked by developer, or total line?

---

### 3. Ontology — Data Model Explorer

**New page.** An interactive graph visualization of all data models and their relationships. Auto-generated from the GraphQL schema.

**What it should answer:**

| Question | For whom |
|----------|----------|
| What data entities exist in the system? | Lead, Developer |
| How do entities relate to each other? | Lead, Developer |
| What fields does a given entity have? | Developer |
| What rules apply to this entity? (Layer 2, future) | Lead |

**Design:**

Force-directed graph showing:
- **Nodes** = entities (Task, Sprint, Project, Developer, Event, Transcript, etc.)
- **Edges** = relationships (Task → Sprint, Task → Developer, Task → Dependencies, etc.)
- **Click a node** → right sidebar expands with entity details: fields, types, description, statistics
- **Read-only sidebar** — view entity details (fields, types, relationships, health status)
- **Search** bar to find entities by name
- **Zoom/pan** for navigation
- **Auto-generated** from the GraphQL schema (introspection or schema parsing)

**Health integration:** Each entity node shows a freshness dot (green/yellow/red) indicating sync status. This makes the Ontology page double as a visual health view — you see at a glance which parts of the data model are stale.

**Evolution path:**
- **Phase 1 (now):** Visualizes Layer 1 — the GraphQL ontology. Entities, fields, relationships auto-derived.
- **Phase 2 (later):** Overlays Layer 2 — the rules engine. Business rules, capacity constraints, assignment logic, risk signals attached to entities.

**Decisions made:**
- Auto-generated from schema (not hand-curated)
- Click to expand entity details in right sidebar (**read-only**)
- Health freshness dots on each entity node
- No strong library preference — pick whatever renders all nodes well (D3 force, cytoscape, react-flow, etc.)
- Editing deferred to Phase 2 (rules engine)

**Open questions:**
3. How do edits to the ontology persist? (write back to schema? separate override layer? just visual annotations?)

---

### 4. Health — Footer + Ontology Integration

**Current state:** Standalone page with 5 sync streams and freshness indicators.

**Decision:** Health appears in **two places**:
1. **Footer widget** on all pages — aggregate pipeline status (green/yellow/red) with expand-on-click for stream details
2. **Ontology integration** — per-entity freshness dots on graph nodes

The standalone Health page route can remain as a fallback, but the primary interactions are through the footer and Ontology.

---

### 5. Activity — Side Panel

**Current state:** Full page with scrollable conversation feed, developer filter, date grouping.

Activity is a **side panel** accessible from any page, matching the Ask panel pattern:
- Resizable right drawer
- Expandable to full-screen (like Ask has the `/ask` route)
- Shows the **full conversation feed** (not a summarized view)
- Tool call badges, user/assistant messages
- Scoped by the global person/project filters
- When opened from a Streams session card, scopes to that specific session

**Search:** Filter bar at top with structured filters (tool type, date range, developer) **plus** full-text search across message content. Filter bar handles the common cases; full-text handles the rest.

**Only one panel open at a time** — Activity and Ask share the same panel slot. Opening one closes the other.

---

### 6. Ask — Contextual Side Panel

**Current state:** Side panel + full-screen chat. Uses Claude to query ontology. Multi-turn conversations.

**Context injection — the Ask panel should know:**

| Context | How to inject |
|---------|--------------|
| **Current date/time** | Add to system prompt |
| **Current page + route** | Pass active route to the API |
| **Active filters** | Pass person/project filter state |
| **Visible data** | Pass summary of what's currently rendered (e.g., task list, KPI values) |
| **Selected entity** | If a task detail sheet is open, include that task's context |
| **Past conversations** | Reference or search previous Ask chats |

**New capabilities:**
- **Recommend views** — Ask can suggest navigating to a specific page or applying specific filters. (e.g., "Try the Tasks page filtered to sprint=coordination, grouped by status" with a clickable link.)
- **Generate charts inline** — Ask can render charts directly in the conversation (already partially implemented with `generate_chart` tool; needs polish).
- **Past conversation reference** — Ask should be able to see/search previous conversations. Implementation approach TBD — this is a solved problem in the industry (conversation embeddings, recent chat list, semantic search over history). Worth researching best practices before building.

**Decisions made:**
- Inject **both route and visible data** as context
- **Past chat reference** — yes, research best implementation approach
- **Model: Opus** — use the most capable model regardless of query complexity
- **View recommendations** — Ask suggests dashboard views/filters to the user
- **Inline charts** — Ask generates charts in the conversation
- **Proactive alerts deferred** — will build toward a "radar" mode later, not now
- **One panel at a time** — shares slot with Activity

---

## Real-Time Strategy

Pragmatic mix — realtime where it matters for coordination, polling where it doesn't:

| Page/Panel | Method | Rationale |
|------------|--------|-----------|
| Tasks | Supabase realtime | Coordination needs instant updates — claiming, status changes |
| Streams | Supabase realtime | Live session awareness needs to be instant |
| Activity | Polling (10s) | Historical feed, not time-critical |
| Health | Polling (30s) | Pipeline status, not time-critical |
| Ask | On-demand | Only fires when user sends a query |

---

## What We Know So Far

| Decision | Source |
|----------|--------|
| Palantir dark-only theme (bg #1C2127, 2px radius, 14px font, dense) | Implemented |
| **Pages: Tasks, Streams, Ontology + Health footer + Activity/Ask panels** | This session |
| **Default landing page: Tasks** | This session |
| **Cut: Velocity, Team, Skills, Developers** (add later) | This session |
| Global person + project filter across all pages | This session |
| Dynamic group-by (project, developer, status) | This session |
| Tasks: Gantt primary, table secondary (toggle top-left) | This session |
| Tasks: leads assign + developers claim (push and pull) | This session |
| Tasks: hover dependency lines to see blocker details | This session |
| Tasks: visual distinction between dependencies vs blocking dependencies | This session |
| Tasks: cross-project deps rendered same as in-sprint deps | This session |
| Tasks: no blocker-clearing notifications | This session |
| Tasks: horizontal zoom by date, well-configured x-axis | This session |
| Tasks: remove contributors table | This session |
| Tasks: time-in-status, blow-up rate per task | This session |
| Tasks: URL sharing (deep links to tasks, filtered views) | This session |
| Streams: session cards replace Gantt timeline | This session |
| Streams: concurrency timeline with draggable time scrubber | This session |
| Streams: show token cost ($) and token counts | This session |
| Streams: tool usage frequency by person | This session |
| Streams: concurrency per engineer | This session |
| Streams: IDLE threshold = 5 minutes of no tool calls | This session |
| Streams: IDLE detection (no tool calls + developer active elsewhere) | This session |
| Streams: concurrency chart = stacked area by developer | This session |
| Ontology: auto-generated from GraphQL schema | This session |
| Ontology: click to expand in right sidebar, read-only (editing in Phase 2) | This session |
| Ontology: health freshness dots on entity nodes | This session |
| Health: both footer indicator AND ontology integration | This session |
| Activity: side panel, full conversation feed | This session |
| Activity: search = filter bar (tool, date, dev) + full-text | This session |
| Activity + Ask: one panel open at a time (shared slot) | This session |
| Ask: inject route + visible data + filters + selected entity | This session |
| Ask: past chat reference (research best approach) | This session |
| Ask: use Opus model | This session |
| Ask: recommends views/filters to navigate to | This session |
| Ask: generates charts inline | This session |
| Ask: proactive alerts deferred (radar mode later) | This session |
| Realtime for Tasks + Streams; polling for Activity + Health | This session |
| Ask panel accessible from every page | Implemented |

---

## Open Questions

All resolved. No open questions remaining.

1. ~~What's the right idle threshold for Streams session cards?~~ **Resolved: 5 minutes.**
2. ~~Should the Streams concurrency chart be stacked by developer, or a total line?~~ **Resolved: Stacked area chart by developer.**
3. ~~How do edits to the Ontology persist?~~ **Resolved: Read-only for Phase 1. Editing deferred to Phase 2 (rules engine).**
