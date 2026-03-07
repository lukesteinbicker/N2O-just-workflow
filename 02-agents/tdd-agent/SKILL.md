---
name: tdd-agent
version: "1.0.0"
description: "Use when the user wants to implement sprint tasks using TDD. Triggers: implement task, tdd, test-driven development, task execution, implement feature, start working on task, pick next task, let's implement, build this feature, write tests first, red green refactor. This skill drives the RED → GREEN → REFACTOR → AUDIT → CODIFY → COMMIT cycle. NOT for planning (use pm-agent) or bug investigation (use bug-workflow)."
---

# TDD Agent

## Overview

This skill guides task implementation using Test-Driven Development:
- **TDD Workflow**: RED → GREEN → REFACTOR → AUDIT → CODIFY → COMMIT
- **Automated Audits**: Quality checks + 3 parallel Sonnet subagents (for auditing only)
- **Pattern Codification**: Document new patterns in `.claude/skills/`
- **Git Commits**: Conventional commits after each task (`./scripts/git/commit-task.sh`)
- **Database Tracking**: SQLite task state updates in `.pm/tasks.db` (gitignored, local)

**Task schema**: Tasks use `(sprint, task_num)` as primary key, not global `id`. Example:
```bash
# Initialize from seed
sqlite3 .pm/tasks.db < .pm/schema.sql
sqlite3 .pm/tasks.db < .pm/todo/crm/tasks.sql

# Query tasks
sqlite3 .pm/tasks.db "SELECT * FROM available_tasks WHERE sprint = 'crm-foundation';"

# Update status
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'done' WHERE sprint = 'crm-foundation' AND task_num = 5;"
```

**When to invoke**:
- When implementing sprint tasks (main chat or dedicated tabs)
- After PM loads tasks into `tasks.db`

**Key principle**: Pick unblocked tasks, implement with TDD, audit, codify learnings, repeat.

### Execution Model

**Main chat handles implementation**. Subagents are ONLY for auditing/scouting, not implementation.

| Activity | Where |
|----------|-------|
| Task implementation (RED/GREEN/REFACTOR) | Main chat |
| Quality checks (typecheck/lint) | Main chat |
| 3-subagent audits (Pattern/Gap/Testing) | Parallel subagents |
| Pattern codification | Main chat |
| Database updates | Main chat |

**Parallelism** (when tasks from same spec can run concurrently):
- User opens new tab for parallel task
- Each tab runs its own tdd-agent
- Sequential tasks stay in same chat

### Before You Start

**Read `CLAUDE.md`** for repo context, and **read `.pm/config.json`** for project commands:
- Test command: `$(jq -r '.commands.test' .pm/config.json)`
- Typecheck command: `$(jq -r '.commands.typecheck' .pm/config.json)`
- Lint command: `$(jq -r '.commands.lint' .pm/config.json)`
- Build command: `$(jq -r '.commands.build' .pm/config.json)`
- Database config: see `database` field in `.pm/config.json` and `CLAUDE.md`

**Don't assume** - verify with actual commands before claiming something works or doesn't work.

---

## Workflow Phases

```
Pick Task → RED → GREEN → REFACTOR → AUDIT ──────────────────────────┐
                                        ↓                            │
                                 [Testing Posture < A?]              │
                                        ↓ yes                        │
                                   FIX AUDIT ←───────────────────────┤
                                        ↓                            │
                                 Re-audit Testing ───────────────────┤
                                        ↓                (loop until A)
                                 [Still < A?] ───────────────────────┘
                                        ↓ no (A grade REQUIRED)
                                 Re-audit Pattern Compliance
                                        ↓
                              Update DB → CODIFY → [GATE: A?] → COMMIT → REPORT
                                                       ↑
                                              (blocks until A grade)
```

