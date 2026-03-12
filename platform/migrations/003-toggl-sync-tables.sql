-- =============================================================================
-- Migration 003: Toggl Sync Tables
-- Target: Supabase Postgres
-- Sprint: toggl-sync, Task 1
-- =============================================================================

-- 1. Time entries (core data synced from Toggl)
CREATE TABLE IF NOT EXISTS tt_entries (
  id BIGINT PRIMARY KEY,
  description TEXT,
  start TIMESTAMPTZ NOT NULL,
  stop TIMESTAMPTZ,
  seconds INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL,
  project_id INTEGER,
  tag_ids INTEGER[] DEFAULT '{}',
  billable BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tt_entries_start ON tt_entries(start);
CREATE INDEX IF NOT EXISTS idx_tt_entries_user ON tt_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_tt_entries_project ON tt_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_tt_entries_synced ON tt_entries(synced_at);
CREATE INDEX IF NOT EXISTS idx_tt_entries_running ON tt_entries(id) WHERE stop IS NULL;

-- 2. Toggl projects
CREATE TABLE IF NOT EXISTS tt_projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  client_id INTEGER,
  color TEXT,
  active BOOLEAN DEFAULT TRUE,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Toggl clients
CREATE TABLE IF NOT EXISTS tt_clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Toggl tags
CREATE TABLE IF NOT EXISTS tt_tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Sync log (observability + backfill tracking)
CREATE TABLE IF NOT EXISTS tt_sync_log (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  entries_upserted INTEGER DEFAULT 0,
  entries_failed INTEGER DEFAULT 0,
  projects_upserted INTEGER DEFAULT 0,
  clients_upserted INTEGER DEFAULT 0,
  tags_upserted INTEGER DEFAULT 0,
  error TEXT,
  sync_type TEXT NOT NULL DEFAULT 'incremental',
  backfill_cursor TIMESTAMPTZ,
  backfill_complete BOOLEAN DEFAULT FALSE
);
