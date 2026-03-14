---
name: frontend-review
version: "1.0.0"
description: "Multi-agent frontend review agent. Assesses UI quality using programmatic checks + LLM vision + interactive testing. Auto-fixes issues with deterministic merge rules. Triggers: frontend review, review UI, check my page, UX audit, accessibility check, visual review, review this component."
argument-hint: <page-url> [--spec <spec-path>] [--focus <category>] [--flow <flow-path>]
---

# Frontend Review Agent

Multi-agent UI quality system: three sub-agents (programmatic, vision, interaction) assess a page independently, a deterministic merge step combines findings, and an auto-fix loop resolves issues iteratively.

## When to Invoke

| Trigger | Source |
|---------|--------|
| User runs `/frontend-review <page>` | Manual |
| Sprint task has `type: frontend` and reaches GREEN | tdd-agent |
| PM agent Phase 6.2 verification | pm-agent |
| User asks to review UI, check accessibility, audit UX | Auto-invoke |

## Prerequisites

Before assessment, verify:

1. **Dev server running** at configured port (from `dev_server_command` in `.claude/review-config.json`)
2. **Playwright installed**: `@playwright/test` and `@axe-core/playwright` in `package.json`. If missing, prompt to install.
3. **Auth configured** (if applicable): `.claude/review-config.json` has `auth.strategy` set. If missing on first run, prompt user.
4. **Page renders meaningful content**: Not 404/500, body not empty, no persistent loading state after 10s.

If prerequisites fail, return structured response:
```json
{ "status": "not_ready", "reason": "Page shows loading state after 10s — data layer may not be connected" }
```

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `page_url` | Yes | Page to review (e.g., `/tasks`, `/settings`) |
| `spec_path` | No | Path to spec describing page intent |
| `focus` | No | Category filter: `density`, `grouping`, `a11y`, `overflow`, `empty-states`, `interactions`, `flow`, or `all` (default) |
| `flow` | No | Path to flow definition for multi-page assessment |
| `data_fixtures` | No | Path to test data fixtures |

---

## Core Loop

```
1.   CONNECT         Check dev server at configured port
1.5  AUTH CHECK      Verify authenticated element is present; re-auth if expired
2.   PREREQUISITES   Verify page renders meaningful content (not loading/error/blank)
                     If not ready: return "not ready" with specifics, do not assess
3.   SEED DATA       Load test fixtures via env var if available (empty, normal, overflow)
4.   NAVIGATE        Open target page URL in Playwright
5.   ASSESS          Run three sub-agents in parallel:
                       a) Programmatic Agent — axe-core, computed styles, DOM, keyboard nav
                       b) Vision Agent — screenshot + LLM multi-pass assessment
                       c) Interaction Agent — click, type, scroll, resize, modals
6.   MERGE           Deterministic merge rules (see below) + LLM tiebreaker for ambiguous cases
                     Read .claude/review-suppressions.md, exclude suppressed findings
                     Update suppression last_verified dates for applied suppressions
                     Validate all sub-agent output against Zod schemas; retry once on failure
6.5  FIRST RUN?      If no prior report at .claude/review-reports/{page}.json:
                       Skip steps 7-9 (no fix loop), proceed to steps 10-12
                       Print first-run messaging (see below)
7.   CONFLICT CHECK  Check git status of files in scope; abort fix if concurrent modification
7.5  FIX             Auto-fix critical + warning issues
8.   RE-ASSESS       Scoped re-assessment: only re-run sub-agents affected by the fixes
                     Carry forward fix history to prevent regression
                     FINAL ITERATION: always run all three agents regardless of affected_agents
9.   REPEAT          Loop 7-8 until no critical/warning issues (max 5 iterations)
                     Report remaining issues descriptively if max iterations reached
10.  GENERATE TESTS  Write defensive Playwright tests with explicit waits
                     Burn-in: run 5x locally; only commit tests that pass all 5 runs
11.  BASELINE        Component-level: toHaveScreenshot() on Storybook stories
                     Page-level: structural DOM assertions (element counts, layout, axe-core)
12.  REPORT          Summary: changes made, tests generated, remaining info items,
                     suppressed findings, max-iteration status if applicable
```