**Workflow phases per task**:
1. Pick available task
2. RED - Write failing tests + **self-check with Litmus Test** (prevent fake tests)
3. GREEN - Implement to pass
4. REFACTOR - Clean up code
5. AUDIT - Quality checks (typecheck/lint) + 3 subagents (Pattern/Gap/Testing)
6. FIX AUDIT - **Loop until A grade** (max 2 iterations), then re-audit Pattern Compliance
7. Update DB - Record findings
8. CODIFY - **Report patterns for user review** (don't auto-document)
9. COMMIT - Commit changes
10. REPORT - **Final report with audit findings, fixes applied, patterns found**
11. Move to next task

**Loop continuously**: Repeat phases 1-11 until no available tasks remain or all are blocked.

**CRITICAL: Do NOT truncate workflow**. Include ALL phases. Stopping at REFACTOR and omitting AUDIT/FIX/CODIFY/COMMIT/REPORT is incomplete.

**CRITICAL: Be explicit about workflow status**. After each phase, state what was done. If any phase is skipped or paused, state it explicitly with the reason:

```
## Workflow Status

| Phase | Status | Notes |
|-------|--------|-------|
| RED | ✓ | 21 tests written |
| GREEN | ✓ | All tests pass |
| REFACTOR | ✓ | Extracted helper function |
| AUDIT: Quality | ✓ | typecheck/lint pass |
| AUDIT: Pattern Compliance | ✓ | 0 violations, 2 new patterns |
| AUDIT: Gap Analysis | ✓ | 5/5 criteria met |
| AUDIT: Testing Posture | ✓ | Grade: A, 0 fake tests |
| FIX AUDIT | ✓ | 2 iterations, reached A grade |
| Update DB | ✓ | |
| CODIFY | ✓ | 2 patterns reported for review |
| COMMIT | ✓ | abc1234 |
| REPORT | ⏳ | Pending |

Next: Outputting final report
```

**MANDATORY**: Output this table at the end of each task. Missing subagent rows = incomplete workflow.

Do NOT silently skip phases. The user should always know where you are in the workflow.

---

## Phase 1: Pick Next Task

Query available tasks with no pending dependencies:

```bash
sqlite3 .pm/tasks.db "SELECT sprint, task_num, title, done_when FROM available_tasks WHERE sprint = 'SPRINT_NAME';"
```

**Selection criteria**:
- No unfinished dependencies (task only appears in `available_tasks` if dependencies are done)
- Status = 'pending'
- Not claimed by another agent (`owner IS NULL`)
- Clear "Done When" criteria

**Claim the task** before starting work (atomic — only one agent succeeds).

Use a developer name from the `developers` table when available, otherwise use the terminal/tab ID:

```bash
sqlite3 .pm/tasks.db "UPDATE tasks SET owner = 'developer-name' WHERE sprint = 'SPRINT_NAME' AND task_num = TASK_NUM AND status = 'pending' AND owner IS NULL; SELECT changes();"
```

If `changes()` returns `0`, another agent already claimed it. Pick a different task.

**Sync to PM tool** (if configured):
```bash
./scripts/sync/sync.sh claim $SPRINT $TASK_NUM
```

**If no tasks available**: Either all tasks are blocked/claimed, or sprint is complete. Report to planning agent.

---

## E2E Tasks

**If task is E2E** (spec contains `e2e` OR title starts with `E2E:`):

| Phase | E2E Workflow |
|-------|--------------|
| RED/GREEN/REFACTOR | Skip - follow `/testing-e2e` skill instead |
| AUDIT | **1 subagent only** (E2E quality check, not 3) |
| Update DB | Same as regular tasks |
| CODIFY | Skip unless genuinely new E2E pattern |
| COMMIT | Same as regular tasks |

**E2E Audit** (1 subagent):
- Tests follow Playwright best practices?
- No flaky selectors (prefer `data-testid`)?
- Proper waits (no arbitrary timeouts)?
- Happy path only (edge cases in component tests)?

**Skip for E2E**:
- Gap Analysis (E2E tests ARE the gap check)
- Pattern Compliance (patterns in testing-e2e skill)
- Testing Posture (meta - testing the tests)

---

## Phase 2: RED (Write Failing Test)

**Goal**: Write tests that verify the task's "Done When" criteria BEFORE implementing.

### Steps

1. **Read the task's "Done When" column** - this is your spec
2. **Write test(s)** that verify those criteria
3. **Self-check: Apply the Litmus Test** (see below - CRITICAL!)
4. **Run tests** - expect ALL to FAIL (red)
5. **Update database**:

### What Counts as RED?

**Proper RED**: Test RUNS but assertion FAILS because behavior doesn't exist yet.

**NOT RED** (fix these first):
- Import error (`Cannot find module`) → Create stub implementation first
- Compile error (TypeScript) → Fix types before claiming RED
- Syntax error → Fix test code

```typescript
// ❌ NOT RED - import error, test doesn't even run
// Error: Cannot find module '../lib/dedupe-messages'

// ✅ PROPER RED - test runs, assertion fails
// Expected: 3, Received: 5
// AssertionError: dedupeMessages did not remove duplicates
```

**Why this matters**: Import errors mean you haven't proven the test CAN fail. You might have a fake test that would pass once the module exists.

### Can't Reproduce? Escalate to bug-workflow

**If you can't write a failing test that reproduces the bug:**

```
tdd-agent: "I can't reproduce this bug in tests"
    ↓
Invoke /bug-workflow
    ↓
bug-workflow investigates (temp E2E tests, database queries, Neon logs)
    ↓
Updates task with hypothesis + reproduction steps
    ↓
Return to tdd-agent with clear path to RED
```

**Signs you need bug-workflow:**
- Task says "X is broken" but you can't make X fail in tests
- Bug only appears in browser, not in unit/integration tests
- Need to inspect network requests, console errors, or browser state
- Multiple services involved and unclear where failure originates

**tdd-agent does NOT include:**
- Claude-in-Chrome debugging (that's bug-workflow)
- Browser inspection, network tab analysis
- Deep log correlation across services

**Stay in tdd-agent if:**
- You can write a test that fails (even if you need to think about how)
- Bug is in pure logic, not browser/network behavior
- Task has clear reproduction steps already

```bash
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'red' WHERE id = TASK_ID;"
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'RED', '$(echo $CLAUDE_SESSION_ID)');"
```

### CRITICAL: Avoid Fake Tests

**Before running tests, apply The Litmus Test to EVERY test you wrote:**

> **"If I break the actual functionality, will this test fail?"**

If the answer is "no", the test is **fake** and must be rewritten NOW.

**Common fake tests to AVOID**:

```typescript
// ❌ BAD: Method existence check (always passes even if method is broken)
it('should have parseCSV method', () => {
  expect(typeof parseCSV).toBe('function');
  // This passes even if parseCSV throws errors or returns garbage!
});

// ❌ BAD: Truthy check without behavior (passes even with garbage data)
it('should return result', async () => {
  const result = await parseCSV(file);
  expect(result).toBeDefined();
  // This passes even if result is null, {}, or complete nonsense!
});

// ❌ BAD: Property existence (checks structure, not behavior)
it('should return object with headers property', async () => {
  const result = await parseCSV(file);
  expect(result).toHaveProperty('headers');
  // This passes even if headers is undefined, null, or wrong!
});

// ✅ GOOD: Behavior verification (fails if parseCSV is broken)
it('should parse CSV headers and rows', async () => {
  const file = createCSVFile('Name,Email\nJohn,john@example.com');
  const result = await parseCSV(file);

  expect(result.headers).toEqual(['Name', 'Email']);  // Real check!
  expect(result.rows[0]).toEqual({ Name: 'John', Email: 'john@example.com' });
  expect(result.totalRows).toBe(1);
  // If parseCSV breaks, this WILL fail. That's the point!
});

// ✅ GOOD: Edge case verification (fails if error handling breaks)
it('should throw on empty file', async () => {
  const file = createCSVFile('');
  await expect(parseCSV(file)).rejects.toThrow('CSV file is empty');
  // If error handling breaks, this WILL fail!
});
```

**Why fake tests are useless**:
- ❌ Give false confidence (you think it works when it doesn't)
- ❌ Won't catch bugs (defeats the purpose of testing)
- ❌ Create maintenance burden (tests to update that verify nothing)
- ❌ Will be caught in AUDIT phase anyway (wasted time)

**Prevent waste**: Catch fake tests NOW in Phase 2, not later in Phase 5 audits.

**Reference**: `.claude/skills/testing-unit/testing/fake-tests-antipattern.md`

### Skills to Reference

| Task Type | Skill |
|-----------|-------|
| Pure function/store tests | `testing-unit` |
| Component tests | `react-components` |
| Component styling | `ui-styling` |
| Server action tests | `server-actions` |
| User flow tests | `testing-e2e` |
| Database tests | `database` |

### Visual Debugging for Component Bugs (REQUIRED)

**For visual/layout bugs in components, you MUST use Storybook isolation first.**

| Bug Type | First Step | Then |
|----------|------------|------|
| Scroll issues (infinite scroll, overflow) | Storybook isolation | Fix → Unit test edge cases |
| Layout bugs (z-index, spacing, alignment) | Storybook isolation | Fix → Verify in full app |
| Hover/focus state issues | Storybook isolation | Fix → Maybe unit test |
| Logic errors (wrong data, calculations) | Unit test | Fix directly |
| Data transformation bugs | Unit test | Fix directly |

**The Visual RED Pattern**:
```
1. ISOLATE    Create story that reproduces the bug
2. CAPTURE    Screenshot the buggy state
3. CONFIRM    "Yes, I can see the bug in isolation"
4. FIX        Fix component, re-screenshot until correct
5. VERIFY     Confirm fix in full app context
```

**Why this is required**:
- Storybook provides **isolated** reproduction (no interference from other components)
- Bug reproduction is **permanent** (story stays in codebase)
- **Fast** feedback loop (no full app build)
- Can test **edge cases** easily (100 rows, long names, constrained heights)

**Signs you need Storybook isolation**:
- Bug involves scrolling, overflow, or container sizing
- Bug only appears at certain viewport sizes
- Bug involves z-index layering
- You need to *see* the bug to understand it

**Skip Storybook if**:
- Bug is pure logic (wrong calculation, missing validation)
- Bug is in data transformation (Zustand, hooks)
- Bug is page-composition issue (component works in isolation)
- You already have a failing unit test

**Reference**: `react-components/testing/visual-debugging.md` for full Visual RED pattern.

**AUDIT CHECK**: Testing Posture audit will flag if a visual/layout bug was fixed without Storybook isolation evidence. Evidence = story file or screenshot in workflow status.

### E2E vs Component Tests

**CRITICAL**: E2E tests are expensive (slow, flaky). Use sparingly.

- **E2E**: Happy path only (see `testing-e2e` skill)
- **Component tests (RTL)**: Edge cases, validation errors, error handling

**Rule**: If tempted to write E2E for edge cases, use component tests instead. E2E is 60x slower.

### Example

```typescript
// Task: "Create parseCSV utility"
// Done When: "Returns headers, rows, totalRows; handles edge cases"

describe('parseCSV', () => {
  it('should parse simple CSV file', async () => {
    const file = createCSVFile('Name,Email\nJohn,john@example.com');
    const result = await parseCSV(file);

    expect(result.headers).toEqual(['Name', 'Email']);
    expect(result.rows).toHaveLength(1);
    expect(result.totalRows).toBe(1);
  });

  it('should throw on empty file', async () => {
    const file = createCSVFile('');
    await expect(parseCSV(file)).rejects.toThrow('CSV file is empty');
  });

  // Add tests for all edge cases mentioned in "Done When"
});
```

**Critical**: Tests must fail at this point. If they pass, you're not testing the right thing.

---

## Phase 3: GREEN (Make It Pass)

**Goal**: Implement minimal code to pass tests. No optimization yet.

### Steps

1. **Implement** just enough to make tests pass
2. **Run tests** - expect ALL to PASS (green)
3. **Update database**:

```bash
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'green' WHERE id = TASK_ID;"
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'GREEN', '$(echo $CLAUDE_SESSION_ID)');"
```

### Frontend Review (after GREEN for frontend tasks)

If the task has `type: frontend`, invoke `/frontend-review` on the affected page after reaching GREEN.

**Prerequisites check** (verify before invoking):
1. Dev server running at configured port — if not, warn: `"⚠️ Dev server not running. Start it with '{dev_server_command}' before frontend review can run."`
2. `@playwright/test` and `@axe-core/playwright` in `package.json` — if missing, warn: `"⚠️ Playwright not installed. Run: npm install -D @playwright/test @axe-core/playwright && npx playwright install chromium"`
3. `.claude/review-config.json` exists — if missing, warn: `"⚠️ No review config found. Copy from templates/review-config.json.example to .claude/review-config.json"`

If any prerequisite fails, **log the specific warning** and continue to REFACTOR. Do not silently skip.

### Important Constraints

- ❌ Don't optimize or add features beyond the task
- ❌ Don't refactor yet
- ✅ Just make the tests pass with minimal code

**Why minimal?** Refactoring comes next. Get to green first.

---

## Phase 4: REFACTOR (Clean Up)

**Goal**: Improve code quality without changing behavior.

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'REFACTOR', '$(echo $CLAUDE_SESSION_ID)');"
```

### Steps

1. **Improve naming, structure, types**
2. **Extract duplicated logic**
3. **Add JSDoc** if complex
4. **Run tests** - must still PASS
5. **No database update** (still green)

### Skills to Reference

Check the relevant skill for patterns:
- `react-components` for component structure
- `server-actions` for action patterns
- `database` for migration/RLS patterns
- `state-management` for Zustand store patterns

### Common Refactorings

- Extract magic numbers to constants
- Improve variable names
- Split large functions (>50 lines)
- Add type annotations where inference fails
- Remove dead code

**Critical**: Tests must still pass after refactoring. Run them frequently.

---

## Phase 5: AUDIT (Quality Checks + 3 Subagents)

**Goal**: Ensure code meets quality standards and follows patterns.

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'AUDIT', '$(echo $CLAUDE_SESSION_ID)');"
```

> **⚠️ STOP: Quality checks alone are NOT sufficient!**
>
> Passing `typecheck` and `lint` does NOT complete the AUDIT phase.
> You MUST also run **3 subagent audits** (Pattern Compliance, Gap Analysis, Testing Posture).
> Skipping subagents = incomplete workflow. The workflow status table will show missing rows.

### Step 1: Run Quality Checks (Required)

**Always run first** (commands from `.pm/config.json`):

```bash
$(jq -r '.commands.typecheck' .pm/config.json)  # Must pass (zero errors)
$(jq -r '.commands.lint' .pm/config.json)        # Must pass (zero warnings)
```

**For significant changes**:

```bash
$(jq -r '.commands.build' .pm/config.json)  # Must succeed
```

**If checks fail**: **STOP**. Fix all errors before proceeding to subagent audits.

- **Typecheck errors**: Fix type issues (no `any` casts)
- **Lint warnings**: Fix all warnings manually (never use unsafe auto-fix)
- **Build errors**: Resolve module/export issues

### Step 2: Spin Up 3 Subagents (MANDATORY)

**After quality checks pass**, spawn **3 parallel Task tools** using the prompts in `subagent-prompts/task/`.

**How to invoke** (all 3 in a single message for parallelism):

```
1. Read subagent-prompts/task/pattern-compliance.md
2. Read subagent-prompts/task/gap-analysis.md
3. Read subagent-prompts/task/testing-posture.md
4. Substitute variables: ${taskId}, ${taskTitle}, ${filesChanged}, ${doneWhen}, ${testFiles}, ${implFiles}
5. Invoke 3 Task tools in ONE message (parallel execution):
   - Task(subagent_type='general-purpose', model='sonnet', description='Pattern Compliance audit', prompt=...)
   - Task(subagent_type='general-purpose', model='sonnet', description='Gap Analysis audit', prompt=...)
   - Task(subagent_type='general-purpose', model='sonnet', description='Testing Posture audit', prompt=...)
```

**3 Audits**:
| Audit | Purpose | Output |
|-------|---------|--------|
| **Pattern Compliance** | Verify follows `.claude/skills/` patterns, identify new patterns | violations, new_patterns |
| **Gap Analysis** | Find missing functionality vs "Done When" criteria | criteria_met, gaps |
| **Testing Posture** | Check test quality, apply Litmus Test for fake tests | grade (A-F), fake_tests |

### When to Audit

**Run audits for**:
- New features
- Refactoring
- Infrastructure changes
- Anything touching >1 file

**Skip audits for**:
- Trivial changes (typo fixes, single-line)
- Test-only changes
- Blocked/pending tasks

### Step 3: Code Health Scan (Non-Blocking)

**After subagent audits complete**, run `/code-health` on changed files. This is **informational only** — findings do not block the workflow.

```
Scope: changed
Files: ${filesChanged}
```

Invoke the code-health skill with `changed` scope, passing the list of files modified in this task. Code-health spawns 6 parallel subagents (file length, missing docs, function density, circular deps, dead exports, test coverage gaps).

**What happens with findings**:
- Findings appear in the final report under a "Code Health" section
- `tech-debt` tasks are created for critical/warn findings (deduplicated)
- Findings **never block** the TDD workflow — the task proceeds to Phase 6

**Include in final report** (Phase 10):
```
## Code Health (changed files)

| Check | Critical | Warn | Info |
|-------|----------|------|------|
| ...   | ...      | ...  | ...  |

Tasks created: N new, M skipped (existing)
```

### Why Audits Matter

Manual checklists get skipped. Subagents ensure:
- **Systematic**: Same checks every time
- **Thorough**: Dedicated analysis, not rushed
- **Documented**: Results stored in database
- **Automated**: Can't be forgotten

---

## Phase 6: Update tasks.db

**After audits complete**, consolidate findings and update the database:

```bash
sqlite3 .pm/tasks.db "UPDATE tasks SET
  tests_pass = TRUE,
  testing_posture = '${grade}',
  pattern_audited = TRUE,
  pattern_audit_notes = '${consolidatedNotes}',
  skills_updated = ${hasNewPatterns},
  skills_update_notes = '${skillUpdates}'
WHERE sprint = '${sprint}' AND task_num = ${taskNum};"
```

### Consolidated Notes Format

```
PATTERN AUDIT: [violations: 0 | new patterns: 3]
GAP ANALYSIS: [criteria met: 5/5 | gaps: 1 moderate]
TESTING POSTURE: [quality: A- | fake tests: 2 | coverage: 92%]

ACTION ITEMS:
1. [Critical] Remove fake test at line X
2. [Moderate] Add error handling for edge case Y
3. [Low] Document pattern Z in testing-unit skill
```

**Include**:
- Summary of each audit (violations, gaps, quality grade)
- Action items with severity
- What skills were updated (if any)

---

## Phase 8: CODIFY (Report Patterns for Review)

**Report patterns found, don't auto-document.** User reviews and decides what to codify.

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'CODIFY', '$(echo $CLAUDE_SESSION_ID)');"
```

### Output Format: Pattern Report

For each pattern found, explain concisely:

```
PATTERNS FOUND (for your review):

1. **Testing Large File Operations**
   - Problem: Loading large files in tests causes timeout/OOM
   - Solution: Stream/chunk files, test with smaller samples
   - Target skill: testing-unit
   - Reusability: High (any file >10MB)

2. **Mock File Creation Utilities**
   - Problem: Creating test files is repetitive
   - Solution: createTestFile() helper with common formats
   - Target skill: testing-unit
   - Reusability: High (all file upload tests)

User action: Approve patterns to codify, or defer to backlog.
```

**Why report-only?** User often wants to review patterns before they're added to skills. Prevents skill bloat from auto-codification.

### Codification Criteria (Is This Worth Documenting?)

**CODIFY patterns that are**:
- ✅ **Reusable** - Will be used by 3+ future tasks
- ✅ **Non-obvious** - Not well-known or documented elsewhere
- ✅ **Framework/library-specific** - Specific to our stack (Next.js 15, React 19, Zustand, TanStack Query, etc.)
- ✅ **Architectural** - Affects how we structure code (feature packages, server actions, RLS patterns)
- ✅ **Error-prone** - Common gotchas or mistakes others will make

**DO NOT codify patterns that are**:
- ❌ **One-off** - Specific to single feature/component, unlikely to reuse
- ❌ **Trivial** - Well-known or obvious (e.g., "use ESLint", "add error handling")
- ❌ **Library documentation** - Already well-documented in official docs (e.g., "PapaParse has a streaming mode")
- ❌ **Too specific** - Highly contextual with narrow applicability (e.g., "escape pipes in markdown tables for CSV preview")
- ❌ **Implementation detail** - Business logic, not reusable pattern

### Examples: Codify vs Skip

| Pattern | Codify? | Reasoning |
|---------|---------|-----------|
| "Stream large CSV files with PapaParse" | ❌ Skip | Library documentation. Just link to PapaParse docs instead. |
| "Escape markdown table cells for CSV preview" | ❌ Skip | Too specific, one-off use case for CSV preview feature. |
| "Test React Server Components with async data" | ✅ Codify | Non-obvious, affects many future RSC tests. |
| "RLS policy pattern for company-scoped data" | ✅ Codify | Architectural, used by every new table. |
| "Mock TanStack Query hooks in component tests" | ✅ Codify | Error-prone, needed for every component using queries. |
| "Zustand store with localStorage persistence" | ✅ Codify | Framework-specific pattern we'll use repeatedly. |
| "Use `createSecureAction` for server actions" | ✅ Codify | Architectural standard for all server actions. |
| "Add console.log for debugging" | ❌ Skip | Trivial, obvious, not a pattern. |

### Where to Document (Skill File Selection)

**Use existing skill files**:
- Most patterns belong in existing skills
- Add to relevant section (create new section if needed)
- Don't create new files unless you have 10+ related patterns

**Skill file structure**:
```
.claude/skills/
├── testing-unit/
│   ├── SKILL.md              # Main patterns
│   └── testing/
│       └── fake-tests-antipattern.md  # Deep dive on specific topic
├── react-components/
│   ├── SKILL.md
│   └── building/
│       ├── forms.md          # 20+ form patterns
│       └── datatable.md      # 15+ DataTable patterns
```

**Create new file when**:
- Pattern collection is 10+ related patterns (e.g., `forms.md`, `datatable.md`)
- Needs deep explanation (e.g., `fake-tests-antipattern.md`)
- Doesn't fit existing skill structure

### When to Codify

**Codify when audit reports patterns AND they pass criteria above**:
- Pattern Compliance subagent found `new_patterns`
- You manually identified a reusable, non-obvious pattern
- Pattern passes the "3+ future tasks" test

**Skip codification when**:
- No new patterns discovered
- All patterns already documented
- Patterns are too specific/niche (see criteria above)

### Applying Judgment

**Subagent flagged patterns you disagree with?**

The Pattern Compliance subagent suggests patterns, but **you have final judgment**:

```bash
# Subagent suggests: "Escape markdown table cells for CSV preview"
# Your assessment: Too specific, one-off use case
# Decision: Skip codification, update database notes

sqlite3 .pm/tasks.db "UPDATE tasks SET
  skills_updated = FALSE,  # Override subagent
  skills_update_notes = 'Pattern flagged but deemed too specific for codification'
WHERE id = ${taskId};"
```

**When to override subagent**:
- Pattern fails "3+ future tasks" test
- Already covered in library documentation (just add comment with link)
- Too implementation-specific
- Would clutter skill file with noise

**When to trust subagent**:
- You're unsure about reusability
- Pattern involves framework internals (Next.js, React)
- Multiple similar patterns could benefit future tasks
- Error you debugged that others will hit

**Rule of thumb**: If you debate whether to codify for >1 minute, skip it. Truly valuable patterns are obvious.

---

### Codification Guidelines

**See**: `codify/antipatterns.md` for detailed guidance on what NOT to document.

**Quick rules**:
- ✅ Reusable (3+ tasks), non-obvious, framework-specific
- ❌ One-off, library docs, trivial, too specific

**Target length**: 10-30 lines per pattern (not 100+ lines)

---

### Codification Process

**When**: New patterns discovered AND pass criteria (reusable, non-obvious, etc.)

**Process**: See `codify/process.md` for step-by-step guide

**Quick steps**:
1. Review audit findings
2. Identify target skill
3. Read skill structure
4. Add pattern (10-30 lines)
5. Update database

## Phase 6: FIX AUDIT (Loop Until A Grade)

**Target: A grade in Testing Posture.** Loop until achieved (max 2 iterations).

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id, metadata) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'FIX_AUDIT', '$(echo $CLAUDE_SESSION_ID)', '{\"reason\": \"${auditGrade}\", \"findings\": \"${auditFindings}\"}');"
```

**Metadata fields**: `reason` is the audit grade that triggered the fix (e.g., "B", "C"), and `findings` lists the specific issues found (e.g., "2 fake tests, 1 weak assertion").

### A Grade Definition

| Criteria | A Grade | Below A |
|----------|---------|---------|
| Fake tests | 0 | Any fake tests |
| Assertions | All verify behavior | Existence checks (toBeDefined, toHaveProperty) |
| Weak assertions | 0 | Truthy checks without content verification |
| Coverage | >85% on changed code | Gaps in error handling, edge cases |

### FIX AUDIT Loop

```
Iteration 1:
  1. Review Testing Posture findings
  2. Fix all violations (fake tests, weak assertions, coverage gaps)
  3. Re-run quality checks (typecheck/lint)
  4. Re-run Testing Posture subagent ONLY (pass prior findings as context)
  5. If A grade → exit loop
  6. If < A grade → Iteration 2

Iteration 2+:
  1. Fix remaining issues
  2. Re-run Testing Posture with prior trace
  3. If still < A → continue to next iteration

Hard block (after 3+ iterations without reaching A):
  - STOP workflow - DO NOT COMMIT
  - Document why A grade is not achievable
  - Ask user for guidance (proceed with lower grade? adjust criteria?)
```

### Re-audit Testing Posture (Context-Aware)

Pass the prior audit trace to avoid duplicate work:

```
TESTING POSTURE RE-AUDIT (Iteration ${n})

Prior findings from Iteration ${n-1}:
${priorFindings}

Files changed since last audit:
${changedFiles}

Focus: Verify fixes addressed prior issues. Check for new issues introduced.
```

### After A Grade: Re-audit Pattern Compliance

**Why**: Fixing test posture often involves refactoring → may introduce pattern violations.

After reaching A grade (or max iterations), run Pattern Compliance subagent:
- Feed it the fixes made during FIX AUDIT
- Verify refactoring didn't break patterns
- If new violations → fix before proceeding (no loop, just fix once)

### Action Item Prioritization

| Severity | Action |
|----------|--------|
| **Critical** | Fix now (blocks A grade) |
| **Moderate** | Fix in loop if time permits |
| **Minor** | Document in final report, don't block |

**Create follow-up tasks** in `.wm/` for minor items that can be deferred.

---

## Phase 9: COMMIT

**GATE: Testing Posture MUST be A grade before committing.**

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'COMMIT', '$(echo $CLAUDE_SESSION_ID)');"
```

If Testing Posture < A: DO NOT commit. Return to FIX AUDIT loop.

After FIX AUDIT achieves A grade and CODIFY report is ready:

```bash
./scripts/git/commit-task.sh TASK_ID
```

**Sync completion to PM tool** (if configured):
```bash
./scripts/sync/sync.sh complete $SPRINT $TASK_NUM
```

---

## Phase 10: FINAL REPORT (Critical)

**The final report is the primary deliverable.** It tells the user what happened, what was fixed, and what patterns were found.

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'REPORT', '$(echo $CLAUDE_SESSION_ID)');"
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, metadata) VALUES ('${sprint}', ${taskNum}, 'task_completed', 'tdd-agent', 'REPORT', '{\"status\": \"completed\"}');"
```

