-- N2O Full Postgres Schema for Supabase
-- Translated from .pm/schema.sql + .pm/migrations/004-data-platform.sql
-- Apply via Supabase Management API or SQL Editor

-- =============================================================================
-- DROP existing partial schema (from coordination setup)
-- =============================================================================

DROP VIEW IF EXISTS active_working_sets CASCADE;
DROP VIEW IF EXISTS active_agents CASCADE;
DROP TABLE IF EXISTS developer_twins CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;

-- =============================================================================
-- TABLES
-- =============================================================================

-- Tasks table: Primary Key is (sprint, task_num)
CREATE TABLE IF NOT EXISTS tasks (
    sprint TEXT NOT NULL,
    task_num INTEGER NOT NULL,
    spec TEXT,
    title TEXT NOT NULL,
    description TEXT,
    done_when TEXT,
    status TEXT DEFAULT 'pending',
    blocked_reason TEXT,
    type TEXT,
    owner TEXT,
    skills TEXT,

    -- Audit tracking
    pattern_audited BOOLEAN DEFAULT false,
    pattern_audit_notes TEXT,
    skills_updated BOOLEAN DEFAULT false,
    skills_update_notes TEXT,
    tests_pass BOOLEAN DEFAULT false,
    testing_posture TEXT,
    verified BOOLEAN DEFAULT false,

    -- Velocity tracking
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,

    -- Estimation and complexity
    estimated_minutes REAL,
    complexity TEXT,
    complexity_notes TEXT,
    reversions INTEGER DEFAULT 0,

    -- Priority and scheduling
    priority REAL,
    priority_reason TEXT,
    assignment_reason TEXT,
    horizon TEXT DEFAULT 'active',
    session_id TEXT,

    -- Git tracking
    commit_hash TEXT,
    merged_at TIMESTAMPTZ,
    lines_added INTEGER,
    lines_removed INTEGER,

    -- External PM tool sync
    external_id TEXT,
    external_url TEXT,
    last_synced_at TIMESTAMPTZ,

    -- Coordination fields (from supabase-schema.sql)
    developer TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (sprint, task_num),

    CHECK (status IN ('pending', 'red', 'green', 'blocked')),
    CHECK (type IS NULL OR type IN ('database', 'actions', 'frontend', 'infra', 'agent', 'e2e', 'docs')),
    CHECK (testing_posture IS NULL OR testing_posture IN ('A', 'B', 'C', 'D', 'F')),
    CHECK (complexity IS NULL OR complexity IN ('low', 'medium', 'high', 'unknown')),
    CHECK (horizon IS NULL OR horizon IN ('active', 'next', 'later', 'icebox'))
);

-- Developers table
CREATE TABLE IF NOT EXISTS developers (
    name TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT,

    skill_react INTEGER,
    skill_node INTEGER,
    skill_database INTEGER,
    skill_infra INTEGER,
    skill_testing INTEGER,
    skill_debugging INTEGER,

    strengths TEXT,
    growth_areas TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
    sprint TEXT NOT NULL,
    task_num INTEGER NOT NULL,
    depends_on_sprint TEXT NOT NULL,
    depends_on_task INTEGER NOT NULL,
    PRIMARY KEY (sprint, task_num, depends_on_sprint, depends_on_task),
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num),
    FOREIGN KEY (depends_on_sprint, depends_on_task) REFERENCES tasks(sprint, task_num)
);

-- Workflow events
CREATE TABLE IF NOT EXISTS workflow_events (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    session_id TEXT,
    sprint TEXT,
    task_num INTEGER,
    event_type TEXT NOT NULL,
    tool_name TEXT,
    tool_use_id TEXT,
    skill_name TEXT,
    skill_version TEXT,
    phase TEXT,
    agent_id TEXT,
    agent_type TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    tool_calls_in_msg INTEGER,
    metadata JSONB,
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);

