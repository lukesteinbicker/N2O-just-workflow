-- NOS Data Platform Schema
-- Initialize with: sqlite3 .pm/tasks.db < .pm/schema.sql

-- =============================================================================
-- TABLES
-- =============================================================================

-- Tasks table: Primary Key is (sprint, task_num)
CREATE TABLE IF NOT EXISTS tasks (
    sprint TEXT NOT NULL,
    task_num INTEGER NOT NULL,
    spec TEXT,                          -- Spec file name (e.g., '01-deals-pipeline.md')
    title TEXT NOT NULL,
    description TEXT,                   -- Context (executable in isolation)
    done_when TEXT,                     -- What makes this done
    status TEXT DEFAULT 'pending',      -- pending, red, green, blocked
    blocked_reason TEXT,                -- Why task is blocked (if status = blocked)
    type TEXT,                          -- database, actions, frontend, infra, agent, e2e, docs
    owner TEXT,                         -- Engineer assigned
    skills TEXT,                        -- Comma-separated skills to invoke

    -- Audit tracking
    pattern_audited BOOLEAN DEFAULT 0,  -- Dev agent audited patterns after implementation
    pattern_audit_notes TEXT,           -- What patterns were found/documented
    skills_updated BOOLEAN DEFAULT 0,   -- Dev agent updated relevant skills
    skills_update_notes TEXT,           -- What skill updates were made
    tests_pass BOOLEAN DEFAULT 0,       -- All tests passing
    testing_posture TEXT,               -- Grade: A, B, C, D, F (target: A)
    verified BOOLEAN DEFAULT 0,         -- PM verified task completion

    -- Velocity tracking (auto-populated by triggers)
    started_at DATETIME,                -- Auto-set when status changes from 'pending'
    completed_at DATETIME,              -- Auto-set when status changes to 'green'
    verified_at DATETIME,               -- Set when user marks task as verified (manual or via CLI)

    -- Estimation and complexity (set by PM during task breakdown)
    estimated_minutes REAL,             -- PM's estimate in minutes at planning time
    complexity TEXT,                     -- low, medium, high, unknown
    complexity_notes TEXT,              -- Why (e.g., 'unstable API', 'heavy integration')
    reversions INTEGER DEFAULT 0,       -- Times status went backward (green→red, green→blocked)

    -- Priority and scheduling
    priority REAL,                      -- Ordering within a sprint. Lower=first. Use midpoints to
                                        -- insert (1.0, 2.0, 3.0 → insert 1.5 between 1 and 2). NULL=unordered.
    priority_reason TEXT,               -- Why this ordering (e.g., 'blocks all observability work')
    assignment_reason TEXT,             -- Why assigned to this person (e.g., 'strongest at bash scripting')
    horizon TEXT DEFAULT 'active',      -- When to think about this: active, next, later, icebox
    session_id TEXT,                    -- Claude Code session ID (set when task is claimed)

    -- Git tracking (set by commit-task.sh script)
    commit_hash TEXT,                   -- Git commit hash after task completion
    merged_at DATETIME,                 -- When task branch was merged into base (set by merge-queue.sh)
    lines_added INTEGER,                -- Lines added in commit (from git diff --numstat)
    lines_removed INTEGER,              -- Lines removed in commit (from git diff --numstat)

    -- External PM tool sync (Linear, Asana, Jira, etc.)
    external_id TEXT,                   -- Linear issue ID, Asana task ID, etc.
    external_url TEXT,                  -- Link to task in PM tool
    last_synced_at DATETIME,            -- When this task was last synced

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (sprint, task_num),

    -- Data integrity constraints
    CHECK (status IN ('pending', 'red', 'green', 'blocked')),
    CHECK (type IS NULL OR type IN ('database', 'actions', 'frontend', 'infra', 'agent', 'e2e', 'docs')),
    CHECK (testing_posture IS NULL OR testing_posture IN ('A', 'B', 'C', 'D', 'F')),
    CHECK (complexity IS NULL OR complexity IN ('low', 'medium', 'high', 'unknown')),
    CHECK (horizon IS NULL OR horizon IN ('active', 'next', 'later', 'icebox'))
);

