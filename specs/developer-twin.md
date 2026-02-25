# Developer Digital Twin — Data Model & Routing Interface

**Sprint**: coordination | **Task**: #8
**Status**: Designed
**Implements**: Goal H (Developer Digital Twin & Intelligent Routing) from `specs/coordination.md`
**Consumed by**: Task #9 (Routing Scoring Algorithm)

---

## Summary

The Developer Digital Twin is a per-developer data model that tracks current context, skills, velocity, and availability. The routing algorithm (Task #9) reads from the twin to decide which developer gets which task. The twin lives in **both** local SQLite (for own-twin reads during local scoring) and Supabase (for cross-machine visibility of other developers' twins).

This spec defines every field, where it comes from, how it's populated, and the exact interface the routing algorithm consumes.

**Relationship to Data Platform** (`specs/data-platform.md`): The twin is the **real-time operational layer**; the data platform is the **analytical layer**. The twin READS from the data platform's ontology (skills via `developer_skills`, availability via `contributor_availability`, velocity views, `baseline_competency`). The twin WRITES operational context that the data platform captures (`developer_context` snapshots, `activity_log` events). The routing algorithm is a future Layer 2 Rules Engine candidate.

---

## Twin Field Reference Table

| Field | Type | Source | Population Trigger | Grounding | Staleness Tolerance | MVP? |
|-------|------|--------|-------------------|-----------|-------------------|------|
| `developer` | TEXT (PK) | `git config user.name` | Session start | Grounded | N/A (static) | Yes |
| `machine_id` | TEXT | `hostname -s` | Session start | Grounded | Session-scoped | Yes |
| `loaded_files` | TEXT[] | `git diff --name-only` per worktree | Task completion + periodic (5 min) | Grounded (git is truth) | 5 minutes | Yes |
| `loaded_modules` | TEXT[] | Derived: first 2 path segments of `loaded_files` | Same as `loaded_files` | Derived (deterministic) | 5 minutes | No |
| `loaded_domains` | TEXT[] | Derived: task `type` values from completed tasks | Task completion | Derived (from task metadata) | Session-scoped | No |
| `path_history` | JSONB[] | Task completion events + git diff | Task completion | Grounded (measured data) | Hours (append-only) | Yes |
| `trajectory` | JSONB[] | Computed from `task_dependencies` + `path_history` | Claim time (not stored) | Computed (deterministic) | Recomputed per claim | Yes |
| `skills` | JSONB | Read from `developer_skills` table (hierarchical: category/skill/rating REAL 0.0-5.0) | Session start (snapshot from data platform) | Grounded (human + calculated) | Hours | Yes |
| `baseline_competency` | REAL (0-10) | `developers.baseline_competency` | Session start (snapshot from data platform) | Grounded (assessed) | Weeks | Yes |
| `expected_minutes` | REAL | `contributor_availability` table (today's row) | Session start (snapshot from data platform) | Grounded (external system) | Daily | Yes |
| `effectiveness` | REAL | `contributor_availability` table (relative-to-mean multiplier) | Session start (snapshot from data platform) | Computed (rolling window) | Daily | Yes |
| `concurrent_sessions` | INTEGER | `developer_context` table / agent count | Agent start/stop, session start | Grounded | Minutes | Yes |
| `session_started_at` | TIMESTAMPTZ | Session hook | Session start | Grounded | N/A (set once) | Yes |
| `session_elapsed_min` | INTEGER | `NOW() - session_started_at` | Computed at query time | Computed | Real-time | Yes |
| `avg_session_minutes` | REAL | Mean of historical session durations | Session end (recalculated) | Grounded (>3 sessions) | Days | No |
| `remaining_minutes` | INTEGER | `min(expected_minutes - today_total, avg_session_min - elapsed)` | Computed at query time | Computed | Real-time | Yes |
| `velocity_avg_minutes` | REAL | `effective_velocity` view (mean minutes across all tasks) | Task completion | Grounded (>5 tasks) | Hours | Yes |
| `velocity_by_type` | JSONB | Per-type avg minutes + blow_up_ratio + count | Task completion | Grounded (per-type, >3 tasks) | Hours | No |
| `blow_up_ratio` | REAL | `effective_velocity` view (actual_minutes / estimated_minutes) | Task completion | Grounded (>5 tasks) | Hours | Yes |
| `total_tasks_completed` | INTEGER | COUNT from tasks table | Task completion | Grounded | Minutes | Yes |
| `recent_revert_rate` | REAL | Reversions / tasks in last 10 tasks | Task completion | Grounded (>10 tasks) | Hours | No |

---

## Design Decisions (All 8 Questions)

### Q1: Field-Level Contract

Every field above has a defined source and grounding status. The key contract rules:

1. **No speculative fields in routing**. Every field the scoring function reads is either grounded (from git, config, or measured data) or deterministically derived from grounded data.
2. **JSONB fields have defined schemas** (see Field Schemas section below).
3. **NULL means "no data"**, not "zero". The routing function treats NULL as "skip this signal" and redistributes weight (see Q7).
4. **Staleness tolerance drives update frequency**. Fields with 5-minute tolerance get periodic updates. Fields with session-scoped tolerance get set once and cleared at session end.

### Q2: Loaded Context Population

**Decision: `git diff --name-only <base_branch>..HEAD` on each active worktree, accumulated across all worktrees for this developer.**

Population flow:
1. **Session start**: `loaded_files = []` (empty — nothing loaded yet).
2. **Task completion** (primary trigger): Run `git diff --name-only $(git merge-base HEAD master)..HEAD` on the worktree. Append unique files to `loaded_files`.
3. **Periodic refresh** (secondary, every 5 minutes if session hook heartbeat runs): Same git diff, captures in-progress work.
4. **Session end**: Clear `loaded_files` to `[]`. A new session starts fresh.

**Why git diff, not file access tracking**: Git diff gives us the files the developer *changed*, which is a much stronger signal of loaded context than files merely *read*. Reading a file takes seconds; modifying it requires understanding. Git is the source of truth for "this developer has context in these files."

**Modules derivation** (deferred to post-MVP):
```
file: "scripts/coordination/claim-task.sh"  →  module: "scripts/coordination"
file: "02-agents/tdd-agent/SKILL.md"        →  module: "02-agents/tdd-agent"
```
Rule: Take up to 2 directory segments. Strip filename. Deduplicate.

**Clearing**: `loaded_files` is cleared at session end (trap in session hook). If the developer starts a new session, they get a fresh context. This is correct — context degrades overnight. A developer who worked on auth yesterday doesn't have auth context loaded today.

### Q3: Path History Granularity

**Decision: Per-task. Files from `git diff --name-only` at task completion. Include test files. Retain last 20 tasks or 7 days, whichever is more.**

Schema for each path_history entry:
```json
{
  "sprint": "coordination",
  "task_num": 7,
  "type": "infra",
  "files": ["scripts/coordination/merge-queue.sh", "tests/test-merge-queue.sh"],
  "completed_at": "2026-02-23T14:30:00Z"
}
```

**Why per-task, not per-commit**: A task is the atomic unit of meaningful work. Commits are implementation noise — a developer might make 15 commits to complete one task. The routing algorithm cares about "this developer worked on merge-queue infrastructure" not "this developer added a semicolon in commit abc123."

**Why include tests**: Test files indicate the developer understands the testing patterns for that area. If they wrote `test-merge-queue.sh`, they have context in both the implementation and its test harness. That's a stronger signal than implementation files alone.

**Retention**: 20 tasks or 7 days. This is long enough to capture a sprint's worth of context continuity, short enough that stale ancient history doesn't pollute routing. Pruning happens at task completion: before appending the new entry, remove entries older than 7 days AND trim to most recent 20.

### Q4: Trajectory Source

**Decision: Computed at claim time from dependency chains + same-spec ordering. NOT stored persistently.**

Algorithm (runs in the scoring function at claim time):
```
trajectory_tasks(developer, available_tasks) -> scored_task_list:
  1. Get developer's path_history (last 20 tasks)
  2. For each available_task:
     a. DEPENDENCY CHAIN: Does this task depend (directly or transitively, max depth 2)
        on a task this developer completed? If yes → trajectory bonus.
     b. SAME-SPEC CONTINUATION: Is this task in the same spec as a task this developer
        completed, with a higher task_num? If yes → trajectory bonus (weaker).
  3. Return trajectory_score per task (0.0 to 1.0)
```

**Why computed, not stored**: Trajectory is a function of (developer's history, currently available tasks). Both change frequently. Storing a trajectory would immediately go stale when another developer claims a task or a new task becomes available. Computing it fresh at claim time is cheap (score 10-20 tasks against 20 history entries = ~400 comparisons) and always accurate.

**Why dependency chains over pm-agent decomposition**: The dependency chain in `task_dependencies` already encodes the pm-agent's decomposition. A dependency `(coordination, 9) depends_on (coordination, 8)` means "routing depends on twin model." If Developer X completed task 8, task 9 is naturally in their trajectory. No separate trajectory data structure needed.

**Transitivity limit**: Max depth 2. If A→B→C and developer completed A, task C gets a weaker trajectory bonus than B. Beyond depth 2, the context continuity signal is too weak to be useful.

### Q5: Availability Data Sources

**Decision: Read from data platform's `contributor_availability` table (daily expected minutes + effectiveness multiplier) + session hooks (`session_started_at`) + `developer_context` for concurrent sessions. No pattern inference in MVP.**

Data sources and formula:

| Data Point | Source (Data Platform) | Fallback |
|-----------|--------|----------|
| `expected_minutes` | `contributor_availability.expected_minutes` WHERE date = today | Default: 480 (8 hours) |
| `effectiveness` | `contributor_availability.effectiveness` (relative to own mean, 1.0 = average day) | Default: 1.0 |
| `concurrent_sessions` | `developer_context.concurrent_sessions` (latest snapshot) | Default: 1 |
| `session_started_at` | SessionStart hook writes to twin | Default: NULL (treat as "just started") |
| `today_total_minutes` | SUM of session durations from `activity_log` WHERE date = today | Default: 0 |
| `avg_session_minutes` | AVG of session durations from `activity_log` last 30 days | Default: 240 (4 hours) |

**Remaining time formula**:
```
effective_minutes = expected_minutes * effectiveness    -- e.g. 480 * 0.8 = 384 productive min
remaining_minutes = min(
  effective_minutes - today_total_minutes,              -- daily budget remaining
  avg_session_minutes - session_elapsed_min             -- session budget remaining
)
remaining_minutes = max(remaining_minutes, 0)           -- floor at zero
-- Concurrent sessions reduce per-task throughput:
per_task_minutes = remaining_minutes / concurrent_sessions
```

**Why read from data platform, not config**: The `contributor_availability` table is synced from the external custom system (calendars, daily hours). The `effectiveness` multiplier is recomputed daily from a rolling window of actual velocity data. This is richer than a static `hours_per_day` config value and accounts for day-to-day variation.

**What happens when availability data is missing**: Falls back to 480 minutes (8 hours) at 1.0 effectiveness. A new developer should not be penalized for lack of history.

### Q6: Velocity Profile Structure

**Decision: `avg_minutes_per_task` + `blow_up_ratio` + `total_tasks_completed` for MVP. Per-type breakdown deferred. Velocity sourced from data platform's `effective_velocity` view, which accounts for concurrent sessions and alertness at time of work.**

MVP velocity object (stored in `velocity` JSONB):
```json
{
  "avg_minutes_per_task": 138,
  "blow_up_ratio": 1.4,
  "total_tasks_completed": 18,
  "last_updated": "2026-02-23T14:30:00Z"
}
```

**Why not per-type in MVP**: Per-type velocity requires enough completed tasks per type to be statistically meaningful. With <5 tasks per type, the per-type average is noise. The routing algorithm uses the overall `blow_up_ratio` to adjust duration predictions: `predicted_minutes = task.estimated_minutes * developer.blow_up_ratio`. When a developer has completed 20+ tasks with 5+ per type, per-type breakdown becomes valuable. That's a post-MVP enhancement.

**Why not reversions in velocity**: Reversions are a quality signal, not a speed signal. They live in the `developer_quality` view already. Mixing them into velocity would create a confusing metric. The routing algorithm can read revert rate separately if fatigue detection is added later.

**Confidence mapping** (for consumer interpretation, not used in scoring):
- `total_tasks_completed < 5`: Low confidence — velocity data is unreliable
- `5 <= total_tasks_completed <= 20`: Medium confidence
- `total_tasks_completed > 20`: High confidence

### Q7: Routing Interface Contract

The routing function signature:

```
score_task(task, own_twin, other_working_sets) -> float
```

**Required fields** (routing will not function without these):

| Field | Why Required | Source |
|-------|-------------|--------|
| `task.sprint`, `task.task_num` | Task identity | `available_tasks` view |
| `task.type` | Skill matching | `available_tasks` view |
| `task.estimated_minutes` | Availability fit | `available_tasks` view |

**Optional fields with NULL handling:**

| Field | If NULL | Weight Redistribution |
|-------|---------|----------------------|
| `own_twin.loaded_files` | Score 0.0 for context_match | None (0.0 is valid — no context loaded) |
| `own_twin.skills` (empty/NULL) | Score 0.5 for skill_match (neutral) | None |
| `own_twin.path_history` | Skip trajectory_match entirely | +0.15 to context_match, +0.10 to skill_match |
| `own_twin.expected_minutes` | Assume 480 (8 hours) | None |
| `own_twin.session_started_at` | Assume just started (full availability) | None |
| `own_twin.velocity` | Use `task.estimated_minutes` directly (no blow_up adjustment) | None |
| `other_working_sets` | Skip overlap_avoidance entirely | +0.10 to context_match |
| `task.estimated_minutes` NULL | Score 1.0 for availability_fit (assume it fits) | None |

**Scoring weights (initial, tunable via config):**

| Signal | Weight | Computation |
|--------|--------|-------------|
| `context_match` | 0.35 | `\|intersection(task_expected_files, loaded_files)\| / \|task_expected_files\|`. If task has no expected files, use module-level matching from path_history. |
| `trajectory_match` | 0.25 | 1.0 if direct dependency completed by this dev, 0.5 if same-spec continuation, 0.0 otherwise |
| `skill_match` | 0.15 | Look up matching skill from `developer_skills` table by task type (see Skill Matching below). `rating / 5.0`. |
| `availability_fit` | 0.10 | `1.0 - max(0, predicted_minutes - remaining_minutes) / predicted_minutes`. Clamped [0, 1]. Accounts for effectiveness multiplier and concurrent sessions. |
| `overlap_avoidance` | 0.10 | `1.0 - (\|intersection(task_expected_files, other_active_files)\| / max(\|task_expected_files\|, 1))` |
| `dependency_unlock` | 0.05 | `count(tasks_unblocked_by_this) / max_possible_unblocks`. Normalized [0, 1]. |

**Task expected files**: Derived from the task description + spec. For MVP, use the files from the most recent completed task in the same spec (heuristic: same-spec tasks touch similar files). Post-MVP: parse task description for file paths.

**Final score**: `sum(weight_i * signal_i)` for all signals. Range: [0.0, 1.0].

### Q8: MVP Scope for Task 9

**In scope (build now):**

| Component | Detail |
|-----------|--------|
| `loaded_files` population | Git diff at task completion, stored in twin |
| `path_history` population | Append at task completion, prune to 20/7 days |
| `trajectory` computation | Dependency chain + same-spec at claim time |
| Skill snapshot | Read `developer_skills` table at session start → JSONB snapshot in twin |
| Availability snapshot | Read `contributor_availability` (today) at session start → `expected_minutes` + `effectiveness` |
| Context writes | Write `developer_context` snapshot at session start (concurrent sessions, hour of day) |
| `session_started_at` | Set by session hook, cleared at session end |
| `velocity` (aggregate) | `avg_minutes_per_task` + `blow_up_ratio` from `effective_velocity` view |
| Scoring function | All 6 weighted signals with NULL handling |
| Supabase sync | Twin data syncs to Supabase at task completion + session start/end |
| Graceful degradation | Routing falls back to priority ordering if twin data insufficient |

**Deferred (post-MVP):**

| Component | Why Deferred |
|-----------|-------------|
| `loaded_modules` / `loaded_domains` | Nice-to-have derived fields, `loaded_files` sufficient for MVP |
| `velocity.by_type` | Needs >5 tasks per type for statistical significance |
| Pattern inference (schedule learning) | Requires weeks of data + ML complexity |
| `recent_revert_rate` (fatigue detection) | Quality signal, not routing-critical |
| Dynamic weight tuning | Needs routing outcome data to optimize against |
| `avg_session_hours` | Simple fallback (4.0 hours) sufficient until data accumulates |
| Task description file-path parsing | Heuristic (same-spec files) sufficient for MVP |

---

## Data Flow Diagram

```
SESSION START
    │
    ├─→ session hook fires
    │     ├─→ Set twin.session_started_at = NOW()
    │     ├─→ Set twin.machine_id = hostname
    │     ├─→ READ from data platform:
    │     │     ├─→ developer_skills → twin.skills (JSONB snapshot)
    │     │     ├─→ developers.baseline_competency → twin.baseline_competency
    │     │     ├─→ contributor_availability (today) → twin.expected_minutes, twin.effectiveness
    │     │     └─→ effective_velocity view → twin.velocity_avg_minutes, twin.blow_up_ratio
    │     ├─→ WRITE to data platform:
    │     │     └─→ INSERT developer_context (concurrent_sessions, hour_of_day, alertness)
    │     └─→ Sync twin to Supabase
    │
    ▼
TASK CLAIM
    │
    ├─→ claim-task.sh calls score_task() for each candidate
    │     ├─→ Read own twin from local SQLite
    │     ├─→ Read other working sets from Supabase (or skip if unreachable)
    │     ├─→ Compute trajectory from task_dependencies + path_history
    │     ├─→ Score all 6 signals, return ranked list
    │     └─→ Claim top-scored task (atomic UPDATE)
    │
    ▼
TASK IN PROGRESS
    │
    ├─→ Agent works in worktree
    │     └─→ (No twin updates during active work — zero overhead)
    │
    ▼
TASK COMPLETION
    │
    ├─→ git diff --name-only on worktree
    │     ├─→ Append files to twin.loaded_files (deduplicated)
    │     ├─→ Append entry to twin.path_history (prune old)
    │     ├─→ Recompute twin.velocity from effective_velocity view
    │     ├─→ WRITE to data platform:
    │     │     ├─→ INSERT developer_context (snapshot at completion time)
    │     │     └─→ INSERT activity_log ('task_completed', summary, metadata)
    │     └─→ Sync twin to Supabase
    │
    ├─→ Task status → green
    │     └─→ Triggers next claim cycle (back to TASK CLAIM)
    │
    ▼
SESSION END
    │
    ├─→ trap fires (SIGINT/SIGTERM/EXIT)
    │     ├─→ Clear twin.loaded_files → []
    │     ├─→ Clear twin.session_started_at → NULL
    │     ├─→ WRITE to data platform:
    │     │     └─→ INSERT activity_log ('session_end', duration)
    │     ├─→ Sync twin to Supabase
    │
    ▼
DONE
```

---

## Schema Changes

### Local SQLite: Changes to `developers` table

The data platform migration (see `specs/data-platform.md`) handles the structural changes to `developers`:
- Drop fixed `skill_*` columns (replaced by `developer_skills` table)
- Add `baseline_competency REAL` and `competency_assessed_at DATETIME`

No additional `developers` changes needed for the twin — availability comes from `contributor_availability`, not a column on `developers`.

### Local SQLite: New `developer_twins_local` table

The local twin caches own-developer state for fast reads during scoring. This is NOT the same as the Supabase `developer_twins` table — it's a local-only cache for the routing hot path. Skills and availability are snapshots from data platform tables, refreshed each session start.

```sql
CREATE TABLE IF NOT EXISTS developer_twins_local (
    developer TEXT PRIMARY KEY,
    machine_id TEXT,
    loaded_files TEXT DEFAULT '[]',      -- JSON array of file paths
    path_history TEXT DEFAULT '[]',      -- JSON array of path entries
    skills TEXT DEFAULT '{}',            -- JSON snapshot from developer_skills table
                                         -- e.g. {"frontend": {"react": 4.2, "css": 3.5}, "backend": {"node": 3.8}}
    baseline_competency REAL,            -- Snapshot from developers.baseline_competency
    expected_minutes REAL DEFAULT 480,   -- Snapshot from contributor_availability (today)
    effectiveness REAL DEFAULT 1.0,      -- Snapshot from contributor_availability (today)
    concurrent_sessions INTEGER DEFAULT 1, -- From developer_context
    session_started_at DATETIME,
    velocity_avg_minutes REAL,
    velocity_blow_up REAL,
    velocity_tasks_completed INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (developer) REFERENCES developers(name)
);
```

### Supabase: Validate existing `developer_twins` table

The existing Supabase schema (lines 91-117 of `supabase-schema.sql`) needs these changes:

```sql
-- CHANGE 1: Replace loaded_context JSONB with loaded_files TEXT[]
-- Reason: Files are the grounded signal. Modules/domains are derived and deferred.
ALTER TABLE developer_twins DROP COLUMN loaded_context;
ALTER TABLE developer_twins ADD COLUMN loaded_files TEXT[] DEFAULT '{}';

-- CHANGE 2: Replace skill_* INTEGER columns with skills JSONB
-- Reason: Skill tree is hierarchical (category/skill/rating), not 6 fixed columns.
ALTER TABLE developer_twins DROP COLUMN skill_react;
ALTER TABLE developer_twins DROP COLUMN skill_node;
ALTER TABLE developer_twins DROP COLUMN skill_database;
ALTER TABLE developer_twins DROP COLUMN skill_infra;
ALTER TABLE developer_twins DROP COLUMN skill_testing;
ALTER TABLE developer_twins DROP COLUMN skill_debugging;
ALTER TABLE developer_twins ADD COLUMN skills JSONB DEFAULT '{}';
ALTER TABLE developer_twins ADD COLUMN baseline_competency REAL;

-- CHANGE 3: Replace availability JSONB with explicit columns from data platform
ALTER TABLE developer_twins DROP COLUMN availability;
ALTER TABLE developer_twins ADD COLUMN expected_minutes REAL DEFAULT 480;
ALTER TABLE developer_twins ADD COLUMN effectiveness REAL DEFAULT 1.0;
ALTER TABLE developer_twins ADD COLUMN concurrent_sessions INTEGER DEFAULT 1;
ALTER TABLE developer_twins ADD COLUMN avg_session_minutes REAL;

-- CHANGE 4: Restructure velocity JSONB to explicit columns (minutes, not hours)
ALTER TABLE developer_twins DROP COLUMN velocity;
ALTER TABLE developer_twins ADD COLUMN velocity_avg_minutes REAL;
ALTER TABLE developer_twins ADD COLUMN velocity_blow_up REAL;
ALTER TABLE developer_twins ADD COLUMN velocity_tasks_completed INTEGER DEFAULT 0;

-- KEEP: path_history as JSONB (array of structured entries, variable length)
-- KEEP: trajectory as JSONB (computed at claim time, stored for cross-machine visibility)
-- KEEP: session_started_at, session_duration_minutes (already correct)
```

**Rationale for JSONB → explicit columns**: The original schema used JSONB for `loaded_context`, `availability`, and `velocity`. This hides the schema — callers don't know what keys exist without reading docs. Explicit columns are self-documenting, type-checked by Postgres, and indexable. The exception is `path_history` (variable-length array), `trajectory` (variable-length), and `skills` (hierarchical tree structure), which are genuinely variable-structure and suit JSONB.

---

## Population Plan Per Field

### At Session Start (n2o-session-hook.sh)

```bash
# 1. Identify developer
developer=$(git config user.name)
today=$(date +%Y-%m-%d)
hour=$(date +%H)

# 2. Snapshot skills from developer_skills table → JSON
skills_json=$(sqlite3 .pm/tasks.db "
  SELECT json_group_object(category,
    json_group_object(skill, rating))
  FROM developer_skills
  WHERE developer = '$developer';
")

# 3. Initialize local twin (reads from data platform tables)
sqlite3 .pm/tasks.db "
  INSERT OR REPLACE INTO developer_twins_local
    (developer, machine_id, session_started_at,
     skills, baseline_competency,
     expected_minutes, effectiveness, concurrent_sessions,
     velocity_avg_minutes, velocity_blow_up, velocity_tasks_completed)
  SELECT
    d.name,
    '$(hostname -s)',
    CURRENT_TIMESTAMP,
    '$skills_json',
    d.baseline_competency,
    COALESCE(ca.expected_minutes, 480),
    COALESCE(ca.effectiveness, 1.0),
    COALESCE((SELECT MAX(concurrent_sessions) FROM developer_context
              WHERE developer = d.name
              ORDER BY recorded_at DESC LIMIT 1), 1),
    ev.avg_minutes, ev.blow_up_ratio, ev.completed_tasks
  FROM developers d
  LEFT JOIN contributor_availability ca ON ca.developer = d.name AND ca.date = '$today'
  LEFT JOIN (
    SELECT owner, ROUND(AVG(actual_minutes)) as avg_minutes,
           ROUND(AVG(blow_up_ratio), 2) as blow_up_ratio,
           COUNT(*) as completed_tasks
    FROM effective_velocity WHERE owner = '$developer'
  ) ev ON ev.owner = d.name
  WHERE d.name = '$developer';
"

# 4. Write developer_context snapshot to data platform
sqlite3 .pm/tasks.db "
  INSERT INTO developer_context (developer, recorded_at, concurrent_sessions, hour_of_day)
  VALUES ('$developer', CURRENT_TIMESTAMP,
    $(count_active_agents "$developer"),
    $hour);
"

# 5. Sync to Supabase
supabase_update_twin "$developer" "session_started_at" "\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
supabase_update_twin "$developer" "machine_id" "\"$(hostname -s)\""
# (skills, availability, velocity synced via bulk update)
```

### At Task Completion (post-task hook or tdd-agent COMMIT phase)

```bash
# 1. Get files touched in this task's worktree
worktree_path="$WORKTREE_PATH"
base_branch="master"
files_json=$(cd "$worktree_path" && git diff --name-only "$(git merge-base HEAD $base_branch)..HEAD" | jq -R . | jq -s .)

# 2. Append to loaded_files (deduplicated)
sqlite3 .pm/tasks.db "
  UPDATE developer_twins_local
  SET loaded_files = (
    SELECT json_group_array(DISTINCT value)
    FROM (
      SELECT value FROM json_each(loaded_files)
      UNION
      SELECT value FROM json_each('$files_json')
    )
  )
  WHERE developer = '$developer';
"

# 3. Append to path_history (with pruning)
path_entry=$(jq -n \
  --arg sprint "$sprint" \
  --argjson task_num "$task_num" \
  --arg type "$task_type" \
  --argjson files "$files_json" \
  --arg completed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{sprint: $sprint, task_num: $task_num, type: $type, files: $files, completed_at: $completed_at}')

sqlite3 .pm/tasks.db "
  UPDATE developer_twins_local
  SET path_history = (
    SELECT json_group_array(value) FROM (
      SELECT value FROM json_each(path_history)
      WHERE json_extract(value, '$.completed_at') > datetime('now', '-7 days')
      UNION ALL
      SELECT '$path_entry'
      ORDER BY json_extract(value, '$.completed_at') DESC
      LIMIT 20
    )
  )
  WHERE developer = '$developer';
"

# 4. Recompute velocity from data platform's effective_velocity view
sqlite3 .pm/tasks.db "
  UPDATE developer_twins_local
  SET velocity_avg_minutes = (
        SELECT ROUND(AVG(actual_minutes)) FROM effective_velocity WHERE owner = '$developer'),
      velocity_blow_up = (
        SELECT ROUND(AVG(blow_up_ratio), 2) FROM effective_velocity WHERE owner = '$developer'),
      velocity_tasks_completed = (
        SELECT COUNT(*) FROM effective_velocity WHERE owner = '$developer')
  WHERE developer = '$developer';
"

# 5. Write developer_context snapshot to data platform (captures state at completion)
sqlite3 .pm/tasks.db "
  INSERT INTO developer_context (developer, recorded_at, concurrent_sessions, hour_of_day)
  VALUES ('$developer', CURRENT_TIMESTAMP,
    $(count_active_agents "$developer"),
    $(date +%H));
"

# 6. Write activity_log event to data platform
sqlite3 .pm/tasks.db "
  INSERT INTO activity_log (developer, action, sprint, task_num, summary)
  VALUES ('$developer', 'task_completed', '$sprint', $task_num,
    '$developer completed $sprint #$task_num');
"

# 7. Sync to Supabase
supabase_update_twin "$developer" "loaded_files" "$files_json"
supabase_update_twin "$developer" "path_history" "$(sqlite3 -json .pm/tasks.db \
  "SELECT path_history FROM developer_twins_local WHERE developer = '$developer';" | jq '.[0].path_history')"
```

### At Session End (trap handler)

```bash
# Clear session-scoped fields
sqlite3 .pm/tasks.db "
  UPDATE developer_twins_local
  SET loaded_files = '[]',
      session_started_at = NULL
  WHERE developer = '$developer';
"

# Write session_end to data platform activity_log
sqlite3 .pm/tasks.db "
  INSERT INTO activity_log (developer, action, summary, metadata)
  VALUES ('$developer', 'session_end',
    '$developer ended session after $elapsed_minutes minutes',
    json_object('session_duration_minutes', $elapsed_minutes));
"

# Sync cleared state to Supabase
supabase_update_twin "$developer" "loaded_files" "[]"
supabase_update_twin "$developer" "session_started_at" "null"
```

---

## Routing Interface Contract (for Task #9)

### Function Signature

```bash
# Input: available tasks (from SQLite), own twin (from SQLite), other working sets (from Supabase)
# Output: JSON array of [{sprint, task_num, score}] sorted by score descending
score_available_tasks() {
    local developer="$1"
    local db_path="${2:-.pm/tasks.db}"
    # Returns JSON on stdout
}
```

### Scoring Algorithm Pseudocode

```
for each task in available_tasks:
    score = 0.0
    weights = load_weights_from_config()  # or defaults

    # 1. Context match (0.35)
    if own_twin.loaded_files is not empty:
        # Use path_history files from same-spec tasks as proxy for task's expected files
        expected_files = files_from_same_spec(task.spec, own_twin.path_history)
        if expected_files is not empty:
            overlap = |intersection(expected_files, own_twin.loaded_files)| / |expected_files|
        else:
            overlap = 0.0
        score += weights.context_match * overlap

    # 2. Trajectory match (0.25)
    if own_twin.path_history is not empty:
        completed_tasks = [(p.sprint, p.task_num) for p in own_twin.path_history]
        if task directly depends on a completed task → traj = 1.0
        elif task is same-spec, higher task_num than a completed task → traj = 0.5
        else → traj = 0.0
        score += weights.trajectory_match * traj
    else:
        # Redistribute: +0.15 to context, +0.10 to skill
        weights.context_match += 0.15
        weights.skill_match += 0.10

    # 3. Skill match (0.15)
    # Look up best matching skill from twin.skills JSON (hierarchical tree)
    category, skill_name = map_type_to_skill(task.type)  # e.g., "frontend" → ("frontend", "react")
    rating = own_twin.skills.get(category, {}).get(skill_name, None)
    if rating is not None:
        score += weights.skill_match * (rating / 5.0)   # rating is 0.0-5.0 REAL
    else:
        score += weights.skill_match * 0.5  # neutral — no skill data for this type

    # 4. Availability fit (0.10)
    predicted_minutes = task.estimated_minutes * coalesce(own_twin.velocity_blow_up, 1.0)
    effective_remaining = own_twin.remaining_minutes / own_twin.concurrent_sessions
    if effective_remaining <= 0:
        fit = 0.0
    elif predicted_minutes <= effective_remaining:
        fit = 1.0
    else:
        fit = max(0, 1.0 - (predicted_minutes - effective_remaining) / predicted_minutes)
    score += weights.availability_fit * fit

    # 5. Overlap avoidance (0.10)
    if other_working_sets available:
        other_files = union(all other developers' active files)
        expected_files = files_from_same_spec(task.spec, own_twin.path_history)
        if expected_files is not empty:
            overlap = |intersection(expected_files, other_files)| / |expected_files|
            score += weights.overlap_avoidance * (1.0 - overlap)
        else:
            score += weights.overlap_avoidance * 1.0  # no files to overlap
    else:
        # Supabase unreachable — redistribute to context_match
        score += 0.10 * context_overlap  # reuse context_match computation

    # 6. Dependency unlock (0.05)
    unblocked = count_tasks_unblocked_by(task)
    max_unblockable = max(1, max_fan_out_in_sprint)
    score += weights.dependency_unlock * (unblocked / max_unblockable)

return sorted(tasks, key=score, reverse=True)
```

### Skill Matching (Type → Skill Tree Lookup)

The old spec mapped task types to 6 fixed skill columns. With the hierarchical skill tree from the data platform (`developer_skills` table), the mapping is now type → (category, skill):

| task.type | Skill Tree Lookup (category, skill) | Fallback |
|-----------|-------------------------------------|----------|
| `frontend` | `("frontend", "react")` | Max rating in `frontend` category |
| `database` | `("backend", "database")` | Max rating in `backend` category |
| `infra` | `("devops", "infra")` | Max rating in `devops` category |
| `actions` | `("backend", "node")` | Max rating in `backend` category |
| `agent` | `("backend", "node")` | Max rating in `backend` category |
| `e2e` | `("testing", "e2e")` | Max rating in `testing` category |
| `docs` | NULL | Score 0.5 (neutral) |

**Fallback logic**: If the exact (category, skill) pair doesn't exist for a developer, use the max rating across all skills in that category. If the category doesn't exist, score 0.5 (neutral). This gracefully handles developers who have category-level skills but haven't been rated on specific technologies.

**Future**: When enough task data accumulates, the type-to-skill mapping can be learned from actual performance data rather than hard-coded. This is a natural fit for the data platform's `developer_skills.source = 'calculated'` pattern.

---

## VICA Student Model Mapping

The Developer Digital Twin is inspired by VICA's Student Model. Here's the explicit mapping:

| VICA Student Model | Developer Digital Twin | Notes |
|--------------------|----------------------|-------|
| **Knowledge state** (what the student knows) | `developer_skills` table (hierarchical tree, REAL 0.0-5.0) | Manager-set AND calculated from performance data. Richer than VICA's single-dimension mastery. |
| **Mastery level** (how well they know it) | `velocity_by_type` + `blow_up_ratio` + `baseline_competency` | VICA measures P(correct); we measure speed, estimation accuracy per domain, and general aptitude. |
| **Engagement/fatigue** | `developer_context` (alertness, hour_of_day, concurrent_sessions) + `recent_revert_rate` | VICA detects disengagement; we capture environmental factors that correlate with quality. `alertness` is the closest analog. |
| **Learning trajectory** | `path_history` + `trajectory` | VICA's prerequisite graph = our `task_dependencies`. VICA's next best content = our trajectory-weighted routing. |
| **Zone of Proximal Development** | Task `complexity` (numeric REAL) vs developer skill rating + velocity | VICA avoids too-easy/too-hard content. Our routing avoids assigning high-complexity tasks to low-skill developers (via skill_match weight). Numeric complexity enables continuous ZPD targeting. |
| **Diagnostic bootstrapping** | `developer_skills.source = 'manager'` + `baseline_competency` | VICA runs a diagnostic test. We initialize from manager assessment. Both evolve toward calculated/measured values over time. |
| **Adaptive difficulty** | Not in MVP | VICA adjusts difficulty dynamically. Future: routing could prefer tasks at the edge of a developer's skill level to promote growth. Natural fit for Layer 2 Rules Engine. |

**Key difference**: VICA's Student Model is probabilistic (Bayesian knowledge tracing). The Developer Digital Twin is deterministic — it records what happened and computes scores from measured data. We don't need probabilistic inference because we observe the developer's actual output (commits, task completion, revert rate), not just their answers to questions. The data platform's `developer_context` adds environmental factors VICA doesn't model (concurrent sessions, time-of-day effects).

---

## config.json Team Array Extension

The config.json team array provides bootstrap data for developers. Daily availability is now sourced from the data platform's `contributor_availability` table (synced from the external custom system), but config.json serves as the fallback when that table has no entry for today:

```json
{
  "team": [
    {
      "name": "wiley",
      "default_daily_minutes": 480,
      "role": "fullstack"
    },
    {
      "name": "ada",
      "default_daily_minutes": 360,
      "role": "frontend"
    }
  ]
}
```

The session hook reads availability from: `contributor_availability` (today) → config.json `default_daily_minutes` → 480 (8 hours).

---

## Open Items (NOT blocking Task #9)

These are documented for awareness. None block implementation.

1. **Task expected files heuristic**: MVP uses "files from same-spec completed tasks" as a proxy. Post-MVP could parse task descriptions for file paths or use pm-agent to annotate tasks with expected files at planning time.
2. **Weight tuning**: Initial weights are educated guesses. After routing has been running for 2-3 sprints, analyze outcomes (did the developer actually complete the task faster than alternatives?) and tune weights.
3. **Multi-machine twin merge**: If a developer runs sessions on two machines simultaneously, their twins could diverge. Supabase `updated_at` timestamp + last-write-wins is sufficient for MVP. Post-MVP could merge loaded_files arrays.
4. **Routing → Rules Engine migration**: The `score_task()` function is a natural candidate for the data platform's Layer 2 Rules Engine (see `specs/data-platform.md`). When the rules engine ships, the 6-signal scoring function becomes a composable, testable, explainable rule rather than a standalone bash function. The twin still provides the real-time operational data; the rules engine provides the scoring logic.
5. **Calculated skill ratings**: As task completion data accumulates, `developer_skills.source = 'calculated'` entries can be auto-generated from velocity-by-type data. E.g., if a developer consistently completes frontend tasks 40% faster than average with low blow-up ratios, their `frontend > react` rating increases. This is a data platform concern but feeds back into the twin's skill snapshot.
