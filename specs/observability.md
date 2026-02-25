# N2O Observability System

**Status**: Done

## What We Want

Know whether our people and AI systems are producing good software. Know what's working, what's being reverted, what types of mistakes people make, and where our skills are failing. Use this data to train people and improve our tools.

## What We Already Have

The tasks table already captures timing (`started_at`, `completed_at`), quality grades (`testing_posture` A-F), reversions (auto-incremented on backward status changes), estimation accuracy, and developer velocity. 11 analytics views exist. This is good outcome data.

**What's missing:** the process that produced those outcomes. We don't know which skills fired, how long each phase took, why reversions happened, or what the conversation looked like that led to bad code.

## What We Learned

**Transcripts already exist.** Claude Code saves full JSONL transcripts automatically at `~/.claude/projects/{project-path}/{session-uuid}.jsonl`. Every conversation is already on disk. We don't need to build capture — we need collection and indexing.

**Storage is trivial.** Real numbers from this machine:
- 5 sessions for this project: **15 MB total**
- 10 projects, ~50 sessions: **439 MB total**
- Largest single session ever: **68 MB**
- Projected cost at 5 developers, heavy usage: **~20-25 GB/year**
- A single Zoom recording is larger than a year of transcripts

**Claude Code has hooks.** Events available: `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`. A shell script hook can log every skill invocation automatically — zero changes to SKILL.md required.

**Session IDs already exist.** Every JSONL transcript contains a `sessionId` field. We don't need to generate one — we just need to read it.

---

## Goals (Ranked)

### 1. JSONL Transcript Parsing

**What:** A script that parses Claude Code's existing JSONL transcript files and loads structured event data into a `workflow_events` table in the observability database.

**Why first:** Claude Code already saves complete JSONL transcripts at `~/.claude/projects/{project-path}/{session-uuid}.jsonl`. Every tool call, subagent spawn, token count, and timestamp is already on disk. We don't need real-time capture — we need parsing and indexing.

**Why not hooks:** Hooks fire on every tool call and add latency to the workflow. They also require maintaining hook scripts and ensuring they don't break. The JSONL transcripts contain strictly more data than hooks provide (full tool input/output, token usage, model info, subagent transcripts). Hooks are better suited for blocking/safety (see "Future: Hooks" section below).

**How:**

A `scripts/collect-transcripts.sh` script that:
1. Reads the project path from `.pm/config.json`
2. Finds JSONL files in `~/.claude/projects/{encoded-path}/`
3. For each session, extracts:
   - Session metadata (session_id, timestamps, message counts, file size)
   - Tool calls (name, input, output, timing from adjacent events)
   - Subagent spawns (agent_id, agent_type, transcript path)
   - Token usage (input_tokens, output_tokens per assistant message)
   - Skill invocations (Skill tool calls with skill name)
4. Inserts into `workflow_events` and `transcripts` tables
5. Skips sessions already indexed (idempotent)

**What the JSONL contains:**
- Every assistant message has a `usage` block: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
- Every tool call appears as a `content` block with `type: "tool_use"`, `name`, `input`
- Tool results appear with `type: "tool_result"`
- Subagent transcripts stored at `{session}/subagents/agent-{id}.jsonl`
- All events are timestamped

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS workflow_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT,
    sprint TEXT,
    task_num INTEGER,
    event_type TEXT NOT NULL,       -- tool_call, subagent_spawn, phase_entered,
                                    -- task_completed, skill_invoked, session_start, session_end
    tool_name TEXT,                 -- Read, Edit, Write, Bash, Task, Skill, Glob, Grep...
    tool_use_id TEXT,               -- Links tool call to its result
    skill_name TEXT,                -- For Skill tool: which skill was invoked
    skill_version TEXT,
    phase TEXT,                     -- RED, GREEN, REFACTOR, AUDIT, etc (from SKILL.md markers)
    agent_id TEXT,                  -- For subagent events
    agent_type TEXT,                -- Explore, Plan, Bash, etc
    metadata TEXT,                  -- JSON blob: tool_input, tool_output, token counts, etc
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);