-- Transcripts
CREATE TABLE IF NOT EXISTS transcripts (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    parent_session_id TEXT,
    agent_id TEXT,
    file_path TEXT,
    file_size_bytes INTEGER,
    message_count INTEGER,
    user_message_count INTEGER,
    assistant_message_count INTEGER,
    tool_call_count INTEGER,
    total_input_tokens INTEGER,
    total_output_tokens INTEGER,
    model TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    sprint TEXT,
    task_num INTEGER,

    -- Cost tracking (migration 005)
    estimated_cost_usd REAL,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    user_message_timestamps TEXT,
    total_user_content_length INTEGER DEFAULT 0,

    -- Comprehensive JSONL extraction (migration 006)
    stop_reason_counts TEXT,
    thinking_message_count INTEGER DEFAULT 0,
    thinking_total_length INTEGER DEFAULT 0,
    service_tier TEXT,
    has_sidechain BOOLEAN DEFAULT false,
    system_error_count INTEGER DEFAULT 0,
    system_retry_count INTEGER DEFAULT 0,
    avg_turn_duration_ms INTEGER,
    tool_result_error_count INTEGER DEFAULT 0,
    compaction_count INTEGER DEFAULT 0,

    -- Session context (migration 007)
    cwd TEXT,
    git_branch TEXT,
    assistant_message_timestamps TEXT,
    background_task_count INTEGER DEFAULT 0,
    web_search_count INTEGER DEFAULT 0,

    -- Sync tracking (migrations 008-009)
    developer TEXT,
    machine_id TEXT,
    synced_at TIMESTAMPTZ,
    sync_attempts INTEGER DEFAULT 0,
    sync_error TEXT,

    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);

-- Messages: full content of every conversation message (no truncation)
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_index INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    timestamp TIMESTAMPTZ,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    stop_reason TEXT,
    UNIQUE (session_id, message_index),
    CHECK (role IN ('user', 'assistant', 'system'))
);

-- Tool calls: full input params for every tool invocation
CREATE TABLE IF NOT EXISTS tool_calls (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_index INTEGER NOT NULL,
    tool_index INTEGER NOT NULL,
    tool_use_id TEXT,
    tool_name TEXT NOT NULL,
    input JSONB NOT NULL,
    output TEXT,
    is_error BOOLEAN DEFAULT false,
    timestamp TIMESTAMPTZ,
    UNIQUE (session_id, message_index, tool_index)
);

-- Skill versions
CREATE TABLE IF NOT EXISTS skill_versions (
    id SERIAL PRIMARY KEY,
    skill_name TEXT NOT NULL,
    version TEXT NOT NULL,
    framework_version TEXT,
    introduced_at TIMESTAMPTZ DEFAULT NOW(),
    changelog TEXT,
    UNIQUE(skill_name, version)
);

-- Migration tracking
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    framework_version TEXT,
    checksum TEXT
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    repo_url TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (status IN ('planning', 'active', 'completed', 'archived'))
);

-- Sprints
CREATE TABLE IF NOT EXISTS sprints (
    name TEXT PRIMARY KEY,
    project_id TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    deadline TIMESTAMPTZ,
    goal TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    CHECK (status IN ('planning', 'active', 'completed', 'cancelled'))
);

-- Developer skills (hierarchical)
CREATE TABLE IF NOT EXISTS developer_skills (
    developer TEXT NOT NULL,
    category TEXT NOT NULL,
    skill TEXT NOT NULL,
    rating REAL NOT NULL,
    source TEXT DEFAULT 'manager',
    evidence TEXT,
    assessed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (developer, category, skill),
    FOREIGN KEY (developer) REFERENCES developers(name),
    CHECK (rating >= 0.0 AND rating <= 5.0)
);

-- Developer context snapshots
CREATE TABLE IF NOT EXISTS developer_context (
    id SERIAL PRIMARY KEY,
    developer TEXT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    concurrent_sessions INTEGER DEFAULT 1,
    hour_of_day INTEGER,
    alertness REAL,
    environment TEXT,
    notes TEXT,
    FOREIGN KEY (developer) REFERENCES developers(name),
    CHECK (concurrent_sessions >= 1),
    CHECK (hour_of_day IS NULL OR (hour_of_day >= 0 AND hour_of_day <= 23)),
    CHECK (alertness IS NULL OR (alertness >= 0.0 AND alertness <= 1.0))
);

