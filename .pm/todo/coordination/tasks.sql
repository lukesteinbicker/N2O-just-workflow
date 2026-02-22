-- =============================================================================
-- Coordination Sprint Tasks
-- Source spec: specs/coordination.md
-- 4 phases, 13 tasks total
-- =============================================================================

-- =============================================================================
-- PHASE 1: Local Coordination (single machine, parallel agents)
-- Get N agents working in parallel on one machine with isolation + merging.
-- =============================================================================

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 1,
 'Git worktree lifecycle scripts',
 'infra', 'infra',
 4.0, 'medium', 'Git worktree API is well-documented but edge cases around cleanup and .pm/tasks.db sharing need care',
 'Scripts exist: create-worktree (given task ID, creates worktree + branch), cleanup-worktree (removes worktree + branch after merge). Manual test: create 3 worktrees, verify independent working directories, verify shared .git database, cleanup all 3.',
 'Create scripts for git worktree management that the coordination system uses to isolate each agent.

create-worktree.sh:
- Input: task identifier (sprint + task_num)
- Creates branch task/{sprint}-{task_num} from current HEAD
- Creates worktree at project/worktree-{sprint}-{task_num}/
- Copies .pm/tasks.db into the worktree (each agent needs its own local copy for reads)
- Returns the worktree path

cleanup-worktree.sh:
- Input: task identifier
- Removes the worktree (git worktree remove)
- Deletes the branch if merged
- Cleans up any leftover files

Edge cases: handle worktree already exists (re-claim after crash), handle branch already exists, handle cleanup when worktree has uncommitted changes (warn, don''t delete).

Reference: specs/coordination.md Goal C (Isolation), Q3 (git worktrees).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 2,
 'Session hook: auto-register agent and claim task',
 'infra', 'infra',
 3.0, 'medium', 'Claude Code hook system is documented but integration with worktrees and SQLite claiming is novel',
 'Enhanced session hook exists. On SessionStart: agent registers in local state, queries available_tasks with basic scoring (skill match), claims best task via atomic SQLite UPDATE, creates worktree for claimed task, prints task context. Manual test: start Claude Code session in N2O project, verify auto-claim fires.',
 'Enhance scripts/n2o-session-hook.sh (or create new hook script) to handle agent lifecycle on session start.

On SessionStart:
1. Detect this is an N2O project (check for .pm/tasks.db)
2. Generate agent ID (e.g., agent-{hostname}-{pid}-{timestamp})
3. Query available_tasks view for best available task
4. Claim atomically: UPDATE tasks SET owner = agent_id, session_id = $SESSION_ID, status = ''red'' WHERE sprint = $sprint AND task_num = $task_num AND owner IS NULL
5. Verify claim with SELECT changes() — if 0, someone else claimed, try next
6. Call create-worktree.sh for the claimed task
7. Output task context (title, description, done_when) for the agent to begin work

Initial routing: simple priority ordering from available_tasks. Intelligent routing (Digital Twin) comes in Phase 3.

Reference: specs/coordination.md Goal G (Developer Experience), Q7 (Agent initiation).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 3,
 'Local merge queue with sequential merging',
 'infra', 'infra',
 4.0, 'high', 'Background process management in bash, dependency-aware merge gating, error handling for failed merges',
 'Merge queue script exists. Accepts completed task branches, merges them sequentially into base branch. Clean merges auto-complete. Conflicting merges are flagged with file list + conflict details. Dependency gating: tasks do not become available until predecessor merge lands. Manual test: complete 3 tasks in parallel worktrees, verify sequential merge, verify dependent task unblocks only after merge.',
 'Create scripts/coordination/merge-queue.sh — a background process that manages merging completed agent work.

