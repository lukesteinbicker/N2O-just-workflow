# Data Platform

> A three-layer data platform (Ontology, Rules Engine, Intelligence) that makes all N2O project data queryable, actionable, and LLM-accessible through a single GraphQL endpoint.

| Field | Value |
|-------|-------|
| Status | Draft |
| Owner | Wiley |
| Last Updated | 2026-02-23 |
| Depends On | `specs/observability.md`, `specs/workflow-dashboard.md`, `specs/coordination.md` |
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
| 2026-02-23 | Layer 3 no longer depends on Layer 2 — can ship with ontology-only LLM queries, rules enhance later | [Implementation Plan](#implementation-plan), [Layer 3](#layer-3-intelligence-llm) |
| 2026-02-23 | Initial draft | All |

---

## Current State

What exists:
- **SQLite database** (`.pm/tasks.db`): 6 tables, 30+ views — tasks, developers, dependencies, workflow events, transcripts, skill versions
- **JSONL transcripts**: full session recordings parsed by `scripts/collect-transcripts.sh`
- **`n2o stats` CLI**: surfaces velocity, estimation accuracy, quality metrics
- **Contributor availability**: tracked daily in external custom system (hours, calendars)
- **Linear sync**: adapter pattern for external PM tool integration

What does NOT exist:
- No unified API layer — all access is direct SQLite or bash scripts
- No semantic data model — relationships are implicit in SQL joins
- No rules engine — capacity planning, assignment, risk detection are manual
- No LLM data access — Claude cannot query project data programmatically
- No `sprints` table (text labels only, no dates/deadlines)
- No `projects` table (single-project assumption)

---

## Vision

Three layers, inspired by Palantir's Foundry, built incrementally on the existing SQLite foundation.

**Layer 1 — Ontology**: A GraphQL API that serves as the semantic data model. All entities and relationships queryable through a single endpoint. Schema introspection lets LLMs discover the data model without documentation.

**Layer 2 — Rules Engine**: Business logic encoded as composable, testable rules. Capacity ("Luke can take 5 more tasks this week"), assignment ("best fit for this task"), risk ("sprint is at-risk"), forecasting ("finishes Wednesday at current pace"). **Blocked on investigating GPS team's rules engine before detailed design.**

**Layer 3 — Intelligence**: An LLM with read access to the Ontology and execute access to Rules. Powers natural language queries ("how's the sprint?") and dynamic dashboard generation — dashboards assembled from data + rules + visualization primitives, not pre-built templates.

Each layer is independently valuable. The Ontology alone replaces direct SQLite access. The Rules Engine alone replaces manual spreadsheet forecasting. The Intelligence layer is thin — it connects human intent to data and logic.

---

## Design

### Layer 1: Ontology (GraphQL API)

The GraphQL schema IS the ontology. Every entity, property, and relationship is explicit, queryable, and self-documenting via introspection.

**Entities and sources:**

| Entity | Source | New/Existing |
|--------|--------|-------------|
| Task | `tasks` table | Existing |
| Sprint | text labels on tasks | **New `sprints` table** — needs dates, deadlines |
| Project | none | **New `projects` table** |
| Developer | `developers` table | Existing |
| Availability | external custom system | **New `contributor_availability` table** |
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
- Developer → Availability[] (daily capacity)
- Developer → Task[] (current + historical work)
- Sprint → Forecast (computed from rules engine)

**Tech stack:**
- Apollo Server 4 (TypeScript) — mature, good introspection, plugin ecosystem
- better-sqlite3 — synchronous SQLite access, no async overhead
- DataLoader — batches nested queries (prevents N+1)
- Start SQLite, add Postgres/Supabase adapter for online multi-user later

**Example query** (what Layer 1 enables):

```graphql
query {
  sprint(name: "auth-sprint") {
    deadline
    progress { totalTasks, green, percentComplete }
    tasks {
      title
      status
      owner { name, velocity { avgHours } }
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

One request, all the data, exactly the shape needed.

### Layer 2: Rules Engine

**Status: blocked on GPS investigation.** This section is intentionally high-level.

**What the rules engine needs to do:**

| Category | Example | Input | Output |
|----------|---------|-------|--------|
| Capacity | "Can Luke take another task?" | Availability, active tasks, estimates | Boolean + reason |
| Assignment | "Best developer for this task" | Task type, developer skills, working sets | Ranked list |
| Risk | "Is this sprint at risk?" | Progress, velocity trend, remaining capacity | Risk level + factors |
| Forecast | "When will auth feature be done?" | Remaining tasks, velocity, availability | Date range |
| Alerting | "What needs attention?" | Blocked tasks, stale tasks, at-risk sprints | Prioritized alerts |

**Architectural principles** (subject to GPS learnings):
- **Declarative** — rules read like sentences, not code
- **Composable** — complex rules build on simple ones ("best developer" = skill_match + availability + context_continuity)
- **Testable** — every rule can be unit tested with mock data
- **Explainable** — when a rule fires, it says why

**GPS investigation questions:**
1. How are rules defined? (DSL, config, code?)
2. How do rules compose?
3. How does the rules engine interact with the data layer?
4. How are rule outputs consumed? (dashboards, APIs, notifications?)
5. How are rules tested and versioned?

### Layer 3: Intelligence (LLM)

The thinnest layer. **Depends on Layer 1 only. Enhanced by Layer 2 when available.**

An LLM with tools that grow as layers ship:

| Tool | What it does | Layer | Available |
|------|-------------|-------|-----------|
| `query_ontology` | Execute a GraphQL query | Layer 1 | Phase 1 (day one) |
| `generate_chart` | Produce a visualization spec from data | Viz library | Phase 1 |
| `execute_rule` | Run a named rule with parameters | Layer 2 | Phase 3 (when rules engine ships) |

**Without Layer 2**, the LLM can still:
- Answer "how's the sprint?" — queries sprint progress view
- Answer "what's Luke working on?" — queries tasks by owner
- Show transcript messages for any session
- Generate charts from any query result

**With Layer 2** (additive, no rewiring), the LLM gains:
- "When will the sprint finish?" — calls forecast rule
- "Who should take this task?" — calls assignment rule
- "Is anything at risk?" — calls risk detection rule

**Natural language query flow:**
1. User: "How's the sprint?"
2. LLM introspects GraphQL schema (cached)
3. LLM constructs + executes query
4. If rules engine available, evaluates relevant rules (risk, forecast)
5. LLM formats human-readable answer
6. Optionally generates a chart

**Dynamic dashboard generation:**
Given a question, the Intelligence layer determines what data to fetch (ontology), what rules to evaluate (if available), and what visualizations to render. Dashboards are assembled, not pre-built. This is the GPS pattern applied to N2O.

### Pre-Built Dashboards

Default views powered by the Ontology (from `specs/workflow-dashboard.md`):

1. **Board View** — Kanban with TDD phases, task claiming
2. **Graph View** — dependency visualization
3. **Activity Feed** — real-time from `activity_log`
4. **Velocity Dashboard** — team/individual metrics, trends
5. **AI Metrics** — contribution tracking, quality correlation
6. **Project Rollup** — cross-project summary

These are "saved queries" — pre-configured dashboard layouts that anyone can use without asking questions. Dynamic dashboards supplement, not replace, these.

---

## Schema

New tables needed before building the API. These go in a migration file.

```sql
-- Sprint metadata (currently just text labels on tasks)
CREATE TABLE IF NOT EXISTS sprints (
    name TEXT PRIMARY KEY,
    project TEXT,
    start_date DATE,
    end_date DATE,
    deadline DATE,
    goal TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('planning', 'active', 'completed', 'cancelled'))
);