-- Contributor availability
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

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    developer TEXT,
    action TEXT NOT NULL,
    sprint TEXT,
    task_num INTEGER,
    summary TEXT,
    metadata JSONB,
    FOREIGN KEY (sprint, task_num) REFERENCES tasks(sprint, task_num)
);

-- Agents registry (coordination)
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL,
    developer TEXT,
    task_sprint TEXT,
    task_num INTEGER,
    worktree_path TEXT,
    files_touched TEXT[],
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    FOREIGN KEY (task_sprint, task_num) REFERENCES tasks(sprint, task_num)
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
CREATE INDEX IF NOT EXISTS idx_skill_versions_name ON skill_versions(skill_name);
CREATE INDEX IF NOT EXISTS idx_dev_context_lookup ON developer_context(developer, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_dev ON activity_log(developer, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agents_developer ON agents(developer);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_heartbeat ON agents(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(session_id, role);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name_session ON tool_calls(session_id, tool_name);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Available tasks: Pending with no unfinished dependencies and not claimed
CREATE OR REPLACE VIEW available_tasks AS
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

-- Blocked tasks
CREATE OR REPLACE VIEW blocked_tasks AS
SELECT sprint, task_num, title, blocked_reason, owner
FROM tasks
WHERE status = 'blocked';

-- Sprint progress
CREATE OR REPLACE VIEW sprint_progress AS
SELECT
    sprint,
    COUNT(*) as total_tasks,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN status = 'red' THEN 1 ELSE 0 END) as red,
    SUM(CASE WHEN status = 'green' THEN 1 ELSE 0 END) as green,
    SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
    SUM(CASE WHEN pattern_audited = true THEN 1 ELSE 0 END) as audited,
    SUM(CASE WHEN verified = true THEN 1 ELSE 0 END) as verified,
    ROUND(100.0 * SUM(CASE WHEN status = 'green' THEN 1 ELSE 0 END)::numeric / COUNT(*), 1) as percent_complete
FROM tasks
GROUP BY sprint;

-- Needs pattern audit
CREATE OR REPLACE VIEW needs_pattern_audit AS
SELECT sprint, task_num, title, owner
FROM tasks
WHERE status = 'green'
  AND pattern_audited = false;

-- Needs verification
CREATE OR REPLACE VIEW needs_verification AS
SELECT sprint, task_num, title, done_when, owner
FROM tasks
WHERE status = 'green'
  AND pattern_audited = true
  AND verified = false;

-- Refactor audit
CREATE OR REPLACE VIEW refactor_audit AS
SELECT sprint, task_num, title, skills_update_notes
FROM tasks
WHERE skills_update_notes IS NOT NULL
  AND skills_update_notes != '';

-- Velocity report
CREATE OR REPLACE VIEW velocity_report AS
SELECT
    sprint,
    task_num,
    title,
    started_at,
    completed_at,
    ROUND(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0, 1) as minutes_to_complete
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
ORDER BY sprint, task_num;

-- Sprint velocity
CREATE OR REPLACE VIEW sprint_velocity AS
SELECT
    sprint,
    COUNT(*) as completed_tasks,
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 1) as avg_minutes_per_task,
    ROUND(SUM(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 1) as total_minutes
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
GROUP BY sprint;

-- Developer velocity
CREATE OR REPLACE VIEW developer_velocity AS
SELECT
    owner,
    COUNT(*) as completed_tasks,
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 1) as avg_minutes,
    ROUND(MIN(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 1) as fastest,
    ROUND(MAX(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 1) as slowest
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND owner IS NOT NULL
GROUP BY owner;

-- Estimation accuracy
CREATE OR REPLACE VIEW estimation_accuracy AS
SELECT
    owner,
    COUNT(*) as tasks_with_estimates,
    ROUND(AVG(estimated_minutes)::numeric, 1) as avg_estimated,
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 1) as avg_actual,
    ROUND(
        (AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0) /
        NULLIF(AVG(estimated_minutes), 0))::numeric,
    2) as blow_up_ratio,
    ROUND(AVG(ABS(
        EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0 - estimated_minutes
    ))::numeric, 1) as avg_error_minutes
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND estimated_minutes IS NOT NULL
  AND owner IS NOT NULL
GROUP BY owner;

-- Estimation accuracy by type
CREATE OR REPLACE VIEW estimation_accuracy_by_type AS
SELECT
    type,
    COUNT(*) as tasks,
    ROUND(AVG(estimated_minutes)::numeric, 1) as avg_estimated,
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 1) as avg_actual,
    ROUND(
        (AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0) /
        NULLIF(AVG(estimated_minutes), 0))::numeric,
    2) as blow_up_ratio
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND estimated_minutes IS NOT NULL
GROUP BY type;