### First-Run Behavior

When no prior report exists at `.claude/review-reports/{page}.json`, the agent runs in **report-only mode** — assess but do not auto-fix.

Print this message:
```
First review of {page}. Running in report-only mode — no auto-fixes will be applied.
Review the report at .claude/review-reports/{page-name}.md, then:
  - Add suppressions to .claude/review-suppressions.md for intentional design choices
  - Re-run /frontend-review {page} to auto-fix remaining issues
```

On subsequent runs (prior report exists), auto-fix critical and warning issues automatically.

---

## Sub-Agents

### 5a: Programmatic Assessment Agent

Deterministic checks — no LLM needed, no false positives on what it covers.

**Accessibility (axe-core)**:
```typescript
import AxeBuilder from '@axe-core/playwright';
const results = await new AxeBuilder({ page }).analyze();
```

Catches: contrast ratios, missing labels, missing alt text, ARIA violations, focus order, landmark regions, heading hierarchy.

**Computed Styles Extraction** (scoped to semantic elements, sampled):
```typescript
const STYLE_SELECTORS = [
  'h1, h2, h3, h4, h5, h6',           // headings
  'button, a, input, select, textarea', // interactive
  'td, th',                             // table cells
  '[class*=card], [class*=Card]',       // cards
  'nav, main, aside, header, footer',   // landmarks
  'li, [role=listitem]',                // list items
].join(', ');
const MAX_ELEMENTS = 500;

const styles = await page.evaluate(({ selectors, max }) => {
  const elements = Array.from(document.querySelectorAll(selectors));
  // Sample repeated elements: first 5 + last 1 per parent
  const byParent = new Map<Element, Element[]>();
  elements.forEach(el => {
    const parent = el.parentElement || document.body;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(el);
  });
  const sampled: Element[] = [];
  byParent.forEach(children => {
    if (children.length <= 6) { sampled.push(...children); }
    else { sampled.push(...children.slice(0, 5), children[children.length - 1]); }
  });
  return sampled.slice(0, max).map(el => ({
    tag: el.tagName,
    selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
    padding: getComputedStyle(el).padding,
    fontSize: getComputedStyle(el).fontSize,
    borderRadius: getComputedStyle(el).borderRadius,
    gap: getComputedStyle(el).gap,
    color: getComputedStyle(el).color,
    backgroundColor: getComputedStyle(el).backgroundColor,
  }));
}, { selectors: STYLE_SELECTORS, max: MAX_ELEMENTS });
```

Configurable via `max_style_elements` in `.claude/review-config.json`.

**Layout Checks**:
- Horizontal scroll: `scrollWidth > clientWidth`
- Overflow detection: elements with `overflow: hidden` clipping content
- Viewport testing at multiple breakpoints: 1280px, 1024px, 768px, 375px

**Focus/Keyboard Navigation**:
- Tab through all interactive elements, verify focus is visible
- Check tab order matches visual order
- Verify Escape closes modals/sheets
- Verify Enter activates buttons/links

**Output**: Zod-validated JSON. Each finding has: rule ID, element selector, severity, description, remediation.

### 5b: Vision Assessment Agent

LLM-based assessment using screenshots. Catches holistic issues programmatic tools can't.

**Multi-pass assessment** (one prompt per category):

| Pass | What it catches |
|------|-----------------|
| Information Architecture | Bad categorization, flat lists that should be grouped, missing headers, spec intent misalignment |
| Visual Hierarchy | Buried CTAs, competing focal points, unclear priority, unclear reading path |
| Density & Spacing | Wasted space in data-dense views, cramped content in content-heavy views |
| Empty & Error States | Blank pages, unhelpful errors, missing loading indicators |
| Consistency | Inconsistent buttons, mixed styling patterns, visual outliers |