Core loop:
1. Watch for completed tasks (status = green, has worktree branch, not yet merged)
2. For each, attempt: git merge task/{sprint}-{task_num} into base branch
3. If clean merge: mark as merged, call cleanup-worktree.sh, update task status
4. If conflict: log conflict details (which files, conflict markers), flag for human review, skip and continue with next task
5. After successful merge: check if any dependent tasks just became unblocked (all predecessors merged), update available_tasks accordingly

Dependency-aware gating:
- Add a merged_at column or flag to tasks table (or use commit_hash as indicator)
- Modify available_tasks view: predecessors must be green AND merged (not just green)

The merge queue runs as a loop with a configurable interval (default: check every 5 seconds).
Does NOT include AI conflict resolution yet — that comes in Phase 4.

Reference: specs/coordination.md Goal D (Conflict Resolution), Q5 (Merge strategy).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 4,
 'File structure linter for parallel safety',
 'infra', 'infra',
 2.0, 'low', 'Straightforward file analysis script',
 'Linter script exists. Reports files over N lines (configurable, default 200). Integrated into lint-skills.sh or standalone. Running on the codebase produces a report of files that should be decomposed for parallel safety.',
 'Create scripts/lint-file-size.sh — a linter that flags files too large for safe parallel editing.

Behavior:
- Scan source files (configurable extensions: .ts, .tsx, .js, .jsx, .py, .rs, .go, .sh)
- Flag files exceeding a configurable threshold (default: 200 lines)
- Output: file path, line count, suggestion to decompose
- Exit code: 0 if no violations, 1 if violations found
- Exclude: node_modules, .git, vendor, build directories

This is a prevention-first tool: if files are small enough, parallel agents rarely touch the same file and conflicts become rare.

Reference: specs/coordination.md Goal C2 (File Structure for Parallelism).');

-- =============================================================================
-- PHASE 2: Supabase Integration (cross-machine coordination)
-- Add shared coordination store for multi-machine visibility.
-- =============================================================================

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 5,
 'Supabase schema + client setup',
 'database', 'database, infra',
 4.0, 'high', 'First Supabase integration in the framework. Schema design, auth setup, client library choice, real-time subscription wiring.',
 'Supabase project exists with tables: tasks (mirror of local), agents (registry), activity_log (events). Client script (bash or node) can read/write to Supabase. Connection config in .pm/config.json. Manual test: insert a task locally, sync to Supabase, verify it appears.',
 'Set up Supabase as the shared coordination store (Layer 2).

Why Supabase specifically: built-in real-time subscriptions (WebSocket push on row changes). Alternatives like Neon/PlanetScale are Postgres but have no real-time push — you''d need to build your own pub/sub layer. Firebase has real-time but locks into NoSQL. Supabase gives us real-time + standard Postgres + free tier.

Schema (Supabase tables):
- tasks: mirrors local SQLite tasks table (sprint, task_num, title, status, owner, started_at, completed_at, session_id)
- agents: registry of active agents (agent_id, machine_id, developer, task_sprint, task_num, worktree_path, files_touched, started_at, last_heartbeat)
- activity_log: event stream (event_type, agent_id, task_sprint, task_num, metadata JSON, created_at)
- developer_twins: current twin state per developer (loaded_context JSON, path_history JSON, trajectory JSON, availability JSON)

Client:
- Create scripts/coordination/supabase-client.sh (or .js if bash is too limiting for HTTP/JSON)
- Functions: supabase_upsert_task, supabase_register_agent, supabase_log_event, supabase_claim_verify, supabase_get_agents, supabase_get_active_working_sets
- Auth: use Supabase service role key stored in environment variable (SUPABASE_KEY)
- Connection URL in .pm/config.json: supabase_url, supabase_key_env
- Real-time: subscribe to task claim events so agents on this machine know immediately when tasks are claimed on other machines