-- Estimation accuracy by complexity
CREATE OR REPLACE VIEW estimation_accuracy_by_complexity AS
SELECT
    complexity,
    COUNT(*) as tasks,
    ROUND(AVG(estimated_minutes)::numeric, 1) as avg_estimated,
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 1) as avg_actual,
    ROUND(
        (AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0) /
        NULLIF(AVG(estimated_minutes), 0))::numeric,
    2) as blow_up_ratio
FROM tasks
WHERE started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND estimated_minutes IS NOT NULL
  AND complexity IS NOT NULL
GROUP BY complexity;

-- Developer quality
CREATE OR REPLACE VIEW developer_quality AS
SELECT
    owner,
    COUNT(*) as total_tasks,
    SUM(reversions) as total_reversions,
    ROUND((1.0 * SUM(reversions) / COUNT(*))::numeric, 2) as reversions_per_task,
    SUM(CASE WHEN testing_posture = 'A' THEN 1 ELSE 0 END) as a_grades,
    ROUND((100.0 * SUM(CASE WHEN testing_posture = 'A' THEN 1 ELSE 0 END) / COUNT(*))::numeric, 1) as a_grade_pct
FROM tasks
WHERE owner IS NOT NULL
  AND status = 'green'
GROUP BY owner;

-- Developer learning rate
CREATE OR REPLACE VIEW developer_learning_rate AS
SELECT owner, sprint,
    COUNT(*) as tasks,
    ROUND(AVG(
        EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0 /
        NULLIF(estimated_minutes, 0)
    )::numeric, 2) as avg_blow_up_ratio
FROM tasks
WHERE started_at IS NOT NULL AND completed_at IS NOT NULL
    AND estimated_minutes IS NOT NULL AND owner IS NOT NULL
GROUP BY owner, sprint;

-- Common audit findings
CREATE OR REPLACE VIEW common_audit_findings AS
SELECT owner,
    SUM(CASE WHEN pattern_audit_notes LIKE '%fake test%' THEN 1 ELSE 0 END)
        as fake_test_incidents,
    SUM(CASE WHEN pattern_audit_notes LIKE '%violation%' THEN 1 ELSE 0 END)
        as pattern_violations,
    SUM(CASE WHEN testing_posture != 'A' THEN 1 ELSE 0 END)
        as below_a_grade,
    SUM(reversions) as total_reversions,
    COUNT(*) as total_tasks
FROM tasks WHERE pattern_audited = true AND owner IS NOT NULL
GROUP BY owner;

-- Reversion hotspots
CREATE OR REPLACE VIEW reversion_hotspots AS
SELECT type, complexity,
    COUNT(*) as tasks,
    SUM(reversions) as total_reversions,
    ROUND(AVG(reversions)::numeric, 2) as avg_reversions,
    ROUND(AVG(CASE WHEN testing_posture = 'A' THEN 1.0 ELSE 0.0 END)::numeric, 2) as a_grade_rate
