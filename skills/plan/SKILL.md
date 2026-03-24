---
name: plan
version: "1.0.0"
description: "Use when the user wants to plan, scope, or break down work. Triggers: create spec, new feature spec, write spec, break down, decompose tasks, task breakdown, sprint planning, plan sprint, pm workflow, project management, planning agent, scope this feature, what should we build, let's plan, create tasks, load tasks, start a sprint. Use this for planning and orchestration — NOT for implementing code (use tdd-agent for implementation)."
---

# PM Agent (Planning Agent)

## Overview

**Audience**: PM role (planning, not implementation)

This skill guides the feature-to-tasks lifecycle:
- Create feature specs from ideas
- **Verify specs before tasks** (audit code, MECE, sizing)
- Break specs into executable tasks (SQLite)
- Set up dependencies and sprint structure
- Start implementation with `/test`
- Monitor sprint progress and unblock tasks

**Key principle**: PM plans and orchestrates, implementation uses `test`.

### Linear Integration (Optional)

If the project has a `.mcp.json` with Linear configured, the PM agent can use Linear MCP for planning:

**Reading** — browse backlog, check current cycle, read stakeholder comments, view cross-project dependencies
**Writing** — create issues, set assignees/priorities/labels, add blocking relations, post spec summaries

Linear is for human visibility. Agents still execute against local SQLite. The sync script (`./scripts/sync/sync.sh`) bridges the two — pushing claim/complete/blocked updates to Linear automatically.

To set up: `claude mcp add --transport sse linear-server https://mcp.linear.app/sse`

### Phases (Planning Agent Only)

| Phase | Name | Key Action |
|-------|------|------------|
| 1 | Ideation | Capture in `.wm/` or `backlog/` |
| 1.5 | Audit Code | Check what exists before speccing |
| 2 | Refinement | Write specs in `todo/` |
| **2.5** | **Pre-Task Checklist** | **Audit → Patterns → MECE** |
| **2.75** | **Adversarial Review** | **Stress-test design → user decides → update spec** |
| 3 | Sprint Planning | Break into tasks → SQLite |
| **3.5** | **Post-Load Audit** | **Dependencies → Orphans → Cycles → Coverage** |
| **4** | **Start Implementation** | **Begin tasks with `/test`** |
| **5** | **Monitor Sprint** | **Track progress, unblock tasks** |
| **6** | **Sprint Completion** | **Verify, clean up, close sprint** |

**Note**: Implementation uses the `test` skill (main chat or parallel tabs as needed).

---

## Workflow (Planning Agent)

```
.wm/ (scratch) → backlog/ (idea) → todo/ (spec) → VERIFY → ADVERSARIAL → tasks.db → AUDIT → dev agents
                                         ↑              ↑              ↑              ↓
                                   Pre-Task Checklist  Adversarial  Post-Load Audit  tdd-agent
                                   (patterns, MECE)    Review        (deps, orphans)
```

**Dev agents** then implement tasks in parallel using `test` skill.

| Stage | Location | Purpose |
|-------|----------|---------|
| **Scratch** | `.wm/` | Transitory brainstorming, context dumps |
| **Backlog** | `.pm/backlog/**/*.md` | Raw ideas, someday items |
| **Todo** | `.pm/todo/**/*.md` | Active sprint specs |
| **Pre-Verify** | Pre-Task Checklist | Audit, patterns, MECE |
| **Adversarial** | User review | Stress-test design, resolve ambiguity |
| **Tasks** | `.pm/tasks.db` | Executable work items |
| **Post-Verify** | Post-Load Audit | Dependencies, orphans, cycles, coverage |
| **Dev Agents** | Separate tabs | Execute tasks using `test` |
| **Done** | Delete the spec | Git history preserves it |

---

## Directory Structure

```
.pm/
├── schema.sql            # Schema (in git)
├── tasks.db              # Local working db (gitignored)
├── backlog/              # Ideas (unrefined)
│   └── {group}/
├── todo/                 # Active sprint specs + task seeds
│   ├── crm/
│   │   ├── 01-deals-pipeline.md
│   │   ├── ...
│   │   └── tasks.sql     # Task seed for this sprint (gitignored, local only)
│   └── domain-events/
│       └── tasks.sql
└── case-studies/         # User research

.wm/                      # Working memory (transitory, gitignored)
```

**Key design**: `tasks.sql` seeds are gitignored (local only). `tasks.db` is also gitignored — no merge conflicts. Specs (.md) in git serve as the durable planning rationale.

---

## Phase 1: Ideation

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'IDEATION', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: User research, feature request, brainstorm

**Action**: Capture in `.wm/` (scratch) or `.pm/backlog/` (keep)

**Format**: Loose, informal — one-liner to brain dump.

---

## Phase 1.5: Audit Current Code (CRITICAL)

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'AUDIT_CODE', '$(echo $CLAUDE_SESSION_ID)');"
```

**Before writing ANY spec, audit what already exists — both in your codebase and in the wider ecosystem.**

This prevents:
- Proposing components that already exist
- Creating new packages when features can extend existing ones
- Over-engineering with redundant abstractions
- Specs that duplicate existing functionality
- Designing in a vacuum without learning from best-in-class tools

**Prior art research happens here too.** While auditing your own code, also research how leading products solve the same problem. This feeds directly into the spec's Prior Art and Ideal State sections.

### Audit Checklist

```bash
# 1. Search for existing implementations
find packages -name "*.tsx" | xargs grep -l "ComponentName"
find apps -name "*.tsx" | head -20

