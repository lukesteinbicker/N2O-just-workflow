# Overview

## What This Is

A unified workflow system that coordinates planning, implementation, and debugging through a shared SQLite task database. Claude Code reads the workflow SKILL.md and auto-routes between phases based on context.

```
PLAN → BREAK DOWN → IMPLEMENT (loop per task) → PR
                        ↑              ↓
                   DEBUG ←──── can't write failing test?
```

One entry point: `/workflow`. Auto-routes, auto-chains, pauses at 3 decision points (interactive) or 0 (async). Output is always a PR.

## Why It Works

> "If Claude makes any decision as a developer, I want 95% of those decisions to already be documented in the codebase."

Context management at scale. Every pattern documented means less time debugging, less time reviewing, and more time shipping.

## The Workflow Loop

### Phase 1: Plan

**Input**: Ideas, feature requests, bug reports
**Output**: Spec in `.pm/todo/{sprint}/`

The workflow audits existing code, writes a spec using the pyramid principle template, runs adversarial review, and pauses for approval.

### Phase 2: Break Down

**Input**: Approved spec
**Output**: Tasks in SQLite (`tasks.db`)

2-4 tasks per spec, each completable in one focused session. Dependencies tracked. At least one refactor task per sprint.

### Phase 3: Implement (TDD)

**Input**: Available task from SQLite
**Output**: Tested code, committed to branch

```
Pick task → RED → GREEN → REFACTOR → quality gates → commit → next task
```

- **RED**: Write failing tests (Litmus Test: "if I break functionality, will this test fail?")
- **GREEN**: Minimal code to pass
- **REFACTOR**: Clean up, tests still pass
- **Quality gates**: test, typecheck, lint, build (from `.pm/config.json`)
- **Commit**: with `Done-When`, `Task`, `Assisted-by` trailers

2-attempt cap on gate failures → mark blocked, move to next.

### Phase 4: Debug

**When**: Can't write a failing test after 2 attempts
**Output**: Root cause findings → back to Implement

Reproduce → investigate → scope → hypothesis → return to TDD with findings.

### Phase 5: PR

All tasks done → one PR per workflow run with all commits.

## Skills

```
skills/
├── workflow/SKILL.md    (orchestrator — /workflow entry point)
├── plan/SKILL.md        (planning details, internal to workflow)
├── test/SKILL.md        (TDD details, internal to workflow)
├── debug/SKILL.md       (debug details, internal to workflow)
├── health/SKILL.md      (optional standalone code quality audit)
├── detect/SKILL.md      (project detection)
├── review/SKILL.md      (frontend review)
├── react/SKILL.md       (ambient React/Next.js patterns)
├── ux/SKILL.md          (ambient UX heuristics)
└── design/              (micro-skills)
```

## Design Principles

1. **Database-Driven** — Task state in SQLite, not markdown. Enables queries, parallel work, no merge conflicts.
2. **Deterministic Gates** — test, typecheck, lint, build. "The walls matter more than the model."
3. **TDD Discipline** — RED → GREEN → REFACTOR. Tests first, implementation second, cleanup third.
4. **Auto-Routing** — No manual handoffs. The workflow checks state and enters the right phase.
5. **PR as Output** — One branch per run, commits per task, one PR at the end.

## File Structure

### In Git (shared)
```
.pm/
├── schema.sql              # Database structure
└── todo/
    └── {sprint}/
        ├── feature-spec.md # Feature specification
        └── tasks.sql       # Task seed data

skills/                     # Skill SKILL.md files
scripts/git/                # Commit automation
```

### NOT in Git (local only)
```
.pm/tasks.db               # Live SQLite database
.wm/                       # Scratch files, working memory
.env.local                 # Secrets
```

## Example Session

```bash
$ claude

> plan a user authentication feature

[Workflow enters PLAN phase]
[Audits existing code, writes spec, adversarial review]
"Does this spec look right?"

> yes

[Auto-chains to BREAK DOWN]
[Creates 3 tasks, loads into tasks.db]
"Ready to start implementing?"

> yes

[Auto-chains to IMPLEMENT]
[Creates branch: workflow/auth-sprint]
[Picks task 1, RED → GREEN → REFACTOR → gates → commit]
[Picks task 2, RED → GREEN → REFACTOR → gates → commit]
[Picks task 3, RED → GREEN → REFACTOR → gates → commit]
[Opens PR with all commits]
"All tasks complete. PR opened: #42"
```

## Common Queries

```bash
# Available tasks
sqlite3 .pm/tasks.db "SELECT task_num, title FROM available_tasks WHERE sprint = 'current-sprint';"

# Sprint progress
sqlite3 .pm/tasks.db "SELECT * FROM sprint_progress;"

# Blocked tasks
sqlite3 .pm/tasks.db "SELECT * FROM blocked_tasks;"
```
