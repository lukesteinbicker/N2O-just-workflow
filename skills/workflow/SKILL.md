---
name: workflow
version: "1.0.0"
description: "Use when the user wants to plan, implement, fix, build, create, ship, or work on any feature, task, bug, spec, test, sprint, or PR. Triggers: implement, plan, build, create, fix, bug, feature, task, spec, test, ship, PR, sprint, what should I work on, pick next task, investigate, let's plan, break down, scope, design, start working, write tests, red green refactor, tdd, debug, something's broken, this doesn't work."
---

# Unified Workflow

One entry point. Auto-routes based on context. Auto-chains between phases. Pauses at 3 decision points (interactive) or 0 (async). Output is always a PR.

```
PLAN → BREAK DOWN → IMPLEMENT (loop per task) → PR
                        ↑              ↓
                   DEBUG ←──── can't write failing test?
```

Outside `/workflow`, Claude Code works normally — ask questions, make edits, explore.

---

## Routing Algorithm

On entry, determine which phase to enter by checking state:

```
1. Check conversation: did the user describe a feature/change/bug?
   → YES and no spec file referenced → enter PLAN
   → YES and spec file referenced    → go to step 2

2. Query task DB: SELECT * FROM available_tasks WHERE sprint = '<current>';
   → No sprint exists           → enter BREAK DOWN (spec exists but no tasks)
   → Available tasks returned   → enter IMPLEMENT (pick first available)
   → All tasks done             → enter VERIFY (open PR, summarize, exit)
   → All tasks blocked          → surface to human

3. During IMPLEMENT, if RED phase fails after 2 attempts:
   → enter DEBUG for the current task

4. After DEBUG produces findings:
   → return to IMPLEMENT with findings as context
```

**Current sprint**: explicit user mention > most recent sprint with pending tasks > ask the user.

**Spec detection**: check `ls .pm/todo/*/` for markdown files. If the user references a spec by name or describes a feature matching a spec filename, that's the active spec.

---

## Mode Behavior

### Interactive Mode (default)

Pauses at **3 decision points only**:

1. **After spec draft** — "Does this look right?"
2. **After task breakdown** — "Ready to implement?"
3. **On unrecoverable failure** (2 CI failures on same task) — "I'm stuck, here's what I tried"

Between pauses, the workflow auto-chains: PLAN completes → BREAK DOWN starts → pauses → IMPLEMENT starts → picks tasks → commits → next task → ... → PR.

### Async Mode (claude -p / n2o async)

Pauses at **0 points**. Runs the full loop autonomously:
- Failures → mark task blocked, move to next
- All output goes to PRs
- Robot has its own task DB, follows same workflow

---

## Phase: PLAN

Read `skills/plan/SKILL.md` for detailed instructions.

**Summary**:
1. Audit existing code — what already exists?
2. Write spec in `.pm/todo/{group}/` using pyramid principle template
3. Adversarial review — stress-test design decisions, present to user
4. **PAUSE (interactive)**: "Does this spec look right?"
5. Auto-chain → BREAK DOWN

---

## Phase: BREAK DOWN

Read `skills/plan/SKILL.md` for detailed instructions (task breakdown section).

**Summary**:
1. Break spec into 2-4 tasks per spec
2. Write `tasks.sql` with INSERT statements
3. Load into `tasks.db`: `sqlite3 .pm/tasks.db < .pm/todo/{sprint}/tasks.sql`
4. Verify dependencies (no orphans, no cycles, E2E depends on features)
5. Ensure at least one `type=refactor` task exists in the sprint
6. **PAUSE (interactive)**: "Ready to start implementing?"
7. Auto-chain → IMPLEMENT

---

## Phase: IMPLEMENT

Read `skills/test/SKILL.md` for detailed instructions.

**Summary — TDD cycle per task**:

1. Create branch: `git checkout -b workflow/{sprint}` (once per run)
2. Pick next available task from DB
3. **RED**: Write failing tests (apply Litmus Test — "if I break the functionality, will this test fail?")
4. **GREEN**: Implement minimal code to pass
5. **REFACTOR**: Clean up, tests still pass
6. Run quality gates
7. LLM judge (subagent): pass/fail on diff vs done_when
8. Commit with trailers
9. Update DB: `UPDATE tasks SET status = 'done'`
10. Pick next task → repeat from step 2
11. All tasks done → open PR, summarize, exit

### Litmus Test (fake test prevention)

