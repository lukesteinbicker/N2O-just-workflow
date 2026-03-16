# Phase 5: `n2o task` commands + lazy transcript parsing
> Agents call `n2o task *` for all mutations instead of raw SQL. The CLI handles local DB write + event generation + remote push in one codepath. Session-end hook handles transcript/stats collection.

## What changes

1. **`n2o task *` command family** — every task mutation goes through the CLI. Agents stop running raw `sqlite3` commands. Each command: validates → updates local DB → generates event → pushes to remote API (if authenticated + online).
2. **`n2o phase` command** — replaces raw SQL phase tracking inserts.
3. **`n2o sprint` command** — sprint lifecycle (archive, etc.).
4. **Lazy transcript parsing** — JSONL transcripts are parsed on-demand (first `n2o task *` or `n2o stats` call in a new session detects un-indexed JSONL files and parses them). No dedicated session-end hook.
5. **SKILL.md rewrites** — all agent skills updated to use `n2o` commands instead of `sqlite3`.
6. **Adapter interface** — coding tool abstraction for session data parsing. Claude Code is the first adapter.
7. **Absorbs `collect-transcripts.sh`** and **`live-feed-hook.sh`** — both deleted after port.

## Command reference

### Task commands (allowlisted — no approval prompt)

| Command | What it does | Used by |
|---------|-------------|---------|
| `n2o task list` | List tasks (filterable by sprint, status, owner) | All agents |
| `n2o task available` | Show unclaimed tasks with met dependencies | tdd-agent |
| `n2o task claim --sprint X --task N` | Atomically claim a task. Exits non-zero if already claimed. | tdd-agent |
| `n2o task status --sprint X --task N --status red` | Change task status. Validates transition. | tdd-agent |
| `n2o task block --sprint X --task N --reason "..."` | Mark task blocked with reason | tdd-agent |
| `n2o task unblock --sprint X --task N` | Clear blocked status | pm-agent, CLI |
| `n2o task audit --sprint X --task N --posture A [--pattern-notes "..."]` | Record audit results | tdd-agent |
| `n2o task codify --sprint X --task N --notes "..."` | Record codification results. `--skip` to decline. | tdd-agent |
| `n2o task commit --sprint X --task N --hash abc123` | Record commit hash, auto-compute line stats | tdd-agent |
| `n2o task create --sprint X --title "..." [--type T] [--done-when "..."]` | Create a single task | pm-agent, bug-workflow, code-health |
| `n2o task dep add --sprint X --task N --depends-on M` | Add dependency. Validates no cycles. | pm-agent |
| `n2o task verify --sprint X --task N` | Mark task verified | pm-agent |
| `n2o phase enter --phase RED --skill tdd-agent [--sprint X --task N]` | Log phase transition | All agents |
| `n2o sprint create --name X [--goal "..."] [--deadline DATE]` | Create sprint | pm-agent |
| `n2o sprint archive --name X` | Delete verified tasks, mark sprint completed | pm-agent |

### User-facing commands (require approval)

| Command | What it does |
|---------|-------------|
| `n2o login` | OAuth device flow, stores token in `~/.n2o/credentials.json` |
| `n2o logout` | Clear stored credentials |
| `n2o status` | Show auth state, pending events, last sync |
| `n2o sync` | Flush pending events, pull remote state |
| `n2o sync --rebuild` | Full state pull from remote, rebuild local DB |
| `n2o setup` | Configure `~/.n2o/config.json` (framework path, developer name) |
| `n2o init` | Scaffold project: copy skills, schema, create DB, write allowlist |
| `n2o check` | Validate project health (tables, views, files, skill markers, file sizes, `n2o` on PATH) |
| `n2o stats` | Query local DB for sprint/session/tool stats |
| `n2o version` | Show or bump version |

## Permission allowlisting

`n2o init` and `n2o sync` write explicit allowlist rules into `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(n2o task list*)",
      "Bash(n2o task available*)",
      "Bash(n2o task claim *)",
      "Bash(n2o task status *)",
      "Bash(n2o task block *)",
      "Bash(n2o task unblock *)",
      "Bash(n2o task audit *)",
      "Bash(n2o task codify *)",
      "Bash(n2o task commit *)",
      "Bash(n2o task create *)",
      "Bash(n2o task dep *)",
      "Bash(n2o task verify *)",
      "Bash(n2o phase enter *)",
      "Bash(n2o sprint create *)",
      "Bash(n2o sprint archive *)"
    ]
  }
}
```

Explicit per-command entries avoid glob ambiguity. Destructive commands (`n2o sync`, `n2o login`) are intentionally excluded.

## Offline / logged-out behavior

