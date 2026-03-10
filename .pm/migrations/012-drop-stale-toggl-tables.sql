-- Migration 012: Drop Stale Toggl Tables
-- Removes pre-synced Toggl tables that are being replaced by live API calls.
-- The new Toggl integration (Task 2) will call the Toggl API directly
-- with rate limiting and caching instead of reading from pre-synced tables.

DROP TABLE IF EXISTS toggl_time_entries;
DROP TABLE IF EXISTS toggl_sync_state;
DROP TABLE IF EXISTS toggl_projects;
DROP TABLE IF EXISTS toggl_clients;