Before running tests in RED, self-check every test:

> "If I break the actual functionality, will this test fail?"

If the answer is "no", the test is fake and must be rewritten.

---

## Phase: DEBUG

Read `skills/debug/SKILL.md` for detailed instructions.

**Summary**:
1. Reproduce the bug (confirm it's real)
2. Investigate (code reading, DB queries, temp E2E test if needed)
3. Scope the fix (which files, which tests)
4. Form hypothesis, verify with evidence
5. Return to IMPLEMENT with findings as context

---

## Quality Gates

**Deterministic gates from `.pm/config.json`**:

```bash
$(jq -r '.commands.test' .pm/config.json)       # Must pass
$(jq -r '.commands.typecheck' .pm/config.json)   # Must pass (zero errors)
$(jq -r '.commands.lint' .pm/config.json)        # Must pass (zero warnings)
$(jq -r '.commands.build' .pm/config.json)       # Must succeed (significant changes)
```

**LLM judge** — runs as a **subagent** (not the same session). Receives only:
- The diff (git diff of task changes)
- Task `done_when` criteria
- Task description

Pass/fail: does the diff match the acceptance criteria and stay in scope?

**On judge fail**: Interactive → surface reason, let human decide. Async → mark blocked, move to next.

**2-attempt cap**: If gates fail twice on the same task:
- Interactive: pause — "I'm stuck, here's what I tried"
- Async: mark task blocked, pick next task

**Cut** (from old workflow): 3 parallel audit subagents, A-F grading, FIX_AUDIT loop, codification, phase logging to SQLite, workflow status tables.

---

## Version Control

Built into the workflow, not a separate concern.

### Branch

One branch per workflow run: `workflow/{sprint}` (or `async/<job-id>` for remote runs).

```bash
git checkout -b workflow/{sprint}
```

### Commit (per task)

Each completed task gets a commit with trailers:

```
{prefix}({sprint}): {task_title}

Done-When: {done_when}
Task: {sprint}/{task_num}
Assisted-by: claude-opus-4-6 [workflow]
```

Commit prefix mapping:
| Task type | Prefix |
|-----------|--------|
| database | feat |
| actions | feat |
| frontend | feat |
| infra | chore |
| agent | feat |
| e2e | test |
| docs | docs |
| refactor | refactor |

### PR (end of run)

One PR per workflow run. All commits on the branch.

```bash
gh pr create --title "{sprint}: {summary}" --body "$(cat <<'EOF'
## What
<!-- 1-2 sentences: what this workflow run accomplished -->

## Tasks completed
<!-- list of sprint/task_num with done_when for each -->

## How to verify
<!-- test results, done_when criteria -->

## Review focus
<!-- 1-2 areas where human attention matters most -->
EOF
)"
```

---

## Refactoring Budget

Every sprint includes at least one `type=refactor` task. Enforced during BREAK DOWN: check the task list before finishing and add a refactor task if none exists.

---

## Code Health

Optional standalone. Not part of the main loop. Invoke `/health` separately when you want a code quality audit. Quality enforcement in the workflow happens through deterministic gates + LLM judge.

---

## Task Database

Tasks use `(sprint, task_num)` as primary key. Schema at `.pm/schema.sql`.

```bash
# Initialize
sqlite3 .pm/tasks.db < .pm/schema.sql
sqlite3 .pm/tasks.db < .pm/todo/{sprint}/tasks.sql

# Query available tasks
sqlite3 .pm/tasks.db "SELECT sprint, task_num, title, done_when FROM available_tasks WHERE sprint = '{sprint}';"

# Claim task
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'in_progress' WHERE sprint = '{sprint}' AND task_num = {num} AND status = 'pending';"

# Complete task
HASH=$(git rev-parse HEAD)
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'done', commit_hash = '$HASH' WHERE sprint = '{sprint}' AND task_num = {num};"

# Block task
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'blocked' WHERE sprint = '{sprint}' AND task_num = {num};"
```

---

## Phase Detail Files

The phase detail files are **optional deep-dive references**. This orchestrator SKILL.md contains all essential instructions inline. The detail files provide deeper guidance when Read():

| Phase | Detail file |
|-------|------------|
| PLAN / BREAK DOWN | `skills/plan/SKILL.md` |
| IMPLEMENT | `skills/test/SKILL.md` |
| DEBUG | `skills/debug/SKILL.md` |

If Read() is skipped, the workflow still functions from the inline instructions above.