# 2. Check package structure
ls -la packages/*/src/ 2>/dev/null || ls -la packages/*/

# 3. Look for existing hooks
grep -r "export function use" packages/ apps/

# 4. Check what's registered/exported
grep -r "export \*" packages/ apps/

# 5. Read existing implementations before proposing new ones
```

### What to Audit

| Before speccing... | Where to look |
|--------------------|---------------|
| UI components | Check `CLAUDE.md` → Project Structure for component paths |
| Hooks | Check `CLAUDE.md` → Project Structure for hook paths |
| Server actions | Check `CLAUDE.md` → Project Structure for action paths |
| API routes | Check `CLAUDE.md` → Project Structure for route paths |

> **Note:** Project-specific paths are defined in the project's `CLAUDE.md` under "Project Structure". Always check there first — never assume a directory layout.

### Update Specs, Don't Duplicate

If existing code covers 80% of a spec:
1. **Mark completed items** in "What's Done" section
2. **Reduce scope** to only the remaining work
3. **Delete the spec** if nothing remains

**Example**: Root interface spec proposed new package, but `Thread` component in `features-chat` already handles everything → delete the spec.

---

## Phase 2: Refinement → Spec

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'REFINEMENT', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: Deciding to work on something

**Action**: Move from backlog to `.pm/todo/{group}/`, refine into spec.

**Spec is ready when**:
- Goal is articulated (why we're building this, what user problem it solves)
- Success criteria defined (quantitative and/or qualitative, depending on the feature)
- Prior art reviewed (how best-in-class tools handle this)
- Problem is clear
- Solution approach defined
- Acceptance criteria are testable

### Spec Template (Pyramid Principle)

Every spec follows the pyramid principle: **answer first, details later.** A reader should be able to stop at any heading and have the most important information at that depth.

```markdown
# [Feature Name]

> One sentence: what this spec defines and why it matters.

| Field | Value |
|-------|-------|
| Status | Draft / Active / Implemented / Superseded |
| Owner | [name] |
| Last Updated | YYYY-MM-DD |
| Depends On | [links to other specs] |
| Enables | [links to other specs / roadmap goals] |

---

## Table of Contents

