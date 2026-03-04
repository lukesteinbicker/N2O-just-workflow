-- Migration 011: Full Transcript Sync
-- Adds messages and tool_calls tables for complete transcript data in Supabase.
-- Messages store full user/assistant content (no truncation).
-- Tool calls store full input params (Edit diffs, Bash commands, etc.) as JSONB.

-- Messages table
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

-- Tool calls table
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(session_id, role);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name_session ON tool_calls(session_id, tool_name);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON tool_calls FOR ALL USING (true) WITH CHECK (true);

-- Record migration
INSERT INTO _migrations (name, framework_version)
VALUES ('011-full-transcript-sync', '0.8.0');

NOTIFY pgrst, 'reload schema';