**Viewport tiering** (cost optimization):
- **Primary viewport** (configurable, default 1280px): Full 5-pass assessment
- **Secondary viewports** (768px, 375px): Single combined "Responsive Layout" pass — layout/overflow/responsive issues only
- Cross-viewport deduplication removes findings matching same `(element_selector, category)`
- Primary viewport configurable via `primary_viewport_width` in `.claude/review-config.json`

**Prompt structure for each pass**:
```
You are assessing a web page for UX quality.

SPEC INTENT (what this page should accomplish):
{spec_text or "No spec provided — assess against general UX principles"}

HEURISTIC RULES (apply these):
{general_heuristics from 03-patterns/ux-heuristics/SKILL.md}
{project_heuristics from .claude/ui-heuristics.md if exists}

PREVIOUS FIXES (do not regress on these):
{fix_history from prior iterations}

SUPPRESSED RULES for this page:
{suppressions from .claude/review-suppressions.md}

FOCUS: {category}

Assess the screenshot. Return structured JSON:
{
  "findings": [
    {
      "id": "vision-{category}-{n}",
      "category": "{category}",
      "severity": "critical|warning|info",
      "location": "description of where on the page",
      "issue": "what's wrong",
      "suggestion": "how to fix it",
      "spec_alignment": "how this relates to spec intent (if spec provided)"
    }
  ],
  "pass_summary": "one sentence overall assessment for this category"
}
```

All sub-agent output validated against Zod schemas. On validation failure, retry once with the validation error appended. On second failure, skip that agent's findings for this iteration and log warning.

### 5c: Interaction Assessment Agent

Tests the page by actually using it. Playwright drives the browser, LLM assesses results.

| Test | What it does | What it catches |
|------|-------------|-----------------|
| Navigation | Click every nav link, verify page loads, verify active state | Broken links, missing active indicators |
| Form submission | Fill every form, submit, check validation | Missing validation, unclear errors |
| Error triggering | Submit empty required fields, invalid data | Missing error states, crashes |
| Scroll behavior | Scroll to bottom, check sticky headers, pagination | Broken sticky elements, layout shift |
| Viewport resize | Resize 1280px → 768px → 375px | Responsive breakage, overlapping elements |
| Modal/Sheet | Open modals, test Escape, click-outside, focus trap | Broken modals, missing focus trap |
| Data states | If fixtures available: test 0 items, 5 items, 100+ items | Empty state gaps, overflow |

**Budget** (prevents unbounded exploration):
- **Max 30 interaction steps** per page
- **Priority ordering**: navigation (1) > form submissions (2) > modals/sheets (3) > keyboard nav (4) > viewport resize (5) > scroll behavior (6) > remaining (7)
- **10-second timeout** per Playwright action
- **30-minute total wall clock** — clean break at timeout, report partial results
- Configurable via `interaction_step_limit`, `interaction_step_timeout_ms`, `interaction_total_timeout_ms` in `.claude/review-config.json`

**How interaction testing works**:
1. Agent reads page DOM to identify interactive elements
2. Generates interaction plan prioritized by element type
3. Executes up to 30 interactions via Playwright
4. Screenshots before and after each interaction
5. LLM assesses the transition: "Was the result expected and usable?"
6. On timeout: stop gracefully, include completed assessments in output

---

## Deterministic Merge Rules

The merge step is primarily deterministic. LLM judgment is limited to genuinely ambiguous cases.

**Rules (applied in order)**:

1. **Programmatic findings always survive.** Deterministic, no false positives. Merge agent can **downgrade severity** (never delete, never upgrade) if vision agent explicitly contradicts. `original_severity` preserved for audit trail.