Reference: specs/coordination.md Q2 (coordination state), Q4 (two-layer architecture).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 6,
 'Optimistic claiming with Supabase verification',
 'infra', 'infra, database',
 3.0, 'medium', 'Async verification pattern is straightforward but handling rejection (stop current task, claim next) needs careful design',
 'Claiming flow works end-to-end: agent claims locally (instant), starts working, Supabase verifies in background. If Supabase rejects (another machine claimed first), agent abandons and claims next task. Manual test: simulate two machines claiming same task, verify one gets rejected and falls back.',
 'Implement the optimistic claiming pattern from specs/coordination.md Q4.

Flow:
1. Agent claims locally via SQLite (existing atomic UPDATE pattern from changes/005)
2. Agent immediately starts working (creates worktree, begins tdd-agent)
3. In background, broadcast claim to Supabase: call supabase_claim_verify(task_sprint, task_num, agent_id)
4. Supabase runs: UPDATE tasks SET owner = $agent WHERE sprint = $sprint AND task_num = $task_num AND owner IS NULL
5. If Supabase confirms (affected_rows = 1): continue normally
6. If Supabase rejects (affected_rows = 0): interrupt agent, cleanup worktree, claim next best task

The rejection handler needs to:
- Signal the current agent session to stop (write a sentinel file? send signal?)
- Cleanup the worktree for the rejected task
- Re-run the claiming flow for the next available task

Reference: specs/coordination.md Goal B (Task Coordination), Q4 (cross-machine claiming).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 7,
 'Event-driven sync triggers + git hooks',
 'infra', 'infra',
 3.0, 'medium', 'Git hooks are well-understood but ensuring they fire correctly with worktrees and don''t block agent execution needs testing',
 'Sync fires automatically on: task claimed, task blocked, task completed, merge landed, agent start/stop. Git hooks installed: post-commit, post-merge, pre-push, post-checkout. All sync is background + non-blocking. Manual n2o sync command works. Manual test: claim a task, verify Supabase updates within 5 seconds. Commit in a worktree, verify post-commit hook fires sync.',
 'Wire up automatic sync from local SQLite to Supabase at key transitions.

Workflow event triggers (in session hook + merge queue):
- On task claimed: sync task status + owner to Supabase
- On task blocked: sync blocked_reason to Supabase
- On task completed (green): sync completion + time to Supabase
- On merge landed: sync merge status, log event
- On agent start/stop: register/deregister in agents table

Git hook triggers (installed by n2o init):
- post-commit: call scripts/coordination/sync-event.sh commit
- post-merge: call scripts/coordination/sync-event.sh merge
- pre-push: call scripts/coordination/sync-event.sh push
- post-checkout: call scripts/coordination/sync-event.sh checkout

All sync calls are background (append & to the command) and non-blocking.
Add manual: n2o sync --force to push all local state to Supabase.

Reference: specs/coordination.md Goal E (Sync & Visibility), Q6 (sync triggers).');

-- =============================================================================
-- PHASE 3: Intelligent Routing (Developer Digital Twin)
-- Context-aware task assignment based on developer model.
-- =============================================================================

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 8,
 'Developer Digital Twin data model + population',
 'database', 'database, infra',
 4.0, 'high', 'Novel data model. Defining loaded context, path history, trajectory, and availability in a queryable format requires careful schema design.',
 'Schema additions exist for twin data: developer_sessions (session tracking), developer_paths (task sequence history), developer_file_sets (files touched per session). Population hooks fire on session start, task claim, file edit, task completion. Manual test: work on 3 tasks in a session, query twin and verify loaded context shows correct files/modules, path shows task sequence, availability shows session duration.',
 'Design and implement the Developer Digital Twin data store. Twin data lives in BOTH local SQLite (for local routing computation) and Supabase (for cross-machine visibility). The routing algorithm reads from both — local for own twin, Supabase for other developers'' twins.

New tables (local SQLite + mirrored to Supabase):
- developer_sessions: (session_id, developer, machine_id, started_at, last_activity, agent_count, status)
- developer_paths: (developer, session_id, task_sprint, task_num, claimed_at, completed_at, sequence_num)
- developer_file_sets: (session_id, task_sprint, task_num, file_path, first_touched_at)