### Report Structure

```
TDD Workflow: RED → GREEN → REFACTOR → AUDIT → FIX → COMMIT ✓

## Summary
- Tests: X pass, Y% coverage
- Quality: typecheck ✓, lint ✓
- Files: N created, M modified

## Audit Results
- Pattern Compliance: [grade] - [summary]
- Gap Analysis: [X/Y criteria met]
- Testing Posture: [grade] - [summary]

## FIX AUDIT (if applicable)
- Iteration 1: Fixed [N issues] - [summary]
- Iteration 2: Fixed [M issues] - [summary]
- Final grade: A

## Patterns Found (for your review)
1. **Pattern Name**
   - Problem: [what problem it solves]
   - Solution: [how to solve it]
   - Target skill: [which skill]
   - Reusability: [High/Medium/Low]

2. **Another Pattern**
   - ...

## Remaining Issues (if any)
- [Minor items deferred to backlog]

## Commit
[commit hash] - [commit message]

## Final Audit Summary (REQUIRED)
Restate these before closing:
- **Testing Posture**: [grade] (must be A to commit)
- **Patterns Found**: [list patterns identified for potential codification]
- **Patterns Codified**: [list patterns actually added to skills, or "none"]
```

### Task Completion Checklist

✅ **status = 'green'** - Implementation complete
✅ **tests_pass = TRUE** - All tests passing
✅ **testing_posture = 'A'** - **REQUIRED** (no commit without A grade)
✅ **pattern_audited = TRUE** - All audits complete (including re-audits)
✅ **Patterns reported** - User has list to review