2. **Programmatic evidence overrides vision on measurable properties.** If vision flags spacing/contrast/font-size and computed styles show compliance with project heuristics, vision finding is dismissed with `dismissed_reason: "contradicted by computed styles"`.

3. **Findings flagged by 2+ sub-agents always survive.** No LLM judgment needed.

4. **Single-agent vision/interaction findings: LLM tiebreaker decides.** Merge agent reviews screenshot and finding, decides to keep (with rationale) or dismiss. This is the only non-deterministic step.

5. **Suppressed findings are excluded.** Match page + rule ID from `.claude/review-suppressions.md`. Suppressed findings appear in report as "suppressed" but do not enter the fix loop.

**Output**: Each finding includes:
- `source_agents: string[]` — which sub-agents produced it
- `merge_rule` — one of: `programmatic_pass`, `multi_agent_consensus`, `merge_agent_decision`
- `merge_rationale` — transparency on why it survived or was dismissed

**Non-determinism note**: Single-agent vision/interaction findings may vary across runs. Programmatic findings and multi-agent consensus findings are stable.

---

## Scoped Re-Assessment (Iterations 2+)

After iteration 1, only re-run sub-agents relevant to fixes applied.

**`affected_agents` derivation** (deterministic):
- Each fix inherits `source_agents` from the merged finding it addresses
- CSS/SCSS/className changes auto-add `"vision"`
- ARIA/role/tabIndex changes auto-add `"interaction"`

**Scoping rules**:
- If iteration 1 only fixed contrast → re-run programmatic only
- If iteration 1 fixed layout + interactions → re-run programmatic + interaction
- Vision only re-runs if vision findings were fixed
- Merge agent only runs when multiple sub-agents produce findings

**Final iteration full validation**: On the last iteration (whether iteration 2 or 5), always run all three agents regardless of `affected_agents`. Catches cascading regressions that scoped re-assessment would miss.

**Diminishing severity threshold**:
- Iterations 1-3: Fix critical + warning
- Iterations 4-5: Fix critical only
- After iteration 5: Report remaining issues descriptively

**Fix history carried forward**:
```
FIX HISTORY:
- Iteration 1: Fixed contrast on .status-badge (was 2.8:1, now 4.6:1) [programmatic]
- Iteration 1: Grouped 12 flat items into 3 categories with headers [vision]
- Iteration 2: Added empty state message for zero-data case [vision]
```

Assessment prompts include fix history: "Do not flag issues already fixed. Do not suggest changes that would undo previous fixes."

---

## Schemas

All sub-agent output validated against Zod schemas. Retry once on validation failure. Second failure skips agent + warning.

### Finding Schema

```typescript
const FindingSchema = z.object({
  id: z.string(),                    // e.g., "prog-a11y-01", "vision-density-1"
  category: z.string(),
  severity: z.enum(['critical', 'warning', 'info']),
  location: z.string(),             // element selector or page region
  issue: z.string(),
  suggestion: z.string(),
  rule_id: z.string().optional(),    // heuristic rule ID (e.g., "arch-02")
  spec_alignment: z.string().optional(),
});

const SubAgentOutputSchema = z.object({
  agent: z.enum(['programmatic', 'vision', 'interaction']),
  findings: z.array(FindingSchema),
  pass_summary: z.string().optional(),
  error: z.string().optional(),
});

const MergedFindingSchema = FindingSchema.extend({
  source_agents: z.array(z.string()),
  merge_rule: z.enum(['programmatic_pass', 'multi_agent_consensus', 'merge_agent_decision']),
  merge_rationale: z.string().optional(),
  original_severity: z.enum(['critical', 'warning', 'info']).optional(),
  dismissed_reason: z.string().optional(),
  suppressed: z.boolean().default(false),
  conflict_detected: z.boolean().default(false),
  fixed: z.boolean().default(false),
});
```

---

## Suppression File

**Location**: `.claude/review-suppressions.md`

Developers suppress specific findings on specific pages when the agent's recommendation conflicts with intentional design.