FROM tasks WHERE status = 'green' AND owner IS NOT NULL
GROUP BY type, complexity;

-- Skill usage
CREATE OR REPLACE VIEW skill_usage AS
SELECT tool_name,
    COUNT(*) as invocations,
    COUNT(DISTINCT session_id) as sessions,
    MIN(timestamp) as first_used,
    MAX(timestamp) as last_used
FROM workflow_events
WHERE event_type = 'tool_call'
GROUP BY tool_name;

-- Phase timing
CREATE OR REPLACE VIEW phase_timing AS
SELECT e1.sprint, e1.task_num, e1.phase,
    ROUND(EXTRACT(EPOCH FROM (e2.timestamp - e1.timestamp))) as seconds
FROM workflow_events e1
JOIN workflow_events e2 ON e1.sprint = e2.sprint
    AND e1.task_num = e2.task_num
    AND e2.id = (
        SELECT MIN(id) FROM workflow_events
        WHERE id > e1.id AND sprint = e1.sprint
            AND task_num = e1.task_num AND event_type = 'phase_entered'
    )
WHERE e1.event_type = 'phase_entered';

-- Skill token usage
CREATE OR REPLACE VIEW skill_token_usage AS
SELECT
    skill_name,
    sprint,
    COUNT(*) as invocations,
    COALESCE(SUM(input_tokens / NULLIF(tool_calls_in_msg, 0)), 0) as total_input_tokens,
    COALESCE(SUM(output_tokens / NULLIF(tool_calls_in_msg, 0)), 0) as total_output_tokens,
    ROUND(AVG((input_tokens + output_tokens) / NULLIF(tool_calls_in_msg, 0))) as avg_tokens_per_call
FROM workflow_events
WHERE event_type = 'tool_call' AND input_tokens IS NOT NULL
GROUP BY skill_name, sprint;

-- Skill duration
CREATE OR REPLACE VIEW skill_duration AS
SELECT
    e1.skill_name,
    e1.sprint,
    e1.task_num,
    ROUND(EXTRACT(EPOCH FROM (e2.timestamp - e1.timestamp))) as seconds
FROM workflow_events e1
JOIN workflow_events e2
    ON e1.sprint = e2.sprint AND e1.task_num = e2.task_num
    AND e2.event_type = 'task_completed' AND e2.skill_name = e1.skill_name
WHERE e1.event_type = 'skill_invoked';

-- Skill precision
CREATE OR REPLACE VIEW skill_precision AS
SELECT
    we.sprint,
    we.task_num,
    COUNT(DISTINCT CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep')
        THEN we.metadata->>'file_path' END) as files_read,
    COUNT(DISTINCT CASE WHEN we.tool_name IN ('Edit', 'Write')
        THEN we.metadata->>'file_path' END) as files_modified,
    CASE
        WHEN COUNT(DISTINCT CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep')
            THEN we.metadata->>'file_path' END) > 0
        THEN ROUND((1.0 - (
            1.0 * COUNT(DISTINCT CASE WHEN we.tool_name IN ('Edit', 'Write')
                THEN we.metadata->>'file_path' END) /
            COUNT(DISTINCT CASE WHEN we.tool_name IN ('Read', 'Glob', 'Grep')
                THEN we.metadata->>'file_path' END)
        ))::numeric, 2)
        ELSE NULL
    END as exploration_ratio
FROM workflow_events we
WHERE we.event_type = 'tool_call'
GROUP BY we.sprint, we.task_num;

-- Phase time distribution
CREATE OR REPLACE VIEW phase_time_distribution AS
SELECT
    pt.sprint,
    pt.task_num,
    pt.phase,
    pt.seconds,
    ROUND((100.0 * pt.seconds / SUM(pt.seconds) OVER (PARTITION BY pt.sprint, pt.task_num))::numeric, 1) as pct_of_total
FROM phase_timing pt;

-- Token efficiency trend
CREATE OR REPLACE VIEW token_efficiency_trend AS
SELECT
    t.sprint,
    t.complexity,
    COUNT(*) as tasks,
    ROUND(AVG(tr.total_input_tokens + tr.total_output_tokens)) as avg_tokens_per_task