New views:
- developer_loaded_context: what files/modules a developer has touched in current session
- developer_trajectory: upcoming tasks in current feature/dependency chain (computed from task_dependencies + completed path)
- developer_availability: configured hours - elapsed session time = remaining availability

Population:
- Session hooks update developer_sessions on start/activity/end
- Task completion updates developer_paths
- File edits (tracked via git diff in post-commit hook) update developer_file_sets
- All twin updates sync to Supabase so other machines can read them

Static data: developers table already has skill ratings. Add columns: expected_hours_per_day, typical_start_time, typical_end_time.

Reference: specs/coordination.md Goal H (Developer Digital Twin).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 9,
 'Routing scoring algorithm',
 'agent', 'infra',
 4.0, 'high', 'Core intelligence of the coordination system. Scoring function with multiple weighted signals. Getting the weights right requires iteration.',
 'Routing function exists and is called during task claiming. Scores available tasks by: context match (files/modules overlap with loaded context), trajectory match (task is next in developer''s feature chain), skill match (task type vs developer skill ratings), availability fit (estimated_hours vs remaining session time), overlap avoidance (negative score for files in another developer''s active working set). Manual test: set up 2 developers with different contexts, verify routing assigns tasks that match each developer''s context.',
 'Implement the routing scoring algorithm that replaces simple priority ordering in task claiming.

Architecture: LOCAL computation, CENTRALIZED data. The scoring function runs locally on the agent''s machine. It reads twin data from both local SQLite (own twin) and Supabase (other developers'' twins). There is no centralized routing service.

At claim time:
1. Query local SQLite: available_tasks, own developer_loaded_context, own developer_trajectory
2. Query Supabase: other developers'' active working sets, other agents'' current tasks (~100-200ms, once per claim)
3. Score each available task locally
4. Claim top-scored task

The scoring function takes: (available_task, developer_twin, other_developers_working_sets) and returns a score.

Scoring weights (initial, tunable):
- context_match: 0.35 — proportion of task''s expected files that overlap with developer''s loaded context
- trajectory_match: 0.25 — is this task next in the developer''s current feature/dependency chain?
- skill_match: 0.15 — developer''s skill rating for this task''s type (normalized 0-1)
- availability_fit: 0.10 — does estimated_hours fit within remaining session time?
- overlap_avoidance: 0.10 — negative score if task''s files overlap with another active developer''s working set (from Supabase)
- dependency_unlock: 0.05 — does completing this task unblock other high-value tasks?

Implementation:
- Create scripts/coordination/route-task.sh (or function in session hook)
- Query local views + Supabase client for cross-machine data
- Score each available task
- Return ranked list, claim top-scored task

Graceful degradation: if Supabase is unreachable, skip overlap_avoidance and cross-machine trajectory data. Route on local-only signals (own loaded context, skill match, priority ordering). Agent keeps working.

Reference: specs/coordination.md Goal H (Routing requirements), Q8 (Routing implementation).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 10,
 'File working set tracking + overlap avoidance',
 'infra', 'infra, database',
 3.0, 'medium', 'Tracking files per agent is straightforward via git diff. Making it queryable for routing requires wiring into the scoring function.',
 'Each agent''s working set (files touched) is tracked in developer_file_sets and synced to Supabase. The routing algorithm queries active working sets across all developers and applies negative scoring for overlap. Manual test: two developers working on different areas, verify routing steers new tasks away from overlapping files.',
 'Track which files each agent is working on and use this for overlap avoidance in routing.

Population mechanism:
- On task claim: record expected files (from spec/description analysis or empty initially)
- On each commit (post-commit hook): run git diff --name-only HEAD~1 and record new files in developer_file_sets
- On task completion: snapshot final file set

