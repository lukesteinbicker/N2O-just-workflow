-- =============================================================================
-- Rollout Readiness Sprint
-- Source spec: .pm/todo/rollout-ready/01-rollout-fixes.md
-- 6 tasks: 5 parallel code/doc fixes + 1 final onboarding doc
-- =============================================================================

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('rollout-ready', '01-rollout-fixes.md', 1,
 'Fix n2o stats path resolution',
 'infra', 'infra',
 30, 'low', 'Single line change + test update',
 'Running `n2o stats` from a target project (not the framework repo) shows that project''s task data. Existing stats tests still pass. New test confirms project-path detection.',
 'cmd_stats() at n2o:1824 uses $N2O_DIR/.pm/tasks.db which always resolves to the framework directory. When Ella runs `n2o stats` in her project, she sees the framework''s data.

Fix: Add project path detection at the top of cmd_stats(). Check if CWD (or parent dirs) has .pm/tasks.db — if so, use that. Fall back to $N2O_DIR only if no project DB found. Update test-n2o-stats.sh to verify project-local DB is used.');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('rollout-ready', '01-rollout-fixes.md', 2,
 'Fix started_at on task claim',
 'infra', 'infra',
 30, 'low', 'Single column addition to UPDATE statement',
 'claim-task.sh UPDATE includes started_at = datetime(''now''). test-n2o-claim.sh has a test verifying started_at is populated after claim.',
 'scripts/coordination/claim-task.sh lines 189-198: the atomic claim UPDATE sets owner, status, and session_id but never sets started_at. This breaks the Efficiency metric (avg minutes per task = completed_at - started_at).

Fix: Add started_at = datetime(''now'') to the UPDATE statement at line 192. Add a test in test-n2o-claim.sh that claims a task and verifies started_at IS NOT NULL.');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('rollout-ready', '01-rollout-fixes.md', 3,
 'Harden n2o check + add .worktrees/ to gitignore',
 'infra', 'infra',
 60, 'low', 'Straightforward additions to existing check function and init',
 'n2o check validates all 6 skills (not just 3), verifies session hooks in settings.json, confirms rates.json exists, and checks transcripts + workflow_events tables. n2o init adds .worktrees/ to .gitignore entries. Tests updated.',
 'Two fixes in the n2o CLI:

1. run_health_check() (n2o:520+) only checks pm-agent, tdd-agent, bug-workflow. Add detect-project, react-best-practices, web-design-guidelines. Also add checks for:
   - .claude/settings.json has SessionStart and SessionEnd hooks
   - templates/rates.json (or .pm/ copy) exists
   - transcripts and workflow_events tables exist in tasks.db

2. cmd_init() line 1080: add ".worktrees/" to the gitignore entries array.

Update test-n2o-e2e.sh to verify the new checks pass on a healthy project.');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('rollout-ready', '01-rollout-fixes.md', 4,
 'Fix session hook: background sync + claim opt-out',
 'infra', 'infra',
 90, 'medium', 'Restructuring async flow in bash requires care with background processes and exit handling',
 'Session hook completes critical path (identity + task context) in <2s. Auto-sync + git pull run in background. Setting claim_tasks: false in .pm/config.json skips auto-claim. Tests verify both modes.',
 'scripts/n2o-session-hook.sh currently runs auto-sync (n2o sync --quiet) and git pull synchronously before claiming a task. This can exceed the 5-second Claude Code hook timeout.

Fixes:
1. Move the auto-sync block (lines 31-56) to a background subshell: ( n2o sync --quiet 2>/dev/null & )
2. Move git pull reminder to background or remove (it''s just a reminder, not blocking)
3. Read claim_tasks from .pm/config.json (default true). If false, skip the claim-task.sh call and just show sprint progress summary instead.
4. Add claim_tasks to the config schema in cmd_init() so new projects get it.

Keep synchronous: developer identity (Step 0), task context display (Step 3 output).
Move to background: auto-sync (Step 0.5), git pull (Step 1), Supabase pull (already background).

Add test in test-n2o-auto-sync.sh or test-n2o-e2e.sh:
- Verify session hook with claim_tasks=false does NOT produce "Claimed task" output
- Verify session hook with claim_tasks=true (default) still claims');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('rollout-ready', '01-rollout-fixes.md', 5,
 'Update setup.md + team-quickstart.md',
 'docs', 'docs',
 60, 'low', 'Rewriting existing docs, not creating from scratch',
 'setup.md references n2o init (not manual mkdir/sqlite3). team-quickstart.md mentions n2o setup for auto-sync. No references to .wm/ or manual DB creation remain in setup.md.',
 'Two doc updates:

1. Rewrite 01-getting-started/setup.md:
   - Replace manual mkdir + sqlite3 instructions with n2o init
   - Update prerequisites to match n2o check output (jq, sqlite3, git, bash 3.2+)
   - Remove references to .wm/ directory and manual schema loading
   - Add n2o check as the verification step
   - Keep it concise (under 80 lines)

2. Update 01-getting-started/team-quickstart.md:
   - Add a "First-time setup" section mentioning n2o setup before n2o init
   - Explain that n2o setup enables auto-sync (framework updates on session start)
   - Keep it brief — 3-5 lines added');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('rollout-ready', '01-rollout-fixes.md', 6,
 'Write ONBOARDING.md end-to-end walkthrough',
 'docs', 'docs',
 120, 'medium', 'Requires walking through the actual flow and documenting friction points',
 'ONBOARDING.md exists at 01-getting-started/ONBOARDING.md. Covers: prerequisites, clone framework, n2o setup, n2o init <project>, n2o check, open Claude Code, first session, n2o stats. Includes 5+ "what do I do when" scenarios. Under 150 lines.',
 'Write the missing end-to-end onboarding walkthrough that rollout-goals.md identified as a pre-rollout blocker.

Path: 01-getting-started/ONBOARDING.md

Structure:
1. Prerequisites (Claude Code, jq, sqlite3, git, bash 3.2+)
2. Install N2O framework (clone repo)
3. First-time developer setup (n2o setup)
4. Initialize your project (n2o init <path>)
5. Verify everything works (n2o check)
6. Your first session (open Claude Code, session hook fires, task context appears)
7. Working on tasks (claim, implement with /tdd-agent, complete)
8. Check your stats (n2o stats)
9. Multi-machine setup (Supabase — optional, brief pointer)
10. Common questions:
    - "I opened Claude just to ask a question, not work on a task" → set claim_tasks: false
    - "n2o check says something is missing" → re-run n2o init or n2o sync
    - "My session hook didn''t fire" → check .claude/settings.json
    - "n2o stats shows no data" → run n2o stats after completing at least one task
    - "I want to update to the latest framework" → n2o sync (or auto-sync)

Target audience: Ella and Manda, who are comfortable with CLI but have never seen N2O before.
Tone: Direct, practical, no marketing language. "Run this, expect that."');

-- =============================================================================
-- DEPENDENCIES
-- =============================================================================

-- Tasks 1-5 are all independent — can run in parallel
-- Task 6 (ONBOARDING.md) depends on all others being done first
INSERT OR IGNORE INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('rollout-ready', 6, 'rollout-ready', 1),
('rollout-ready', 6, 'rollout-ready', 2),
('rollout-ready', 6, 'rollout-ready', 3),
('rollout-ready', 6, 'rollout-ready', 4),
('rollout-ready', 6, 'rollout-ready', 5);