-- Developers table: Developer profiles and skill ratings
CREATE TABLE IF NOT EXISTS developers (
    name TEXT PRIMARY KEY,              -- Short identifier (e.g., 'luke', 'ella', 'manda')
    full_name TEXT NOT NULL,
    role TEXT,                          -- e.g., 'frontend', 'backend', 'fullstack'

    -- Skill ratings (1-5, updated periodically by manager)
    skill_react INTEGER,
    skill_node INTEGER,
    skill_database INTEGER,
    skill_infra INTEGER,
    skill_testing INTEGER,
    skill_debugging INTEGER,

    -- External time-tracking provider user ID (currently Toggl)
    time_tracking_user_id INTEGER,

    -- Thinking style / strengths (free text, manager-written)
    strengths TEXT,                     -- e.g., 'Strong systems thinker, good at decomposition'
    growth_areas TEXT,                  -- e.g., 'Tends to over-engineer, needs more testing discipline'

    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task dependencies table
CREATE TABLE IF NOT EXISTS task_dependencies (
    sprint TEXT NOT NULL,
    task_num INTEGER NOT NULL,
    depends_on_sprint TEXT NOT NULL,
    depends_on_task INTEGER NOT NULL,
    PRIMARY KEY (sprint, task_num, depends_on_sprint, depends_on_task),
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num),
    FOREIGN KEY (depends_on_sprint, depends_on_task) REFERENCES tasks(sprint, task_num)
);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Available tasks: Pending tasks with no unfinished dependencies AND not claimed
-- Dependency-aware gating: predecessors must be green AND merged (code integrated),
-- not just status = 'green'. This prevents agents from building on unmerged code.
DROP VIEW IF EXISTS available_tasks;
CREATE VIEW available_tasks AS
SELECT t.*
FROM tasks t
WHERE t.status = 'pending'
  AND t.owner IS NULL
  AND t.horizon = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM task_dependencies d
    JOIN tasks dep ON dep.sprint = d.depends_on_sprint AND dep.task_num = d.depends_on_task
    WHERE d.sprint = t.sprint
      AND d.task_num = t.task_num
      AND (dep.status != 'green' OR dep.merged_at IS NULL)
  )
ORDER BY t.priority ASC NULLS LAST;

-- Blocked tasks: Tasks with status = 'blocked'
CREATE VIEW IF NOT EXISTS blocked_tasks AS
SELECT sprint, task_num, title, blocked_reason, owner
FROM tasks
WHERE status = 'blocked';

-- Sprint progress: Summary of task statuses per sprint
CREATE VIEW IF NOT EXISTS sprint_progress AS
SELECT
    sprint,
    COUNT(*) as total_tasks,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN status = 'red' THEN 1 ELSE 0 END) as red,
    SUM(CASE WHEN status = 'green' THEN 1 ELSE 0 END) as green,
    SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
    SUM(CASE WHEN pattern_audited = 1 THEN 1 ELSE 0 END) as audited,
    SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified,
    ROUND(100.0 * SUM(CASE WHEN status = 'green' THEN 1 ELSE 0 END) / COUNT(*), 1) as percent_complete
FROM tasks
GROUP BY sprint;

-- Needs pattern audit: Green tasks that haven't been audited
CREATE VIEW IF NOT EXISTS needs_pattern_audit AS
SELECT sprint, task_num, title, owner
FROM tasks
WHERE status = 'green'
  AND pattern_audited = 0;

-- Needs verification: Green and audited tasks pending PM verification
CREATE VIEW IF NOT EXISTS needs_verification AS
SELECT sprint, task_num, title, done_when, owner
FROM tasks
WHERE status = 'green'
  AND pattern_audited = 1
  AND verified = 0;

-- Refactor audit: Tasks with skills_update_notes (patterns identified)
CREATE VIEW IF NOT EXISTS refactor_audit AS
SELECT sprint, task_num, title, skills_update_notes
FROM tasks
WHERE skills_update_notes IS NOT NULL
  AND skills_update_notes != '';

-- Velocity report: Task completion times
CREATE VIEW IF NOT EXISTS velocity_report AS
SELECT
    sprint,
    task_num,
    title,
    started_at,
    completed_at,
    ROUND((julianday(completed_at) - julianday(started_at)) * 1440, 1) as minutes_to_complete
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
ORDER BY sprint, task_num;

-- Sprint velocity: Average completion time per sprint
CREATE VIEW IF NOT EXISTS sprint_velocity AS
SELECT
    sprint,
    COUNT(*) as completed_tasks,
    ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 1440), 1) as avg_minutes_per_task,
    ROUND(SUM((julianday(completed_at) - julianday(started_at)) * 1440), 1) as total_minutes
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
GROUP BY sprint;