Overlap detection:
- Query: for a candidate task, estimate which files it will touch (based on task description, type, and module)
- Compare against all active developers'' current file sets
- Return overlap_score: 0.0 (no overlap) to 1.0 (heavy overlap)

Integration with routing (task 9):
- overlap_avoidance weight uses this overlap_score as negative signal
- High overlap with another developer''s active working set = lower task score

Reference: specs/coordination.md Goal C2 (File Structure), Goal H (Working set overlap avoidance).');

-- =============================================================================
-- PHASE 4: AI Merge Resolution + Monitoring
-- Enhance merge queue with AI conflict resolution and coordination observability.
-- =============================================================================

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 11,
 'AI merge conflict resolution',
 'agent', 'infra',
 4.0, 'high', 'Using an LLM to resolve git merge conflicts is novel. Need to handle: conflict extraction, context building, resolution generation, validation.',
 'Merge queue enhanced with AI resolution step. When git merge produces conflicts: extracts conflict markers, sends to Claude with context (both branches'' intent, file history), applies resolution, validates with syntax check. Auto-resolves common cases (import additions, separate functions, non-overlapping regions). Tags AI-resolved merges in activity_log. Manual test: create deliberate conflict (both agents add imports to same file), verify AI resolves correctly.',
 'Add AI conflict resolution to the merge queue (task 3).

When git merge detects a conflict:
1. Extract conflict markers from each conflicted file
2. Build context: what was each agent trying to do? (task descriptions, commit messages, diff of each branch)
3. Classify conflict type:
   - Import additions (both sides added different imports) → auto-resolve: keep both
   - Separate functions (both sides added different functions to same file) → auto-resolve: keep both
   - Non-overlapping regions (edits in different parts of same file) → auto-resolve: apply both
   - Same-function modification → attempt AI resolution with full context
   - Semantic contradiction → flag for human
4. For AI-resolvable: apply resolution, run syntax check (parse the file), if valid → commit the merge
5. For human-needed: write conflict report to .pm/conflicts/{sprint}-{task_num}.md with: files, conflict type, both sides'' context, suggested resolution
6. Log all merge resolutions in activity_log (event_type: merge_resolved or merge_escalated)

Target: >95% of merges clean or AI-resolved. <5% escalated to human.

Reference: specs/coordination.md Goal D (Conflict Resolution), Q5 (Merge strategy).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 12,
 'Conflict notification + escalation system',
 'infra', 'infra',
 2.0, 'low', 'Straightforward notification mechanism — write files, optionally send to Supabase for visibility',
 'When AI cannot resolve a merge conflict, developer is notified with: which files conflict, what each agent was doing, conflict type, suggested resolution. Conflict report written to .pm/conflicts/. Conflict visible in Supabase activity_log. Developer can resolve and mark as done. Manual test: create unresolvable conflict, verify notification appears with clear context.',
 'Build the escalation path for merge conflicts that AI cannot resolve.

When merge-queue detects an unresolvable conflict:
1. Write conflict report to .pm/conflicts/{sprint}-{task_num}.md:
   - Files in conflict
   - Conflict type classification
   - Agent A''s intent (task description, commit message, diff)
   - Agent B''s intent (same)
   - AI''s attempted resolution (if any) and why it was rejected
   - Suggested manual resolution steps
2. Log to Supabase activity_log (event_type: merge_escalated)
3. Update task status to blocked with blocked_reason referencing the conflict
4. Continue processing other merges (don''t block the queue)

Resolution flow:
- Developer reads conflict report
- Resolves manually in the worktree
- Runs: scripts/coordination/resolve-conflict.sh {sprint} {task_num}
- Script: completes the merge, removes conflict report, unblocks task, logs resolution

Reference: specs/coordination.md Goal D (Conflict Resolution).');

