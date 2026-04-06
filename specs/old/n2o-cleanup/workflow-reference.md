# N2O Workflow Reference
> How the framework operates end-to-end. Read this before changing anything structural.

## Architecture

N2O is a **framework source repo** that syncs into target projects. It is not used directly as a project.

```
N2O-just-workflow (this repo)          Target project (e.g. my-app)
├── skills/workflow/SKILL.md           ├── .claude/skills/workflow/SKILL.md  (copied)
├── skills/plan/SKILL.md              ├── .claude/skills/plan/SKILL.md      (internal, loaded by workflow)
├── skills/test/SKILL.md              ├── .claude/skills/test/SKILL.md      (internal, loaded by workflow)
├── skills/debug/SKILL.md             ├── .claude/skills/debug/SKILL.md     (internal, loaded by workflow)
├── skills/react/SKILL.md             ├── .claude/skills/react/SKILL.md     (ambient)
├── .pm/schema.sql                     ├── .pm/schema.sql                    (copied)
├── .pm/migrations/                    ├── .pm/migrations/                   (copied)
├── templates/                         │
├── n2o (Go binary)                    ├── .pm/workflow.db                   (project-owned)
└── n2o-manifest.json                  ├── .pm/config.json                   (project-owned)
                                       └── CLAUDE.md                         (project-owned)
```

> **Note on scripts/**: After the Go rewrite (phase 3), all helper scripts are absorbed into the `n2o` binary. The `scripts/` directory is no longer synced to projects. No session hooks are needed — all initialization (context injection, auth check, event flush, transcript parsing) happens lazily on the first `n2o` command invocation per session.

**Key distinction**: Framework files are **copied** into projects (not symlinked), making projects portable. In this repo, `.claude/skills/` uses symlinks back to source dirs so Claude Code can discover skills during framework development.

## Sync mechanism

`n2o-manifest.json` declares what's framework-owned vs project-owned:

- **Framework files** (`skills/**`, `.pm/schema.sql`, `.pm/migrations/**`): Copied into projects by `n2o sync`. Can be updated on subsequent syncs.
- **Project files** (`.pm/config.json`, `.pm/workflow.db`, `CLAUDE.md`, `.pm/schema-extensions.sql`): Never touched by sync. Scaffolded once by `n2o init` from `templates/`.

**Checksum protection**: Skills are MD5-checksummed on sync. If a project has locally modified a SKILL.md, sync skips it (unless `--force`). Checksums stored in `.pm/.skill-checksums.json`.

## Lifecycle

```
n2o setup     →  Configure ~/.n2o/config.json (framework path, developer name)
n2o init      →  Scaffold project: copy skills, schema, create .pm/workflow.db
n2o sync      →  Push framework updates into project (checksum-protected)
```

No session hooks. The first `n2o` command per session handles context injection, auth check, event flush, and transcript parsing lazily.

## The unified workflow

One entry command — `/workflow` — enters a self-driving loop. No named agents to invoke.

```
PLAN → BREAK DOWN → IMPLEMENT (loop per task) → PR
                        ↑              ↓
                   DEBUG ←──── can't write failing test?
```

The workflow auto-routes based on state (task DB + conversation context) and auto-chains between phases. See [n2o-cleanup-version-control.md](n2o-cleanup-version-control.md) for the full spec.

### Phase details

| Phase | Skill file | What happens |
|-------|-----------|-------------|
| PLAN | `skills/plan/SKILL.md` | Capture idea, research codebase, write spec, adversarial review |
| BREAK DOWN | `skills/plan/SKILL.md` | Break spec into tasks, seed `.pm/workflow.db`, validate dependencies |
| IMPLEMENT | `skills/test/SKILL.md` | Pick task → RED → GREEN → REFACTOR → quality gates → commit → PR → loop |
| DEBUG | `skills/debug/SKILL.md` | Reproduce bug, investigate root cause, update task with findings, return to IMPLEMENT |

### Interactive vs async

- **Interactive** (human at keyboard): pauses after spec draft, after task breakdown, and on unrecoverable failure
- **Async** (`claude -p` / `n2o async`): runs full loop without pausing. Failures → mark task blocked, move to next. Output is always a PR.

---

## Quality gates

After each task's REFACTOR phase, before commit:

1. **Deterministic gates** (from `.pm/config.json`): test, typecheck, lint, build — must all pass
2. **LLM judge** (Spotify-style): runs as a **subagent** with only the diff + task `done_when` + description. Pass/fail — does the diff match acceptance criteria and stay in scope? Separate from the session that wrote the code.
3. **2-attempt cap**: if gates fail twice, mark task blocked and move to next (Stripe's policy)

No A-F grading. No FIX_AUDIT loop. No codification phase. No phase logging. No workflow status tables.

## Version control

One PR per workflow run (not per task). Each task gets a commit with trailers (`Task`, `Assisted-by`, `Done-When`). The PR is opened at the end with all commits on a single branch (`workflow/{sprint}` or `async/<job-id>`).

---

## Supporting skills

### Code Health (`skills/health/`)
6 parallel subagent checks: file length, missing docs, function density, circular deps, dead exports, test coverage gaps. Creates non-blocking tech-debt tasks.

**Optional standalone tool** — not part of the main workflow loop.

### Frontend Review (`skills/review/`)
Multi-agent UI quality system. Three parallel assessors (programmatic/axe-core, vision/screenshot+LLM, interaction/Playwright).

**Triggered when**: Task type = `frontend` and reaches GREEN phase.

### Detect Project (`skills/detect/`)
Scans codebase, fills `<!-- UNFILLED -->` sections in project's `CLAUDE.md` with detected structure, conventions, database info.

**Run after**: `n2o init` or when project structure changes.

---

## Pattern skills (ambient)

These are **not agents** — they provide reference material automatically consulted during relevant work. No phases, no state transitions.

| Skill | What it provides |
|-------|-----------------|
| **react** (`skills/react/`) | React/Next.js performance patterns. Consulted when writing/reviewing React. |
| **ux** (`skills/ux/`) | 28 UX principles. Two-tier: general (this file) + project-specific (`.claude/ui-heuristics.md`). |
| **design micro-skills** (`skills/design/`) | 18 small skills (animate, adapt, audit, bolder, clarify, etc.). |

---

## Database (`.pm/workflow.db`)

Schema at `.pm/schema.sql`. Key tables and views:

### Tables
| Table | Purpose |
|-------|---------|
| `task` | Primary task tracking. PK: `(sprint, task_num)`. Status, owner, git info. |
| `dep` | Dependency graph between tasks. Gating: predecessor must be green + merged. |
| `telemetry` | Audit trail of phase transitions, tool calls, subagent spawns. |
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
    └→ blocked (unresolvable failure or dependency)
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
2. **Sync flow**: `n2o sync` must copy skills from `skills/` into target project's `.claude/skills/`
3. **Checksum protection**: MD5 checksums must still prevent overwriting locally modified skills
4. **Manifest contract**: `n2o-manifest.json` must accurately list framework files vs project files
5. **Task commands**: `n2o task *` replaces raw SQL in SKILL.md files (phase 5)
6. **Lint validation**: `n2o check` validates skill markers and file sizes
7. **Lazy init**: First `n2o` call per session injects context and checks environment. `n2o` must be on PATH.
8. **Task database**: `.pm/workflow.db` schema, auto-migrations, and views must remain functional
9. **Template scaffolding**: `n2o init` must still produce a working project from `templates/`
10. **Existing project migration**: `n2o sync` must handle rename from old skill names to new descriptive names
