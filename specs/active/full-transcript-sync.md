# Full Transcript Sync

> Capture complete Claude Code transcript data (messages, tool calls with diffs, tool outputs) in Supabase so all session content is queryable from one central place.

| Field | Value |
|-------|-------|
| Status | Draft |
| Owner | wiley |
| Last Updated | 2026-03-04 |
| Depends On | data-platform.md |
| Enables | Dashboard conversation detail views, cross-machine search, audit trails |

---

## Recent Changes

| Date | What changed | Section |
|------|-------------|---------|
| 2026-03-04 | v2: Drop Python, use jq; add local staging; fix FK/payload issues | Design, Schema, Implementation |
| 2026-03-04 | Initial spec | All |

---

## Goal

JSONL transcript files are the source of truth for every Claude Code session, but they're scattered across developer machines and only queryable locally. The dashboard's activity page currently reads them via a local filesystem resolver (`conversation.ts`), which means it only works on the machine that ran the session.

We want all transcript content — full messages, complete tool call inputs (including Edit diffs), and tool outputs — centralized in Supabase so it's queryable from anywhere.

---

## Success Criteria

- Every new session's messages and tool calls sync to Supabase automatically via the existing `transcript-collected` hook
- Dashboard activity page can render full session detail from Supabase (no local JSONL dependency)
- Edit diffs (old_string/new_string) are queryable: `SELECT * FROM tool_calls WHERE tool_name = 'Edit' AND session_id = '...'`
- Bulk catch-up via `sync-all` backfills historical sessions

---

## Current State

- **Transcripts table** syncs session-level aggregates: token counts, message counts, cost, timing, stop reasons. No message content.
- **Workflow events table** syncs tool invocation summaries: tool name, file path or command snippet, token counts. No input params or outputs.
- **conversation.ts resolver** parses local JSONL files on every request. Only works on the machine that ran the session. Truncates content to 5000 chars.
- **Sync pipeline** (`supabase-client.sh` + `sync-task-state.sh`) handles transcripts, workflow_events, tasks, developer_context, skill_versions. Adding new streams means adding functions to `supabase-client.sh` and handlers to `sync-task-state.sh`.

---

## Ideal State

Every piece of data in a JSONL transcript is in Supabase. Any developer can open the dashboard and see full session transcripts — messages, diffs, tool outputs, thinking blocks — regardless of which machine ran the session. Cross-session search ("find all Edit calls that touched file X") is a simple SQL query.

---

## Design

Two new tables: `messages` and `tool_calls` — both in local SQLite and Supabase. They sit alongside the existing `transcripts` table (which keeps its aggregate role) and are linked by `session_id`.

**Trade-offs from ideal**: We defer full-text search indexing and thinking block storage to a later phase. Thinking blocks are very large and lower-value for querying. We also defer tool *output* storage initially — inputs (the diffs, commands, queries) are the high-value data; outputs can be added later.

### New tables

#### `messages`

Stores every user and assistant message with full content (no truncation).

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER/SERIAL PK | Auto-increment |
| `session_id` | TEXT NOT NULL | Links to transcripts.session_id |
| `message_index` | INTEGER NOT NULL | Position in conversation (0-based) |
| `role` | TEXT NOT NULL | `user`, `assistant`, `system` |
| `content` | TEXT | Full message text (no truncation) |
| `timestamp` | TIMESTAMPTZ | From JSONL entry |
| `model` | TEXT | Model that generated this message (assistant only) |
| `input_tokens` | INTEGER | Tokens in this turn's input |
| `output_tokens` | INTEGER | Tokens in this turn's output |
| `stop_reason` | TEXT | `end_turn`, `tool_use`, `max_tokens` |

**Unique constraint**: `(session_id, message_index)` — enables upsert on re-sync.

#### `tool_calls`

Stores every tool invocation with full input parameters.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER/SERIAL PK | Auto-increment |
| `session_id` | TEXT NOT NULL | Links to transcripts.session_id |
| `message_index` | INTEGER NOT NULL | Which assistant message contains this call |
| `tool_index` | INTEGER NOT NULL | Position within that message's tool_use blocks |
| `tool_use_id` | TEXT | Claude's tool_use ID |
| `tool_name` | TEXT NOT NULL | `Edit`, `Read`, `Bash`, `Write`, `Grep`, etc. |
| `input` | TEXT (SQLite) / JSONB (Supabase) NOT NULL | Full input params (old_string, new_string, file_path, command, etc.) |
| `output` | TEXT | Tool result content (nullable — phase 2) |
| `is_error` | BOOLEAN DEFAULT false | Whether the tool result was an error |
| `timestamp` | TIMESTAMPTZ | From JSONL entry |

**Unique constraint**: `(session_id, message_index, tool_index)` — enables upsert on re-sync.

### Architecture: local staging → Supabase sync

Follow the same pattern as every other data stream: **JSONL → local SQLite → Supabase**.

1. **JSONL → SQLite** happens in `conversation.ts` (the existing TypeScript parser). Extend it to write parsed messages and tool_calls to local SQLite tables alongside the existing transcript aggregates. This is the single JSONL parser — no duplication.