Every `n2o task *` command works without authentication. The local DB is always updated.

### Auth states

| State | Local DB | Event log | Remote push | User sees |
|-------|----------|-----------|-------------|-----------|
| **Logged in, online** | Updated | Event written (user_id from token) | Pushed immediately | `✓ auth/3 → green (synced)` |
| **Logged in, offline** | Updated | Event written (user_id from token) | Queued, flushed on reconnect | `✓ auth/3 → green (queued)` |
| **Logged out** | Updated | Event written (user_id = NULL) | Not attempted | `✓ auth/3 → green` + warning |

Events are **always written locally** regardless of auth state. Events with `user_id = NULL` don't sync — they're local-only records. If the user later logs in, a backfill could replay them, but that's not a v1 requirement.

### Logged-out warning

```
✓ auth/3 status → green
⚠ Not logged in — changes are local only. Run: n2o login
```

- Printed to stderr, once per session (suppressed after first occurrence)
- Session-start hook also injects warning into agent context

### Token expiry mid-session

1. Next push gets 401 → event stays in event with `synced_at = NULL`
2. Prints: `⚠ Session expired — events queued locally. Run: n2o login`
3. Subsequent commands skip push for rest of session (avoids repeated 401s)
4. On next login or first `n2o task *` call, queued events flush

## What each command does internally

Every `n2o task *` / `n2o phase` / `n2o sprint` command follows the same pattern:

```
1. Parse flags
2. Validate (state transition legal? task exists? not already claimed?)
3. Open .pm/workflow.db (WAL mode, busy timeout 5s)
4. BEGIN TRANSACTION
   a. UPDATE/INSERT task state in tasks table
   b. INSERT event into event table (same database)
5. COMMIT
6. If authenticated + online:
   POST /api/projects/:id/events (non-blocking, best-effort)
   ├─ 200 OK → UPDATE event SET synced_at = NOW()
   └─ 5xx / timeout → leave unsynced, will flush later
7. Print confirmation (terse, one line)
```

### Design decisions

**Single database**: `event` lives in `.pm/workflow.db` alongside task state. No cross-DB transaction issues. Phase 4's split into `events.db` / `tasks.db` / `local.db` is dropped — one DB, one transaction, one source of truth locally.

**WAL mode + busy timeout**: Handles 8-10 concurrent terminals writing to the same SQLite. WAL allows concurrent reads during writes. `PRAGMA busy_timeout = 5000` retries on lock contention rather than failing immediately.

**project_id**: Stored in `.pm/config.json`, set during `n2o init` by linking to the GitHub repo. Format: `github.com/org/repo`. Required for remote push, not for local operations.

**Local-first**: Local DB is always updated first. Remote push is best-effort. If push fails, the local state is still correct and the event is queued.

## Task claiming (concurrent sessions)

When running 8-10 parallel Claude Code terminals against the same sprint, each terminal's tdd-agent needs a different task. `n2o task claim` handles this with a local atomic operation:

```
1. BEGIN TRANSACTION
2. SELECT owner FROM task WHERE sprint = ? AND task_num = ? AND status = 'pending'
   - If owner IS NOT NULL → ROLLBACK, exit 1, print "already claimed by {owner}"
   - If status != 'pending' → ROLLBACK, exit 1, print "task is {status}"
3. UPDATE task SET owner = ?, session_id = ? WHERE ...
4. INSERT INTO event (...)
5. COMMIT
6. Push event to remote (best-effort, informational — not a lock request)
```

All claims happen against the same local `.pm/workflow.db`. SQLite's WAL mode handles concurrency natively — no remote conflict detection needed. The agent sees a non-zero exit code and picks a different task from `n2o task available`.

> **Future multi-user note**: Multi-user collaboration operates at a higher abstraction layer (objectives/epics in the web app, assigned to developers). The `task` table stays per-developer, agent-scoped. See phase 4's "Future: Multi-user extension" section.

## Lazy transcript parsing

No dedicated session-end hook. Instead, JSONL transcripts are parsed on-demand:

1. Every `n2o task *`, `n2o stats`, or `n2o check` call opens `.pm/workflow.db`
2. On open, the DB layer checks for un-indexed JSONL files via the adapter's `Discover()` method
3. Any new/grown files are parsed via `adapter.Parse()` → upserted into `transcript` and `telemetry` tables
4. Stats cache (`~/.claude/stats-cache.json`) is also read and upserted into `stat` table

This is fast (~10ms per file in Go with streaming parser) and transparent — the user never thinks about collection.

### Backfill (one-time migration)

```
n2o stats --backfill    # parse all JSONL files, not just new ones
n2o stats --reparse     # delete + re-parse everything
```

## Phase tracking