-- Multi-project support
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    external_system TEXT,
    external_id TEXT,
    external_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Daily contributor availability (synced from external system)
CREATE TABLE IF NOT EXISTS contributor_availability (
    developer TEXT NOT NULL,
    date DATE NOT NULL,
    expected_hours REAL NOT NULL,
    effectiveness REAL DEFAULT 1.0,
    status TEXT DEFAULT 'available',
    notes TEXT,
    source TEXT DEFAULT 'manual',
    PRIMARY KEY (developer, date),
    FOREIGN KEY (developer) REFERENCES developers(name),
    CHECK (status IN ('available', 'limited', 'unavailable')),
    CHECK (effectiveness >= 0 AND effectiveness <= 1)
);

-- Human-readable activity feed (distinct from raw workflow_events)
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    developer TEXT,
    action TEXT NOT NULL,
    sprint TEXT,
    task_num INTEGER,
    summary TEXT,
    metadata TEXT,
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);

CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_dev ON activity_log(developer, timestamp DESC);

-- Sprint forecast (computed view)
CREATE VIEW IF NOT EXISTS sprint_forecast AS
SELECT
    s.name as sprint,
    s.deadline,
    COUNT(t.task_num) as total_tasks,
    SUM(CASE WHEN t.status = 'green' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN t.status != 'green' THEN COALESCE(t.estimated_hours, 0) ELSE 0 END) as remaining_hours,
    sv.avg_hours_per_task,
    julianday(s.deadline) - julianday('now') as days_until_deadline
