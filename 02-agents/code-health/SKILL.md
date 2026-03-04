---
name: code-health
version: "1.0.0"
description: "Use when the user wants to audit code quality across the repo. Triggers: code health, audit code quality, check code health, tech debt scan, find dead exports, check file lengths, find circular deps, test coverage gaps, code quality check. Spawns 6 parallel subagents to scan for issues and creates tech-debt tasks for findings. Can run standalone, or is invoked by tdd-agent (changed files) and pm-agent (full scan)."
---

# Code Health Audit

## Overview

Parallel subagent skill that scans for code quality issues and creates tasks for findings.

**6 checks** run in parallel (one subagent each):
| Check | Finds |
|-------|-------|
| File length | Files exceeding type-specific line thresholds |
| Missing docs | Entry points and complex files without purpose comments |
| Function density | Files with too many exported functions (low cohesion) |
| Circular deps | Import cycles (A→B→C→A) |
| Dead exports | Exported but never imported anywhere |
| Test coverage gaps | Source files with no corresponding test file |

**Invocation modes**:
- **On-demand**: `/code-health` — full repo scan
- **tdd-agent**: After AUDIT phase — scans changed files only (non-blocking)
- **pm-agent**: Pre-Task Checklist — full scan for baseline

**Key principle**: Non-blocking. Findings create `tech-debt` tasks with `horizon: next`, never gate the calling workflow.

---

## Phases

```
CONFIGURE → SCAN (6 parallel subagents) → REPORT → CREATE TASKS
```

| Phase | Action |
|-------|--------|
| 1. CONFIGURE | Load config, determine scope, collect file list |
| 2. SCAN | Spawn 6 parallel subagents |
| 3. REPORT | Consolidate findings, assign severities |
| 4. CREATE TASKS | Deduplicate against existing tasks, create new ones |

---

## Phase 1: CONFIGURE

### Determine Scope

The skill accepts a `scope` parameter:

| Scope | When | Files scanned |
|-------|------|---------------|
| `full` | On-demand, PM baseline | All files matching include patterns |
| `changed` | tdd-agent post-audit | Only files changed in current task |

```bash
# For 'changed' scope — get files from git
FILES=$(git diff --name-only HEAD~1)

# For 'full' scope — use include patterns from config
# (subagents handle this internally via Glob/Grep)
```

### Load Config

Read `.pm/code-health.yml` if it exists. If not, use built-in defaults.

```bash
# Check for config
if [ -f .pm/code-health.yml ]; then
  echo "Using .pm/code-health.yml"
else
  echo "Using built-in defaults"
fi
```

### Built-in Defaults

These apply when no `.pm/code-health.yml` exists:

```yaml
thresholds:
  file_length:
    ts: 300
    tsx: 250
    sql: 500
    md: 400
    default: 300
  function_density:
    max_exports: 10
    cohesion_ratio: 0.3
  test_coverage:
    critical_min_lines: 100
    warn_min_lines: 50

include:
  - "src/**"
  - "packages/**"
  - "apps/**"
  - "platform/**"
  - "dashboard/**"

exclude:
  - "node_modules/**"
  - "dist/**"
  - ".next/**"
  - "*.test.*"
  - "*.spec.*"
  - "__tests__/**"
  - "*.d.ts"
  - "*.config.*"

task_creation:
  sprint: "tech-debt"
  type: "docs"
  horizon: "next"
  dedup_prefix: "[code-health"
```

---

## Phase 2: SCAN (6 Parallel Subagents)

**Spawn all 6 subagents in a single message** for maximum parallelism.

### How to Invoke

```
1. Read each subagent prompt from 02-agents/code-health/subagent-prompts/
2. Substitute variables:
   - ${scope} — 'full' or 'changed'
   - ${files} — file list (for 'changed' scope)
   - ${config} — resolved config (thresholds, include/exclude)
3. Invoke 6 Task tools in ONE message (parallel execution):
   - Task(subagent_type='general-purpose', model='opus', description='File length check', prompt=...)
   - Task(subagent_type='general-purpose', model='opus', description='Missing docs check', prompt=...)
   - Task(subagent_type='general-purpose', model='opus', description='Function density check', prompt=...)
   - Task(subagent_type='general-purpose', model='opus', description='Circular deps check', prompt=...)
   - Task(subagent_type='general-purpose', model='opus', description='Dead exports check', prompt=...)
   - Task(subagent_type='general-purpose', model='opus', description='Test coverage gaps check', prompt=...)
```

### Subagent Output Format

Each subagent returns findings in this structure:

```
CHECK: <check-name>
SCOPE: <full|changed>
FINDINGS: <count>

| File | Issue | Severity | Detail |
|------|-------|----------|--------|
| path/to/file.ts | <issue> | critical/warn/info | <detail> |

SUMMARY: <one-line summary>
```

---

## Phase 3: REPORT

Consolidate all 6 subagent results into a single report.

### Report Format