-- Developer velocity: average minutes per task, by person
CREATE VIEW IF NOT EXISTS developer_velocity AS
SELECT
    owner,
    COUNT(*) as completed_tasks,
    ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 1440), 1) as avg_minutes,
    ROUND(MIN((julianday(completed_at) - julianday(started_at)) * 1440), 1) as fastest,
    ROUND(MAX((julianday(completed_at) - julianday(started_at)) * 1440), 1) as slowest
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND owner IS NOT NULL
GROUP BY owner;

-- Estimation accuracy: how close estimates are to actuals, by person
CREATE VIEW IF NOT EXISTS estimation_accuracy AS
SELECT
    owner,
    COUNT(*) as tasks_with_estimates,
    ROUND(AVG(estimated_minutes), 1) as avg_estimated,
    ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 1440), 1) as avg_actual,
    ROUND(
        AVG((julianday(completed_at) - julianday(started_at)) * 1440) /
        NULLIF(AVG(estimated_minutes), 0),
    2) as blow_up_ratio,  -- >1 means tasks take longer than estimated
    ROUND(AVG(ABS(
        (julianday(completed_at) - julianday(started_at)) * 1440 - estimated_minutes
    )), 1) as avg_error_minutes
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND estimated_minutes IS NOT NULL
  AND owner IS NOT NULL
GROUP BY owner;

-- Estimation accuracy by task type: are we worse at estimating frontend vs database?
CREATE VIEW IF NOT EXISTS estimation_accuracy_by_type AS
SELECT
    type,
    COUNT(*) as tasks,
    ROUND(AVG(estimated_minutes), 1) as avg_estimated,
    ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 1440), 1) as avg_actual,
    ROUND(
        AVG((julianday(completed_at) - julianday(started_at)) * 1440) /
        NULLIF(AVG(estimated_minutes), 0),
    2) as blow_up_ratio
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND estimated_minutes IS NOT NULL
GROUP BY type;

-- Estimation accuracy by complexity: do "high" complexity tasks blow up more?
CREATE VIEW IF NOT EXISTS estimation_accuracy_by_complexity AS
SELECT
    complexity,
    COUNT(*) as tasks,
    ROUND(AVG(estimated_minutes), 1) as avg_estimated,
    ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 1440), 1) as avg_actual,
    ROUND(
        AVG((julianday(completed_at) - julianday(started_at)) * 1440) /
        NULLIF(AVG(estimated_minutes), 0),
    2) as blow_up_ratio
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND estimated_minutes IS NOT NULL
  AND complexity IS NOT NULL
GROUP BY complexity;

-- Developer quality: reversions and testing posture by person
CREATE VIEW IF NOT EXISTS developer_quality AS
SELECT
    owner,
    COUNT(*) as total_tasks,
    SUM(reversions) as total_reversions,
    ROUND(1.0 * SUM(reversions) / COUNT(*), 2) as reversions_per_task,
    SUM(CASE WHEN testing_posture = 'A' THEN 1 ELSE 0 END) as a_grades,
    ROUND(100.0 * SUM(CASE WHEN testing_posture = 'A' THEN 1 ELSE 0 END) / COUNT(*), 1) as a_grade_pct
FROM tasks
WHERE owner IS NOT NULL
  AND status = 'green'
GROUP BY owner;

-- Workflow events: Tool calls, skill invocations, phase transitions, subagent spawns
-- Populated by JSONL transcript parsing (scripts/collect-transcripts.sh)
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
    agent_type TEXT,                -- Explore, Plan, Bash, claude-code-guide, etc
    input_tokens INTEGER,            -- Tokens in context window for this assistant turn
    output_tokens INTEGER,           -- Tokens generated in this turn's response
    tool_calls_in_msg INTEGER,       -- How many tool calls shared these token counts
    metadata TEXT,                  -- JSON blob: tool_input, tool_output, token counts, etc
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);

