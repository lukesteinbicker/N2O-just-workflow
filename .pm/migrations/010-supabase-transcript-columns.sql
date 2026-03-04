-- Migration 010: Supabase Transcript Column Parity
-- Adds columns to Supabase transcripts table that were added locally in
-- migrations 005-009 but never applied to Supabase, causing sync failures:
--   "Could not find the 'assistant_message_timestamps' column of 'transcripts'"

-- Cost tracking (from migration 005)
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS estimated_cost_usd REAL;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS cache_read_tokens INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS user_message_timestamps TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS total_user_content_length INTEGER DEFAULT 0;

-- Comprehensive JSONL extraction (from migration 006)
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS stop_reason_counts TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS thinking_message_count INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS thinking_total_length INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS service_tier TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS has_sidechain BOOLEAN DEFAULT false;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS system_error_count INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS system_retry_count INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS avg_turn_duration_ms INTEGER;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS tool_result_error_count INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS compaction_count INTEGER DEFAULT 0;

-- Session context (from migration 007)
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS cwd TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS git_branch TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS assistant_message_timestamps TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS background_task_count INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS web_search_count INTEGER DEFAULT 0;

-- Sync tracking (from migrations 008-009)
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS developer TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS machine_id TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS sync_attempts INTEGER DEFAULT 0;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Make file_path nullable (local filesystem path not meaningful in remote context)
ALTER TABLE transcripts ALTER COLUMN file_path DROP NOT NULL;

-- Reload PostgREST schema cache so new columns are immediately visible
NOTIFY pgrst, 'reload schema';

-- Record migration
INSERT INTO _migrations (name, framework_version)
VALUES ('010-supabase-transcript-columns', '0.7.0');
