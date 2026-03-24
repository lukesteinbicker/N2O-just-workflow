---
name: debug
version: "1.0.0"
description: "Use when the user reports a bug or needs help investigating unexpected behavior. Triggers: found a bug, bug report, something's broken, this doesn't work, investigate this bug, be my debugging partner, help me debug, manual verification failed, why is this failing, unexpected behavior, regression. Investigates root cause and generates tasks — does NOT write fixes (use tdd-agent for that)."
---

# Bug Workflow

**Investigate bugs, find root cause, generate tasks.** Parallel to pm-agent (specs → tasks), this skill handles bugs → tasks.

```
pm-agent:  spec → tasks
bug-workflow: bug  → tasks
tdd-agent: task → code
```

## When to Use

**Primary trigger: tdd-agent escalates here when RED phase fails.**

```
tdd-agent tries to write failing test
    ↓ can't reproduce the bug?
bug-workflow investigates (temp E2E tests, database queries, Neon logs)
    ↓ finds root cause
task updated with hypothesis
    ↓
back to tdd-agent (now can write RED)
```

**Invoke when:**
- tdd-agent can't reproduce bug in tests
- PM describes bug but root cause is unclear
- Need browser debugging (temp E2E test with screenshots + console capture)
- Container failures, database state problems
- Database state problems

**Capabilities (that tdd-agent doesn't have):**
- Temp E2E test debugging (screenshots, console capture, network logging)
- Deep log tracing across services
- Database query investigation
- Multi-service correlation

**Do NOT use for:**
- Bugs with obvious reproduction steps (go straight to tdd-agent)
- Simple test failures (fix in tdd-agent)
- Visual/layout bugs in components (use Storybook isolation first - see `react-components/testing/visual-debugging.md`)

---

## Browser Debugging via Temp E2E Test

**Use Playwright tests to reproduce and capture evidence.** No manual browser interaction needed.

### Why Temp E2E Instead of Manual Browser?

- Automated, reproducible debugging
- Console + network captured automatically
- Screenshots at each step
- No user intervention needed for log capture
- Works in CI

### Debugging Workflow

1. **Write temp E2E test** that reproduces the bug steps
2. **Add console logging** in the code paths being tested
3. **Take screenshots** at each step
4. **Run test** and capture output
5. **Read screenshots + console output** to diagnose
6. **Delete temp test** when done

### Example: Debugging Login Failure

```typescript
// apps/app/__tests__/temp-debug.spec.ts (delete when done)
import { test } from '@playwright/test';

test('debug login issue', async ({ page }) => {
  // Capture console and errors
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Step 1: Navigate
  await page.goto('/auth');
  await page.screenshot({ path: 'apps/app/__tests__/screenshots/temp/step1-auth-page.png' });

  // Step 2: Fill form
  await page.fill('[data-testid="email"]', 'test@example.com');
  await page.fill('[data-testid="password"]', 'password123');
  await page.screenshot({ path: 'apps/app/__tests__/screenshots/temp/step2-filled.png' });

  // Step 3: Submit
  await page.click('[data-testid="submit"]');

  // Step 4: Wait and screenshot result
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'apps/app/__tests__/screenshots/temp/step3-result.png' });

  // Step 5: Capture cookies/storage if needed
  const cookies = await page.context().cookies();
  console.log('COOKIES:', JSON.stringify(cookies, null, 2));
});
```

**Run and analyze**:
```bash
mkdir -p __tests__/screenshots/temp
# Use your project's test command (from .pm/config.json) to run the temp test
# Read screenshots + terminal output to diagnose
```

### Console Capture Patterns

**Capture browser console in test**:
```typescript
page.on('console', msg => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
});
```

**Capture network requests**:
```typescript
page.on('request', req => console.log('REQUEST:', req.method(), req.url()));
page.on('response', res => console.log('RESPONSE:', res.status(), res.url()));
```

**Capture page errors**:
```typescript
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
```

### Evidence Gathering

| What to Capture | How |
|-----------------|-----|
| Visual state | `page.screenshot()` |
| Console logs | `page.on('console', ...)` |
| Network requests | `page.on('request/response', ...)` |
| Page errors | `page.on('pageerror', ...)` |
| Cookies/storage | `page.context().cookies()` |
| DOM state | `page.content()` or `page.locator().innerHTML()` |

### Cleanup

```bash
# Delete the temp test file and screenshots when done
rm <your-temp-test-file>
rm -rf __tests__/screenshots/temp/
```

---

## The Five Phases

### Phase 1: REPRODUCE

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'debug', 'REPRODUCE', '$(echo $CLAUDE_SESSION_ID)');"
```

**Goal:** Confirm bug exists via manual steps.

**User provides:**
- Screenshot of error / console output
- Steps taken
- Expected vs actual behavior

**Agent confirms:**
- Bug is real (not user error)
- Documents exact reproduction steps

```markdown
## Reproduction
- Navigate to /feature
- Perform action X
- **Expected:** Result Y
- **Actual:** Result Z
```

### Phase 2: INVESTIGATE

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'debug', 'INVESTIGATE', '$(echo $CLAUDE_SESSION_ID)');"
```

**Goal:** Find root cause using evidence-gathering tools.

**Tools (in order of preference)**:
1. **Code reading** - grep, Read tool
2. **Database queries** - database state, Neon logs
3. **Temp E2E test** - browser state, console, screenshots (see Browser Debugging section)

**Add instrumentation if needed:**
```typescript
console.error('DEBUG parseCSVPreview:', {
  input: data.slice(0, 100),
  headers,
  stack: new Error().stack
});
```

**Trace backwards:**
1. Where does the bad value appear? (symptom)
2. What called this with the bad value?
3. Keep tracing up until you find the source
4. Document the call chain