-- Transcripts: Index of Claude Code JSONL session files
-- Maps sessions to tasks and tracks token usage
CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    parent_session_id TEXT,          -- For subagent transcripts
    agent_id TEXT,                   -- For subagent transcripts
    file_path TEXT NOT NULL,         -- Path to the JSONL file on disk
    file_size_bytes INTEGER,
    message_count INTEGER,
    user_message_count INTEGER,
    assistant_message_count INTEGER,
    tool_call_count INTEGER,
    total_input_tokens INTEGER,
    total_output_tokens INTEGER,
    estimated_cost_usd REAL,           -- Dollar cost estimate (tokens x model rate card)
    model TEXT,
    started_at DATETIME,
    ended_at DATETIME,
    sprint TEXT,
    task_num INTEGER,
    user_message_timestamps TEXT,       -- JSON array of user message ISO timestamps
    cache_read_tokens INTEGER DEFAULT 0,      -- Sum of cache_read_input_tokens from assistant messages
    cache_creation_tokens INTEGER DEFAULT 0,  -- Sum of cache_creation_input_tokens from assistant messages
    total_user_content_length INTEGER DEFAULT 0,  -- Sum of character length of all user message content
    -- Comprehensive JSONL extraction (migration 006)
    stop_reason_counts TEXT,               -- JSON: {"end_turn": N, "max_tokens": N, "tool_use": N}
    thinking_message_count INTEGER DEFAULT 0,  -- Number of assistant messages with thinking blocks
    thinking_total_length INTEGER DEFAULT 0,   -- Total character length of all thinking content
    service_tier TEXT,                     -- Service tier from assistant message usage (e.g. "standard")
    has_sidechain INTEGER DEFAULT 0,       -- 1 if any user message has isSidechain=true
    system_error_count INTEGER DEFAULT 0,  -- Count of system messages with subtype="error"
    system_retry_count INTEGER DEFAULT 0,  -- Count of system messages with subtype="retry"
    avg_turn_duration_ms INTEGER,          -- Average turn duration from system subtype="turn_duration"
    tool_result_error_count INTEGER DEFAULT 0,  -- Count of toolUseResult entries with isError=true
    compaction_count INTEGER DEFAULT 0,    -- Count of system messages with subtype="compaction"
    -- Session context and additional signals (migration 007)
    cwd TEXT,                              -- Working directory from first message with cwd field
    git_branch TEXT,                       -- Git branch from first message with gitBranch field
    assistant_message_timestamps TEXT,     -- JSON array of assistant message ISO timestamps
    background_task_count INTEGER DEFAULT 0,  -- Count of queue-operation messages (async work)
    web_search_count INTEGER DEFAULT 0,    -- Count of web search requests from server_tool_use
    synced_at DATETIME,                    -- When this row was last synced to Supabase (NULL = not synced)
    sync_attempts INTEGER DEFAULT 0,       -- Number of failed sync attempts (skip after 5)
    sync_error TEXT,                       -- Last sync error message (NULL = no error)
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);

-- Messages: full content of every conversation message (no truncation)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    message_index INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT,
    timestamp TEXT,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    stop_reason TEXT,
    synced_at DATETIME,
    UNIQUE (session_id, message_index)
);

-- Tool calls: full input params for every tool invocation
CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    message_index INTEGER NOT NULL,
    tool_index INTEGER NOT NULL,
    tool_use_id TEXT,
    tool_name TEXT NOT NULL,
    input TEXT NOT NULL,  -- JSON string
    output TEXT,
    is_error INTEGER DEFAULT 0,
    timestamp TEXT,
    synced_at DATETIME,
    UNIQUE (session_id, message_index, tool_index)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name);

-- Developer learning rate: estimation accuracy trend by sprint
-- A blow-up ratio approaching 1.0 means improving estimation skills
CREATE VIEW IF NOT EXISTS developer_learning_rate AS
SELECT owner, sprint,
    COUNT(*) as tasks,
    ROUND(AVG(
        (julianday(completed_at) - julianday(started_at)) * 1440 /
        NULLIF(estimated_minutes, 0)
    ), 2) as avg_blow_up_ratio
FROM tasks
WHERE started_at IS NOT NULL AND completed_at IS NOT NULL
    AND estimated_minutes IS NOT NULL AND owner IS NOT NULL
GROUP BY owner, sprint;

-- Common audit findings: which developers have the most audit problems, and what kinds
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

-- Reversion hotspots: which task types and complexities cause the most trouble
CREATE VIEW IF NOT EXISTS reversion_hotspots AS
SELECT type, complexity,
    COUNT(*) as tasks,
    SUM(reversions) as total_reversions,
    ROUND(AVG(reversions), 2) as avg_reversions,
    ROUND(AVG(CASE WHEN testing_posture = 'A' THEN 1.0 ELSE 0.0 END), 2) as a_grade_rate
FROM tasks WHERE status = 'green' AND owner IS NOT NULL
GROUP BY type, complexity;

-- Skill usage: how frequently each tool/skill is used across sessions
CREATE VIEW IF NOT EXISTS skill_usage AS
SELECT tool_name,
    COUNT(*) as invocations,
    COUNT(DISTINCT session_id) as sessions,
    MIN(timestamp) as first_used,
    MAX(timestamp) as last_used