### Verify Task State

```bash
# Confirm task is complete
sqlite3 .pm/tasks.db "SELECT status, tests_pass, testing_posture, pattern_audited FROM tasks WHERE sprint = 'SPRINT' AND task_num = TASK_NUM;"

# Expected output:
# green|1|A|1
```

### What "Done" Means

| Perspective | "Done" Criteria |
|-------------|-----------------|
| **Dev Agent** | `status='green'` + `tests_pass=TRUE` + `testing_posture='A'` + `pattern_audited=TRUE` |
| **Planning Agent** | All tasks green, sprint-end E2E/manual verification passes |

**Dev agent completion checklist**:
- `status='green'` - Implementation complete
- `tests_pass=TRUE` - All tests passing
- `testing_posture='A'` - **REQUIRED** (no commit without A grade)
- `pattern_audited=TRUE` - 3-subagent audit complete

---

### Git Discipline

**One task = one commit (after squash).** All commits must be tagged for grouping.

**NEVER add task references in source code.** Task IDs belong in commit messages only.

```typescript
// ❌ BAD - Littering source with task references
// Task #105: Context injection
function buildSystemPrompt() { ... }

// ❌ BAD - Task references in JSDoc
/**
 * Build system prompt with context injection
 * @see Task #105
 */

// ✅ GOOD - Clean code, task reference in commit message only
function buildSystemPrompt() { ... }
// Commit: feat(agent-refactor): wire context injection (Task #105)
```

