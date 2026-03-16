# N2O Workflow Reference
> How the framework operates end-to-end. Read this before changing anything structural.

## Architecture

N2O is a **framework source repo** that syncs into target projects. It is not used directly as a project.

```
N2O-just-workflow (this repo)          Target project (e.g. my-app)
├── skills/pm-agent/SKILL.md           ├── .claude/skills/pm-agent/SKILL.md  (copied)
├── skills/react.../SKILL.md           ├── .claude/skills/react.../SKILL.md  (copied)
├── .pm/schema.sql                     ├── .pm/schema.sql                    (copied)
├── .pm/migrations/                    ├── .pm/migrations/                   (copied)
├── templates/                         │
├── n2o (Go binary)                    ├── .pm/workflow.db                      (project-owned)
└── n2o-manifest.json                  ├── .pm/config.json                   (project-owned)
                                       └── CLAUDE.md                         (project-owned)
```

> **Note on scripts/**: After the Go rewrite (phase 3), all helper scripts are absorbed into the `n2o` binary. The `scripts/` directory is no longer synced to projects. No session hooks are needed — all initialization (context injection, auth check, event flush, transcript parsing) happens lazily on the first `n2o` command invocation per session.

**Key distinction**: Framework files are **copied** into projects (not symlinked), making projects portable. In this repo, `.claude/skills/` uses symlinks back to source dirs so Claude Code can discover skills during framework development.

## Sync mechanism

`n2o-manifest.json` declares what's framework-owned vs project-owned:

- **Framework files** (`02-agents/**`, `03-patterns/**`, `.pm/schema.sql`, `.pm/migrations/**`, `scripts/**`): Copied into projects by `n2o sync`. Can be updated on subsequent syncs.
- **Project files** (`.pm/config.json`, `.pm/workflow.db`, `CLAUDE.md`, `.pm/schema-extensions.sql`): Never touched by sync. Scaffolded once by `n2o init` from `templates/`.

**Checksum protection**: Skills are MD5-checksummed on sync. If a project has locally modified a SKILL.md, sync skips it (unless `--force`). Checksums stored in `.pm/.skill-checksums.json`.

## Lifecycle

```
n2o setup     →  Configure ~/.n2o/config.json (framework path, developer name)
n2o init      →  Scaffold project: copy skills, schema, scripts, create .pm/workflow.db
n2o sync      →  Push framework updates into project (checksum-protected)
Session hook  →  On Claude Code session start: auto-sync if enabled, inject context
```

## The three core agents

```
pm-agent (planning)  ──creates tasks──▸  tdd-agent (implementation)
                                              │
                                         bug found?
                                              │
                                         bug-workflow (debugging)
                                              │
                                         creates hotfix task
                                              │
                                         tdd-agent (fix)
```

---

## PM-Agent phases

Drives planning from idea to sprint-ready task database.

| # | Phase | What happens |
|---|-------|-------------|
| 1 | IDEATION | Capture ideas in `.wm/` (scratch) or `.pm/backlog/` (persistent) |
| 1.5 | AUDIT_CODE | Research what exists in codebase + ecosystem before writing spec. Prevents duplication. |
| 2 | REFINEMENT | Move from backlog to `.pm/todo/{group}/`, write formal spec with goal, success criteria, prior art |
| 2.5 | PRE_TASK_CHECKLIST | Run `/code-health`, verify MECE (no overlaps), check task count (~50-100), get user approval |
| 2.75 | ADVERSARIAL_REVIEW | Two-subagent pipeline stress-tests spec: generates 8-15 adversarial questions, user answers, spec updated |
| 3 | SPRINT_PLANNING | Break spec into tasks, write `tasks.sql`, seed `.pm/workflow.db`. Tasks are one-session granularity (15-60 min). |
| 3.5 | POST_LOAD_AUDIT | Subagent checks: dependency graph validity, orphan detection, cycle detection, coverage check |
| 4 | START_IMPLEMENTATION | Hand off to tdd-agent. Developers run 8-10 parallel terminals. |
| 5 | MONITOR | Track sprint progress, unblock tasks, run periodic `/code-health` |
| 6 | SPRINT_COMPLETION | Verify all tasks, audit pattern compliance, generate completion report, archive sprint |

**Task schema** (key columns): `sprint`, `task_num`, `title`, `type` (database/actions/frontend/infra/agent/e2e/docs), `owner`, `status` (pending/red/green/blocked), `done_when` (testable acceptance criteria), `estimated_minutes`, `complexity`.

**Dependencies**: Explicit `dep` table. A task is "available" when all predecessors are `status='green'` AND `merged_at IS NOT NULL`.

---

## TDD-Agent phases

Every task follows this cycle. All phases are mandatory — skipping any phase is incomplete work.

| # | Phase | What happens |
|---|-------|-------------|
| 1 | PICK | Query `available_tasks` view, claim task atomically (UPDATE ... WHERE owner IS NULL) |
| 2 | RED | Write failing tests that verify "Done When" criteria. Apply litmus test to prevent fake tests. All tests must fail. |
| 3 | GREEN | Write minimum code to make tests pass. Typecheck + lint. |
| 4 | REFACTOR | Clean up without changing behavior. Tests must still pass. |
| 5 | AUDIT | Manual: typecheck + lint. Then 3 parallel subagents: Pattern Compliance, Gap Analysis, Testing Posture (grade A-F). |
| 6 | FIX_AUDIT | If any grade < A: fix violations, re-audit. Loop until A grade (max 2 iterations). |
| 7 | UPDATE_DB | `UPDATE tasks SET status = 'green'` |
| 8 | CODIFY | Report discovered patterns for user review. User decides whether to add to skills. |
| 9 | COMMIT | Create conventional commit via `scripts/git/commit-task.sh` |
| 10 | REPORT | Output mandatory status table (all phases + grades). Then loop to phase 1. |

**Special cases**:
- **E2E tasks**: Skip RED/GREEN/REFACTOR, follow E2E-specific flow. Single audit subagent instead of 3.
- **Frontend tasks**: Automatically trigger frontend-review agent after GREEN phase.

---

## Bug-Workflow phases

Used when tdd-agent can't reproduce a bug in tests, or when browser debugging is needed.

| # | Phase | What happens |
|---|-------|-------------|
| 1 | REPRODUCE | Confirm bug exists. Document exact steps, expected vs actual behavior. |
| 2 | INVESTIGATE | Find root cause: code reading, DB queries, temp Playwright E2E test with console/network capture. |
| 3 | SCOPE | Define impact: one user or widespread? Data corruption or display? Blocking or workaround? |
| 4 | HYPOTHESIS | State probable root cause with evidence and confidence level. |
| 5 | TASK | Create task(s) in `.pm/workflow.db` for tdd-agent to fix. Include hypothesis + evidence in description. |

---

## Supporting agents

### Code Health
6 parallel subagent checks: file length, missing docs, function density, circular deps, dead exports, test coverage gaps. Creates non-blocking tech-debt tasks.

**Invoked by**: `/code-health` (full scan), tdd-agent AUDIT phase (changed files only), pm-agent PRE_TASK_CHECKLIST (full scan).

### Frontend Review
14-step multi-agent UI quality system. Three parallel assessors (programmatic/axe-core, vision/screenshot+LLM, interaction/Playwright), then merge → fix → re-assess loop (max 5 iterations).

**Triggered when**: Task type = `frontend` and reaches GREEN phase.

### Detect Project
Scans codebase, fills `<!-- UNFILLED -->` sections in project's `CLAUDE.md` with detected structure, conventions, database info.

**Run after**: `n2o init` or when project structure changes.

---

## Pattern skills (ambient)

These are **not agents** — they provide reference material automatically consulted during relevant work. No phases, no state transitions.

| Skill | What it provides |
|-------|-----------------|
| **react-best-practices** | 45 rules across 8 categories (waterfalls, bundle size, SSR, data fetching, re-renders, rendering, JS perf, advanced). Consulted when writing/reviewing React/Next.js. |
| **ux-heuristics** | 28 UX principles (info architecture, density, accessibility, overflow, interactions, patterns, modals, data). Two-tier: general (this file) + project-specific (`.claude/ui-heuristics.md`). |
| **design micro-skills** | 18 small skills (animate, adapt, audit, bolder, clarify, colorize, critique, delight, distill, extract, frontend-design, harden, normalize, onboard, optimize, polish, quieter, teach-impeccable). Currently in `.claude/skills/design/`. |

---

## Database (`.pm/workflow.db`)

Schema at `.pm/schema.sql`. Key tables and views:

### Tables
| Table | Purpose |
|-------|---------|
| `task` | Primary task tracking. PK: `(sprint, task_num)`. Status, owner, audit grades, git info. |
| `dep` | Dependency graph between tasks. Gating: predecessor must be green + merged. |
| `telemetry` | Audit trail of all phase transitions, tool calls, subagent spawns. |
| `transcript` | One row per Claude Code session. Token counts, model, timestamps. |
| `message` | Full conversation message content (no truncation). |
| `tool` | Full input params for every tool invocation. |

### Key views
| View | What it shows |
|------|-------------|
| `available_tasks` | Pending, unblocked tasks ready to claim |
| `sprint_progress` | Task status counts per sprint |
| `blocked_tasks` | Tasks waiting on unfinished dependencies |
| `phase_timing` | Duration of each TDD phase per task |
| `skill_token_usage` | Token totals by skill and sprint |
| `session_health` | Error/retry/compaction counts per session |

### Task status lifecycle
```
pending → red → green → (merged via git)
    │
    └→ blocked (unresolved dependency)
```

---

## Lazy initialization (replaces session hooks)

No hooks in `.claude/settings.json`. The first `n2o` command per session handles everything:

1. Auto-migrate schema if needed
2. Inject context: developer name, concurrent sessions, git status (once per session)
3. Check auth state, warn if not logged in
4. Flush pending events if authenticated + online
5. Parse un-indexed JSONL transcripts via adapter

---

## What must not break during cleanup

1. **Skill discovery**: Claude Code must find SKILL.md files under `.claude/skills/` (via symlinks in this repo, via copies in projects)
2. **Sync flow**: `n2o sync` must copy skills from their source location into target project's `.claude/skills/`
3. **Checksum protection**: MD5 checksums must still prevent overwriting locally modified skills
4. **Manifest contract**: `n2o-manifest.json` must accurately list framework files vs project files
5. **Phase tracking**: `n2o phase enter` replaces raw `INSERT INTO telemetry` in SKILL.md files
6. **Lint validation**: `n2o check` validates skill markers and file sizes (replaces standalone lint commands)
7. **Lazy init**: First `n2o` call per session injects context and checks environment. `n2o` must be on PATH.
8. **Task database**: `.pm/workflow.db` schema, auto-migrations, and views must remain functional
9. **Template scaffolding**: `n2o init` must still produce a working project from `templates/`
10. **Existing project migration**: `n2o sync` must remove stale hook entries from `.claude/settings.json`