- [Recent Changes](#recent-changes)
- [Goal](#goal)
- [Success Criteria](#success-criteria)
- [Prior Art](#prior-art)
- [Current State](#current-state)
- [Ideal State](#ideal-state)
- [Design](#design)
- [Schema](#schema)
- [Implementation Plan](#implementation-plan)
- [Open Questions](#open-questions)
- [References](#references)

---

## Recent Changes

Reverse-chronological. A returning reader scans this and knows whether to re-read anything below.

| Date | What changed | Section |
|------|-------------|---------|
| YYYY-MM-DD | Added X based on Y | [Design > Sub-section](#sub-section) |
| YYYY-MM-DD | Initial spec | All |

---

## Goal

**Why are we building this?** What user problem does it solve? What's the motivation?

1-3 sentences. A reader should understand the purpose before anything else.

---

## Success Criteria

**How do we know this worked?** Mix of quantitative and qualitative depending on the feature.

- [Quantitative: metric X improves by Y%, load time under Z ms, etc.]
- [Qualitative: users can complete X without asking for help, workflow feels intuitive, etc.]

---

## Prior Art

**How do best-in-class tools handle this?** 2-3 examples with what they do well and what we'd do differently.

- **[Tool A]**: [what they do, what's good, what we'd change]
- **[Tool B]**: [what they do, what's good, what we'd change]

*(Use web search to research how leading products solve this problem.)*

---

## Current State

**What exists today.** 3-5 bullets. Ground the reader before the ideal state.

- [what is done]
- [what is partially done]
- [what is not started]

---

## Ideal State

**What does the best possible version look like, unconstrained?** Describe the dream — no resource, time, or technical constraints. This is the north star.

1-2 paragraphs. The Design section below scopes down from this ideal, making trade-offs explicit.

---

## Design

**What we're actually building, given constraints.** Each subsection opens with a **one-sentence answer** (what we decided), then reasoning, then details.

**Trade-offs from ideal**: [What we're deferring and why — makes the gap between Ideal State and Design explicit]

**This spec covers**:
- Component A
- Component B

**Out of scope**:
- [Topic X] → `other-spec.md`

---

## Schema

SQL, TypeScript interfaces, or data model definitions. Separated from prose for easy reference.

*(Optional — only if the spec defines data structures.)*

---

## Implementation Plan

| # | Task | Done When |
|---|------|-----------|
| 1 | Create X | X exists and works |
| 2 | Build Y | Y renders correctly |

*(Optional — some specs are vision-only, not yet implementation-ready.)*

---

## Open Questions

Numbered. Resolved questions are struck through with the answer inline (not deleted — the resolution is valuable context).

1. ~~Should we use X or Y?~~ **Resolved**: X, because [reason].
2. How do we handle Z?

---

## References

- Related spec: `related-spec.md`
- Skill: `.claude/skills/{relevant-skill}`
```

**Key template rules:**
- **Recent Changes is the second section** — eliminates "re-read the whole spec" friction
- **Goal → Success Criteria → Prior Art before Design** — establish the "why," how you'll measure it, and what good looks like before proposing a solution
- **Current State before Ideal State** — "where are we" before "where we could go"
- **Ideal State before Design** — dream version first, then scope down with explicit trade-offs
- **One-line summary under the title** — forces clarity, makes directory scanning fast
- **Struck-through open questions** — resolved questions keep their reasoning
- **Not every section is required** — Schema and Implementation Plan are optional

### MECE Principle

Specs should be **Mutually Exclusive, Collectively Exhaustive**:

- **No overlaps**: Each task belongs to exactly one spec
- **No gaps**: Together, specs cover the entire feature
- **Cross-reference**: Use "Out of scope → see X" to redirect

**Bad** (overlapping):
```
# 01-root-interface.md
Tasks: Layout, Composer, File upload, CSV parsing

# 02-attachments.md
Tasks: File upload, CSV parsing  ← OVERLAP!
```

**Good** (MECE):
```
# 01-root-interface.md
Tasks: Layout, Composer
Out of scope: File handling → 02-attachments.md

# 02-attachments.md
Tasks: File upload, context injection
Out of scope: Import logic → 03-import-agent.md
```

### Phased Work

For multi-phase features, use separate task tables:

```markdown
## Phase 1: Foundation

| # | Task | Done When |
|---|------|-----------|
| 1 | Create package | Build succeeds |
| 2 | Basic layout | Component renders |

---

## Phase 2: Features (depends on Phase 1)

| # | Task | Done When |
|---|------|-----------|
| 3 | Add streaming | Text streams |
| 4 | Add progress | Progress shows |
```

---

## Phase 2.5: Pre-Task Checklist

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'PRE_TASK_CHECKLIST', '$(echo $CLAUDE_SESSION_ID)');"
```

**Before translating specs into tasks, run this checklist.**

### Checklist

```
□ 1. AUDIT CODE
    - Run `/health` full scan to establish baseline debt level
    - Note critical findings — new tasks touching flagged files should include cleanup
    - Spin up parallel subagents per spec area
    - What exists? Update "What's Done" sections
    - What's missing/blocked? Flag external deps
    - Where does code live? New package or extend existing?
    - Delete specs if 100% complete
    - Read existing hooks/utils before proposing new ones
    - Check what SDK/framework already provides

□ 2. PATTERN CHECK
    - Spin up subagent to check specs against .claude/skills/
    - Do tasks follow existing patterns? (hooks, components, actions)
    - Are we duplicating something that already exists?

□ 3. MECE CHECK
    - No overlaps between specs
    - Cross-refs for out-of-scope items

□ 4. SCOPE CHECK WITH USER
    - Task count reasonable? (50-100 ideal, flexible)
    - Any obvious gaps or concerns before adversarial review?
    - Proceed to Phase 2.75 (Adversarial Review)
```

### Task Quality Checks

Before loading to SQLite:

| Check | Bad | Good |
|-------|-----|------|
| Done When | "works", "done" | See "Done When" examples below |
| Task size | Multi-day epic | One session (see sizing guide) |
| Description | "as discussed" | Standalone context |
| Dependencies | Spec-level | Task-level |

### "Done When" Examples

**Pure logic / utilities**:
- Bad: "Parses CSV", "works"
- Good: "Unit test passes, returns headers + first N rows"

**UI components**:
- Bad: "Component renders"
- Good: "Component renders with mock data, Storybook story added"

**Hooks**:
- Bad: "Hook works"
- Good: "Hook returns expected state, unit test passes"

**Integrations**:
- Bad: "Wired up"
- Good: "Manual verification: action triggers expected behavior"

**Server actions / tools**:
- Bad: "Creates investors"
- Good: "Integration test passes, creates investors in DB"

### Task Sizing Guide

**Target: 2-4 tasks per spec.** Each spec should have exactly 2-4 tasks. If you have more, combine related work. If you have fewer, consider if the spec is too small.

**E2E specs: Single task.** All E2E verification for a sprint should be ONE task, not split by feature.

**One session** = 15-60 minutes of focused work.

| Size | Example | Verdict |
|------|---------|---------|
| ✅ OK | "Create CRUD server actions for investors" | One pattern, 4-5 functions |
| ✅ OK | "Create 4 components for investor domain" | Same structure, different data |
| ✅ OK | "Remove Mastra wrapper + sync persistence" | Linear sequence, same concern |
| ⚠️ Split | "Build investor import with preview, validation, creation" | 3 distinct phases with different concerns |
| ❌ Epic | "Implement agent progress UI" | Entire spec, not a task |
| ❌ Over-split | 9 tasks for one spec | Combine into 2-4 larger tasks |

### When to Split vs Combine

**Combine into ONE task** when steps are:
- Linear sequence (A → B → C, no branching)
- Same concern/domain
- No external dependencies between steps
- Natural stopping point only at the end

**Split into MULTIPLE tasks** when:
- Steps can be done in parallel
- Different people could work on them
- External dependency between steps (e.g., needs API before UI)
- Natural stopping points exist

### Example: Refactoring

**Bad** (over-split):
```
| 1 | Investigate extraction feasibility | Decision doc |
| 2 | Extract createAgentTransport utility | Utility + tests |
| 3 | Extract useThreadId hook | Hook + tests |
| 4 | Simplify useAgentChat | Main hook ~100 lines |
```
These are a linear sequence with no branching. One task.

**Good** (single task):
```
| 1 | Refactor useAgentChat into smaller units | Extract transport + threadId hooks, ~100 lines, tests pass |
```

**Why?** When visualized as a dependency graph, linear sequences have no interconnections. They're one unit of work.

---

## Phase 2.75: Adversarial Review

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'ADVERSARIAL_REVIEW', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: Pre-Task Checklist (2.5) complete. Spec written, code audited, patterns checked, MECE verified. Design has NOT yet been broken into tasks.

**Purpose**: Stress-test the spec's design decisions, data model, edge cases, and assumptions before committing to a task breakdown. It's 10x cheaper to find a design flaw here than during implementation.

### Two-Agent Pipeline

Uses two sequential subagents. Detailed prompts are in `templates/adversarial-review.md`.

**Agent 1 — Question Generator**: Reads the spec, schema, and audit context. Generates 8-15 adversarial questions covering categories relevant to the spec (state transitions, race conditions, edge cases, failure modes, data integrity, etc.). Each question includes 2-4 options with a recommended choice and schema/spec impact notes.

**Agent 2 — Review & Present**: Reviews Agent 1's output. Challenges recommendations, adds implementation notes to each option, flags low-value questions as SKIP, adds 1-2 missed questions if needed. Then reorders surviving questions: groups by theme, foundational decisions first, leaf decisions last. Produces the final formatted review.

### Presenting to User

Present the full adversarial review. The format allows rapid responses:

```
User: "1A, 2B, 3A, 4C, 5A, 6A, 7A, 8B"
```

### Processing Decisions

After the user responds:

1. **Parse responses** — map each answer to the chosen option
2. **Update the spec's Open Questions section** — record each decision as a resolved question:
   ```
   ~~Q: {adversarial question}~~ **Resolved**: {chosen option + rationale}
   ```
3. **Apply schema changes** required by the chosen options
4. **Summarize changes** — tell the user what was updated
5. **Get explicit approval** — "Spec updated with adversarial decisions. Ready to create tasks?"
6. **Proceed to Phase 3** (Sprint Planning) only after user confirms

### When to Re-Run

- Spec changes significantly after the review (new major section or redesigned data model)
- New external dependency or constraint discovered
- User requests it explicitly

---

## Phase 3: Sprint Planning

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'SPRINT_PLANNING', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: Starting new sprint (after Pre-Task Checklist + Adversarial Review complete, user approved)

**Actions**:
1. Pick spec(s) from `todo/` — multiple specs per sprint is normal
2. Write `tasks.sql` in the sprint folder (e.g., `.pm/todo/crm/tasks.sql`)
3. Initialize local db from schema + seed(s)

**Task granularity**: One session. Each task should be completable in a single focused work session.

**Source of truth**: Specs (.md) stay in git as planning rationale. `tasks.sql` is local-only (gitignored) -- used to seed your local `tasks.db`. Task seeds (tasks.sql) are shared via git. Each developer has their own local tasks.db.

### Initialize Local Database

```bash
# Fresh start (loads schema + all active sprints)
sqlite3 .pm/tasks.db < .pm/schema.sql
sqlite3 .pm/tasks.db < .pm/todo/crm/tasks.sql
sqlite3 .pm/tasks.db < .pm/todo/domain-events/tasks.sql

# Add new sprint tasks (keeps existing progress)
sqlite3 .pm/tasks.db < .pm/todo/new-sprint/tasks.sql
```

### Writing tasks.sql

**PM writes tasks as INSERT statements** in `.pm/todo/{sprint}/tasks.sql`. Lives with specs.

```sql
-- .pm/todo/crm/tasks.sql
INSERT INTO tasks (sprint, spec, task_num, title, type, owner, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('crm-foundation', '01-deals-pipeline.md', 1, 'Create CRM tasks table', 'database', 'adam', 'database',
  30, 'medium', NULL,
  'Migration runs, RLS policies pass pgTap (positive + negative cases)',
  'Build tasks table for human-in-the-loop agent approvals.');

INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('crm-foundation', 2, 'crm-foundation', 1);  -- task 2 depends on task 1
```

**Column formats**:
- `sprint`: Sprint name (e.g., `'crm-foundation'`)
- `spec`: Spec file name (e.g., `'01-deals-pipeline.md'`)
- `task_num`: Sequential number within sprint (1, 2, 3...)
- `type`: Task layer — one of: `database`, `actions`, `frontend`, `infra`, `agent`, `e2e`, `docs`. See "Task Type Guide" below
- `owner`: Engineer assigned (e.g., `'ada'`, `'adam'`)
- `skills`: Comma-separated skills to invoke (e.g., `'database'`, `'server-actions, tanstack-hooks'`)
- `estimated_minutes`: PM's time estimate in minutes — set at planning time, **never adjusted after work starts**
- `complexity`: One of `low`, `medium`, `high`, `unknown`. High = wider probability distribution on completion time
- `complexity_notes`: Why it's complex (e.g., `'unstable API'`, `'heavy cross-service integration'`, `'first time using this library'`). Leave NULL for straightforward tasks

### Estimation Guidelines

**Set `estimated_minutes` for every task during planning.** This is the PM's best guess in minutes before work starts. Don't adjust after seeing actuals — the whole point is measuring estimation accuracy over time.

**Rules of thumb for `complexity`**:
- **low** — Repeated pattern, no external dependencies, isolated scope (e.g., "another CRUD endpoint")
- **medium** — Some integration, well-documented APIs, moderate scope
- **high** — Unstable APIs, cross-service coordination, novel technology, unclear requirements
- **unknown** — Genuinely can't assess. Use sparingly — try to classify as low/medium/high first

### Task Type Guide

The `type` field determines which automated checks run during implementation:

| Type | What triggers automatically | Use when |
|------|---------------------------|----------|
| `database` | Database-specific audit patterns | Migrations, RLS policies, schema changes |
| `actions` | Server action patterns | Server actions, API handlers, business logic |
| `frontend` | **`/review` runs after GREEN** | UI components, pages, layouts, styling, anything the user sees |
| `infra` | Infrastructure audit | CI/CD, deployment, config, tooling |
| `agent` | Agent-specific patterns | AI agent definitions, prompts, tools |
| `e2e` | E2E-specific audit (single subagent) | End-to-end test specs |
| `docs` | No automated checks | Documentation, READMEs, guides |

**Important**: `type: frontend` triggers the multi-agent frontend review (programmatic + vision + interaction). If a task touches UI, set `type: frontend` so the review runs automatically. Tasks that only touch backend logic (even if they affect what the frontend displays) should use `actions` or `database`.

### Task Description Standard

**Tasks must be executable in isolation.** Include enough context that someone unfamiliar with the spec can complete the task without asking questions.

Good:
```
Add RLS policy for investors table. Users should only see investors
belonging to their company. Pattern: see existing policy on batches table.
```

Bad:
```
Add RLS policy as discussed.
```

### Setting Dependencies

```bash
# Create tasks with explicit task_num
sqlite3 .pm/tasks.db "INSERT INTO tasks (sprint, task_num, title) VALUES
  ('agent', 1, 'Write RLS policy for investors'),
  ('agent', 2, 'Create getInvestor server action'),
  ('agent', 3, 'Build InvestorDetail component');"

# Task 2 depends on 1, Task 3 depends on 2 (within same sprint)
sqlite3 .pm/tasks.db "INSERT INTO task_dependencies VALUES
  ('agent', 2, 'agent', 1),
  ('agent', 3, 'agent', 2);"
```

### E2E Spec (One Per Sprint)

**CRITICAL**: Implementation specs do NOT include E2E tasks.

Each sprint gets ONE E2E spec that runs after all implementation is complete.

**Structure**:
```
.pm/todo/<sprint>/
├── 01-feature-a.md      # Implementation spec
├── 02-feature-b.md      # Implementation spec
├── ...
└── 99-e2e-verification.md   # E2E spec (runs last)
```

**E2E Spec Creation**:
1. Create `99-e2e-verification.md` during sprint planning
2. Leave tasks section minimal initially
3. Populate tasks AFTER implementation specs are done
4. One E2E task per spec area (not per individual test)

**Template**: See `templates/e2e-spec.md`

**E2E Task Dependencies**:
```bash
# E2E task (last task in sprint) depends on all other tasks
# Example: E2E is task 51, depends on tasks 1-50
sqlite3 .pm/tasks.db "
  INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task)
  SELECT 'crm-foundation', 51, 'crm-foundation', task_num
  FROM tasks
  WHERE sprint = 'crm-foundation' AND task_num < 51;"
```

---

## Phase 3.5: Post-Load Audit

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'POST_LOAD_AUDIT', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: Tasks loaded to SQLite, before starting implementation

**Actions**: Run subagent checks to verify task quality and dependencies.

### Audit Checklist

```
□ 1. DEPENDENCY AUDIT
    - Check available_tasks count vs total tasks
    - If >50% available immediately → missing dependencies
    - E2E tests MUST depend on features they test
    - Sequential work (sidebar → hooks → prompts → wire) needs ordering
    - Cross-spec dependencies captured (import agent → progress UI)

□ 2. ORPHAN CHECK
    - Tasks with no dependencies AND nothing depends on them
    - May be valid (standalone components) or missing links

□ 3. CYCLE CHECK
    - No circular dependencies (A → B → A)
    - SQLite won't catch this automatically

□ 4. COVERAGE CHECK
    - Every spec has tasks loaded
    - Task count matches spec's "Suggested Tasks" section
```

### Subagent Audit Script

```bash
# 1. Dependency ratio check
echo "=== Dependency Audit ==="
TOTAL=$(sqlite3 .pm/tasks.db "SELECT COUNT(*) FROM tasks WHERE sprint = 'SPRINT';")
AVAILABLE=$(sqlite3 .pm/tasks.db "SELECT COUNT(*) FROM available_tasks WHERE sprint = 'SPRINT';")
RATIO=$(echo "scale=0; $AVAILABLE * 100 / $TOTAL" | bc)
echo "Available: $AVAILABLE / $TOTAL ($RATIO%)"
if [ "$RATIO" -gt 50 ]; then
  echo "⚠️  WARNING: >50% tasks have no dependencies - likely missing!"
fi

# 2. Orphan check (no deps in or out)
echo -e "\n=== Orphan Tasks ==="
sqlite3 -header -column .pm/tasks.db "
  SELECT task_num, substr(title, 1, 40) as title
  FROM tasks t
  WHERE sprint = 'SPRINT'
  AND NOT EXISTS (SELECT 1 FROM task_dependencies d WHERE d.sprint = t.sprint AND d.task_num = t.task_num)
  AND NOT EXISTS (SELECT 1 FROM task_dependencies d WHERE d.depends_on_sprint = t.sprint AND d.depends_on_task = t.task_num);
"

# 3. E2E test dependency check
echo -e "\n=== E2E Tests Without Dependencies ==="
sqlite3 -header -column .pm/tasks.db "
  SELECT task_num, substr(title, 1, 40) as title
  FROM tasks t
  WHERE sprint = 'SPRINT'
  AND title LIKE 'E2E%'
  AND NOT EXISTS (SELECT 1 FROM task_dependencies d WHERE d.sprint = t.sprint AND d.task_num = t.task_num);
"

# 4. Coverage check
echo -e "\n=== Tasks Per Spec ==="
sqlite3 -header -column .pm/tasks.db "
  SELECT spec_path, COUNT(*) as tasks FROM tasks
  WHERE sprint = 'SPRINT'
  GROUP BY spec_path;
"
```

### Common Dependency Patterns

| Pattern | Dependencies |
|---------|--------------|
| UI sequence | sidebar → hooks → prompts → wire page |
| Agent tools | agent definition → tools → registration |
| Components | schemas → individual components → component tests |
| E2E tests | feature implementation → E2E test for that feature |
| Cross-spec | Import Agent → Progress UI (shows agent working) |

### Fixing Missing Dependencies

```bash
# Add dependency (task 5 depends on task 3, same sprint)
sqlite3 .pm/tasks.db "INSERT INTO task_dependencies VALUES ('SPRINT', 5, 'SPRINT', 3);"

# Bulk add: E2E tests depend on wiring tasks
sqlite3 .pm/tasks.db "
  INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task)
  SELECT t.sprint, t.task_num, w.sprint, w.task_num
  FROM tasks t, tasks w
  WHERE t.title LIKE 'E2E%'
  AND w.title LIKE 'Wire % page%'
  AND t.sprint = w.sprint;
"
```

---

## Phase 4: Start Implementation

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'START_IMPLEMENTATION', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: Tasks loaded and audited, ready for implementation

**Goal**: Begin task implementation using `/test`

### Execution Model

**Main chat handles implementation**. No separate "dev agent" tabs needed by default.

```bash
# Show available tasks to start
sqlite3 .pm/tasks.db "SELECT id, title, done_when FROM available_tasks WHERE sprint = 'SPRINT_NAME' LIMIT 10;"
```

Then invoke `/test` and start implementing.

### Parallelism (Optional)

If multiple tasks from same spec can run concurrently:

| Scenario | Approach |
|----------|----------|
| Sequential tasks (dependencies) | Stay in main chat |
| Parallel tasks (no dependencies) | User opens new tab, invokes `/test` there |

**User decides** when to parallelize. Each tab runs its own tdd-agent independently.

### Quick Start

```
PM: "Tasks loaded. 10 available. Start with task #5 - Create parseCSVPreview utility."

User/Agent:
1. Invoke `/test`
2. Pick task #5
3. Follow RED → GREEN → REFACTOR → AUDIT → CODIFY workflow
4. Complete task, pick next available task
5. Repeat until sprint complete
```

---

## Phase 4.5: Handle Future Enhancements (Discovered During Implementation)

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'FUTURE_ENHANCEMENTS', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: Discover future work while implementing tasks

**Protocol**: Ask user for approval, then add directly to spec and tasks.db

### Workflow

1. **Discover enhancement** during implementation
2. **Ask user for approval**:
   ```
   "Found potential enhancement: Add attachment metadata display in chat history.
   Should I add this to the spec and create a task? (Y/N)"
   ```
3. **If approved**:
   - Update spec with new item
   - Add task to tasks.db (see `templates/adding-tasks.md` for examples)
   - Set dependencies if needed
4. **If deferred**: Note in completion report, move on

### Example

```
Agent: "Discovered 2 potential enhancements:
1. UI preview of attachment context before sending (2 tasks)
2. Attachment metadata display in chat history (1 task)

Should I add these to the spec and create tasks?"

User: "Add #2, defer #1 to backlog"

Agent:
- Updates 01-attachments.md with item #2
- Adds task #69 to tasks.db
- Notes #1 in completion report for backlog
```

### Task Creation Reference

See `templates/adding-tasks.md` for:
- INSERT syntax for tasks.db
- Setting dependencies
- Linking to specs

---

## Code Review → Task Creation

**Trigger**: Reviewing code (PR review, commit review, architecture audit) and discovering issues

**Use case**: Tech debt, pattern violations, refactoring opportunities found during code review — not during implementation.

### When to Use

| Scenario | Action |
|----------|--------|
| Pattern violation in existing code | Create task in current sprint |
| Tech debt discovered in review | Create task, link to spec if exists |
| Audit finding (security, perf) | Create task with appropriate priority |
| Refactoring opportunity | Create task, set dependencies on affected work |

### Workflow

1. **Identify the issue** during code review
2. **Determine task details**:
   - Which sprint? (current sprint or create new)
   - Which spec? (existing or `NULL` for standalone)
   - Next task_num in that sprint
   - Type, skills, done_when
3. **Add task directly to tasks.db**:

```bash
# Find next task_num for sprint
sqlite3 .pm/tasks.db "SELECT MAX(task_num) + 1 FROM tasks WHERE sprint = 'SPRINT';"

# Add the task
sqlite3 .pm/tasks.db "INSERT INTO tasks (sprint, spec, task_num, title, type, skills, done_when, description) VALUES
('SPRINT', 'SPEC.md', TASK_NUM, 'TITLE', 'TYPE', 'SKILLS',
'DONE_WHEN',
'DESCRIPTION with context about why this was identified and what commit/code it relates to.');"
```

4. **Optionally persist to tasks.sql** (if task should be in git):

```bash
# Append to sprint's tasks.sql for persistence
echo "INSERT INTO tasks (...) VALUES (...);" >> .pm/todo/SPRINT/tasks.sql
```

### Example: Pattern Violation Found in Review

```bash
# Reviewing commit fc041c80, found server action with business logic
# that should be extracted to reusable functions

sqlite3 .pm/tasks.db "INSERT INTO tasks (sprint, spec, task_num, title, type, skills, done_when, description) VALUES
('demo-ready', '03-entity-transitions.md', 14,
'Extract entity-transitions business logic to reusable functions',
'actions',
'server-actions, testing-unit',
'Business logic extracted to reusable functions with unit tests, server actions are thin wrappers',
'Refactor server action to follow pattern: actions should be thin wrappers, business logic in reusable functions.

Current violation (fc041c80): SQL queries directly in handler files.

Create:
- createDealFromBatchInvestor core action
- advanceDealStage core action
- createPostMeetingTask core action

Update handlers to call core actions instead of raw SQL.');"
```

### Task Types for Review Findings

| Finding Type | task.type | Example |
|--------------|-----------|---------|
| Architecture violation | `actions` | Lambda business logic → core |
| Missing tests | `e2e` or `docs` | Coverage gap |
| Security issue | `infra` or `actions` | RLS policy missing |
| Performance issue | `database` or `infra` | Missing index, N+1 query |
| Documentation gap | `docs` | Missing skill documentation |

### Key Principle

**Don't create backlog files for actionable tech debt.** If it's worth tracking, it's worth a task in tasks.db. Backlog is for ideas that aren't yet refined enough to be tasks.

---

## Phase 5: Monitor Sprint Progress

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'MONITOR', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: Dev agents are working on tasks

**Action**: Track progress and surface blockers

### Monitor Queries

```bash
# Sprint overview
sqlite3 -header -column .pm/tasks.db "SELECT * FROM sprint_progress WHERE sprint = 'your-sprint';"

# What's blocked?
sqlite3 -header -column .pm/tasks.db "SELECT * FROM blocked_tasks WHERE sprint = 'your-sprint';"

# What needs pattern audit? (dev agents should handle this, but check)
sqlite3 -header -column .pm/tasks.db "SELECT * FROM needs_pattern_audit WHERE sprint = 'your-sprint';"

# What needs verification?
sqlite3 -header -column .pm/tasks.db "SELECT id, title, done_when FROM needs_verification WHERE sprint = 'your-sprint';"

# Refactor audit (technical debt identified)
sqlite3 -header -column .pm/tasks.db "SELECT * FROM refactor_audit WHERE sprint = 'your-sprint';"
```

### Planning Agent Responsibilities During Sprint

- **Unblock tasks**: Resolve external dependencies, clarify requirements
- **Adjust dependencies**: If dev agents discover missing dependencies
- **Coordinate**: If multiple dev agents conflict on same area
- **Track progress**: Regular check-ins on sprint completion %
- **Surface issues**: Alert when blockers pile up or velocity drops

---

## Phase 6: Sprint Completion

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'plan', 'SPRINT_COMPLETION', '$(echo $CLAUDE_SESSION_ID)');"
```

**Trigger**: All tasks green and audited (dev agents report completion)

**Template**: See `templates/sprint-completion-report.md` for detailed steps.

**Actions** (planning agent):

### 1. Pre-Cleanup Verification

```bash
# Verify all tasks green and audited
sqlite3 .pm/tasks.db "
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'green' THEN 1 ELSE 0 END) as green,
    SUM(CASE WHEN pattern_audited = 1 THEN 1 ELSE 0 END) as audited,
    SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified
  FROM tasks WHERE sprint = 'SPRINT_NAME';
"

# Check all specs have "Status: Done" with conclusions
```

### 2. Frontend Review (if UI-heavy sprint)

If any sprint task has `type: frontend` or modifies component/page files, run `/review` on affected pages before verify-agent. The frontend review agent reads the JSON report's `status` field — `pass` means the page is cleared, `fail` or `max_iterations` means issues remain.

### 3. Sprint Verification (verify-agent)

**User spins up a verify-agent agent** to run:
1. **E2E Tests** - functional correctness, diagnose failures via screenshots
2. **Visual Iteration** - temp screenshot tests for UI polish (if UI-heavy sprint)

**Two tools available in verify-agent**:
- **Tool 1**: Run E2E tests, if failure → read screenshot → diagnose → fix → re-run
- **Tool 2**: Write temp test → screenshot page → assess visual issues → fix CSS → iterate

**If verify-agent escalates to bug-workflow**: bug-workflow investigates with temp E2E tests + console capture + database queries, returns findings, verify-agent continues.

### 4. Handle Issues Found

If issues found during verification:

1. **verify-agent fixes directly**: Most issues can be fixed and committed by verify-agent

2. **Escalate to bug-workflow**: If can't diagnose from screenshots, bug-workflow investigates

3. **Create hotfix task**: For complex issues requiring separate task tracking

4. **PM verifies fix**: Re-run affected manual check

**Note**: PM does NOT invoke `/debug` — that's for dev agents. PM's job is to document the bug and create the task.

### 5. Git Squash (Consolidate Commits)

**Before cleanup, squash commits per task for clean git history.**

```bash
# Preview what will be squashed (dry-run)
./scripts/git/squash-sprint.sh SPRINT_NAME

# Shows:
# [Task #105] 5 commits → 1 commit
# [Task #106] 3 commits → 1 commit
# [Sprint: SPRINT_NAME] 2 commits → 1 commit
# Before: 10 commits | After: 3 commits

# Execute the squash (creates backup branch first)
./scripts/git/squash-sprint.sh SPRINT_NAME --execute
```

**Safety**:
- Dry-run by default (must pass `--execute`)
- Creates backup branch before squashing
- Aborts if commits already pushed to origin

**Result**: One commit per task, clean history for rollback.

### 6. .wm/ Cleanup (Haiku Subagent)

Spawn Haiku subagent to categorize .wm/ files:
- **DELETE**: Sprint-specific notes (task-N-*.md, *-plan.md, *-summary.md)
- **KEEP**: Persistent context, unrelated to sprint
- **DISTILL**: Patterns worth extracting to skills

Execute deletions. PM approves any distillations.

### 7. Tasks.db Cleanup

**No cleanup needed.** Since `tasks.db` is gitignored and local to each developer:
- Each developer keeps their own progress
- No merge conflicts
- Delete completed sprint's tasks locally when you want: `DELETE FROM tasks WHERE sprint = 'old-sprint';`
- Or just keep them — they don't affect anything

### 8. Specs Cleanup

```bash
rm .pm/todo/<sprint>/*
rmdir .pm/todo/<sprint>
```

### 9. Sprint Retrospective

Document briefly:
- **Patterns emerged**: What was codified in skills?
- **What worked well**: Process improvements
- **What didn't work**: Friction points
- **Next sprint**: Considerations to carry forward

---

## Schema Reference

### Tasks Table

**Primary Key**: `(sprint, task_num)` — task numbers are unique within a sprint.

| Column | Type | Purpose |
|--------|------|---------|
| `sprint` | TEXT | Sprint name (part of PK) |
| `spec` | TEXT | Spec file name (e.g., `'01-deals-pipeline.md'`) |
| `task_num` | INTEGER | Task number within sprint (part of PK) |
| `title` | TEXT | What to do |
| `description` | TEXT | Context (executable in isolation) |
| `done_when` | TEXT | What makes this done |
| `status` | TEXT | TDD stages: `pending` → `red` → `green` (or `blocked`) |
| `blocked_reason` | TEXT | Why task is blocked (if status = blocked) |
| `type` | TEXT | database, actions, frontend, infra, agent, e2e, docs |
| `owner` | TEXT | Engineer assigned |
| `skills` | TEXT | Comma-separated skills to invoke (e.g., `'database, server-actions'`) |
| `pattern_audited` | BOOLEAN | Dev agent audited patterns after implementation |
| `pattern_audit_notes` | TEXT | What patterns were found/documented |
| `skills_updated` | BOOLEAN | Dev agent updated relevant skills |
| `skills_update_notes` | TEXT | What skill updates were made |
| `tests_pass` | BOOLEAN | All tests passing |
| `testing_posture` | TEXT | Grade: A, B, C, D, F (target: A)

### Dependencies Table

```sql
task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task)
```

### Views

| View | Purpose |
|------|---------|
| `available_tasks` | Pending tasks with no unfinished dependencies |

---

## Quick Reference

### Initialize Local Database

```bash
# Load schema + sprint tasks
sqlite3 .pm/tasks.db < .pm/schema.sql
sqlite3 .pm/tasks.db < .pm/todo/crm/tasks.sql
```

### Common Queries

```bash
# What's available to work on?
sqlite3 -header -column .pm/tasks.db "SELECT sprint, task_num, title, owner FROM available_tasks;"

# List all tasks in a sprint
sqlite3 -header -column .pm/tasks.db "SELECT task_num, title, status, type, owner FROM tasks WHERE sprint = 'crm-foundation' ORDER BY task_num;"

# Mark task in progress
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'in_progress' WHERE sprint = 'crm-foundation' AND task_num = 5;"

# Mark task done
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'done' WHERE sprint = 'crm-foundation' AND task_num = 5;"
```

---

## File Locations

| Type | Path |
|------|------|
| Ideas | `.pm/backlog/**/*.md` |
| Sprint specs | `.pm/todo/{sprint}/*.md` |
| Task seeds | `.pm/todo/{sprint}/tasks.sql` (gitignored -- local seed script) |
| Local task db | `.pm/tasks.db` (gitignored) |
| Schema | `.pm/schema.sql` |
| Working memory | `.wm/**/*.md` |
| User research | `.pm/case-studies/**/*.md` |
| Dev agent workflow | `.claude/skills/test/SKILL.md` |

---

## Separation of Concerns

### PM Role (this skill):
- Create specs
- Audit existing code
- Break specs into tasks
- Set dependencies
- Audit task structure (pre/post load)
- Monitor sprint progress
- Unblock tasks
- Verify sprint completion

### Implementation Role (`test` skill):
- Invoke `/test`
- Pick available tasks
- Implement with TDD (RED → GREEN → REFACTOR)
- Run quality checks
- Execute 3-subagent audits (subagents for auditing only)
- Update tasks.db with status and findings
- Report blockers
- Move to next task

**Key principle**: PM orchestrates, implementation happens in main chat (or parallel tabs as needed).

---

### Workflow Complete

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, metadata) VALUES ('${sprint}', ${taskNum}, 'task_completed', 'plan', 'DONE', '{\"status\": \"completed\"}');"
```

**Status**: LIVE
**Database**: `.pm/tasks.db` (SQLite via Bash)
**Related Skill**: `test` (for dev agents)
**Invoked By**: Planning agent only
