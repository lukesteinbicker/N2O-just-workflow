# Data Platform

> A three-layer data platform (Ontology, Rules Engine, Intelligence) that makes all N2O project data queryable, actionable, and LLM-accessible through a single GraphQL endpoint.

| Field | Value |
|-------|-------|
| Status | Active — Layer 1 shipped, Layer 3 scoping |
| Owner | Wiley |
| Last Updated | 2026-03-03 |
| Depends On | `../done/observability.md`, `workflow-dashboard.md`, `coordination.md` |
| Enables | Roadmap Goal 8 (Ubiquitous Access), dynamic dashboards, natural language project queries |

---

## Table of Contents

- [Recent Changes](#recent-changes)
- [Current State](#current-state)
- [Vision](#vision)
- [Design](#design)
  - [Layer 1: Ontology (GraphQL API)](#layer-1-ontology-graphql-api)
  - [Layer 2: Rules Engine](#layer-2-rules-engine)
  - [Layer 3: Intelligence (LLM)](#layer-3-intelligence-llm)
  - [Pre-Built Dashboards](#pre-built-dashboards)
- [Schema](#schema)
- [Implementation Plan](#implementation-plan)
- [Open Questions](#open-questions)
- [References](#references)

---

## Recent Changes

| Date | What changed | Section |
|------|-------------|---------|
| 2026-03-03 | Major status update: Layer 1 is live (Apollo Server, 65+ GraphQL fields, 30+ views, 9 migrations). Rewrote Current State. Collapsed Phases 0-1 into "Complete." Phase 2 (Intelligence) is now active work. Replaced Databricks chat migration plan with `assistant-ui` (`@assistant-ui/react`) as the chat frontend — clean build on existing Next.js dashboard, no adapter swap needed. Resolved Open Question #13. Updated #2 (Supabase sync partially shipped). | [Current State](#current-state), [Implementation Plan](#implementation-plan), [Layer 3](#layer-3-intelligence-llm), [Open Questions](#open-questions) |
| 2026-02-23 | Major model revision: UUID projects with flexible metadata, dynamic skill tree (not 6 fixed integers), numeric complexity, minutes not hours, developer context tracking (concurrent sessions, alertness, time-of-day), effectiveness as relative-to-mean multiplier, removed source from availability | [Schema](#schema), [Design](#design) |
| 2026-02-23 | Layer 3 no longer depends on Layer 2 — can ship with ontology-only LLM queries, rules enhance later | [Implementation Plan](#implementation-plan), [Layer 3](#layer-3-intelligence-llm) |
| 2026-02-23 | Added multi-signal reasoning requirements to Layer 2 (DLA analogy, N2O worked example), GraphQL→graph DB migration path in Layer 1, chat component backend migration note. Removed GPS references — designing rules engine independently, see `rules-engine.md` | [Layer 1](#layer-1-ontology-graphql-api), [Layer 2](#layer-2-rules-engine), [Open Questions](#open-questions) |
| 2026-02-23 | Initial draft | All |

---

## Current State

### Layer 1 (Ontology) — Live

The GraphQL API is operational. Apollo Server 5 (TypeScript) + better-sqlite3, running on port 4000.

**Schema coverage:**
- **65+ GraphQL fields** across Query and Mutation types
- **30+ SQL views** for analytics (velocity, quality, estimation, skills, phases, concurrency, health)
- **Entity resolvers** with nested relationships: Task, Sprint, Project, Developer
- **Mutations** for availability, skills, context snapshots, and activity logging
- **Conversation feed** resolver parsing JSONL transcripts with tool call summarization
- **Session timeline** for Gantt-style developer activity views
- **Data health** monitoring endpoint

**Database:**
- **11 tables**: tasks, developers, task_dependencies, workflow_events, transcripts, skill_versions, projects, sprints, developer_skills, developer_context, contributor_availability, activity_log, developer_twins_local
- **9 migrations** applied (002 through 009): skill quality, versioning, data platform foundations, data completeness, comprehensive JSONL extraction, session context, transcript sync, sync resilience
- **Supabase sync** for transcripts (migrations 008-009): `synced_at`, `sync_attempts`, `sync_error` columns

**Dashboard (Next.js 16, port 3000):**
- Observatory, Velocity, Skills, Team, Activity, Streams, Tasks pages
- Activity feed with developer filtering, tool call badges, 10s polling
- Session timeline Gantt charts

**What's still on paper (Layer 1 gaps):**
- ~~`estimated_hours` → `estimated_minutes` column migration~~ **Done** — column renamed, views updated
- `complexity` TEXT → REAL numeric migration
- Developer table: old `skill_*` integer columns not yet dropped (coexist with `developer_skills` table)
- `baseline_competency` not yet on `developers` table (exists on `developer_twins_local`)

### Layer 2 (Rules Engine) — Designed, not built

Architecture spec in `rules-engine.md`. No implementation yet.

### Layer 3 (Intelligence) — Not built, ready to scope

The ontology is rich enough to answer real questions. This is the active work item — see [Implementation Plan](#implementation-plan).

---

## Vision

Three layers, inspired by Palantir's Foundry, built incrementally on the existing SQLite foundation.

**Layer 1 — Ontology**: A GraphQL API that serves as the semantic data model. All entities and relationships queryable through a single endpoint. Schema introspection lets LLMs discover the data model without documentation.

**Layer 2 — Rules Engine**: Business logic encoded as composable, testable rules that combine multiple signals into weighted confidence scores. Capacity ("Luke can take 5 more tasks this week"), assignment ("best fit for this task"), risk ("sprint is at-risk"), forecasting ("finishes Wednesday at current pace"). Detailed design in `rules-engine.md`.

**Layer 3 — Intelligence**: An LLM with read access to the Ontology and execute access to Rules. Powers natural language queries ("how's the sprint?") and dynamic dashboard generation — dashboards assembled from data + rules + visualization primitives, not pre-built templates.

Each layer is independently valuable. The Ontology alone replaces direct SQLite access. The Rules Engine alone replaces manual spreadsheet forecasting. The Intelligence layer is thin — it connects human intent to data and logic.

---

## Design

### Layer 1: Ontology (GraphQL API)

The GraphQL schema IS the ontology. Every entity, property, and relationship is explicit, queryable, and self-documenting via introspection.

**Entities and sources:**

| Entity | Source | New/Existing |
|--------|--------|-------------|
| Task | `tasks` table | Existing (modify: numeric complexity, estimated_minutes) |
| Sprint | text labels on tasks | **New `sprints` table** — datetimes, deadlines, computed progress |
| Project | none | **New `projects` table** — UUID PK, flexible metadata JSON, GitHub linking |
| Developer | `developers` table | Existing (modify: drop fixed skill columns, add baseline_competency) |
| DeveloperSkill | none | **New `developer_skills` table** — hierarchical skill tree (category/skill/rating) |
| DeveloperContext | none | **New `developer_context` table** — concurrent sessions, alertness, time-of-day |
| Availability | external custom system | **New `contributor_availability` table** — minutes, relative effectiveness |
| Event | `workflow_events` table | Existing |
| Transcript | `transcripts` table + JSONL files | Existing |
| Dependency | `task_dependencies` table | Existing |
| Activity | none | **New `activity_log` table** |
| SkillVersion | `skill_versions` table | Existing |

**Key relationships** (what makes this an ontology, not just tables):
- Task → Sprint → Project (containment)
- Task → Developer (assignment, via `owner`)
- Task → Task (dependencies, via `task_dependencies`)
- Task → Event[] (telemetry, via `workflow_events`)
- Task → Transcript[] (session recordings)
- Developer → DeveloperSkill[] (hierarchical skill tree: category → skill → rating)
- Developer → DeveloperContext[] (point-in-time snapshots: sessions, alertness, environment)
- Developer → Availability[] (daily capacity in minutes, relative effectiveness)
- Developer → Task[] (current + historical work)
- Project → Sprint[] (containment)
- Project → metadata (flexible JSON: documents, links, configuration)
- Sprint → Forecast (computed from rules engine or ontology views)

**Tech stack:**
- Apollo Server 4 (TypeScript) — mature, good introspection, plugin ecosystem
- better-sqlite3 — synchronous SQLite access, no async overhead
- DataLoader — batches nested queries (prevents N+1)
- Start SQLite, add Postgres/Supabase adapter for online multi-user later

**Data store migration path (GraphQL → Graph DB):**

GraphQL was chosen because schema introspection lets LLMs discover the data model, and nested queries match relational data well. However, GraphQL is a **data retrieval** layer, not an **inference** layer. As ontological reasoning becomes more central (see Layer 2 multi-signal reasoning below), the backing store may need graph-native query capabilities.

The migration path is clean because of how the layers are isolated:
- **Layer 3 (LLM/chat)** calls `query_ontology` — doesn't know what's behind it
- **Layer 1 (Ontology)** is the only layer that touches the data store — resolvers today wrap SQLite, tomorrow could wrap Neo4j/Cypher
- **Dashboards** query GraphQL — if the schema stays the same but the backing store changes, the frontend is untouched

Sequence: ship with SQLite/Postgres behind GraphQL (current plan) → discover where relational queries get painful (likely multi-hop reasoning like "find all developers who've worked on tasks similar to this one in sprints where velocity was above average") → stand up a graph DB, migrate data, rewrite resolvers. Everything above Layer 1 stays untouched.

**Key constraint**: do not encode inference logic in SQL views. Keep reasoning in the rules engine, keep data access behind the GraphQL boundary. SQL views should compute aggregates (sprint progress, velocity), not make decisions (who should take this task). If this boundary is maintained, the graph DB port stays mechanical.

**Example query** (what Layer 1 enables):

```graphql
query {
  sprint(name: "auth-sprint") {
    deadline
    progress { totalTasks, completed, percentComplete, remainingMinutes }
    tasks {
      title
      status
      complexity          # numeric (e.g. 3.2), not "low"/"medium"/"high"
      estimatedMinutes
      owner {
        name
        baselineCompetency
        skills(category: "frontend") { skill, rating }
        context(latest: true) { concurrentSessions, alertness }
        velocity { avgMinutes, blowUpRatio }
      }
      dependencies { title, status }
      transcripts {
        messages(types: [USER, ASSISTANT], limit: 3) {
          type
          content { ... on TextBlock { text } }
        }
      }
    }
  }
}
```

One request, all the data, exactly the shape needed. Note `blowUpRatio` = actual_minutes / estimated_minutes — a value of 1.0 means perfect estimation, 2.5 means the task took 2.5x longer than expected.

### Layer 2: Rules Engine

Detailed design in `rules-engine.md`. This section captures requirements; the separate spec covers the Software 1.0/2.0/3.0 architecture.

**What the rules engine needs to do:**

| Category | Example | Input | Output |
|----------|---------|-------|--------|
| Capacity | "Can Luke take another task?" | Availability, active tasks, estimates | Boolean + reason |
| Assignment | "Best developer for this task" | Task type, developer skills, working sets | Ranked list |
| Risk | "Is this sprint at risk?" | Progress, velocity trend, remaining capacity | Risk level + factors |
| Forecast | "When will auth feature be done?" | Remaining tasks, velocity, availability | Date range |
| Alerting | "What needs attention?" | Blocked tasks, stale tasks, at-risk sprints | Prioritized alerts |

**Architectural principles:**
- **Declarative** — rules read like sentences, not code
- **Composable** — complex rules build on simple ones ("best developer" = skill_match + availability + context_continuity)
- **Testable** — every rule can be unit tested with mock data
- **Explainable** — when a rule fires, it says why

**Multi-signal reasoning (the real goal):**

The rules engine needs to go beyond single-signal deterministic checks ("is capacity available? yes/no"). The real value is **combining multiple contextual signals to produce a weighted confidence score with an explanation chain** — the same pattern used in ontological reasoning systems.

*Analogy — DLA scrap metal identification:* The Defense Logistics Agency has warehouses of unidentified parts. Visual analysis might say a part is equally likely to be from an F-35 or an A-10 Warthog. But the ontology knows this warehouse is in Kentucky, and Kentucky has A-10s but no F-35s. That contextual prior shifts the confidence from 50/50 to ~95% A-10. The ontology doesn't just store facts — it encodes relationships that shift probability when you combine them.

*N2O equivalent — "Who should take task #7 (fix auth token refresh)?"*

Single-signal answer (insufficient): Check skill match. Luke has `backend: 4.2`, Sarah has `backend: 3.8`. Assign to Luke.

Multi-signal answer (what we need):

| Signal | Source | Evidence | Direction |
|--------|--------|----------|-----------|
| Skill match | `developer_skills` | Luke: backend 4.2, Sarah: backend 3.8 | Luke slightly favored |
| Current context | `developer_context` | Luke: 4 concurrent sessions, alertness 0.4. Sarah: 1 session, alertness 0.9 | Sarah strongly favored |
| Sprint familiarity | `tasks` (history) | Luke has 0 tasks in this sprint. Sarah has completed 3 related auth tasks | Sarah strongly favored |
| Blow-up ratio | `effective_velocity` | Luke's auth tasks: 2.8x blowup. Sarah's: 1.1x | Sarah strongly favored |
| Availability | `contributor_availability` | Luke: 30 min remaining today. Sarah: 120 min | Sarah favored |

Combined inference: Despite Luke's slightly higher skill rating, Sarah is the better assignment with high confidence — context familiarity, availability, focus state, and historical accuracy all align. One signal says Luke; four contextual signals overwhelm it. This is the Kentucky/A-10 pattern applied to developer assignment.

**What this requires from the rules engine:**

1. **Rules produce weighted signals, not final answers.** Each rule contributes a score and a confidence, not a boolean. The composition layer combines them.
2. **A signal combination mechanism.** Could be weighted scoring, Bayesian inference, or learned weights. See `rules-engine.md` for the Software 1.0→2.0→3.0 progression.
3. **Contextual priors as first-class inputs.** `developer_context` isn't just a standalone data source — it modifies every other rule's output. A skill rating of 4.2 means something different at alertness 0.9 vs 0.4.
4. **Explanation chains.** For multi-signal decisions: "Here are the 5 signals I combined, here's how they weighted, here's why the conclusion follows." This is what makes the system trustworthy and debuggable.

**Detailed design:** See `rules-engine.md` for how signals combine, the Software 1.0/2.0/3.0 progression, and the confidence scoring architecture.

### Layer 3: Intelligence (LLM)

The thinnest layer. **Depends on Layer 1 only. Enhanced by Layer 2 when available.**

**Audience:** Admin-only tool for project leads. Not developer-facing.

#### Chat Frontend: assistant-ui

[assistant-ui](https://www.assistant-ui.com/) (`@assistant-ui/react`) — a composable React library for AI chat interfaces. Replaces the prior plan to migrate the Databricks chat component.

**Why assistant-ui:**
- Composable primitives (inspired by Radix UI) — not a monolithic chat widget
- Built-in streaming, auto-scroll, markdown, code syntax highlighting
- **Generative UI** — maps LLM tool calls to custom React components (e.g., render a chart when `generate_chart` is called, render a data table for `query_ontology` results)
- **LocalRuntime** with `ChatModelAdapter` — connects to any custom backend via a simple adapter interface
- Works with Next.js (already our dashboard framework)
- MIT licensed, active development (YC-backed)

**UX design (reference: Ramp's "Ask Ramp"):**
- Trigger: button at bottom-left of sidebar with sparkle icon + "Ask N2O" label
- Click opens a right-side chat panel (~350px wide), sidebar auto-collapses to icon-only to make room
- Chat panel header: "New chat" dropdown, expand-to-fullscreen icon, close (X) icon
- Greeting with contextual suggested questions (e.g., "How's the current sprint?", "Who has capacity?")
- Input at bottom: "Ask a question" placeholder, attachment icon, send icon
- Closing the panel restores the sidebar to its expanded state
- Panel is accessible from any page — it's a layout-level component, not a route

**Integration pattern:**
```
dashboard/src/components/ask-panel.tsx   ← Layout-level chat panel (not a page route)
  └─ AssistantRuntimeProvider             ← assistant-ui runtime wrapper
       └─ Thread                          ← Chat thread component
            ├─ ThreadMessages             ← Message list (streaming, markdown)
            └─ Composer                   ← Input with send button

dashboard/src/components/sidebar.tsx     ← Existing sidebar, add trigger button
  └─ AskButton (bottom-left)             ← Toggles panel open/closed + sidebar collapse
```

The `ChatModelAdapter` calls a backend endpoint that:
1. Receives the conversation (user question + history)
2. Sends it to Claude with the GraphQL schema as system context
3. Claude generates GraphQL queries using `query_ontology` tool
4. Backend executes queries against the existing Apollo Server
5. Claude formats the answer and optionally calls `generate_chart`
6. Streams the response back to assistant-ui

#### Backend Tools

LLM tools that grow as layers ship:

| Tool | What it does | Layer | Available |
|------|-------------|-------|-----------|
| `query_ontology` | Execute a GraphQL query against the existing API | Layer 1 | Phase 2 (now) |
| `generate_chart` | Produce a visualization spec from query results | Viz library | Phase 2 |
| `execute_rule` | Run a named rule with parameters | Layer 2 | Phase 3 (when rules engine ships) |

#### What's answerable today (Layer 1 only)

| Question | GraphQL query |
|----------|--------------|
| "What's Ella working on?" | `tasks(owner: "ella")` |
| "How's the sprint?" | `sprint(name: "X") { progress { ... } }` |
| "Who has the most reversions?" | `developerQuality` |
| "Which tasks blew up?" | `blowUpFactors` |
| "What skills are being used?" | `skillUsage` |
| "Show me today's session activity" | `sessionTimeline(dateFrom: "...")` |
| "What's the estimation accuracy by type?" | `estimationAccuracyByType` |
| "Show me audit findings for Luke" | `commonAuditFindings(owner: "luke")` |

#### What requires Layer 2 (additive, no rewiring)

- "When will the sprint finish?" — calls forecast rule
- "Who should take this task?" — calls assignment rule
- "Is anything at risk?" — calls risk detection rule

#### Data coverage gaps

Questions we want to answer but can't yet:
- "What is each developer doing *right now*?" — needs real-time session status, not just historical transcripts
- Time-windowed aggregate queries ("What did the team do last week?") — most analytics views lack date range filters; need to add `dateFrom`/`dateTo` params to key queries

#### Natural language query flow

1. Admin: "How's the sprint?"
2. Backend sends question + GraphQL schema to Claude
3. Claude constructs + executes `query_ontology` (GraphQL query)
4. If rules engine available, evaluates relevant rules (risk, forecast)
5. Claude formats human-readable answer
6. Optionally calls `generate_chart` → assistant-ui renders via Generative UI
7. Response streams back to the chat thread

### Pre-Built Dashboards

Default views powered by the Ontology (from `workflow-dashboard.md`):

1. **Board View** — Kanban with TDD phases, task claiming
2. **Graph View** — dependency visualization
3. **Activity Feed** — real-time from `activity_log`
4. **Velocity Dashboard** — team/individual metrics, trends
5. **AI Metrics** — contribution tracking, quality correlation
6. **Project Rollup** — cross-project summary

These are "saved queries" — pre-configured dashboard layouts that anyone can use without asking questions. Dynamic dashboards supplement, not replace, these.

---

## Schema

Changes to existing tables and new tables needed before building the API. These go in migration files.

### Changes to existing tables

**`tasks`** — two column changes:
- `complexity`: TEXT enum (`low`/`medium`/`high`/`unknown`) → **REAL numeric** (e.g. 1.0-10.0). Allows continuous scoring, machine-learned values, and meaningful comparisons. Migration: map low=2.0, medium=5.0, high=8.0, unknown=NULL.
- ~~`estimated_hours` → **`estimated_minutes`** REAL~~ **Done**. Minutes are the natural unit for AI-assisted tasks (most complete in 15-90 min, not 1-8 hours). All velocity views updated.

**`developers`** — structural change:
- **Drop** fixed skill columns (`skill_react`, `skill_node`, `skill_database`, `skill_infra`, `skill_testing`, `skill_debugging`). Replaced by `developer_skills` table (see below).
- **Add** `baseline_competency REAL` — general aptitude score (0.0-10.0), assessed periodically. Correlates with task velocity and estimation accuracy across all skill domains. Think of it as a general cognitive performance baseline.
- **Add** `competency_assessed_at DATETIME` — when baseline was last measured.

### New tables

```sql
-- Multi-project support
-- UUID primary key, flexible metadata JSON for documents/links/config
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    description TEXT,
    repo_url TEXT,                       -- GitHub repo (e.g. 'https://github.com/org/repo')
    start_at DATETIME,
    end_at DATETIME,
    status TEXT DEFAULT 'active',
    metadata TEXT,                       -- JSON blob: specs, documentation links, config, etc.
                                         -- e.g. {"spec_path": "specs/auth.md", "linear_team": "ENG"}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('planning', 'active', 'completed', 'archived'))
);

-- Sprint metadata (currently just text labels on tasks)
-- Datetimes (not dates) for precise scheduling
CREATE TABLE IF NOT EXISTS sprints (
    name TEXT PRIMARY KEY,
    project_id TEXT,
    start_at DATETIME,
    end_at DATETIME,
    deadline DATETIME,
    goal TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    CHECK (status IN ('planning', 'active', 'completed', 'cancelled'))
);

-- Hierarchical skill tree for developers
-- Replaces the 6 fixed integer columns on developers table.
-- Category/skill pairs form a tree: "Frontend > React", "Backend > Node", "DevOps > Docker"
-- Rating is 0.0-5.0 REAL (not integer) for precision (e.g. 3.7, not just 3 or 4)
CREATE TABLE IF NOT EXISTS developer_skills (
    developer TEXT NOT NULL,
    category TEXT NOT NULL,              -- Top level: 'frontend', 'backend', 'devops', 'data', etc.
    skill TEXT NOT NULL,                 -- Specific: 'react', 'node', 'postgres', 'docker', etc.
    rating REAL NOT NULL,                -- 0.0-5.0 continuous
    source TEXT DEFAULT 'manager',       -- 'manager', 'calculated', 'self'
                                         -- 'calculated' = derived from task performance data
    evidence TEXT,                       -- JSON: relevant task IDs, notes, examples
    assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (developer, category, skill),
    FOREIGN KEY (developer) REFERENCES developers(name),
    CHECK (rating >= 0.0 AND rating <= 5.0)
);

-- Developer context: point-in-time snapshots of working conditions
-- Captures factors that affect velocity on any given task:
-- concurrent sessions, time of day, alertness/mental awareness
CREATE TABLE IF NOT EXISTS developer_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    developer TEXT NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    concurrent_sessions INTEGER DEFAULT 1,  -- How many Claude Code instances running right now
                                             -- 8 sessions = each task gets ~1/8th attention
    hour_of_day INTEGER,                     -- 0-23, local time. Correlate with velocity.
    alertness REAL,                          -- 0.0-1.0, self-reported or inferred mental awareness
                                             -- 0.3 = fatigued/distracted, 0.9 = sharp/focused
    environment TEXT,                        -- 'office', 'home', 'travel', etc.
    notes TEXT,
    FOREIGN KEY (developer) REFERENCES developers(name),
    CHECK (concurrent_sessions >= 1),
    CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
    CHECK (alertness >= 0.0 AND alertness <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_dev_context_lookup
    ON developer_context(developer, recorded_at DESC);

-- Daily contributor availability (synced from external custom system)
-- expected_minutes = how many minutes this person is available today
-- effectiveness = multiplier RELATIVE TO THEIR OWN MEAN (1.0 = their average day)
--   > 1.0 means above-average output expected (e.g. 1.3 = 30% more productive than usual)
--   < 1.0 means below-average (e.g. 0.6 = only 60% of usual output)
--   Recomputed daily from rolling window of actual velocity data
CREATE TABLE IF NOT EXISTS contributor_availability (
    developer TEXT NOT NULL,
    date DATE NOT NULL,
    expected_minutes REAL NOT NULL,
    effectiveness REAL DEFAULT 1.0,
    status TEXT DEFAULT 'available',
    notes TEXT,
    PRIMARY KEY (developer, date),
    FOREIGN KEY (developer) REFERENCES developers(name),
    CHECK (status IN ('available', 'limited', 'unavailable')),
    CHECK (effectiveness > 0.0)
);

-- Human-readable activity feed (distinct from raw workflow_events)
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    developer TEXT,
    action TEXT NOT NULL,                -- 'task_claimed', 'task_completed', 'pr_opened', etc.
    sprint TEXT,
    task_num INTEGER,
    summary TEXT,                        -- Human-readable: "Luke completed auth-sprint #3"
    metadata TEXT,                       -- JSON blob for structured details
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);

CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_dev ON activity_log(developer, timestamp DESC);
```

### Key computed views

```sql
-- Sprint progress: computed from task data (not stored)
-- Answers "how's the sprint?" without needing the rules engine
CREATE VIEW IF NOT EXISTS sprint_forecast AS
SELECT
    s.name as sprint,
    s.deadline,
    COUNT(t.task_num) as total_tasks,
    SUM(CASE WHEN t.status = 'green' THEN 1 ELSE 0 END) as completed,
    ROUND(100.0 * SUM(CASE WHEN t.status = 'green' THEN 1 ELSE 0 END) / COUNT(*), 1) as percent_complete,
    SUM(CASE WHEN t.status != 'green' THEN COALESCE(t.estimated_minutes, 0) ELSE 0 END) as remaining_minutes,
    ROUND((julianday(s.deadline) - julianday('now')) * 24 * 60) as minutes_until_deadline
FROM sprints s
LEFT JOIN tasks t ON t.sprint = s.name
GROUP BY s.name;

-- Effective velocity: task completion adjusted for context
-- Accounts for concurrent sessions and alertness at time of work
-- "Luke completes tasks in 45 min when focused on one, 120 min when running 4 sessions"
CREATE VIEW IF NOT EXISTS effective_velocity AS
SELECT
    t.owner,
    t.sprint,
    t.task_num,
    ROUND((julianday(t.completed_at) - julianday(t.started_at)) * 24 * 60) as actual_minutes,
    t.estimated_minutes,
    ROUND(
        (julianday(t.completed_at) - julianday(t.started_at)) * 24 * 60 /
        NULLIF(t.estimated_minutes, 0), 2
    ) as blow_up_ratio,
    dc.concurrent_sessions,
    dc.alertness,
    dc.hour_of_day
FROM tasks t
LEFT JOIN developer_context dc ON dc.developer = t.owner
    AND dc.recorded_at = (
        SELECT MAX(recorded_at) FROM developer_context
        WHERE developer = t.owner AND recorded_at <= t.started_at
    )
WHERE t.started_at IS NOT NULL AND t.completed_at IS NOT NULL;
```

### Glossary

- **Blow-up ratio**: `actual_minutes / estimated_minutes`. A value of 1.0 means the estimate was perfect. 2.5 means the task took 2.5x longer than estimated. Tracked per task, aggregated per developer and per task type to identify patterns (e.g. "database tasks consistently blow up 3x").
- **Effectiveness**: A multiplier relative to a developer's own historical mean velocity. 1.0 = their average day. Recomputed daily from a rolling window. Used for forecasting: "Luke has 120 available minutes today at 0.8 effectiveness = ~96 productive minutes."
- **Baseline competency**: A general cognitive performance score (0.0-10.0) that correlates across all skill domains. Helps predict performance on novel task types where specific skill data is sparse.

---

## Implementation Plan

| Phase | What | Status |
|-------|------|--------|
| 0 | **Schema foundations** — sprints, projects, contributor_availability, activity_log, developer_skills, developer_context tables. Backfill sprints from task data. | **Complete** (migration 004) |
| 1 | **GraphQL Ontology** — Apollo Server, TypeScript, full schema for all entities, resolvers, JSONL transcript reader, analytics views, conversation feed, session timeline | **Complete** (65+ fields, 30+ views, 11 tables) |
| 1.1 | **Schema cleanup** — ~~`estimated_hours` → `estimated_minutes`~~ **Done**, `complexity` TEXT → REAL, drop legacy `skill_*` columns, add `baseline_competency` to developers | Partially complete (`estimated_minutes` done; rest deferred) |
| 2 | **Intelligence (ontology-only)** — chat UI + LLM backend for natural language queries against the GraphQL API | **Active — scoping now** |
| 3 | **Rules Engine** — Software 1.0 first, then 2.0. See `rules-engine.md`. Add `execute_rule` tool to Intelligence layer. | Designed, not started |
| 4 | **Dashboard polish** — pre-built views, Gantt UX, data completeness | In progress (parallel) |

### Phase 2 breakdown (Intelligence layer)

This is the active work. Deliverables:

1. **Chat backend endpoint** — API route in the dashboard (or standalone) that:
   - Accepts a conversation (question + history)
   - Injects GraphQL schema as system context for Claude
   - Implements `query_ontology` tool (executes GraphQL against localhost:4000)
   - Implements `generate_chart` tool (returns a visualization spec)
   - Streams the response

2. **Chat frontend** — New `/ask` page in the Next.js dashboard using `@assistant-ui/react`:
   - `LocalRuntime` with `ChatModelAdapter` pointing to the chat backend
   - Generative UI components for tool call results (data tables, charts)
   - Markdown rendering for text responses

3. **GraphQL schema context** — Export the introspection result or a curated schema summary that Claude can use to construct valid queries. Include descriptions of what each query/view returns.

4. **Date range filters** — Add `dateFrom`/`dateTo` parameters to key analytics queries so time-windowed questions work ("What did the team do last week?").

---

## Open Questions

1. ~~GraphQL vs REST?~~ **Resolved**: GraphQL — schema introspection lets LLMs discover the data model, and nested queries match the relational data well.
2. ~~SQLite → Postgres timing~~ **Partially resolved**: SQLite locally, Supabase sync for transcripts already shipped (migrations 008-009). Full Postgres migration deferred until multi-user concurrent writes are needed.
3. **Dynamic dashboard scope** — is "generate a dashboard from a question" core v1 or a stretch goal? *Recommendation: stretch goal. v1 is text answers + simple charts via `generate_chart`. Dynamic dashboard assembly is Layer 3.1.*
5. **Contributor availability sync** — what's the API/format of the external custom system? Need to define the adapter for calendar data and daily availability.
6. **Hosting** — local dev server is fine for single-user. When does this need to be hosted? Likely when Goal 8 (Ubiquitous Access) activates.
7. **Skill tree taxonomy** — what categories and skills should seed the tree? Should be data-driven (mined from task types, tools used) rather than hand-coded. Need to define the initial seed set and the process for discovering new skills from task data.
8. **Alertness/mental awareness measurement** — self-reported vs inferred? Could correlate time-of-day and concurrent sessions with blow-up ratios to infer alertness retrospectively. How much manual input is acceptable?
9. **Baseline competency assessment** — what does the assessment look like? Standardized coding exercise, historical velocity normalization, or manager assessment? Needs design.
10. **Real-time transcript streaming** — current JSONL files are written post-session. For near-real-time dashboard views of active sessions, need a streaming mechanism (file watching, WebSocket from Claude Code, or polling).
11. **Effectiveness recomputation** — what rolling window? 7 days? 30 days? Weighted recency? Needs experimentation to find the right balance between responsiveness and stability.
12. **GraphQL → Graph DB timing** — GraphQL over a relational DB is the right starting point. If multi-hop ontological reasoning becomes a bottleneck (e.g., "find developers who've worked on similar tasks in sprints with above-average velocity"), evaluate migrating the backing store to a property graph database (Neo4j, etc.). The GraphQL schema serves as a clean intermediate representation that maps onto a property graph. Migration is mechanical if inference logic stays in the rules engine and out of SQL views.
13. ~~Chat component backend migration~~ **Resolved**: Skip Databricks adapter swap entirely. Build the chat frontend fresh using `assistant-ui` (`@assistant-ui/react`) on the existing Next.js dashboard. `LocalRuntime` + `ChatModelAdapter` connects to a custom backend that calls Claude with the GraphQL schema as context. Databricks chat component is not reused — assistant-ui provides a better, more composable solution that's native to the existing stack.
14. **Schema context strategy** — How to present the GraphQL schema to Claude for query generation. Options: (a) full introspection JSON (large but complete), (b) curated summary with query names + descriptions + example queries (smaller, higher quality), (c) hybrid — summary for routing, introspection on demand. Needs experimentation.
15. **LLM model selection for chat backend** — Claude Sonnet for speed/cost on simple queries vs. Opus for complex multi-step reasoning? Could route based on query complexity.

---

## References

- `workflow-dashboard.md` — dashboard views, adapter interface, Supabase schema
- `coordination.md` — Supabase shared store, developer twins
- `../done/observability.md` — data collection pipeline, workflow_events
- `developer-twin.md` — twin data model, routing interface
- `.pm/schema.sql` — current database schema (11 tables, 30+ views)
- `platform/src/schema/typeDefs.ts` — GraphQL schema (65+ fields)
- `platform/src/resolvers/` — resolver implementations
- [Palantir Foundry Ontology](https://www.palantir.com/docs/foundry/ontology/overview) — architectural inspiration
- `rules-engine.md` — Layer 2 detailed design (Software 1.0/2.0/3.0 architecture)
- [assistant-ui](https://www.assistant-ui.com/) — React chat component library (Layer 3 frontend)
- [assistant-ui GitHub](https://github.com/assistant-ui/assistant-ui) — source, examples, runtime docs