FROM workflow_events
WHERE event_type = 'tool_call'
GROUP BY tool_name;

-- Phase timing: how long each TDD phase takes (by diffing consecutive phase_entered events)
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

-- Skill token usage: Per-skill token totals and averages by sprint
DROP VIEW IF EXISTS skill_token_usage;
CREATE VIEW IF NOT EXISTS skill_token_usage AS
SELECT
    skill_name,
    sprint,
    COUNT(*) as invocations,
    COALESCE(SUM(input_tokens / NULLIF(tool_calls_in_msg, 0)), 0) as total_input_tokens,
    COALESCE(SUM(output_tokens / NULLIF(tool_calls_in_msg, 0)), 0) as total_output_tokens,
    ROUND(AVG((input_tokens + output_tokens) / NULLIF(tool_calls_in_msg, 0)), 0) as avg_tokens_per_call
FROM workflow_events
WHERE event_type = 'tool_call' AND input_tokens IS NOT NULL
GROUP BY skill_name, sprint;

-- Skill duration: Duration per skill invocation
DROP VIEW IF EXISTS skill_duration;
CREATE VIEW IF NOT EXISTS skill_duration AS
SELECT
    e1.skill_name,
    e1.sprint,
    e1.task_num,
    ROUND((julianday(e2.timestamp) - julianday(e1.timestamp)) * 86400) as seconds
FROM workflow_events e1
JOIN workflow_events e2
    ON e1.sprint = e2.sprint AND e1.task_num = e2.task_num
    AND e2.event_type = 'task_completed' AND e2.skill_name = e1.skill_name
WHERE e1.event_type = 'skill_invoked';

-- Skill precision: Files read vs modified per task, exploration ratio
DROP VIEW IF EXISTS skill_precision;
CREATE VIEW IF NOT EXISTS skill_precision AS
SELECT
    we.sprint,
    we.task_num,
    COUNT(DISTINCT CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep')
        THEN json_extract(we.metadata, '$.file_path') END) as files_read,
    COUNT(DISTINCT CASE WHEN we.tool_name IN ('Edit', 'Write')
        THEN json_extract(we.metadata, '$.file_path') END) as files_modified,
    CASE
        WHEN COUNT(DISTINCT CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep')
            THEN json_extract(we.metadata, '$.file_path') END) > 0
        THEN ROUND(1.0 - (
            1.0 * COUNT(DISTINCT CASE WHEN we.tool_name IN ('Edit', 'Write')
                THEN json_extract(we.metadata, '$.file_path') END) /
            COUNT(DISTINCT CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep')
                THEN json_extract(we.metadata, '$.file_path') END)
        ), 2)
        ELSE NULL
    END as exploration_ratio
FROM workflow_events we
WHERE we.event_type = 'tool_call'
GROUP BY we.sprint, we.task_num;

-- Phase time distribution: Phase duration as % of total task time
DROP VIEW IF EXISTS phase_time_distribution;
CREATE VIEW IF NOT EXISTS phase_time_distribution AS
SELECT
    pt.sprint,
    pt.task_num,
    pt.phase,
    pt.seconds,
    ROUND(100.0 * pt.seconds / SUM(pt.seconds) OVER (PARTITION BY pt.sprint, pt.task_num), 1) as pct_of_total
FROM phase_timing pt;

-- Token efficiency trend: Avg tokens per task by sprint and complexity
DROP VIEW IF EXISTS token_efficiency_trend;
CREATE VIEW IF NOT EXISTS token_efficiency_trend AS
SELECT
    t.sprint,
    t.complexity,
    COUNT(*) as tasks,
    ROUND(AVG(tr.total_input_tokens + tr.total_output_tokens)) as avg_tokens_per_task
FROM tasks t
JOIN transcripts tr ON tr.sprint = t.sprint AND tr.task_num = t.task_num
WHERE t.status = 'green'
GROUP BY t.sprint, t.complexity;

-- Blow-up factors: Tasks where actual > 2x estimated
DROP VIEW IF EXISTS blow_up_factors;
CREATE VIEW IF NOT EXISTS blow_up_factors AS
SELECT
    sprint,
    task_num,
    title,
    type,
    complexity,
    estimated_minutes,
    ROUND((julianday(completed_at) - julianday(started_at)) * 1440, 1) as actual_minutes,
    ROUND((julianday(completed_at) - julianday(started_at)) * 1440 / NULLIF(estimated_minutes, 0), 1) as blow_up_ratio,
    reversions,
    testing_posture