**Format**:
```markdown
# Review Suppressions
# Each entry: page path, rule ID, last-verified date, and rationale (rationale required)
# The agent auto-updates [verified: ...] each time it applies a suppression.
# Entries not verified in 90 days are flagged as "may be stale" in the report.

/tasks: arch-02 [verified: 2026-03-07] — Intentional flat list. User research shows scanning is preferred over drill-down (see .pm/case-studies/task-scanning.md)
/streams: density-02 [verified: 2026-03-07] — Compact rows are intentional for timeline density
```

The merge agent reads this file before finalizing. Auto-updates `[verified: YYYY-MM-DD]` each time a suppression is applied. Suppressed findings appear in report as "suppressed" but do not enter the fix loop. Entries older than 90 days appear in the report's "stale suppressions" section.

---

## Auth Strategies

Configured in `.claude/review-config.json`:

```json
{
  "auth": {
    "strategy": "none | storage_state | script | dev_bypass",
    "storage_state_path": "playwright/.auth/state.json",
    "script": "scripts/auth-for-review.sh",
    "env_var": "BYPASS_AUTH=true"
  }
}
```

| Strategy | Description |
|----------|-------------|
| `none` | No auth needed (public pages) |
| `storage_state` | Replay Playwright `storageState` file. Works for long-lived sessions |
| `script` | Run a shell command that outputs fresh `storageState` JSON to stdout |
| `dev_bypass` | Set an env var the app recognizes to skip auth |

**First-run behavior**: If no auth config exists, prompt: "Does this app require authentication? (none / storage_state / script / dev_bypass)"

**Per-iteration check** (step 1.5):
1. Check for known authenticated element (nav bar, user avatar, app shell)
2. If absent → execute configured auth strategy
3. If re-auth fails → abort: `error: auth_expired — could not re-authenticate`

---

## Test Generation

After page passes review (or hits max iterations), generate defensive Playwright tests.

**Defensive patterns**:
- `waitForSelector` before assertions
- Configurable timeouts: `toBeVisible({ timeout: 5000 })`
- Retry logic: `test.describe.configure({ retries: 1 })`
- Flakiness-risk comments: `// flakiness-risk: medium — CSS transition timing`

**Burn-in protocol**: Run each generated test 5x locally. Each run uses fresh `browser.newContext()` (clean cookies, storage, WebSocket state). Only commit tests passing all 5 runs. Failed burn-in tests saved to `e2e/generated/staging/` for developer review.

**Test locations**:
- Passing: `e2e/generated/{page-name}.spec.ts` (committed)
- Failed burn-in: `e2e/generated/staging/{page-name}.spec.ts` (committed, flagged)

**Generated test example**:
```typescript
// Generated by /frontend-review on 2026-03-07
// Page: /tasks | Spec: .pm/todo/tasks-page-v2/01-task-table.md
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('/tasks page', () => {
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForSelector('[data-testid="page-content"]', { timeout: 10000 });
  });

  test('passes axe-core accessibility audit', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('no horizontal scroll at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });

  test('navigation highlights current page', async ({ page }) => {
    // flakiness-risk: low
    const navItem = page.locator('[data-nav="tasks"]');
    await expect(navItem).toHaveAttribute('aria-current', 'page');
  });
});
```

---

## Data Seeding

The review agent needs controlled data states to test overflow, empty states, and density.

**Three data states**:

| State | Purpose | Profile |
|-------|---------|---------|
| Empty | Test zero-data UX | No items, no activity, fresh install |
| Normal | Test typical use | 10-20 items, realistic names/values, mixed statuses |
| Overflow | Test at scale | 100+ items, very long strings (50+ chars), all statuses |

**Four seeding approaches** (project chooses):