### Phase 3: SCOPE

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'debug', 'SCOPE', '$(echo $CLAUDE_SESSION_ID)');"
```

**Goal:** Define fix boundary and test strategy.

| Question | Answer |
|----------|--------|
| Which file(s) affected? | `packages/<package-name>/src/utils/parse-csv.ts:23` |
| Existing test to strengthen? | `parse-csv.test.ts` line 45 |
| Or new test needed? | Only if no relevant test exists |
| What assertion proves fix? | "headers returned for empty-first-row CSV" |

### Phase 4: HYPOTHESIS

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'debug', 'HYPOTHESIS', '$(echo $CLAUDE_SESSION_ID)');"
```

**Goal:** Confirm root cause theory.

```
Hypothesis: parseCSVPreview skips empty rows including header detection.
Evidence: Line 23 uses `filter(row => row.length > 0)` before extracting headers.
Verification: Added console.log, confirmed headers array is empty.
```

**If hypothesis wrong:** Return to Phase 2.

### Phase 5: TASK

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id) VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'debug', 'TASK', '$(echo $CLAUDE_SESSION_ID)');"
```

**Goal:** Generate task for tdd-agent.

```sql
INSERT INTO tasks (sprint, title, description, done_when) VALUES (
  'hotfix',
  'Fix CSV preview header display',
  'Bug: CSV preview missing headers when first row empty.
   Reproduced: Upload test.csv with empty row 1 → no headers shown.
   Root cause: parseCSVPreview skips empty rows before header extraction.
   Location: packages/<package-name>/src/utils/parse-csv.ts:23
   Test strategy: Strengthen parse-csv.test.ts with empty-first-row case.
   Related: agent-foundation sprint, attachments feature.',
  'Test fails without fix (RED), passes with fix (GREEN)'
);
```

**Task description must include:**
- Bug summary
- Reproduction steps
- Root cause (not just symptom)
- File location
- Test strategy (which file, strengthen or new)

---

## What bug-workflow Does NOT Do

| Action | Who Does It |
|--------|-------------|
| Write the failing test | tdd-agent (RED) |
| Fix the code | tdd-agent (GREEN) |
| Refactor | tdd-agent (REFACTOR) |
| Commit | tdd-agent (COMMIT) |

**Boundary:** bug-workflow outputs a task. tdd-agent implements it.

---

## Handoff to tdd-agent

```
bug-workflow completes when:
├── Root cause identified
├── Hypothesis confirmed
├── Test strategy defined
└── Task written to tasks.db (sprint: hotfix)

tdd-agent starts:
├── Pick task from tasks.db
├── RED: Write test that FAILS (proves bug)
├── GREEN: Fix code
├── REFACTOR + COMMIT
```

**Invoke:** `/test` to pick up the hotfix task.

---

## Quick Reference

### Essential Database Commands

> **Note:** Check `CLAUDE.md` → Database for your project's database type, connection details, and migration commands. Check `.pm/config.json` for configured commands.

**Interactive database access:**
```bash
# Connection details are in CLAUDE.md → Database section
# Common patterns:
psql $YOUR_DATABASE_URL              # PostgreSQL
sqlite3 path/to/your.db             # SQLite
mysql -u user -p database            # MySQL
```

**Migration commands:**
```bash
# Check CLAUDE.md → Database for project-specific migration commands
```

### Common Debugging Queries

```bash
# Adapt these to your database type and schema (documented in CLAUDE.md)
# View recent data, check table schema, etc.
```

### Code Investigation

```bash
# Find relevant code
grep -r "functionName" packages/

# Recent changes
git log --oneline -10 -- path/to/file
git diff HEAD~3 -- path/to/file
```

---

## Troubleshooting Guide

| Symptom | Diagnosis | Resolution |
|---------|-----------|-----------|
| Connection refused | Connection string invalid | Check database config in `CLAUDE.md` → Database |
| Connection timeout | Network/service issue | Check internet, database provider dashboard |
| Permission denied | Database permissions | Check table permissions, verify connection string |
| Migration failed | Check migration status | Run migration status command from `CLAUDE.md` → Database |
| Empty results | Query logic issue | Verify WHERE clauses, check data exists |

---

## Test Commands (for tdd-agent)

Commands are configured in `.pm/config.json`:

```bash
jq -r '.commands.test' .pm/config.json       # Test command
jq -r '.commands.typecheck' .pm/config.json   # Typecheck command
jq -r '.commands.lint' .pm/config.json        # Lint command
jq -r '.commands.build' .pm/config.json       # Build command
```

---

## Documentation Reference

| File | Use For |
|------|---------|
| `debugging/database-commands.md` | Database connection patterns |
| `debugging/data-investigation.md` | Finding wrong data |
| `debugging/database-connection-issues.md` | Database connection troubleshooting |
| `debugging/react-infinite-loops.md` | React "Maximum update depth" |

---

## Phase Checklist

```
□ REPRODUCE - Bug confirmed, steps documented
□ INVESTIGATE - Evidence gathered, call chain traced
□ SCOPE - Files identified, test strategy defined
□ HYPOTHESIS - Root cause stated and verified
□ TASK - Written to tasks.db (sprint: hotfix)
→ Hand off to /test
```

---

### Workflow Complete

```bash
sqlite3 .pm/tasks.db "INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, metadata) VALUES ('${sprint}', ${taskNum}, 'task_completed', 'debug', 'DONE', '{\"status\": \"completed\"}');"
```

**Status:** ACTIVE
**Output:** Task in `.pm/tasks.db` (sprint: hotfix)
**Handoff:** tdd-agent implements the task