FROM tasks
WHERE started_at IS NOT NULL
    AND completed_at IS NOT NULL
    AND estimated_minutes IS NOT NULL
    AND (julianday(completed_at) - julianday(started_at)) * 1440 > estimated_minutes * 2;

-- Task trajectory: Phase sequence and audit reversions per task
CREATE VIEW IF NOT EXISTS task_trajectory AS
SELECT
    sprint, task_num,
    COUNT(*) as total_phases,
    SUM(CASE WHEN phase = 'FIX_AUDIT' THEN 1 ELSE 0 END) as audit_reversions,
    MIN(CASE WHEN phase = 'RED' THEN timestamp END) as first_red,
    MAX(CASE WHEN phase IN ('COMMIT', 'REPORT') THEN timestamp END) as completed_at,
    GROUP_CONCAT(phase, ' -> ') as trajectory
FROM workflow_events
WHERE event_type = 'phase_entered'
GROUP BY sprint, task_num;

-- Skill versions: Track version history per skill
CREATE TABLE IF NOT EXISTS skill_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    version TEXT NOT NULL,
    framework_version TEXT,
    introduced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    changelog TEXT,
    UNIQUE(skill_name, version)
);

CREATE INDEX IF NOT EXISTS idx_skill_versions_name ON skill_versions(skill_name);

-- Skill version token usage: same as skill_token_usage but grouped by skill_version
DROP VIEW IF EXISTS skill_version_token_usage;
CREATE VIEW IF NOT EXISTS skill_version_token_usage AS
SELECT
    skill_name,
    skill_version,
    COUNT(*) as invocations,
    COALESCE(SUM(input_tokens / NULLIF(tool_calls_in_msg, 0)), 0) as total_input_tokens,
    COALESCE(SUM(output_tokens / NULLIF(tool_calls_in_msg, 0)), 0) as total_output_tokens,
    ROUND(AVG((input_tokens + output_tokens) / NULLIF(tool_calls_in_msg, 0)), 0) as avg_tokens_per_call
FROM workflow_events
WHERE event_type = 'tool_call' AND input_tokens IS NOT NULL AND skill_version IS NOT NULL
GROUP BY skill_name, skill_version;

-- Skill version duration: aggregate duration by skill_name + skill_version
DROP VIEW IF EXISTS skill_version_duration;
CREATE VIEW IF NOT EXISTS skill_version_duration AS
SELECT
    e1.skill_name,
    e1.skill_version,
    COUNT(*) as invocations,
    ROUND(AVG((julianday(e2.timestamp) - julianday(e1.timestamp)) * 86400)) as avg_seconds,
    ROUND(MIN((julianday(e2.timestamp) - julianday(e1.timestamp)) * 86400)) as min_seconds,
    ROUND(MAX((julianday(e2.timestamp) - julianday(e1.timestamp)) * 86400)) as max_seconds
FROM workflow_events e1
JOIN workflow_events e2
    ON e1.sprint = e2.sprint AND e1.task_num = e2.task_num
    AND e2.event_type = 'task_completed' AND e2.skill_name = e1.skill_name
WHERE e1.event_type = 'skill_invoked' AND e1.skill_version IS NOT NULL
GROUP BY e1.skill_name, e1.skill_version;

-- Skill version precision: avg exploration ratio by skill_name + skill_version
DROP VIEW IF EXISTS skill_version_precision;
CREATE VIEW IF NOT EXISTS skill_version_precision AS
SELECT
    we.skill_name,
    we.skill_version,
    COUNT(DISTINCT we.sprint || '/' || we.task_num) as tasks,
    ROUND(AVG(sub.exploration_ratio), 2) as avg_exploration_ratio