CREATE INDEX IF NOT EXISTS idx_events_session ON workflow_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_task ON workflow_events(sprint, task_num);
CREATE INDEX IF NOT EXISTS idx_events_type ON workflow_events(event_type);
```

#### Sub-goals
- 1a. Add `workflow_events` table to schema.sql
- 1b. Write `scripts/collect-transcripts.sh` (JSONL parser + indexer)
- 1c. Add session_id column to tasks table (set when task is claimed)
- 1d. Add `n2o stats` CLI command to surface parsed data

---

### 2. Transcript Collection

**What:** A script that indexes Claude Code's existing transcript files and links them to tasks/sprints.

**Why:** The transcripts already exist at `~/.claude/projects/{path}/{session}.jsonl`. Storage is ~3 MB per session average, ~25 GB/year worst case for a 5-person team. This is not expensive. Just collect them.

**How:**

A `transcripts` table that indexes what already exists on disk:

```sql
CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    sprint TEXT,
    task_num INTEGER,
    file_path TEXT NOT NULL,        -- path to the JSONL file
    file_size_bytes INTEGER,
    message_count INTEGER,
    started_at DATETIME,
    ended_at DATETIME,
    summary TEXT,                    -- optional: AI-generated summary
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);
```

A collection script (`scripts/collect-transcripts.sh`) that:
1. Reads the project path from `.pm/config.json`
2. Finds all JSONL files in `~/.claude/projects/{encoded-path}/`
3. Extracts `sessionId`, message count, timestamps, file size from each
4. Inserts into the `transcripts` table if not already indexed
5. Optionally copies the JSONL to `.pm/transcripts/` for centralized storage

The script doesn't move or modify the originals. It just indexes them.

For linking transcripts to tasks: when a developer claims a task, the session ID from the current conversation gets stored on the task. The `workflow_events` from Goal 1 also carry session IDs. Between these two, we can correlate any transcript to the tasks worked on during that session.

**Analysis later:** We can figure out how to break down, summarize, or search transcripts as a separate concern. The first step is just knowing they exist and having them indexed. A future step could run Claude over each transcript to generate a structured summary, extract key decisions, count tool calls, etc. But that's analysis tooling, not capture.

#### Sub-goals
- 2a. Add `transcripts` table to schema.sql
- 2b. Write `scripts/collect-transcripts.sh`
- 2c. Add `session_id` column to tasks table (set when task is claimed)
- 2d. Add transcript collection to sprint-end workflow in pm-agent

---

### 3. Phase-Level Timing in TDD Workflow

**What:** Add INSERTs to tdd-agent SKILL.md that log phase transitions to `workflow_events`. This supplements the automatic hook logging (Goal 1) with semantic phase data that hooks can't infer.

**Why:** Hooks tell us what tools were called. Phase logging tells us what the agent was trying to do. "10 minutes in RED, 5 minutes in GREEN, 45 minutes in AUDIT fix loop" is directly actionable — it tells you the audit is the bottleneck.

**How:** ~8 single-line SQLite INSERTs in tdd-agent SKILL.md, one at each phase transition:

```sql
-- At start of RED phase:
sqlite3 .pm/tasks.db "INSERT INTO workflow_events
  (sprint, task_num, event_type, skill_name, phase)
  VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'RED');"
```

These go immediately after the existing status UPDATE statements that already exist in the SKILL.md. One line per phase. The duration gets calculated by diffing timestamps between `phase_entered` and the next `phase_entered`.

Also add a decision summary at the REPORT phase:

```sql
sqlite3 .pm/tasks.db "INSERT INTO workflow_events
  (sprint, task_num, event_type, skill_name, phase, metadata)
  VALUES ('${sprint}', ${taskNum}, 'task_completed', 'tdd-agent', 'REPORT',
    '{\"fix_audit_iterations\": N, \"patterns_found\": N, \"user_interventions\": N}');"
```

#### Sub-goals
- 3a. Add phase-transition INSERTs to tdd-agent SKILL.md (~8 lines)
- 3b. Add decision summary INSERT to REPORT phase
- 3c. Add phase logging to pm-agent and bug-workflow

---

### 4. Analysis Views + Reporting

**What:** SQL views over existing + new data, plus an `n2o stats` CLI command to surface them.

**Why:** Data without a consumer is dead. The views make insights queryable; the CLI command makes them visible.

**Views to add:**

```sql
-- Developer improvement over time
CREATE VIEW IF NOT EXISTS developer_learning_rate AS
SELECT owner, sprint,
    COUNT(*) as tasks,
    ROUND(AVG(
        (julianday(completed_at) - julianday(started_at)) * 24 /
        NULLIF(estimated_hours, 0)
    ), 2) as avg_blow_up_ratio
FROM tasks
WHERE started_at IS NOT NULL AND completed_at IS NOT NULL
    AND estimated_hours IS NOT NULL AND owner IS NOT NULL
GROUP BY owner, sprint;

-- Most common audit failures by developer
CREATE VIEW IF NOT EXISTS common_audit_findings AS
SELECT owner,
    SUM(CASE WHEN pattern_audit_notes LIKE '%fake test%' THEN 1 ELSE 0 END)
        as fake_test_incidents,
    SUM(CASE WHEN pattern_audit_notes LIKE '%violation%' THEN 1 ELSE 0 END)
        as pattern_violations,
    SUM(CASE WHEN testing_posture != 'A' THEN 1 ELSE 0 END)
        as below_a_grade,
    SUM(reversions) as total_reversions,
    COUNT(*) as total_tasks