FROM sprints s
LEFT JOIN tasks t ON t.sprint = s.name
LEFT JOIN sprint_velocity sv ON sv.sprint = s.name
GROUP BY s.name;
```

---

## Implementation Plan

| Phase | What | Blocked on | Parallel? |
|-------|------|-----------|-----------|
| 0 | **Schema foundations** — add sprints, projects, contributor_availability, activity_log tables. Backfill sprints from existing task data. | Nothing | — |
| 1 | **GraphQL Ontology** — Apollo Server, TypeScript, full schema for all entities, resolvers wrapping existing SQL views, JSONL transcript reader | Phase 0 | — |
| 2 | **GPS Investigation** — meet with GPS team, document their rules engine, map to N2O domain | Nothing | Yes, parallel with Phase 0-1 |
| 3 | **Intelligence (ontology-only)** — LLM tools for `query_ontology` + `generate_chart`, natural language queries, dynamic dashboard generation. Works without rules engine. | Phase 1 | — |
| 4 | **Rules Engine** — implement based on GPS learnings, encode capacity/assignment/risk/forecast rules, expose via GraphQL. Add `execute_rule` tool to Intelligence layer. | Phase 2 | Parallel with Phase 3 |
| 5 | **Dashboard migration** — pre-built views powered by GraphQL, Next.js frontend, Supabase for multi-user | Phase 1 | Parallel with Phase 3-4 |

---

## Open Questions

1. **GPS rules engine architecture** — how do they define, compose, test, and version rules? This is the single most important open question. Schedule conversation with GPS team.
2. ~~GraphQL vs REST?~~ **Resolved**: GraphQL — schema introspection lets LLMs discover the data model, and nested queries match the relational data well.
3. **SQLite → Postgres timing** — start SQLite (local-first, matches existing stack). Move to Postgres when multi-user real-time dashboards need concurrent writes.
4. **Dynamic dashboard scope** — is "generate a dashboard from a question" core v1 or a stretch goal? Depends on GPS learnings.
5. **Contributor availability sync** — what's the API/format of the external custom system? Need to define the adapter.
6. **Hosting** — local dev server is fine for single-user. When does this need to be hosted? Likely when Goal 8 (Ubiquitous Access) activates.

---

## References

- `specs/workflow-dashboard.md` — dashboard views, adapter interface, Supabase schema
- `specs/coordination.md` — Supabase shared store, developer twins
- `specs/observability.md` — data collection pipeline, workflow_events
- `specs/developer-twin.md` — twin data model, routing interface
- `.pm/schema.sql` — current database schema (6 tables, 30+ views)
- [Palantir Foundry Ontology](https://www.palantir.com/docs/foundry/ontology/overview) — architectural inspiration
- GPS rules engine — reference for Layer 2 (pending investigation)