```
n2o phase enter --phase RED --skill tdd-agent --sprint auth --task 3
n2o phase enter --phase IDEATION --skill pm-agent
```

Sprint and task flags are **optional** — pm-agent's early phases (IDEATION, AUDIT_CODE, REFINEMENT) happen before tasks exist. The command writes to `telemetry` table and pushes to remote if authenticated.

## Adapter interface

The adapter is only used by the lazy transcript parser (JSONL parsing + stats-cache). Task commands are coding-tool-agnostic.

```go
package adapters

type Adapter interface {
    Name() string
    Discover(projectPath string, reparse bool) ([]SessionFile, error)
    Parse(file SessionFile) (*SessionData, error)
    StatsCache() (*StatsCache, error)
}
```

Registry defaults to `"claude-code"`. Configurable via `adapter` field in `~/.n2o/config.json` or `.pm/config.json`.

## SKILL.md changes

Every `sqlite3 .pm/workflow.db "..."` gets replaced with the corresponding `n2o` command.

### tdd-agent

| Phase | Before (raw SQL) | After |
|-------|-----------------|-------|
| PICK | `SELECT ... FROM available_tasks` | `n2o task available --sprint X` |
| PICK | `UPDATE tasks SET owner = ... WHERE owner IS NULL; SELECT changes();` | `n2o task claim --sprint X --task N` |
| RED | `UPDATE tasks SET status = 'red' ...` + `INSERT INTO workflow_events ...` | `n2o task status ... --status red` + `n2o phase enter --phase RED ...` |
| GREEN | `UPDATE tasks SET status = 'green' ...` + `INSERT INTO workflow_events ...` | `n2o task status ... --status green` + `n2o phase enter --phase GREEN ...` |
| REFACTOR | `INSERT INTO workflow_events ...` | `n2o phase enter --phase REFACTOR ...` |
| AUDIT | `UPDATE tasks SET tests_pass, testing_posture, ...` | `n2o task audit --posture A --pattern-notes "..."` |
| CODIFY | `UPDATE tasks SET skills_updated, skills_update_notes ...` | `n2o task codify --notes "..."` |
| COMMIT | (shells out to git) | `n2o task commit --hash $(git rev-parse HEAD)` |
| ERROR | `UPDATE tasks SET status = 'blocked', blocked_reason = ...` | `n2o task block --reason "..."` |

### pm-agent

| Phase | Before | After |
|-------|--------|-------|
| SPRINT_PLANNING | `INSERT INTO tasks (...) VALUES (...);` (bulk, repeated) | `n2o task create --sprint X --title "..." ...` (called per task) |
| SPRINT_PLANNING | `INSERT INTO task_dependencies VALUES (...);` | `n2o task dep add --sprint X --task N --depends-on M` |
| MONITOR | `INSERT INTO tasks (...) VALUES (...);` | `n2o task create --sprint X --title "..." ...` |
| SPRINT_COMPLETION | `DELETE FROM tasks WHERE sprint = ? AND verified = TRUE;` | `n2o sprint archive --name X` |
| All phases | `INSERT INTO workflow_events ...` | `n2o phase enter --phase IDEATION --skill pm-agent` |

### bug-workflow

| Phase | Before | After |
|-------|--------|-------|
| All phases | `INSERT INTO workflow_events (... 'phase_entered' ...)` | `n2o phase enter --phase REPRODUCE --skill bug-workflow` |
| TASK | `INSERT INTO tasks (...) VALUES (...);` | `n2o task create --sprint hotfix --title "..." --done-when "..."` |

### code-health

| Phase | Before | After |
|-------|--------|-------|
| CREATE TASKS | `INSERT INTO tasks (...) VALUES (...);` | `n2o task create --sprint tech-debt --title "Fix: ..." --type docs ...` |

## Lazy initialization

No hooks. The first `n2o` command in a session handles everything:

1. **Auto-migrate** — check `migration` table, apply pending schema changes
2. **Context injection** — print developer name, concurrent sessions, git status (once per session)
3. **Auth check** — if not logged in, print warning (once per session)
4. **Event flush** — if authenticated + online, flush pending events from `event` table
5. **Transcript parsing** — if un-indexed JSONL files exist, parse them via adapter
6. **`n2o` on PATH** — `n2o check` validates this; if not on PATH, agents can't call it

## Steps