FROM workflow_events we
JOIN (
    SELECT
        sprint,
        task_num,
        COUNT(DISTINCT CASE WHEN tool_name IN ('Read', 'Glob', 'Grep')
            THEN json_extract(metadata, '$.file_path') END) as files_read,
        COUNT(DISTINCT CASE WHEN tool_name IN ('Edit', 'Write')
            THEN json_extract(metadata, '$.file_path') END) as files_modified,
        CASE
            WHEN COUNT(DISTINCT CASE WHEN tool_name IN ('Read', 'Glob', 'Grep')
                THEN json_extract(metadata, '$.file_path') END) > 0
            THEN ROUND(1.0 - (
                1.0 * COUNT(DISTINCT CASE WHEN tool_name IN ('Edit', 'Write')
                    THEN json_extract(metadata, '$.file_path') END) /
                COUNT(DISTINCT CASE WHEN tool_name IN ('Read', 'Glob', 'Grep')
                    THEN json_extract(metadata, '$.file_path') END)
            ), 2)
            ELSE NULL
        END as exploration_ratio
    FROM workflow_events
    WHERE event_type = 'tool_call'
    GROUP BY sprint, task_num
) sub ON we.sprint = sub.sprint AND we.task_num = sub.task_num
WHERE we.event_type = 'tool_call' AND we.skill_version IS NOT NULL AND sub.exploration_ratio IS NOT NULL
GROUP BY we.skill_name, we.skill_version;

-- Developer context: Captures session-level developer state for analytics
-- (concurrent sessions, time of day, etc.)
CREATE TABLE IF NOT EXISTS developer_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    developer TEXT NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    concurrent_sessions INTEGER DEFAULT 1,
    hour_of_day INTEGER,
    alertness REAL,
    environment TEXT,
    notes TEXT,
    FOREIGN KEY (developer) REFERENCES developers(name),
    CHECK (concurrent_sessions >= 1),
    CHECK (hour_of_day IS NULL OR (hour_of_day >= 0 AND hour_of_day <= 23))
);

CREATE INDEX IF NOT EXISTS idx_developer_context_lookup
    ON developer_context(developer, recorded_at DESC);

-- Concurrency timelines: running count at every boundary event (agent start/end).
-- Each row = a state change. Query any point in time with:
--   SELECT active FROM concurrency_agents WHERE ts <= '<timestamp>' ORDER BY ts DESC LIMIT 1;

-- Agent-level concurrency (all transcripts: primary sessions + subagents)
CREATE VIEW IF NOT EXISTS concurrency_agents AS
SELECT ts, delta, SUM(delta) OVER (ORDER BY ts, delta DESC) as active
FROM (
    SELECT started_at as ts, 1 as delta FROM transcripts WHERE started_at IS NOT NULL
    UNION ALL
    SELECT ended_at as ts, -1 as delta FROM transcripts WHERE ended_at IS NOT NULL
);

-- Session-level concurrency (primary sessions only = terminals)
CREATE VIEW IF NOT EXISTS concurrency_sessions AS
SELECT ts, delta, SUM(delta) OVER (ORDER BY ts, delta DESC) as active
FROM (
    SELECT started_at as ts, 1 as delta FROM transcripts
    WHERE parent_session_id IS NULL AND started_at IS NOT NULL
    UNION ALL
    SELECT ended_at as ts, -1 as delta FROM transcripts
    WHERE parent_session_id IS NULL AND ended_at IS NOT NULL
);

-- Task-level concurrency (overlapping task work windows)
CREATE VIEW IF NOT EXISTS concurrency_tasks AS
SELECT ts, delta, SUM(delta) OVER (ORDER BY ts, delta DESC) as active
FROM (
    SELECT started_at as ts, 1 as delta FROM tasks WHERE started_at IS NOT NULL
    UNION ALL
    SELECT completed_at as ts, -1 as delta FROM tasks WHERE completed_at IS NOT NULL
);

-- Brain cycles per task: user messages as proxy for decision loops/steering needed
-- Higher counts suggest more complex or poorly-scoped tasks
CREATE VIEW IF NOT EXISTS brain_cycles_per_task AS
SELECT
    t.sprint,
    t.task_num,
    t.title,
    t.complexity,
    tr.user_message_count as brain_cycles,
    tr.total_user_content_length as total_prompt_chars,
    CASE
        WHEN tr.user_message_count > 0 THEN ROUND(1.0 * tr.total_user_content_length / tr.user_message_count)
        ELSE 0
    END as avg_chars_per_prompt,
    tr.compaction_count,
    json_extract(tr.stop_reason_counts, '$.max_tokens') as max_token_hits
FROM tasks t
JOIN transcripts tr ON tr.sprint = t.sprint AND tr.task_num = t.task_num
WHERE tr.user_message_count > 0;