```
# Code Health Report

**Scope**: full | changed (N files)
**Date**: YYYY-MM-DD

## Summary

| Check | Critical | Warn | Info |
|-------|----------|------|------|
| File length | 2 | 5 | 0 |
| Missing docs | 1 | 3 | 0 |
| Function density | 0 | 2 | 0 |
| Circular deps | 0 | 1 | 0 |
| Dead exports | 0 | 4 | 2 |
| Test coverage gaps | 3 | 2 | 0 |
| **Total** | **6** | **17** | **2** |

## Critical Findings

1. **file-length**: `src/resolvers/analytics.ts` — 612 lines (threshold: 300)
2. **missing-docs**: `src/index.ts` — entry point without purpose comment
3. ...

## Warnings

1. **dead-exports**: `exportFoo` in `src/utils.ts` — never imported
2. ...

## Info

1. **dead-exports**: `TypeBar` in `src/types.ts` — type never imported
2. ...
```

### Severity Logic

| Check | Critical | Warn | Info |
|-------|----------|------|------|
| File length | >2x threshold | >1x threshold | — |
| Missing docs | Entry point file | >100 lines, no docs | — |
| Function density | Cohesion ratio <0.3 | >max_exports | — |
| Circular deps | Runtime cycle | Type-only cycle | — |
| Dead exports | — | Functions | Types |
| Test coverage gaps | Source >100 lines | Source >50 lines | — |

---

## Phase 4: CREATE TASKS

### Deduplication

Before creating a task, check if one already exists with the same structured key:

```bash
# Check for existing task with same code-health key
sqlite3 .pm/tasks.db "SELECT COUNT(*) FROM tasks
  WHERE description LIKE '%[code-health:file-length:src/resolvers/analytics.ts]%'
  AND status != 'green';"
```

**Key format**: `[code-health:<check-type>:<file-path>]`

If a matching task exists and is not `green` (completed), skip creation.

If a matching task exists and IS `green` (was fixed), create a new task (regression).

### Task Creation

For each finding at `critical` or `warn` severity:

```bash
# Find next task_num for tech-debt sprint
NEXT_NUM=$(sqlite3 .pm/tasks.db "SELECT COALESCE(MAX(task_num), 0) + 1 FROM tasks WHERE sprint = 'tech-debt';")

sqlite3 .pm/tasks.db "INSERT INTO tasks (sprint, task_num, title, type, done_when, description, status) VALUES
('tech-debt', $NEXT_NUM,
'Fix: <check-type> — <file-path>',
'docs',
'<specific done-when based on check type>',
'[code-health:<check-type>:<file-path>]

<detail about the finding>

Severity: <critical|warn>
Found: $(date +%Y-%m-%d)
Horizon: next',
'pending');"
```

### Done-When by Check Type

| Check | Done When |
|-------|-----------|
| File length | File is under threshold (split or refactor) |
| Missing docs | Purpose comment added at top of file |
| Function density | Exports reduced or file split into cohesive modules |
| Circular deps | Import cycle broken (dependency inverted or extracted) |
| Dead exports | Export removed or consumer added |
| Test coverage gaps | Test file created with meaningful tests |

### Task Creation Summary

After creating tasks, output:

```
## Tasks Created

- Created: N new tasks in 'tech-debt' sprint
- Skipped: M findings (existing tasks)
- Regression: P findings (previously fixed, reappeared)

| # | Title | Severity | Check |
|---|-------|----------|-------|
| 42 | Fix: file-length — src/resolvers/analytics.ts | critical | file-length |
| 43 | Fix: missing-docs — src/index.ts | critical | missing-docs |
```

---

## Config Reference (.pm/code-health.yml)

Full config file with all options:

```yaml
# .pm/code-health.yml — Code health audit configuration
# All values are optional — built-in defaults apply for missing keys

thresholds:
  file_length:
    ts: 300        # TypeScript files
    tsx: 250       # React components
    sql: 500       # SQL files
    md: 400        # Markdown/docs
    default: 300   # Everything else

  function_density:
    max_exports: 10      # Warn above this
    cohesion_ratio: 0.3  # Critical below this (exports used together / total)

  test_coverage:
    critical_min_lines: 100  # Source files >100 lines without tests = critical
    warn_min_lines: 50       # Source files >50 lines without tests = warn

include:
  - "src/**"
  - "packages/**"
  - "apps/**"
  - "platform/**"
  - "dashboard/**"

exclude:
  - "node_modules/**"
  - "dist/**"
  - ".next/**"
  - "*.test.*"
  - "*.spec.*"
  - "__tests__/**"
  - "*.d.ts"
  - "*.config.*"

task_creation:
  sprint: "tech-debt"   # Sprint name for created tasks
  type: "docs"          # Task type
  horizon: "next"       # When to address (next sprint)
  dedup_prefix: "[code-health"  # Prefix for dedup keys in descriptions
```

---

## Integration Points

### tdd-agent (Phase 5 AUDIT, Step 3)

After the 3 audit subagents complete, tdd-agent runs code-health on changed files:

```
Scope: changed
Files: ${filesChanged}
Mode: non-blocking (findings reported but don't gate workflow)
```

Findings appear in the tdd-agent's final report under "Code Health" section.

### pm-agent (Phase 2.5 Pre-Task Checklist, Step 1)

Before translating specs into tasks, pm-agent runs a full code-health scan:

```
Scope: full
Mode: baseline (establishes current debt level before new work)
```

Results inform task planning — if a file is already flagged, new tasks touching it should include cleanup.

---

**Status**: ACTIVE
**Related Skills**: `tdd-agent` (post-audit hook), `pm-agent` (pre-task baseline)
**Config**: `.pm/code-health.yml` (optional)
**Database**: `.pm/tasks.db` (SQLite — tech-debt sprint)