1. Implement `internal/task/` package — validation, state machine, event generation
2. Implement task Cobra commands: `list`, `available`, `claim`, `status`, `block`, `unblock`, `audit`, `codify`, `commit`, `create`, `dep`, `verify`
3. Implement `n2o phase enter` Cobra command (sprint/task optional)
4. Implement `n2o sprint create`, `archive` Cobra commands
5. Implement auth-aware event push — check credentials, push if online, queue if offline, warn if logged out
6. Implement "warn once per session" logic for logged-out state
7. Enable WAL mode + busy timeout on DB open, auto-migrate on open
8. Implement adapter interface + Claude Code adapter (Discover, Parse, StatsCache)
9. Implement lazy transcript parsing — detect un-indexed JSONL on DB open, parse via adapter
10. Add `--backfill` and `--reparse` flags to `n2o stats`
11. Add `stat` and `event` tables to schema + migration, rename all tables to singular
12. Update `n2o init` / `n2o sync` to write permission allowlist into `.claude/settings.json`
13. Update tdd-agent SKILL.md — replace all raw SQL with `n2o` commands
15. Update pm-agent SKILL.md — replace all raw SQL
16. Update bug-workflow SKILL.md — replace all raw SQL
17. Update code-health SKILL.md — replace all raw SQL
18. Delete `scripts/collect-transcripts.sh` and `scripts/live-feed-hook.sh`

## Project structure additions

```
internal/
  task/
    task.go              (validation, state machine, event generation)
    claim.go             (atomic claim with conflict detection)
    status.go            (state transitions, reversion tracking)
    audit.go             (audit result recording)
    create.go            (task creation, dependency management)
  adapters/
    adapter.go           (interface + shared types)
    registry.go          (adapter lookup by name)
    claudecode/
      adapter.go         (Claude Code adapter)
      parser.go          (streaming JSONL parser)
      stats.go           (stats-cache.json reader)
      paths.go           (path encoding, file discovery)
cmd/n2o/cmd/
  task.go                (task subcommand family)
  phase.go               (phase enter command)
  sprint.go              (sprint create/archive)
```

## Files

### New
```
internal/task/*.go
internal/adapters/*.go
internal/adapters/claudecode/*.go
cmd/n2o/cmd/task.go
cmd/n2o/cmd/phase.go
cmd/n2o/cmd/sprint.go
.pm/migrations/010-rename-tables-add-event-stat.sql
```

### Delete
```
scripts/collect-transcripts.sh
scripts/live-feed-hook.sh
```

### Edit
```
skills/tdd-agent/SKILL.md             (replace raw SQL with n2o commands)
skills/pm-agent/SKILL.md              (replace raw SQL with n2o commands)
skills/bug-workflow/SKILL.md          (replace raw SQL with n2o commands)
skills/code-health/SKILL.md           (replace raw SQL with n2o commands)
  NOTE: paths assume phase 2 has run. If not, these are under 02-agents/.
.pm/schema.sql                        (rename tables to singular, add event + stat)
.claude/settings.json                 (permission allowlist)
```

## Verification

### Task commands
- `n2o task claim` succeeds on unclaimed task, fails on already-claimed (exits non-zero, prints owner)
- `n2o task status` validates transitions — pending→red ok, pending→green rejected
- `n2o task status` detects reversions (green→red increments `reversions` column)
- `n2o task audit` writes all audit columns atomically
- `n2o task create` creates task with all specified columns
- `n2o task dep add` rejects cycles
- `n2o task available` returns only unclaimed, unblocked tasks with met dependencies
- Every command generates an event in `event` table
- Every command pushes to remote API when authenticated + online (non-blocking)
- Every command works without auth (event written with user_id = NULL, no push)

### Concurrency
- 8 parallel `n2o task claim` on same task → exactly 1 succeeds, 7 fail cleanly
- 8 parallel `n2o task status` on different tasks → all succeed (WAL mode)
- No `SQLITE_BUSY` errors under normal load (busy timeout handles contention)

### Lazy parsing
- First `n2o task *` call in a new session parses any un-indexed JSONL files
- `n2o stats --backfill` parses all JSONL files
- Truncated JSONL files handled gracefully (skip last line)

### Agent integration
- tdd-agent full cycle (claim → red → green → audit → codify → commit) uses only `n2o` commands
- pm-agent sprint planning seeds tasks via repeated `n2o task create` calls
- bug-workflow creates hotfix tasks via `n2o task create`
- No `sqlite3 .pm/workflow.db` commands remain in any SKILL.md
- All `n2o task *` / `n2o phase *` commands auto-approved (no user prompt)

## Open questions

- Should `n2o task status --status red` also implicitly log `n2o phase enter --phase RED`? Would halve the number of commands agents call but couples two concerns.
- Should the adapter ingest `~/.claude/telemetry/1p_failed_events.*.json`? Useful data (thinking tokens, cache hit rates) but Anthropic's internal format may change.
- How should `n2o check` validate the permission allowlist in `.claude/settings.json`? Should it warn if entries are missing?