1. **Mock API responses**: `page.route('**/graphql', ...)` with fixtures from `e2e/fixtures/{page}/{state}.json`
2. **Seed scripts**: `scripts/seed-empty.sh`, `scripts/seed-normal.sh`, `scripts/seed-overflow.sh`
3. **Component-level fixtures**: Storybook stories define own fixture data
4. **Environment-controlled fixtures**: `REVIEW_DATA_STATE=empty|normal|overflow` env var

**Dev Server Restart Protocol** (for env-controlled fixtures):

Configurable based on machine capability (detected by `/detect-project`):
- **Sequential** (default, <12GB RAM): Restart dev server per data state. Order: normal → overflow → empty (highest value first). Readiness probe: poll URL every 2s, 30s timeout. Skip state on failure.
- **Parallel** (≥12GB RAM): Launch 3 dev server instances on different ports with different `REVIEW_DATA_STATE` values. ~1.5GB additional RAM.

Configurable via `data_seeding_strategy`, `dev_server_command`, `dev_server_ready_timeout_ms` in `.claude/review-config.json`.

---

## Flow Assessment

Single-page review catches per-page issues. Flow assessment catches cross-page UX problems.

**What flow assessment checks**:
- Navigation correctness
- State persistence across pages (filters, selections)
- Breadcrumb accuracy
- Browser back button behavior with client-side routing
- Multi-step process progress indication
- Data consistency (edit → list → verify update)

**Hybrid flow definition format**:
```yaml
# Flow: Create and verify a task
steps:
  - navigate: /tasks
    assert: "Task list page loads"
    check: "page.locator('[data-testid=task-list]').isVisible()"

  - action: "Click 'New Task' button"
    selector: "button:has-text('New Task')"
    assert: "Task creation form appears"

  - action: "Fill in task title 'Test Task'"
    action: "Click Submit"
    assert: "Success feedback shown"

  - navigate: /tasks
    assert: "New task appears in list"
```

When `selector` and `check` fields are provided, the agent uses them directly (deterministic). When absent, the LLM interprets natural language (flexible but non-deterministic). Agent **backfills selectors** after first successful run.

**Approval gate**: If no flow exists in `.claude/review-flows/{page-name}.yaml`:
1. Infer flow from spec's Implementation Plan
2. Present as YAML preview for developer approval
3. Only proceed after approval
4. Store approved flow in `.claude/review-flows/` for reuse

**Generated flow tests**: After a flow passes, generate a Playwright test that replays it — a permanent E2E test.

---

## Conflict Detection

The fix loop may take several minutes. During this time, others may modify the same files.

1. Before starting fix loop, record git status of files in scope (`git diff --name-only`)
2. Before each fix, check if target file modified since loop started
3. If conflict: skip fix, add `conflict_detected: true` to finding, continue to next fix
4. Report: "Skipped fix for {file} — modified by another process during review. Re-run after changes settle."

---

## Report Format

Two files per review run:

**Machine-readable**: `.claude/review-reports/{page-name}.json` (gitignored)
```json
{
  "page": "/tasks",
  "spec": ".pm/todo/tasks-page-v2/01-task-table.md",
  "status": "pass | fail | max_iterations | report_only",
  "iterations": 3,
  "findings": [{ "id": "...", "severity": "...", "merge_rule": "...", "source_agents": ["..."], "fixed": true }],
  "fixes_applied": [{ "file": "...", "description": "...", "iteration": 1 }],
  "tests_generated": { "committed": 4, "staging": 1 },
  "suppressions_applied": [{ "page": "/tasks", "rule": "arch-02", "last_verified": "2026-03-07" }],
  "stale_suppressions": [],
  "conflicts_detected": [],
  "cost_summary": {
    "total_tokens": 45000,
    "by_agent": { "programmatic": 0, "vision": 28000, "interaction": 12000, "merge": 5000 },
    "by_iteration": [{ "iteration": 1, "tokens": 35000 }, { "iteration": 2, "tokens": 10000 }]
  },
  "timestamp": "2026-03-07T14:30:00Z"
}
```

