-- Migration 004: Data Platform Schema Foundations
-- Creates new tables for the data platform ontology layer.
-- Does NOT alter existing tables (tasks, developers) yet — GraphQL resolvers
-- handle the mapping during transition. Column migrations come in 005.

-- Multi-project support
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    description TEXT,
    repo_url TEXT,
    start_at DATETIME,
    end_at DATETIME,
    status TEXT DEFAULT 'active',
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('planning', 'active', 'completed', 'archived'))
);

-- Sprint metadata (currently just text labels on tasks)
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
CREATE TABLE IF NOT EXISTS developer_skills (
    developer TEXT NOT NULL,
    category TEXT NOT NULL,
    skill TEXT NOT NULL,
    rating REAL NOT NULL,
    source TEXT DEFAULT 'manager',
    evidence TEXT,
    assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (developer, category, skill),
    FOREIGN KEY (developer) REFERENCES developers(name),
    CHECK (rating >= 0.0 AND rating <= 5.0)
);

-- Developer context: point-in-time snapshots of working conditions
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
    CHECK (hour_of_day IS NULL OR (hour_of_day >= 0 AND hour_of_day <= 23)),
    CHECK (alertness IS NULL OR (alertness >= 0.0 AND alertness <= 1.0))
);

CREATE INDEX IF NOT EXISTS idx_dev_context_lookup
    ON developer_context(developer, recorded_at DESC);

-- Daily contributor availability
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

-- Human-readable activity feed
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

-- Local twin cache (updated schema)
CREATE TABLE IF NOT EXISTS developer_twins_local (
    developer TEXT PRIMARY KEY,
    machine_id TEXT,
    loaded_files TEXT DEFAULT '[]',
    path_history TEXT DEFAULT '[]',
    skills TEXT DEFAULT '{}',
    baseline_competency REAL,
    expected_minutes REAL DEFAULT 480,
    effectiveness REAL DEFAULT 1.0,
    concurrent_sessions INTEGER DEFAULT 1,
    session_started_at DATETIME,
    velocity_avg_minutes REAL,
    velocity_blow_up REAL,
    velocity_tasks_completed INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (developer) REFERENCES developers(name)
);

-- Effective velocity view (accounts for developer context)
DROP VIEW IF EXISTS effective_velocity;
CREATE VIEW IF NOT EXISTS effective_velocity AS
SELECT
    t.owner,
    t.sprint,
    t.task_num,
    ROUND((julianday(t.completed_at) - julianday(t.started_at)) * 24 * 60) as actual_minutes,
    t.estimated_minutes,
    ROUND(
        (julianday(t.completed_at) - julianday(t.started_at)) * 1440 /
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

-- Sprint forecast view
DROP VIEW IF EXISTS sprint_forecast;
CREATE VIEW IF NOT EXISTS sprint_forecast AS
SELECT
    s.name as sprint,
    s.deadline,
    COUNT(t.task_num) as total_tasks,
    SUM(CASE WHEN t.status = 'green' THEN 1 ELSE 0 END) as completed,
    ROUND(100.0 * SUM(CASE WHEN t.status = 'green' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as percent_complete,
    SUM(CASE WHEN t.status != 'green' THEN COALESCE(t.estimated_minutes, 0) ELSE 0 END) as remaining_minutes,
    ROUND((julianday(s.deadline) - julianday('now')) * 24 * 60) as minutes_until_deadline
FROM sprints s
LEFT JOIN tasks t ON t.sprint = s.name
GROUP BY s.name;

-- Record migration
INSERT INTO _migrations (name, framework_version)
VALUES ('004-data-platform', '0.5.0');