2. **SQLite → Supabase** happens in `supabase-client.sh` using `jq` for JSON transformation — same as transcripts and workflow_events today. New functions read from local SQLite (not JSONL), batch-transform with `jq`, and POST to Supabase.

This means:
- **One JSONL parser** (TypeScript, already exists)
- **Local staging** with retry tracking (survives Supabase outages)
- **jq for sync transforms** (consistent with existing pipeline)
- **conversation.ts reads local SQLite first**, Supabase second (progressive enhancement)

### Sync pipeline changes

Extend `supabase-client.sh` with two new functions:

1. **`supabase_sync_session_messages`** — Read from local `messages` SQLite table, batch upsert to Supabase `messages` table
2. **`supabase_sync_session_tool_calls`** — Read from local `tool_calls` SQLite table, convert `input` TEXT to JSONB via jq, batch upsert to Supabase `tool_calls` table

Both are called from the existing `handle_transcript_collected` handler in `sync-task-state.sh`, right after the transcript aggregate upsert. Also called from `handle_sync_all` for bulk catch-up.

**Chunking**: Tool calls with large JSONB inputs (Edit diffs) can produce big payloads. Chunk at 100 rows per batch (vs 500 for workflow_events) to stay within Supabase POST limits.

### JSONL file path resolution

The `transcript-collected` handler receives a `session_id`. The JSONL `file_path` is already stored in the local `transcripts` SQLite table. The TypeScript extractor looks up the path from SQLite, reads the JSONL, and writes messages + tool_calls to local SQLite. The bash sync functions then read from SQLite — they never touch JSONL directly.

### Dashboard integration

Update `conversation.ts` to read from the local SQLite `messages` and `tool_calls` tables instead of re-parsing JSONL on every request. This is faster and consistent regardless of whether the JSONL file still exists. Supabase-backed reads come later as a progressive enhancement (requires adding a Supabase client to the platform API server, which is out of scope for this spec).

---

## Schema

### Local SQLite (add to `.pm/schema.sql`)

```sql
-- Messages: full content of every conversation message
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
    synced_at TEXT,
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
    input TEXT NOT NULL,  -- JSON string (JSONB in Supabase)
    output TEXT,
    is_error BOOLEAN DEFAULT 0,
    timestamp TEXT,
    synced_at TEXT,
    UNIQUE (session_id, message_index, tool_index)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name);
```

### Supabase migration (011)

```sql
-- Migration 011: Full transcript sync tables

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
```

**Note on FKs**: No foreign key from `messages`/`tool_calls` to `transcripts` because `transcripts.session_id` lacks a UNIQUE constraint. The `session_id` index provides join performance; referential integrity is enforced by the sync pipeline (messages are only written for sessions that have a transcript row).

---

## Implementation Plan

| # | Task | Done When |
|---|------|-----------|
| 1 | Add `messages` + `tool_calls` tables to `.pm/schema.sql` and create Supabase migration 011 | Local SQLite tables created on `schema.sql` load; Supabase migration applied |
| 2 | Extend `conversation.ts` to write parsed messages and tool_calls to local SQLite | After JSONL parse, messages/tool_calls rows exist in local SQLite; conversation resolver reads from SQLite instead of re-parsing |
| 3 | Add `supabase_sync_session_messages` and `supabase_sync_session_tool_calls` to `supabase-client.sh`; wire into `transcript-collected` and `sync-all` handlers | Functions read from local SQLite, batch upsert to Supabase (chunked at 100 rows), called after transcript aggregate sync |
| 4 | Update `conversation.ts` resolver to read from local SQLite `messages`/`tool_calls` tables | Activity page renders from SQLite (faster, no re-parse), falls back to JSONL parse for sessions not yet in SQLite |

---

## Open Questions

1. ~~Should we store thinking blocks?~~ **Deferred**: They're large and low-value for querying. Can add a `thinking` TEXT column to `messages` later.
2. ~~Should we store tool outputs?~~ **Phase 2**: The `output` column exists but is nullable. We'll populate it in a follow-up — inputs are the high-value data.
3. ~~Should we add a Python JSONL parser?~~ **No**: Reuse the existing TypeScript parser in `conversation.ts`. One parser, no duplication. Bash sync reads from SQLite, not JSONL.
4. Should we add GIN indexes on `tool_calls.input` for JSONB path queries (e.g., `input->>'file_path' = 'foo.ts'`)?
5. What retention policy, if any? Transcripts accumulate indefinitely — should we prune messages/tool_calls older than N days?
6. ~~Should we add a Supabase client to the platform API server?~~ **Deferred**: Out of scope. Dashboard reads local SQLite for now; Supabase-backed reads are a future enhancement.

---

## References

- Current Supabase schema: `platform/supabase-schema.sql`
- Sync pipeline: `scripts/coordination/supabase-client.sh`
- Sync trigger: `scripts/coordination/sync-task-state.sh`
- JSONL resolver: `platform/src/resolvers/conversation.ts`
- Data platform spec: `specs/active/data-platform.md`