**Human-readable**: `.claude/review-reports/{page-name}.md` (gitignored) — markdown summary.

**Contract**: PM agent Phase 6.2 and tdd-agent read JSON `status` field. First-run report-only checks for file existence.

**Token tracking**: Each LLM call logged with token counts grouped by sub-agent and iteration. Written to `workflow_events` with `skill_name = 'frontend-review'`.

---

## Storybook Integration Protocol

Component-level baselines use Storybook screenshots.

1. Check if Storybook running at configured port (default 6006, from `storybook_port`)
2. If not running, start via `storybook_start_command` (default: `npx storybook dev --port 6006 --no-open`), wait up to 60s
3. Discover stories via `http://localhost:{port}/stories.json`
4. Navigate to each story URL, take screenshot, store baseline in `__screenshots__/` alongside story file
5. **Graceful degradation**: If Storybook fails to start, skip component baselines, log warning — do not block page-level review

Page-level uses structural DOM assertions (element visibility, counts, layout, axe-core) instead of pixel comparison.

---

## Severity Matrix

| Level | Criteria | Examples |
|-------|----------|---------|
| **critical** | Blocks functionality, violates WCAG A, crashes, data loss risk | Broken nav, form can't submit, no keyboard access, missing focus trap, page crash |
| **warning** | Degrades usability, violates WCAG AA, misleading UI, poor info architecture | Low contrast (AA fail), missing empty states, ungrouped flat list, inconsistent styling |
| **info** | Polish, best practice, WCAG AAA, minor inconsistency | Slightly off spacing, could use progressive disclosure, minor visual inconsistency |

---

## Integration Points

| System | When | What |
|--------|------|------|
| PM agent Phase 6.2 | Any sprint task has `type: frontend` | Auto-invoke, read JSON `status` field |
| tdd-agent | After GREEN for frontend tasks | Invoke with prerequisites check |
| bug-workflow | Visual bugs for diagnosis | Can escalate |
| CI/CD | Every PR | Generated tests run automatically |

---

## Configuration Reference

`.claude/review-config.json` — populated incrementally on first run and via `/detect-project`:

```json
{
  "auth": {
    "strategy": "none",
    "storage_state_path": null,
    "script": null,
    "env_var": null
  },
  "storybook_port": 6006,
  "storybook_start_command": "npx storybook dev --port 6006 --no-open",
  "dev_server_command": "npm run dev",
  "dev_server_ready_timeout_ms": 30000,
  "data_seeding_strategy": "sequential",
  "primary_viewport_width": 1280,
  "max_style_elements": 500,
  "interaction_step_limit": 30,
  "interaction_step_timeout_ms": 10000,
  "interaction_total_timeout_ms": 1800000
}
```

---

## File Locations

| Type | Path |
|------|------|
| Reports (JSON) | `.claude/review-reports/{page-name}.json` (gitignored) |
| Reports (markdown) | `.claude/review-reports/{page-name}.md` (gitignored) |
| Screenshots | `.claude/screenshots/` (gitignored) |
| Suppressions | `.claude/review-suppressions.md` (committed) |
| Flow definitions | `.claude/review-flows/{page-name}.yaml` (committed) |
| Config | `.claude/review-config.json` (committed) |
| Generated tests (passing) | `e2e/generated/{page-name}.spec.ts` (committed) |
| Generated tests (staging) | `e2e/generated/staging/{page-name}.spec.ts` (committed) |
| Component baselines | `__screenshots__/` alongside story files |
| General heuristics | `03-patterns/ux-heuristics/SKILL.md` |
| Project heuristics | `.claude/ui-heuristics.md` |

---

**Status**: ACTIVE
**Related Skills**: `ux-heuristics` (general heuristics), `web-design-guidelines` (design rules), `detect-project` (UI convention detection + story generation)
**Invoked By**: User, tdd-agent, pm-agent