FROM tasks t
JOIN transcripts tr ON tr.sprint = t.sprint AND tr.task_num = t.task_num
WHERE t.status = 'green'
GROUP BY t.sprint, t.complexity;

-- Blow-up factors
CREATE OR REPLACE VIEW blow_up_factors AS
SELECT
    sprint,
    task_num,
    title,
    type,
    complexity,
    estimated_minutes,
    ROUND(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0, 1) as actual_minutes,
    ROUND((EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0 / NULLIF(estimated_minutes, 0))::numeric, 1) as blow_up_ratio,
    reversions,
    testing_posture
FROM tasks
WHERE started_at IS NOT NULL
    AND completed_at IS NOT NULL
    AND estimated_minutes IS NOT NULL
    AND EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0 > estimated_minutes * 2;

-- Skill version token usage
CREATE OR REPLACE VIEW skill_version_token_usage AS
SELECT
    skill_name,
    skill_version,
    COUNT(*) as invocations,
    COALESCE(SUM(input_tokens / NULLIF(tool_calls_in_msg, 0)), 0) as total_input_tokens,
    COALESCE(SUM(output_tokens / NULLIF(tool_calls_in_msg, 0)), 0) as total_output_tokens,
    ROUND(AVG((input_tokens + output_tokens) / NULLIF(tool_calls_in_msg, 0))) as avg_tokens_per_call
FROM workflow_events
WHERE event_type = 'tool_call' AND input_tokens IS NOT NULL AND skill_version IS NOT NULL
GROUP BY skill_name, skill_version;

-- Skill version duration
CREATE OR REPLACE VIEW skill_version_duration AS
SELECT
    e1.skill_name,
    e1.skill_version,
    COUNT(*) as invocations,
    ROUND(AVG(EXTRACT(EPOCH FROM (e2.timestamp - e1.timestamp)))) as avg_seconds,
    ROUND(MIN(EXTRACT(EPOCH FROM (e2.timestamp - e1.timestamp)))) as min_seconds,
    ROUND(MAX(EXTRACT(EPOCH FROM (e2.timestamp - e1.timestamp)))) as max_seconds
FROM workflow_events e1
JOIN workflow_events e2
    ON e1.sprint = e2.sprint AND e1.task_num = e2.task_num
    AND e2.event_type = 'task_completed' AND e2.skill_name = e1.skill_name
WHERE e1.event_type = 'skill_invoked' AND e1.skill_version IS NOT NULL
GROUP BY e1.skill_name, e1.skill_version;

-- Skill version precision
CREATE OR REPLACE VIEW skill_version_precision AS
SELECT
    we.skill_name,
    we.skill_version,
    COUNT(DISTINCT we.sprint || '/' || we.task_num) as tasks,
    ROUND(AVG(sub.exploration_ratio)::numeric, 2) as avg_exploration_ratio
FROM workflow_events we
JOIN (
    SELECT
        sprint,
        task_num,
        COUNT(DISTINCT CASE WHEN tool_name IN ('Read', 'Glob', 'Grep')
            THEN metadata->>'file_path' END) as files_read,
        COUNT(DISTINCT CASE WHEN tool_name IN ('Edit', 'Write')
            THEN metadata->>'file_path' END) as files_modified,
        CASE
            WHEN COUNT(DISTINCT CASE WHEN tool_name IN ('Read', 'Glob', 'Grep')
                THEN metadata->>'file_path' END) > 0
            THEN ROUND((1.0 - (
                1.0 * COUNT(DISTINCT CASE WHEN tool_name IN ('Edit', 'Write')
                    THEN metadata->>'file_path' END) /
                COUNT(DISTINCT CASE WHEN tool_name IN ('Read', 'Glob', 'Grep')
                    THEN metadata->>'file_path' END)
            ))::numeric, 2)
            ELSE NULL
        END as exploration_ratio
    FROM workflow_events
    WHERE event_type = 'tool_call'
    GROUP BY sprint, task_num
) sub ON we.sprint = sub.sprint AND we.task_num = sub.task_num
WHERE we.event_type = 'tool_call' AND we.skill_version IS NOT NULL AND sub.exploration_ratio IS NOT NULL
GROUP BY we.skill_name, we.skill_version;