-- Context loading time: ratio of exploration (Read/Glob/Grep) before first Edit/Write
-- Lower ratios suggest better familiarity; higher ratios mean more exploration needed
CREATE VIEW IF NOT EXISTS context_loading_time AS
SELECT
    we.sprint,
    we.task_num,
    COUNT(CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep') AND we.id < first_write.first_write_id THEN 1 END) as reads_before_first_write,
    COUNT(CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep') THEN 1 END) as total_reads,
    COUNT(CASE WHEN we.tool_name IN ('Edit', 'Write') THEN 1 END) as total_writes,
    CASE
        WHEN COUNT(CASE WHEN we.tool_name IN ('Edit', 'Write') THEN 1 END) > 0
        THEN ROUND(1.0 *
            COUNT(CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep') AND we.id < first_write.first_write_id THEN 1 END) /
            COUNT(CASE WHEN we.tool_name IN ('Edit', 'Write') THEN 1 END)
        , 2)
        ELSE NULL
    END as context_load_ratio
FROM workflow_events we
LEFT JOIN (
    SELECT sprint, task_num, MIN(id) as first_write_id
    FROM workflow_events
    WHERE event_type = 'tool_call' AND tool_name IN ('Edit', 'Write')
    GROUP BY sprint, task_num
) first_write ON we.sprint = first_write.sprint AND we.task_num = first_write.task_num
WHERE we.event_type = 'tool_call'
GROUP BY we.sprint, we.task_num;

-- Session health: per-session summary of errors, retries, compactions, and thinking usage
-- High error/retry counts or compaction events signal degraded session quality
CREATE VIEW IF NOT EXISTS session_health AS
SELECT
    tr.session_id,
    tr.sprint,
    tr.task_num,
    tr.model,
    tr.system_error_count,
    tr.system_retry_count,
    tr.compaction_count,
    tr.tool_result_error_count,
    tr.thinking_message_count,
    tr.thinking_total_length,
    tr.has_sidechain,
    tr.avg_turn_duration_ms,
    tr.service_tier,
    tr.stop_reason_counts,
    (tr.system_error_count + tr.system_retry_count + tr.tool_result_error_count) as total_errors,
    CASE
        WHEN (tr.system_error_count + tr.system_retry_count + tr.tool_result_error_count) = 0
            AND tr.compaction_count = 0 THEN 'healthy'
        WHEN tr.compaction_count > 0 THEN 'context_pressure'
        WHEN (tr.system_error_count + tr.system_retry_count) > 2 THEN 'degraded'
        ELSE 'minor_issues'
    END as health_status
FROM transcripts tr;

-- Migration tracking: records which schema migrations have been applied
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,            -- e.g., '001-add-workflow-events'
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    framework_version TEXT,               -- version that shipped this migration
    checksum TEXT                          -- SHA256 of migration file contents
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner);
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on_sprint, depends_on_task);
CREATE INDEX IF NOT EXISTS idx_events_session ON workflow_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_task ON workflow_events(sprint, task_num);
CREATE INDEX IF NOT EXISTS idx_events_type ON workflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_skill ON workflow_events(skill_name);
CREATE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_task ON transcripts(sprint, task_num);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp on task modification
CREATE TRIGGER IF NOT EXISTS update_task_timestamp
AFTER UPDATE ON tasks
BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP
    WHERE sprint = NEW.sprint AND task_num = NEW.task_num;
END;

-- Auto-set started_at when task leaves 'pending' status
-- This captures when work actually began on the task
CREATE TRIGGER IF NOT EXISTS set_started_at
AFTER UPDATE OF status ON tasks
WHEN OLD.status = 'pending' AND NEW.status != 'pending' AND OLD.started_at IS NULL
BEGIN
    UPDATE tasks SET started_at = CURRENT_TIMESTAMP
    WHERE sprint = NEW.sprint AND task_num = NEW.task_num;
END;

-- Auto-set completed_at when task reaches 'green' status
-- This captures when the task was successfully completed
CREATE TRIGGER IF NOT EXISTS set_completed_at
AFTER UPDATE OF status ON tasks
WHEN NEW.status = 'green' AND OLD.status != 'green'
BEGIN
    UPDATE tasks SET completed_at = CURRENT_TIMESTAMP
    WHERE sprint = NEW.sprint AND task_num = NEW.task_num;
END;

-- Track when a task's status goes backward (green→red, green→blocked)
CREATE TRIGGER IF NOT EXISTS track_reversion
AFTER UPDATE OF status ON tasks
WHEN (OLD.status = 'green' AND NEW.status IN ('red', 'blocked'))
  OR (OLD.status = 'red' AND NEW.status = 'blocked')
BEGIN
    UPDATE tasks SET reversions = COALESCE(reversions, 0) + 1
    WHERE sprint = NEW.sprint AND task_num = NEW.task_num;
END;