**Why**: Task IDs are metadata for project management, not documentation. They clutter code and become stale. Git history is the source of truth for task→code mapping.

#### Staging Discipline (Concurrent Agents)

**NEVER use `git add .`** - multiple agents may work concurrently. Stage files explicitly:

```bash
git add path/to/your/file.ts  # Stage YOUR files only
git diff --cached --name-only  # Verify before commit
./scripts/git/commit-task.sh polish-robustness 1
```

Commit scripts error if nothing staged (won't auto-stage).

#### Commit Tag Formats

| Tag | Use Case | Script |
|-----|----------|--------|
| `(Task #N)` | Task-tracked work (sprint-scoped) | `./scripts/git/commit-task.sh <sprint> <num>` |
| `(Sprint: name)` | Sprint-level work | `./scripts/git/commit-sprint.sh` |
| `(hotfix)` | Urgent bug fixes (no task number) | `./scripts/git/commit-hotfix.sh` |
| `(docs)` | Documentation | `./scripts/git/commit-docs.sh` |
| `(chore)` | Maintenance/cleanup | `./scripts/git/commit-chore.sh` |

#### Commit Scripts

**Single-line messages only** — no commit body. Details live in tasks.db and git diff.

```bash
# Task work (queries tasks.db for title using sprint + task_num)
./scripts/git/commit-task.sh crm-foundation 5
# → feat(sprint-name): add foreign key migration (Task #5)

# Sprint-level work (no specific task)
./scripts/git/commit-sprint.sh agent-refactor "fix lint errors"
# → chore(agent-refactor): fix lint errors (Sprint: agent-refactor)

# Hotfix (urgent bug fix)
./scripts/git/commit-hotfix.sh "null check in auth"
# → fix(auth): null check in auth (hotfix)

# Documentation
./scripts/git/commit-docs.sh "update API examples"
# → docs(readme): update API examples (docs)

# Maintenance/cleanup
./scripts/git/commit-chore.sh "fix lint errors"
# → chore(repo): fix lint errors (chore)
```

#### Enforcement

A `commit-msg` hook validates format. Install with `./scripts/setup-hooks.sh`.

- **Bypass**: `git commit --no-verify` (emergencies only)
- **End of sprint**: `./scripts/git/squash-sprint.sh` consolidates commits per task

#### Why Tags Matter

- `git log --grep="Task #105"` finds all commits for a task
- Sprint-end squash groups by tag → one commit per task
- Clean history: 50 commits during sprint → 10 commits after squash

---

### Move to Next Task

```bash
# Task is complete, find next available task
sqlite3 .pm/tasks.db "SELECT id, title, done_when FROM available_tasks WHERE sprint = 'SPRINT_NAME' LIMIT 10;"

# Pick next task and repeat workflow (Phase 1 → Phase 9)
```

### When All Tasks Are Done

```bash
# Check sprint progress
sqlite3 .pm/tasks.db "SELECT * FROM sprint_progress WHERE sprint = 'SPRINT_NAME';"

# If all tasks are green + audited:
# - Report to planning agent: "All tasks complete, ready for sprint-end verification"
# - Planning agent will run E2E tests, mark verified=TRUE, close sprint
```

### When a Spec Is Complete

When all tasks for a single spec are green, run the **spec completion audit** before closing out.

**See**: `templates/spec-completion-report.md` for full process (3 Sonnet subagents using prompts from `subagent-prompts/spec/`)

---

## Error Handling

### If Tests Won't Pass

```bash
sqlite3 .pm/tasks.db "UPDATE tasks SET
  status = 'blocked',
  blocked_reason = 'Description of blocker (e.g., missing dependency, API change)'
WHERE id = TASK_ID;"
```

**Then**:
- Document blocker clearly in database
- Sync to PM tool: `./scripts/sync/sync.sh blocked $SPRINT $TASK_NUM`
- Report blocker to planning agent (they can unblock or adjust dependencies)
- Move to another available task

### If Audit Finds Critical Gaps

- **Fix critical gaps** before proceeding to next task
- **Document moderate/minor gaps** in `.wm/` or as new tasks
- **Update `pattern_audit_notes`** with what was addressed

### If No Available Tasks

**Possible reasons**:
1. All tasks blocked - report blockers to planning agent
2. All tasks complete - report sprint completion
3. Missing dependencies - planning agent needs to adjust dependency graph

**Query blockers**:
```bash
sqlite3 .pm/tasks.db "SELECT id, title, blocked_reason FROM tasks WHERE sprint = 'SPRINT_NAME' AND status = 'blocked';"
```

---

## Database Schema Reference

### Task Columns (Dev Agent Updates)

| Column | Type | Dev Agent Updates |
|--------|------|-------------------|
| `status` | TEXT | ✅ Set to 'red', 'green', 'blocked' |
| `blocked_reason` | TEXT | ✅ Set when blocking task |
| `pattern_audited` | BOOLEAN | ✅ Set to TRUE after 3-subagent audit |
| `pattern_audit_notes` | TEXT | ✅ Consolidated audit findings |
| `skills_updated` | BOOLEAN | ✅ TRUE if new patterns documented |
| `skills_update_notes` | TEXT | ✅ What skills were updated |
| `tests_pass` | BOOLEAN | ✅ Set to TRUE when all tests pass |
| `testing_posture` | TEXT | ✅ Grade: A, B, C, D, F (target: A for completion) |

---

## Common Queries (Dev Agent)

```bash
# Next available task (no pending dependencies)
sqlite3 .pm/tasks.db "SELECT id, title, done_when FROM available_tasks WHERE sprint = 'SPRINT_NAME' LIMIT 10;"

# Tasks needing audit (green but not audited) - should be empty if you're doing your job!
sqlite3 .pm/tasks.db "SELECT * FROM needs_pattern_audit WHERE sprint = 'SPRINT_NAME';"

# Sprint progress overview
sqlite3 .pm/tasks.db "SELECT * FROM sprint_progress WHERE sprint = 'SPRINT_NAME';"

# Blocked tasks (to report to planning agent)
sqlite3 .pm/tasks.db "SELECT id, title, blocked_reason FROM tasks WHERE sprint = 'SPRINT_NAME' AND status = 'blocked';"

# Get full task details
sqlite3 .pm/tasks.db "SELECT * FROM tasks WHERE id = TASK_ID;"
```

---

## Skills Cross-Reference

**Consult these skills during implementation:**

| Task Type | Skill to Invoke |
|-----------|-----------------|
| UI components | `/react-components` |
| TanStack Query hooks | `/hooks` |
| Server actions | `/server-actions` |
| Database migrations | `/database` |
| E2E tests | `/testing-e2e` |
| Unit tests | `/testing-unit` |
| API routes | Next.js API routes |
| Zustand stores | `/state-management` |
| Feature packages | `/app-structure` |
| Domain knowledge | Your domain-specific skill (if any) |

---

## Example: Complete Task Execution

```bash
# 1. Pick task
sqlite3 .pm/tasks.db "SELECT id, title, done_when FROM available_tasks WHERE sprint = 'agent-foundation';"
# Result: Task 1 - Create parseCSV utility

# 2. RED: Write failing tests
# ... write 21 tests in parser.test.ts

# SELF-CHECK: Apply Litmus Test BEFORE running tests
# Review each test: "If parseCSV breaks, will this test fail?"
# - "should have parseCSV function" → FAKE! Remove it.
# - "should return defined result" → FAKE! Remove it.
# - "should parse headers correctly" → REAL! Keep it.
# Rewrite 2 fake tests to verify behavior instead

$N2O_TEST_CMD packages/core  # All fail ✓ (19 real tests, removed 2 fake ones)
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'red' WHERE id = 1;"

# 3. GREEN: Implement
# ... write parseCSV function in index.ts
$N2O_TEST_CMD packages/core  # All pass ✓
sqlite3 .pm/tasks.db "UPDATE tasks SET status = 'green' WHERE id = 1;"

# 4. REFACTOR: Clean up
# ... improve naming, extract constants
$N2O_TEST_CMD packages/core  # Still pass ✓

# 5. AUDIT: Quality checks + 3 subagents
# Step 1: Quality checks (must pass before subagents)
$N2O_TYPECHECK_CMD  # Pass ✓
$N2O_LINT_CMD       # Pass ✓

# Step 2: Spin up 3 subagents in parallel
# ... run parallel audits
# Pattern Compliance: 0 violations, 6 new patterns discovered
# Gap Analysis: csv-import migration not done (deferred to future task)
# Testing Posture: 0 fake tests (caught and fixed in Phase 2 self-check!), coverage 92%

# 6. Update database with consolidated findings
sqlite3 .pm/tasks.db "UPDATE tasks SET
  pattern_audited = TRUE,
  pattern_audit_notes = 'Pattern: A+ (0 violations, 6 new patterns) | Gap: 1 deferred (csv-import migration) | Testing: A grade, 92% coverage, 0 fake tests',
  skills_updated = TRUE,
  skills_update_notes = 'Added 6 CSV parsing patterns to testing-unit skill'
WHERE id = 1;"

# 7. CODIFY: Review subagent suggestions and apply judgment
# Subagent flagged 6 patterns. Let's evaluate each:

# ❌ "CSV Parsing with Streaming" - Library doc (PapaParse), skip
# ❌ "Handling CSV Headers with Special Characters" - Too specific, skip
# ✅ "Testing Large File Parsing without Loading into Memory" - Reusable pattern!
# ✅ "Mock File Creation for Tests" - Will use in many tests
# ❌ "Error Handling for Malformed CSV" - Implementation detail, skip
# ❌ "Progress Tracking for Long Parses" - Too specific to this feature, skip

# Decision: Codify 2 patterns out of 6 suggested

# Read testing-unit skill to find right section
cat .claude/skills/testing-unit/SKILL.md | grep -A 5 "Testing"

# Add 2 patterns to testing-unit skill:
# 1. Testing Large File Operations (Task #1)
#    Problem: Loading large files in tests causes timeout/OOM
#    Solution: Stream/chunk files, test with smaller samples
#    Pattern: [code example]
#    When to use: Any file >10MB in tests

# 2. Mock File Creation Utilities (Task #1)
#    Problem: Creating test files is repetitive
#    Solution: createTestFile() helper with common formats
#    Pattern: [code example]
#    When to use: All file upload tests

# Use Edit tool to add patterns
# ... add to .claude/skills/testing-unit/SKILL.md

# Update database with realistic count
sqlite3 .pm/tasks.db "UPDATE tasks SET
  skills_update_notes = 'Added 2 patterns to testing-unit (testing large files, mock file helpers). Skipped 4 library/specific patterns.'
WHERE id = 1;"

# Verify patterns were added
grep -A 10 "Testing Large File Operations" .claude/skills/testing-unit/SKILL.md

# 8. Fix violations
# No violations found! (Fake tests were caught in Phase 2 self-check)

# 9. DONE - Verify task completion
sqlite3 .pm/tasks.db "SELECT status, pattern_audited, skills_updated FROM tasks WHERE id = 1;"
# Output: green|1|1 ✓

# Task is complete! Criteria met:
# ✅ status='green' - Tests pass
# ✅ pattern_audited=TRUE - Audit complete
# ✅ skills_updated=TRUE - Patterns codified
# ✅ No critical violations - Prevented fake tests in Phase 2

# Move to next task
sqlite3 .pm/tasks.db "SELECT id, title, done_when FROM available_tasks WHERE sprint = 'agent-foundation';"
# Result: Task 2 - Create InvestorImportDialog component
# ... repeat workflow (Phases 1-9)
```

---

## Task Execution Loop

**Dev agent workflow (repeat until no available tasks)**:

```
while (has_available_tasks) {
  task = pick_next_task()

  // TDD
  write_failing_tests()  // RED (Phase 2)
  implement()            // GREEN (Phase 3)
  refactor()             // REFACTOR (Phase 4)

  // Audit (Quality + Subagents)
  run_quality_checks()      // Phase 5: typecheck/lint
  run_3_subagent_audits()   // Phase 5: Pattern/Gap/Testing

  // FIX AUDIT Loop (target: A grade)
  iteration = 0
  while (testing_posture < A && iteration < 2) {
    fix_testing_issues()           // Fix fake tests, weak assertions
    rerun_testing_posture_audit()  // Pass prior findings as context
    iteration++
  }
  rerun_pattern_compliance()  // Verify fixes didn't break patterns

  // Record
  update_database()  // Phase 7: Record all findings

  // Codify (report only)
  report_patterns_for_review()  // Phase 8: User decides what to document

  // Commit + Report
  commit_changes()        // Phase 9: git commit
  output_final_report()   // Phase 10: Full audit + fixes + patterns report
}

report_to_planning_agent("Sprint complete" | "All tasks blocked")
```

---

## Separation of Concerns

### PM Role (`pm-agent` skill):
- Create specs
- Break specs into tasks
- Set dependencies
- Monitor sprint progress
- Unblock tasks
- Verify sprint completion

### Implementation Role (this skill):
- **Pick available tasks** from `tasks.db`
- **Implement with TDD** (RED → GREEN → REFACTOR)
- **Run quality checks** (typecheck/lint)
- **Execute 3-subagent audits** (Pattern/Gap/Testing)
- **FIX AUDIT loop** until A grade in Testing Posture (max 2 iterations)
- **Re-audit Pattern Compliance** after fixes
- **Update tasks.db** with status and findings
- **Report patterns** for user review (don't auto-document)
- **Commit changes** and output final report
- **Report blockers** to PM
- **Repeat** until no available tasks

### Subagents (Auditing Only)
- Pattern Compliance audit (initial + after FIX AUDIT)
- Gap Analysis audit (initial only)
- Testing Posture audit (initial + each FIX AUDIT iteration)

Subagents are NOT for implementation - only for audit work after task is green.

---

**Status**: ACTIVE
**Related Skill**: `pm-agent` (for planning/PM work)
**Database**: `.pm/tasks.db` (SQLite via Bash)