INSERT INTO tasks (sprint, spec, task_num, title, type, skills, estimated_hours, complexity, complexity_notes, done_when, description) VALUES
('coordination', 'coordination.md', 13,
 'Coordination monitoring + observability',
 'infra', 'infra, database',
 3.0, 'medium', 'Mostly new views on existing tables + the new coordination tables',
 'Dashboard views exist for coordination health: merge queue times, duplicate claim rate, AI merge resolution rate, human escalation rate, revert rate per concurrent agent count, coordination overhead (% of total agent time spent on coordination). n2o stats enhanced to show coordination metrics. Manual test: run 5 agents through a sprint, verify stats show accurate coordination metrics.',
 'Add observability for the coordination system itself — are we meeting the success criteria from specs/coordination.md?

New views (SQLite + Supabase):
- coordination_health: merge queue avg time, max time, backlog count
- merge_resolution_stats: total merges, clean %, AI-resolved %, human-escalated %
- duplicate_claim_rate: claims rejected by Supabase / total claims
- routing_effectiveness: tasks routed to context-compatible developer %, overlap avoidance %
- coordination_overhead: time spent on claiming + merging + syncing vs total agent execution time

Enhance n2o stats to include a "Coordination" section:
- Merge success rate (target: >95% automatic)
- Avg merge queue time (target: <30 seconds)
- Duplicate claims (target: 0 for single machine, <2% cross-machine)
- Revert rate (target: 5-15%)
- Coordination overhead (target: <5%)

Alert thresholds: warn if merge queue time >30s, if revert rate >15%, if duplicate claims >5%.

Reference: specs/coordination.md Goal H2 (Efficiency), Success Criteria table.');

-- =============================================================================
-- DEPENDENCIES
-- =============================================================================

-- Phase 1 internal dependencies
-- Task 2 (session hooks) depends on Task 1 (worktrees — hooks create worktrees on claim)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 2, 'coordination', 1);

-- Task 3 (merge queue) depends on Task 1 (worktrees — merge queue merges worktree branches)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 3, 'coordination', 1);

-- Task 4 (file linter) has no dependencies — can run in parallel with anything

-- Phase 2 depends on Phase 1
-- Task 5 (Supabase setup) depends on Task 2 (session hooks — Supabase schema mirrors local patterns)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 5, 'coordination', 2);

-- Task 6 (optimistic claiming) depends on Task 5 (Supabase) and Task 2 (session hooks)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 6, 'coordination', 5),
('coordination', 6, 'coordination', 2);

-- Task 7 (sync triggers) depends on Task 5 (Supabase client) and Task 3 (merge queue — merge events trigger sync)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 7, 'coordination', 5),
('coordination', 7, 'coordination', 3);

-- Phase 3 depends on Phase 2
-- Task 8 (Digital Twin data model) depends on Task 5 (Supabase schema) and Task 7 (sync — twin data syncs)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 8, 'coordination', 5),
('coordination', 8, 'coordination', 7);

-- Task 9 (routing algorithm) depends on Task 8 (twin data model) and Task 2 (session hooks — routing replaces simple claiming)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 9, 'coordination', 8),
('coordination', 9, 'coordination', 2);

-- Task 10 (file working set) depends on Task 8 (twin data model) and Task 7 (sync — file sets sync to Supabase)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 10, 'coordination', 8),
('coordination', 10, 'coordination', 7);

-- Phase 4 depends on Phase 1 merge queue + Phase 2 Supabase
-- Task 11 (AI merge resolution) depends on Task 3 (merge queue) — enhances it with AI
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 11, 'coordination', 3);

-- Task 12 (conflict notification) depends on Task 11 (AI merge) and Task 5 (Supabase — notifications log there)
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 12, 'coordination', 11),
('coordination', 12, 'coordination', 5);

-- Task 13 (monitoring) depends on Task 7 (sync), Task 3 (merge queue), Task 9 (routing) — observes all systems
INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('coordination', 13, 'coordination', 7),
('coordination', 13, 'coordination', 3),
('coordination', 13, 'coordination', 9);