-- Effective velocity (accounts for developer context)
CREATE OR REPLACE VIEW effective_velocity AS
SELECT
    t.owner,
    t.sprint,
    t.task_num,
    ROUND(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 60.0) as actual_minutes,
    t.estimated_minutes,
    ROUND(
        (EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 60.0 /
        NULLIF(t.estimated_minutes, 0))::numeric, 2
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

-- Sprint forecast
CREATE OR REPLACE VIEW sprint_forecast AS
SELECT
    s.name as sprint,
    s.deadline,
    COUNT(t.task_num) as total_tasks,
    SUM(CASE WHEN t.status = 'green' THEN 1 ELSE 0 END) as completed,
    ROUND((100.0 * SUM(CASE WHEN t.status = 'green' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))::numeric, 1) as percent_complete,
    SUM(CASE WHEN t.status != 'green' THEN COALESCE(t.estimated_minutes, 0) ELSE 0 END) as remaining_minutes,
    ROUND(EXTRACT(EPOCH FROM (s.deadline - NOW())) / 60.0) as minutes_until_deadline
FROM sprints s
LEFT JOIN tasks t ON t.sprint = s.name
GROUP BY s.name, s.deadline;

-- Active agents (coordination)
CREATE OR REPLACE VIEW active_agents AS
SELECT
    a.agent_id,
    a.machine_id,
    a.developer,
    a.task_sprint,
    a.task_num,
    t.title AS task_title,
    a.files_touched,
    a.started_at,
    a.last_heartbeat,
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) AS seconds_since_heartbeat
FROM agents a
LEFT JOIN tasks t ON t.sprint = a.task_sprint AND t.task_num = a.task_num
WHERE a.status = 'active'
  AND a.last_heartbeat > NOW() - INTERVAL '5 minutes';

-- Active working sets (coordination)
CREATE OR REPLACE VIEW active_working_sets AS
SELECT
    a.developer,
    a.machine_id,
    ARRAY_AGG(DISTINCT f) AS all_files_touched
FROM agents a, UNNEST(a.files_touched) AS f
WHERE a.status = 'active'
  AND a.last_heartbeat > NOW() - INTERVAL '5 minutes'
GROUP BY a.developer, a.machine_id;

-- =============================================================================
-- TRIGGER FUNCTIONS
-- =============================================================================

-- Update timestamp on task modification
CREATE OR REPLACE FUNCTION update_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_task_timestamp
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION update_task_timestamp();

-- Auto-set started_at when task leaves pending
CREATE OR REPLACE FUNCTION set_started_at()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'pending' AND NEW.status != 'pending' AND OLD.started_at IS NULL THEN
        NEW.started_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_started_at
BEFORE UPDATE OF status ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_started_at();

-- Auto-set completed_at when task reaches green
CREATE OR REPLACE FUNCTION set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'green' AND OLD.status != 'green' THEN
        NEW.completed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_completed_at
BEFORE UPDATE OF status ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_completed_at();

-- Track reversions
CREATE OR REPLACE FUNCTION track_reversion()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status = 'green' AND NEW.status IN ('red', 'blocked'))
       OR (OLD.status = 'red' AND NEW.status = 'blocked') THEN
        NEW.reversions = COALESCE(OLD.reversions, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER track_reversion
BEFORE UPDATE OF status ON tasks
FOR EACH ROW
EXECUTE FUNCTION track_reversion();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE developers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE _migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_calls ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON workflow_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON transcripts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON developers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON sprints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON developer_skills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON developer_context FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON contributor_availability FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON task_dependencies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON skill_versions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON _migrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON tool_calls FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- REAL-TIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