FROM tasks WHERE pattern_audited = 1 AND owner IS NOT NULL
GROUP BY owner;

-- Which task types cause the most trouble
CREATE VIEW IF NOT EXISTS reversion_hotspots AS
SELECT type, complexity,
    COUNT(*) as tasks,
    SUM(reversions) as total_reversions,
    ROUND(AVG(reversions), 2) as avg_reversions,
    ROUND(AVG(CASE WHEN testing_posture = 'A' THEN 1.0 ELSE 0.0 END), 2) as a_grade_rate
FROM tasks WHERE status = 'green' AND owner IS NOT NULL
GROUP BY type, complexity;

-- Skill invocation frequency (from hooks data)
CREATE VIEW IF NOT EXISTS skill_usage AS
SELECT skill_name,
    COUNT(*) as invocations,
    COUNT(DISTINCT session_id) as sessions,
    MIN(timestamp) as first_used,
    MAX(timestamp) as last_used
FROM workflow_events
WHERE event_type IN ('tool_pre', 'skill_invoked')
GROUP BY skill_name;

-- Phase time distribution (from tdd-agent phase logging)
CREATE VIEW IF NOT EXISTS phase_timing AS
SELECT e1.sprint, e1.task_num, e1.phase,
    ROUND((julianday(e2.timestamp) - julianday(e1.timestamp)) * 86400) as seconds
FROM workflow_events e1
JOIN workflow_events e2 ON e1.sprint = e2.sprint
    AND e1.task_num = e2.task_num
    AND e2.id = (
        SELECT MIN(id) FROM workflow_events
        WHERE id > e1.id AND sprint = e1.sprint
            AND task_num = e1.task_num AND event_type = 'phase_entered'
    )
WHERE e1.event_type = 'phase_entered';
```

**`n2o stats` command:** Add to the `n2o` CLI. Queries the key views and prints a formatted summary.

#### Sub-goals
- 4a. Add views to schema.sql
- 4b. Add `n2o stats` command to CLI
- 4c. Add sprint-end stats step to pm-agent

---

### 5. Design Constraints

Not goals to build — rules that apply to everything above.

**Pair negative metrics with positive ones.** Reversions + first-attempt pass rate. Speed + quality grade. A developer with high course corrections and high pass rate is better than one who never course-corrects but ships C-grade code.

**Aggregate for the team, detail for the individual.** Sprint dashboards show team averages. Individual data is visible to the individual and their direct manager. The question is "which task types are slow?" not "which developer is slow?"

**Every metric needs a consumer.** If `n2o stats` doesn't print it and pm-agent doesn't check it, the view is dead code. Don't add views that nobody will look at.

---

## Implementation Order

### Step 1: Schema additions
- `workflow_events` table
- `transcripts` table
- `session_id` column on tasks
- 5 new analysis views

### Step 2: JSONL transcript parser
- `scripts/collect-transcripts.sh` — parses JSONL files, populates both tables
- Idempotent (skips already-indexed sessions)

### Step 3: CLI + reporting
- `n2o stats` CLI command
- Sprint-end transcript collection in pm-agent

### Step 4: SKILL.md additions (optional, validated by linter)
- Phase-transition INSERTs in tdd-agent (~8 lines)
- Decision summary in REPORT phase
- Skill linter to verify required markers exist

All of this is straightforward. The schema is SQL. The collection is a bash script that parses JSONL files. The views are queries. None of this requires new infrastructure or services.

---

## Future: Hooks for Blocking & Safety

Claude Code provides 18 hook events (`PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, etc.). Each receives JSON on stdin with `session_id`, `transcript_path`, and event-specific data.

**We are NOT using hooks for logging.** JSONL transcript parsing (Goal 1) captures everything hooks would capture and more — tool inputs/outputs, token usage, subagent transcripts — without adding latency to the workflow.

**Hooks should be added later for:**

1. **Blocking unsafe operations** — A `PreToolUse` hook that intercepts dangerous commands (e.g., `git push --force`, `rm -rf`, `DROP TABLE`) and blocks them before execution. The hook returns a non-zero exit code to prevent the tool from running.

2. **Real-time safety guardrails** — Enforce constraints like "never modify files outside the project directory" or "never run commands that require network access without confirmation."

3. **Live dashboards** — If we build a real-time dashboard that needs streaming event data (not batch-parsed from JSONL), hooks provide the streaming interface.

4. **Credit budget enforcement** — A hook that tracks cumulative token usage within a session and pauses/warns when approaching a budget limit. Would need to parse `usage` blocks from PostToolUse responses.

**When to implement:** After the JSONL parsing pipeline is working and we have data to analyze. Hooks are a real-time layer on top of the batch analysis foundation. They're additive, not foundational.
