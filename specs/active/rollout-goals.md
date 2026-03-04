# Rollout Goals
> Four goals that drive N2O adoption: easy to set up, seamless to update, data-complete, actually an accelerant.

| Field | Value |
|-------|-------|
| Status | Active |
| Owner | Wiley |
| Last Updated | 2026-02-25 |
| Sprint | rollout |

## Contents

1. [Goal 1: Easy to Set Up](#1-easy-to-set-up) — Zero learning curve, everything automatic
2. [Goal 2: Seamless to Update](#2-seamless-to-update) — Auto-sync, skill versioning, quality feedback loops
3. [Goal 3: Capture All Data](#3-capture-all-data) — Every datapoint extracted and synced to cloud
4. [Goal 4: Actually an Accelerant](#4-actually-an-accelerant) — Leadership metrics prove the system works
5. [E2E Verification](#e2e-verification) — 27 e2e tests + 9-check meta-audit
6. [Remaining Gaps](#remaining-gaps) — What's left and what's deferred
7. [Next Steps (Pre-Rollout)](#next-steps-pre-rollout) — Smoke test, onboarding doc, Supabase setup, troubleshooting
8. [Phase 2 (Deferred)](#phase-2-deferred) — Theory, dashboard, NLP, subscription management

---

## Recent Changes

| Date | Change |
|------|--------|
| 2026-02-25 | Goal 3: Sync health in `n2o stats` — terminal + JSON output, Supabase-not-configured handling. Goal 1: Real-time task pull from Supabase with safe-merge logic, blocking pull in claim, background pull on session start. |
| 2026-02-25 | Goal 3: Diff-based Supabase transcript sync — batch upsert, `synced_at` tracking, crash-truncated JSONL recovery. 35 Supabase tests, 29 transcript tests. |
| 2026-02-25 | Goal 3: Session context fields — cwd, git_branch, assistant_message_timestamps, background_task_count, web_search_count. Enables idle time analysis and full session context. |
| 2026-02-25 | Goal 3: Comprehensive JSONL extraction — stop reasons, thinking blocks, service tier, sidechain, system errors/retries/compactions, turn durations, tool result errors. 3 new analytics views (brain_cycles_per_task, context_loading_time, session_health). |
| 2026-02-25 | Goal 2: Auto-sync on session start — `n2o setup`, `--quiet` sync, checksum skill protection, 16 new tests |
| 2026-02-25 | Updated all gaps to reflect implementation status; added "What We Built" and "Verification" per goal |
| 2026-02-25 | Closed remaining gaps: SessionEnd hook for transcript collection, concurrent sessions persisted to DB, 15 e2e tests |
| 2026-02-25 | Added e2e smoke test (13 tests) + meta-test audit (9 checks) covering the full user journey |

---

## Goals

### 1. Easy to Set Up
Zero learning curve — everything automatic. A new team member runs one command and starts working.

**TLDR:** Run `n2o init`, open Claude Code, everything works. Skills auto-invoke based on what you're doing. Tasks flow into the database. Analytics views query immediately. Transcripts collect on session end. Costs calculate from rate cards. Framework updates sync on next session start. No manual steps after init.

**How it works:** `n2o init` stands up the full system in one command: 8 database tables, 24 analytics views, 4 triggers, 6 skills with YAML trigger phrases, SessionStart/SessionEnd hooks, cost rate cards, migration infrastructure, and a health check that validates it all. Claude Code discovers the skills from `.claude/skills/` and the CLAUDE.md template tells it to auto-invoke them. Config sets `auto_invoke_skills: true` by default. Everything downstream — transcript collection, workflow event tracking, concurrent session counting, framework auto-sync — fires from hooks without developer action.

**Success criteria:** `n2o init` + open Claude Code = fully operational. No manual config, no missing deps, no silent failures.

**What we built:**

| Gap | Fix | Where | Status |
|-----|-----|-------|--------|
| No `developer_name` in config | `n2o init` populates from `git config user.name`; session hook falls back to git if missing | `n2o:816-839`, `n2o-session-hook.sh:32-35` | Done |
| `claim-task.sh` swallows errors | `set -e` + explicit exit codes (1 for errors, 2 for "no tasks") at every failure point | `claim-task.sh:21,38,72,93,99,143,209` | Done |
| SQL injection in claim-task.sh | `sanitize_sql()` rejects `;` and `--`, escapes single quotes; applied to all user inputs | `claim-task.sh:33-42,78-86` | Done |
| Session hook output not portable | ANSI escape codes stripped via `sed` before stdout | `n2o-session-hook.sh:209-212` | Done |
| No machine prerequisite check | `n2o check` validates jq, sqlite3, git, bash >=3.2, config, DB tables, scripts, gitignore | `n2o:518-672` | Done |
| `n2o check` not run after init | Init Step 11 calls `run_health_check` (non-fatal) | `n2o:949` | Done |
| No getting-started guide | `quickstart.md` covers agent commands, parallel execution, queries, example session | `01-getting-started/quickstart.md` | Done |
| Compat test for upgrades | 10 tests: config/tasks/CLAUDE.md/schema preserved, skills/schema updated, backup, dry-run, pin | `tests/test-n2o-compat.sh` | Done |

**Verification:**
- `test-n2o-e2e.sh`: `test_e2e_init` verifies DB tables, config version, and rates.json after init
- `test-n2o-e2e.sh`: `test_e2e_check_passes` confirms `n2o check` exits 0 on healthy project
- `test-n2o-e2e.sh`: `test_e2e_check_detects_broken` confirms `n2o check` exits 1 when config is missing
- `test-n2o-e2e.sh`: `test_e2e_session_hook_fires` confirms session hook produces developer context on startup
- `test-n2o-compat.sh`: 10 tests simulate version upgrade and verify nothing breaks
- `test-n2o-claim.sh`: 25 tests covering claiming, priority, dependencies, contention, error handling

### 2. Seamless to Update
The system consistently updates itself. Skill quality metrics feed back into skill revisions.

**TLDR:** We want to improve skills centrally and have those improvements reach every developer automatically. The problem is three-fold: (1) getting updated skills to developers without manual steps, (2) not clobbering skills they've customized locally, and (3) measuring whether new skill versions are actually better. The solution is an auto-sync pipeline that fires on every Claude Code session start.

**How it works:** `n2o setup` writes `~/.n2o/config.json` pointing to the framework clone. On every session start, the SessionStart hook compares the project's N2O version to the framework's version. If they differ, it runs `n2o sync --quiet`, which copies updated skills/schema/scripts but skips any SKILL.md files the developer has modified locally (tracked via SHA256 checksums). The developer sees a single line: `N2O auto-synced: v0.9.0 → v1.0.0 (3 files updated)`. Pinned projects are left alone. `--force` overrides everything. Meanwhile, every skill invocation is tracked with version, tokens, and duration so `n2o stats --compare` can show whether v1.1 of tdd-agent is actually more efficient than v1.0.

**Success criteria:** Every skill invocation is tracked with version, tokens, and duration. Version comparison (`n2o stats --compare`) shows improvement trends. Framework improvements auto-sync to developers without manual steps.

**What we built:**

| Capability | What it does | Where |
|-----------|-------------|-------|
| Skill event tracking | `skill_invoked` events captured with `skill_name`, `skill_version`, token counts | `collect-transcripts.sh:373-391` |
| Version extraction | Skill version read from YAML frontmatter via `get_skill_version()` | `collect-transcripts.sh:68-90` |
| Skill versioning table | `skill_versions` table stores version history with changelog and `introduced_at` | `.pm/schema.sql:492-503` |
| Comparison views | `skill_version_token_usage`, `skill_version_duration`, `skill_version_precision` | `.pm/schema.sql:506-569` |
| `n2o stats --compare` | A/B comparison of token usage, duration, and exploration ratio across skill versions | `n2o:1358-1487` |
| Skill linting | `lint-skills.sh` validates frontmatter, version field, descriptions for all 6 skills | `scripts/lint-skills.sh` |
| Auto-sync on session start | SessionStart hook reads `~/.n2o/config.json`, runs `n2o sync --quiet` if versions differ | `n2o-session-hook.sh:31-60` |
| `n2o setup` | First-time developer setup writes `~/.n2o/config.json` with framework path + preferences | `n2o:cmd_setup()` |
| `--quiet` sync | Suppresses all output except errors; emits single summary line when files change | `n2o:cmd_sync(), sync_project()` |
| Checksum-based skill protection | `.pm/.skill-checksums.json` tracks framework checksums; skips locally modified SKILL.md files | `n2o:sync_directory()` |

**Verification:**
- `test-n2o-e2e.sh`: `test_e2e_workflow_events` asserts exactly 1 `skill_invoked` event with `skill_name='tdd-agent'`
- `test-n2o-skills.sh`: 21 tests validate YAML frontmatter, version fields, trigger descriptions, lint pass
- `test-n2o-migrate.sh`: 30 tests verify migration infrastructure including `003-skill-versioning.sql`
- `test-n2o-auto-sync.sh`: 16 tests covering setup, quiet sync, checksum protection, and session hook auto-sync

### 3. Capture All Data
Every datapoint that might be useful later: time-to-complete, reversions, dollar cost, brain cycles.

**Success criteria:** `workflow_events` and `transcripts` tables are populated automatically. No manual collection steps.

**What we built:**

| Gap | Fix | Where | Status |
|-----|-----|-------|--------|
| `skill_invoked` events not emitted | Collector detects `Skill` tool calls and emits `skill_invoked` events with version | `collect-transcripts.sh:373-391` | Done |
| No dollar cost tracking | Rate card math: `(input × rate + output × rate) / 1M` using `templates/rates.json` | `collect-transcripts.sh:279-312` | Done |
| No brain cycles metric | `user_message_count` extracted per session; `n2o stats` shows avg per task | `collect-transcripts.sh:204`, `n2o:1703-1705` | Done |
| No concurrent session count | Session hook counts `claude` processes via `pgrep`, prints to context, and persists to `developer_context` table | `n2o-session-hook.sh:37-50` | Done |
| Transcript collection not automated | `SessionEnd` hook triggers `collect-transcripts.sh --quiet` when session terminates | `.claude/settings.json`, `n2o:210-211` | Done |
| Transcript-to-task linkage broken | Collector looks up `session_id` in tasks table, populates `sprint`/`task_num` on transcripts + workflow_events | `collect-transcripts.sh` | Done |
| No user message timestamps | JSON array of user message ISO timestamps stored on transcripts | `collect-transcripts.sh`, `schema.sql` | Done |
| No cache token tracking | `cache_read_tokens` + `cache_creation_tokens` extracted from assistant messages | `collect-transcripts.sh`, `schema.sql` | Done |
| No user content length | `total_user_content_length` summed from user message text content | `collect-transcripts.sh`, `schema.sql` | Done |
| Merge conflicts not tracked | `merge_conflict` event emitted to `workflow_events` with escalated/resolved files metadata | `merge-queue.sh` | Done |
| No git diff stats | `lines_added`/`lines_removed` populated on tasks from `git diff --numstat` | `collect-transcripts.sh`, `schema.sql` | Done |
| No task trajectory view | `task_trajectory` view shows phase sequence, audit reversions, first RED to COMMIT timing | `schema.sql` | Done |
| FIX_AUDIT missing metadata | `reason` (audit grade) and `findings` added to FIX_AUDIT phase_entered event metadata | `tdd-agent/SKILL.md` | Done |
| No stop reason tracking | `stop_reason_counts` JSON (end_turn/max_tokens/tool_use distribution) extracted per session | `collect-transcripts.sh`, `schema.sql` | Done |
| No thinking block tracking | `thinking_message_count` + `thinking_total_length` from assistant thinking content | `collect-transcripts.sh`, `schema.sql` | Done |
| No service tier tracking | `service_tier` extracted from assistant message usage | `collect-transcripts.sh`, `schema.sql` | Done |
| No sidechain detection | `has_sidechain` flag from user message `isSidechain` field | `collect-transcripts.sh`, `schema.sql` | Done |
| No system error/retry tracking | `system_error_count`, `system_retry_count`, `compaction_count` from system messages | `collect-transcripts.sh`, `schema.sql` | Done |
| No turn duration tracking | `avg_turn_duration_ms` from system `turn_duration` messages | `collect-transcripts.sh`, `schema.sql` | Done |
| No tool result error tracking | `tool_result_error_count` from user `toolUseResult` with `isError=true` | `collect-transcripts.sh`, `schema.sql` | Done |
| No brain cycles metric | `brain_cycles_per_task` view — user messages per task, avg prompt length, max_token hits | `schema.sql` | Done |
| No context loading metric | `context_loading_time` view — reads before first write ratio | `schema.sql` | Done |
| No session health metric | `session_health` view — classifies sessions as healthy/minor_issues/context_pressure/degraded | `schema.sql` | Done |
| No working directory tracking | `cwd` extracted from first message with cwd field | `collect-transcripts.sh`, `schema.sql` | Done |
| No git branch tracking | `git_branch` extracted from first message with gitBranch field | `collect-transcripts.sh`, `schema.sql` | Done |
| No assistant timestamps | `assistant_message_timestamps` JSON array for idle time / decision time analysis | `collect-transcripts.sh`, `schema.sql` | Done |
| No background task tracking | `background_task_count` counts queue-operation messages (async work) | `collect-transcripts.sh`, `schema.sql` | Done |
| No web search tracking | `web_search_count` from server_tool_use web_search + web_fetch requests | `collect-transcripts.sh`, `schema.sql` | Done |
| No cloud sync of transcripts | Diff-based Supabase sync — batch POST of unsynced rows, `synced_at` tracking, `developer_session_summary` view | `supabase-client.sh`, `supabase-schema.sql`, `sync-task-state.sh` | Done |
| Crash-truncated JSONL lost forever | Pre-validate with jq; if last line is truncated, strip it and recover N-1 messages | `collect-transcripts.sh` | Done |
| Per-transcript sync overhead | Replaced N background processes with single batch POST at end of collector run | `collect-transcripts.sh`, `supabase-client.sh` | Done |
| No sync health visibility | Sync Health section in `n2o stats` (terminal + JSON): total/synced/pending/failed counts, last sync time | `n2o:cmd_stats()` | Done |
| No real-time task state | `supabase_pull_tasks()` pulls task state from Supabase with safe-merge: skip owned tasks, status-only-advances, definitions untouched, supersession handling | `supabase-client.sh`, `claim-task.sh`, `n2o-session-hook.sh` | Done |

**Verification:**
- `test-n2o-e2e.sh`: `test_e2e_transcript_collection` asserts exact message counts (7 total, 2 user, 4 assistant), token sums (2600 input, 1050 output), and tool call count (6)
- `test-n2o-e2e.sh`: `test_e2e_cost_estimation` asserts exact dollar cost `0.02355` from known token counts
- `test-n2o-e2e.sh`: `test_e2e_workflow_events` asserts 4 tool_call + 1 skill_invoked + 1 subagent_spawn events
- `test-n2o-e2e.sh`: `test_e2e_idempotent_collection` confirms no duplicates on re-run
- `test-n2o-e2e.sh`: `test_e2e_transcript_linkage` confirms sprint/task_num populated on transcripts and workflow_events
- `test-n2o-e2e.sh`: `test_e2e_task_trajectory_view` confirms phase sequence, audit reversions, and timing from view
- `test-n2o-e2e.sh`: `test_e2e_cache_tokens_in_transcript` confirms cache token and user content length extraction
- `test-n2o-e2e.sh`: `test_e2e_session_health_view` confirms health classification and error aggregation
- `test-n2o-e2e.sh`: `test_e2e_brain_cycles_view` confirms user message counts and avg chars per prompt
- `test-n2o-e2e.sh`: `test_e2e_context_loading_view` confirms reads-before-first-write ratio
- `test-n2o-transcripts.sh`: 30 tests covering JSONL parsing, token sums, tool calls, subagent detection, idempotency, linkage, cache tokens, user timestamps, content length, stop reasons, thinking blocks, service tier, sidechain detection, system errors/retries, turn duration, tool result errors, compaction count, cwd, git branch, assistant timestamps, background tasks, web searches, crash-truncated file recovery, mid-session update
- `test-n2o-supabase.sh`: 38 tests covering config, task sync, agent registry, activity logging, claim verification, working sets, developer twins, transcript upsert, diff-based batch sync, synced_at tracking, schema validation, sync failure recording, permanently failed row skipping, batch-to-individual fallback

**Remaining gaps:** None — all JSONL data elements are extracted, all derivable analytics views are built, and transcript data syncs to Supabase automatically.

### 4. Actually an Accelerant
Natively makes people faster. Metrics prove it.

**Success criteria:** Leadership can see throughput, efficiency, quality, and cost per task — all derivable from existing data.

**What we built:**

| Metric | Definition | Source | Where |
|--------|-----------|--------|-------|
| Throughput | Tasks completed in 7d / 30d windows | `tasks.completed_at` | `n2o:1675-1677` |
| Efficiency | Avg minutes per task (start → complete) | `tasks.started_at, completed_at` | `n2o:1680-1681` |
| Quality | % of tasks with `testing_posture='A'` | `tasks.testing_posture` | `n2o:1684-1685` |
| Predictability | Avg blow-up ratio (actual / estimated minutes) | `tasks.actual_minutes, estimated_minutes` | `n2o:1688-1689` |
| Adoption | % of tasks using tdd-agent skill | `workflow_events.skill_name` | `n2o:1691-1693` |
| Cost/Task | Avg `estimated_cost_usd` per task | `transcripts.estimated_cost_usd` | `n2o:1695-1697` |
| Peak Tasks | Peak overlapping tasks (`tasks.started_at`/`completed_at`) | `tasks` | `n2o:1699-1701` |
| Peak Sessions | Peak overlapping terminals (`transcripts` where `parent_session_id IS NULL`) | `transcripts` | `n2o:1703-1704` |
| Peak Agents | Peak overlapping agents incl. subagents (all `transcripts`) | `transcripts` | `n2o:1707-1708` |
| Brain Cycles | Avg user messages per task | `transcripts.user_message_count` | `n2o:1703-1705` |

All 8 metrics appear in both terminal output (`n2o stats`) and JSON output (`n2o stats --json`). Definitions documented in `metrics-definition.md`.

**Verification:**
- `test-n2o-stats.sh`: `test_stats_json_keys` confirms JSON output has all required top-level keys
- `test-n2o-stats.sh`: `test_stats_terminal_sections` confirms terminal output includes "Leadership Metrics" section
- `test-n2o-e2e.sh`: `test_e2e_stats_json` validates JSON structure with 7 required keys
- `test-n2o-e2e.sh`: `test_e2e_stats_terminal` confirms "Session Summary", "Leadership Metrics", "Sprint Progress" sections present
- 9 SQL views power the metrics: `skill_token_usage`, `skill_duration`, `skill_precision`, `blow_up_factors`, `velocity_report`, `estimation_accuracy`, `skill_usage`, plus 3 version comparison views

---

## E2E Verification

The full user journey is tested end-to-end in `tests/test-n2o-e2e.sh` (27 tests) with a meta-test audit `tests/test-n2o-e2e-audit.sh` (9 checks) that programmatically validates no tests are fake.

| E2E Test | Goals Covered | What it proves |
|----------|--------------|----------------|
| `test_e2e_init` | 1 | Init scaffolds DB, config, rates.json correctly |
| `test_e2e_seed_tasks` | 3, 4 | Task insertion and sprint views return exact counts |
| `test_e2e_transcript_collection` | 3 | JSONL parsing extracts exact token sums and message counts |
| `test_e2e_workflow_events` | 2, 3 | Skill invocations tracked with correct event types |
| `test_e2e_cost_estimation` | 3, 4 | Dollar cost matches rate card math to 5 decimal places |
| `test_e2e_idempotent_collection` | 3 | Re-running collection doesn't create duplicates |
| `test_e2e_stats_json` | 4 | Stats JSON has all required metric keys |
| `test_e2e_stats_terminal` | 4 | Stats terminal shows all sections including leadership |
| `test_e2e_check_passes` | 1 | Health check passes on properly initialized project |
| `test_e2e_check_detects_broken` | 1 | Health check catches missing config |
| `test_e2e_sync_restores_schema` | 1 | Sync repairs corrupted framework files |
| `test_e2e_sync_preserves_config` | 1 | Sync doesn't overwrite project customizations |
| `test_e2e_all_skills_deployed` | 1, 2 | All 6 SKILL.md files land in `.claude/skills/` after init |
| `test_e2e_skills_have_frontmatter` | 1, 2 | Every skill has YAML frontmatter with `name` + `description` triggers |
| `test_e2e_auto_invoke_config` | 1, 2 | Config has `auto_invoke_skills: true` and empty `disabled_skills` |
| `test_e2e_claude_md_auto_invocation` | 1, 2 | CLAUDE.md instructs Claude to auto-invoke skills + lists all agents |
| `test_e2e_session_hooks_registered` | 1, 2, 3 | Both SessionStart + SessionEnd hooks registered, scripts executable |
| `test_e2e_skill_checksums_seeded` | 2 | 6 SHA256 checksums in `.pm/.skill-checksums.json`, gitignored |
| `test_e2e_session_hook_fires` | 1, 3 | Session hook produces developer context on startup |
| `test_e2e_session_end_hook_registered` | 3 | SessionEnd hook registered in settings.json after init |
| `test_e2e_transcript_linkage` | 3 | Transcript sprint/task_num populated from session-to-task lookup |
| `test_e2e_task_trajectory_view` | 3, 4 | Phase sequence, audit reversions, and timing from task_trajectory view |
| `test_e2e_cache_tokens_in_transcript` | 3 | Cache tokens and user content length extracted correctly |
| `test_e2e_session_health_view` | 3, 4 | Session health classification and error aggregation from comprehensive JSONL data |
| `test_e2e_brain_cycles_view` | 3, 4 | User messages per task as brain cycle proxy, avg chars per prompt |
| `test_e2e_context_loading_view` | 3, 4 | Reads-before-first-write ratio, total reads/writes |
| `test_e2e_concurrent_sessions_persisted` | 3 | Session hook persists concurrent count to developer_context table |

**Meta-test audit** (`test-n2o-e2e-audit.sh`) ensures these tests stay real:
- Every test has assertions (no empty bodies)
- No existence-only tests (must check content, not just file presence)
- No exit-code-only tests (must assert on output, not just $?)
- Assertions use specific literal values (not dynamic variables)
- No commented-out assertions
- Complex tests have >=3 assertions

**Auto-sync tests** (`test-n2o-auto-sync.sh`, 16 tests):
- `n2o setup` creates `~/.n2o/config.json` with all fields, validates framework path, supports reconfigure
- `--quiet` sync emits single summary line on changes, nothing when current, suppresses verbose output
- Init seeds `.pm/.skill-checksums.json`; sync skips locally modified skills; `--force` overrides
- Session hook auto-syncs outdated projects, skips when disabled/pinned/current

**Full suite:** 22 test suites, all green. `bash tests/run-all.sh` passes. Transcript tests: 30. E2E tests: 27. Supabase tests: 38.

---

## Remaining Gaps

| Gap | Goal | Severity | Path Forward |
|-----|------|----------|-------------|
| ~~Transcript collection not automated~~ | 3 | ~~Medium~~ | ~~Done — SessionEnd hook triggers `collect-transcripts.sh`~~ |
| ~~Concurrent sessions not persisted~~ | 3 | ~~Low~~ | ~~Done — Session hook writes to `developer_context` table~~ |
| ~~`n2o stats --compare` untested~~ | 2 | ~~Low~~ | ~~Done — 7 tests in `test-n2o-stats.sh` cover JSON structure, token/duration/precision values, terminal sections, and empty-data fallbacks~~ |
| Observatory dashboard | 4 | Deferred | Phase 2 — `workflow-dashboard.md` |
| NLP-based analysis nodes | 2 | Deferred | Phase 2 |
| Subscription cost tracking | 4 | Deferred | `subscription-management.md` — admin-only feature |

---

## Next Steps (Pre-Rollout)

These must be done before handing N2O to another developer.

### 1. Hands-on smoke test on a real project
Pick an existing project (not the framework repo) and run the full journey: `n2o init`, open Claude Code, claim a task, complete it, check `n2o stats`. Document every friction point, surprise, missing default, or confusing output. This is the highest-value pre-rollout activity — automated tests can't catch UX issues.

### 2. Write the onboarding walkthrough
Write `01-getting-started/ONBOARDING.md` as you do the smoke test. Cover the full path:
- Prerequisites (Claude Code, jq, sqlite3, git)
- Clone/install N2O framework
- `n2o init <your-project>` — what it creates, what to expect
- `n2o check` — verify everything is healthy
- Open Claude Code — first session auto-claims a task
- Set up Supabase (if multi-machine)
- Common "what do I do when..." scenarios

The existing quickstart/setup docs cover pieces but there's no single end-to-end guide for "I have a real project, now what?"

### 3. Supabase setup doc
Even without `n2o setup --supabase` as a CLI command, document the manual steps:
- Create Supabase project
- Run `supabase-schema.sql` in the SQL editor
- Set `SUPABASE_URL` and `SUPABASE_KEY` env vars (or configure in `.pm/config.json`)
- Verify with `n2o sync --pull-tasks`

This unblocks multi-machine coordination without waiting for automation.

### 4. Troubleshooting guide
Document recovery paths for common failures:
- `n2o init` fails (missing deps, permissions, existing `.pm/` directory)
- Transcript sync stuck (`sync_attempts >= 5` — how to diagnose and retry)
- Orphaned worktrees (how to clean up after interrupted claims)
- Database corruption (re-apply schema, re-collect transcripts)
- Supabase unreachable (what degrades, what still works)

### 5. Manual smoke test checklist
A short checklist (not the full onboarding doc) for verifying a fresh install works:
```
1. n2o init <path>           → expect "Initialized successfully"
2. n2o check                 → expect exit 0, all checks green
3. n2o stats                 → expect all sections render (even if empty)
4. n2o stats --json | jq .   → expect valid JSON with sync_health key
5. Open Claude Code          → expect session hook fires, developer context shown
```

### 6. Theoretical clarity before dashboard
The leadership dashboard (`workflow-dashboard.md`) is downstream of getting the Output/Hour framework and brain cycle model clear. The right sequence:
1. **Theory / HTML diagram** — nail down the visual model
2. **Metrics definition refinement** — validate the 10 metrics map to the theory
3. **Dashboard** — build it knowing what story the data tells

Don't build the dashboard until steps 1-2 are done, or you'll redesign it.

---

## Phase 2 (Deferred)

| Item | Spec | Description |
|------|------|-------------|
| Theoretical clarity + HTML diagram | `../README.md` | Visual Output/Hour framework — prerequisite for dashboard |
| Observatory dashboard | `workflow-dashboard.md` | GraphQL API + Next.js dashboard for leadership metrics |
| NLP analysis nodes | — | Natural language analysis of transcript content |
| Subscription management | `subscription-management.md` | Per-developer plan tracking, admin-only CLI |
| Supabase setup automation | `../README.md` | `n2o setup --supabase` guided CLI setup |
| Clawdbot workflow research | `../README.md` | Study high-velocity shipping patterns |
| Git policy documentation | `../README.md` | Branching strategy, merge conventions, worktree lifecycle |
