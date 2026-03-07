# Frontend Review Sprint

> Framework-level UI quality system: a multi-agent review agent with programmatic + LLM assessment, Storybook component catalog with auto-story generation, two-tier UX heuristics, interactive page testing, and automated test generation.

| Field | Value |
|-------|-------|
| Status | Active |
| Owner | whsimonds |
| Last Updated | 2026-03-07 |
| Depends On | detect-project (for optional project-specific heuristic generation) |
| Enables | PM agent Phase 6 verification, tdd-agent UI task completion |

---

## Recent Changes

| Date | What changed | Section |
|------|-------------|---------|
| 2026-03-07 | Second adversarial review (15 decisions): first-run report-only, final-iteration full validation, affected_agents derivation, scoped style extraction, interaction budget, token tracking, auth strategies, Storybook protocol, dev server restart, burn-in isolation, report format, suppression staleness, flow approval, conflict detection, vision viewport tiering | All design sections |
| 2026-03-07 | Adversarial review decisions applied: auto-fix default, suppression file, deterministic merge rules, scoped re-assessment, auth checks, env-controlled fixtures, Zod validation, component-level baselines | All design sections |
| 2026-03-07 | Added multi-agent consensus, programmatic+LLM split, interactive testing, test generation, data seeding, severity matrix, multi-page flows, iteration learning | Design |
| 2026-03-07 | Moved pixel values from general to project tier, made general heuristics principle-based | Deliverable 3 |
| 2026-03-07 | Changed from custom catalog page to Storybook, added Chromatic as optional | Deliverable 2 |
| 2026-03-07 | Initial spec | All |

---

## Table of Contents

- [Goal](#goal)
- [Success Criteria](#success-criteria)
- [Prior Art](#prior-art)
- [Current State](#current-state)
- [Ideal State](#ideal-state)
- [Design](#design)
- [Resolved Questions](#resolved-questions)
- [Open Questions](#open-questions)

---

## Goal

Agents build UI blind — they write JSX but never *look* at what they produced. When a spec says "20 items grouped into 4 categories," the agent can't verify the result is usable. We need a closed-loop system that works across all N2O projects: screenshot the page, assess against spec intent, auto-fix issues, repeat until the page passes.

This is a framework-level concern, not project-specific. Every project that uses N2O should get:
- A frontend review agent that auto-fixes UI issues using both programmatic checks and LLM vision
- Multi-agent consensus with deterministic merge rules to ensure trustworthy findings
- Interactive testing (click, type, scroll, keyboard nav) — not just static screenshots
- General UX heuristics (principles, not pixels) that ship with the framework
- Optional project-specific heuristics detected during setup without encoding bad patterns
- A Storybook component catalog with auto-generated stories (React/TypeScript v1)
- Automated test generation — the review agent leaves behind Playwright tests that catch regressions
- Multi-page flow assessment for end-to-end UX quality

---

## Success Criteria

- Frontend review agent works on any N2O project with a running dev server
- Assessment combines programmatic checks (axe-core, computed styles, keyboard nav) with LLM vision (holistic, intent-based)
- Deterministic merge rules handle most findings; LLM only decides genuinely ambiguous single-agent findings
- First run is report-only with clear inline messaging; subsequent runs auto-fix critical and warning issues, with suppression file for intentional deviations
- Review agent can interact with pages (click nav, fill forms, trigger errors), not just screenshot them
- General heuristics are principle-based and apply to any project regardless of design style
- Storybook runs alongside the dev server with auto-generated stories for discovered components
- Review agent generates Playwright test files as output — defensive tests with burn-in validation
- Multi-page flow testing catches navigation, state persistence, and flow-level UX issues

---

## Prior Art

- **Storybook**: Industry standard component catalog. Isolated component development, variant display, props docs. Has "play functions" for component-level interaction testing. Supports React, Vue, Svelte, Angular. **Decision: Use for component catalog + component-level interaction testing.**
- **Storybook play functions + @storybook/test**: Built on Testing Library. Component-level interaction sequences. **Decision: Use for component-level interaction testing.**
- **Playwright**: Full browser automation. Page-level interaction testing, multi-page flows, screenshots, accessibility testing via axe-core. **Decision: Use for page-level assessment, interaction testing, and flow testing.**
- **axe-core / @axe-core/playwright**: WCAG accessibility testing engine. Deterministic, no false positives. **Decision: Use as the programmatic accessibility layer.**
- **Chromatic** (by Storybook team): SaaS visual regression. Cross-browser snapshots. **Decision: Document as optional upgrade, not core.**
- **Playwright `toHaveScreenshot()`**: Built-in visual regression. Free, self-hosted. **Decision: Use for component-level baselines in Storybook stories. Page-level uses structural assertions instead.**

**Key insight**: Two complementary assessment layers. Programmatic checks are deterministic and catch concrete violations. LLM vision catches holistic issues that no programmatic tool can assess. The best system uses both with deterministic merge rules.

---

## Current State

- **No frontend review agent** anywhere. verify-agent is referenced in PM agent Phase 6.2 but never built.
- **No Storybook** in any project. No component catalog at all.
- **No programmatic accessibility testing**. axe-core not used anywhere.
- **Two generic pattern skills**: `web-design-guidelines` (fetches Vercel rules), `react-best-practices` (45 React perf rules). Neither project-specific, neither assesses live pages.
- **detect-project** scans codebase structure but does NOT detect design system, theme tokens, or UI conventions.
- **Playwright available** as a dependency in the dashboard project. E2E tests exist but no visual testing.

---

## Ideal State

A developer sets up a new N2O project. `/detect-project` scans their components and auto-generates Storybook stories for changed/new components. It scans their theme tokens and asks: "Detected UI conventions. Codify as project heuristics?" They choose yes, no, or customize.

When an agent finishes wiring a UI page, it runs `/frontend-review`. On the first run, the agent assesses the page and writes a report — no auto-fixes yet, giving the developer a chance to review and add suppressions. On subsequent runs, three sub-agents assess the page independently — programmatic checks, visual/holistic assessment, and interaction testing. Deterministic merge rules handle most findings; an LLM tiebreaker decides genuinely ambiguous single-agent findings. The agent auto-fixes critical and warning issues, re-assesses with scoped re-runs (only re-running agents relevant to the fixes), and runs a final full validation pass before exiting.

Developers can suppress specific findings per page via `.claude/review-suppressions.md` when the agent's recommendation conflicts with intentional design choices. Auth state is verified before each iteration to prevent wasted assessment on login pages.

After the page passes, the agent generates defensive Playwright tests with explicit waits and burn-in validation. Component-level screenshot baselines live in Storybook stories; page-level regression uses structural DOM assertions rather than pixel comparison.

---

## Design

### Trade-offs from ideal

- **Chromium only** for core regression. Cross-browser via Chromatic is optional.
- **Storybook is heavy** — separate dev server, separate build. But it's an industry standard and we don't have to build it.
- **Multi-agent assessment costs more tokens** — 3 sub-agents + merge per iteration. Scoped re-assessment on iterations 2+ cuts cost 60-80%.
- **LLM assessment is non-deterministic** — different runs may flag different issues on vision/interaction findings. Documented and expected. Programmatic findings and multi-agent consensus findings are stable.
- **Project-specific heuristics are optional** — projects with bad design don't encode their badness.
- **Auto-story generation is React/TypeScript only in v1** — Storybook itself supports many frameworks, but our code that reads TypeScript interfaces and generates story files is React+TS specific. Framework adapters for Vue/Svelte are a future extension.

---

### Deliverable 1: Frontend Review Agent

**Location**: `02-agents/frontend-review/SKILL.md`

**Invocation**: `/frontend-review` (user-invocable) or programmatically by PM agent / tdd-agent.

**Project-agnostic** — works on any project with a running dev server.

**Default behavior**: Auto-fix on subsequent runs. The first run for any page is **report-only** — the agent assesses and writes a report but does not auto-fix. This gives the developer a chance to review findings and populate the suppression file before auto-fix begins. On all subsequent runs (when a prior report exists at `.claude/review-reports/{page-name}.json`), the agent auto-fixes critical and warning issues automatically.

**First-run messaging**: When running report-only, the agent prints:
```
First review of {page}. Running in report-only mode — no auto-fixes will be applied.
Review the report at .claude/review-reports/{page-name}.md, then:
  - Add suppressions to .claude/review-suppressions.md for intentional design choices
  - Re-run /frontend-review {page} to auto-fix remaining issues
```

#### Core Loop

```
1.  CONNECT        Check dev server at configured port
1.5 AUTH CHECK     Verify authenticated element is present; re-auth if expired
2.  PREREQUISITES  Verify page renders meaningful content (not loading/error/blank)
                   If not ready: return structured "not ready" response, do not assess
3.  SEED DATA      Load test fixtures via env var if available (empty, normal, overflow)
4.  NAVIGATE       Open target page URL in Playwright
5.  ASSESS         Run three sub-agents in parallel:
                     a) Programmatic Agent — axe-core, computed styles, DOM, keyboard nav
                     b) Vision Agent — screenshot + LLM multi-pass assessment
                     c) Interaction Agent — click, type, scroll, resize, modals
6.  MERGE          Deterministic merge rules (see below) + LLM tiebreaker for ambiguous cases
                   Read .claude/review-suppressions.md, exclude suppressed findings
                   Update suppression last_verified dates for applied suppressions
                   Validate all sub-agent output against Zod schemas; retry once on failure
6.5 FIRST RUN?     If no prior report at .claude/review-reports/{page}.json:
                     Skip steps 7-9 (no fix loop), proceed to steps 10-12
                     Print first-run messaging explaining report-only behavior
7.  CONFLICT CHECK Check git status of files in scope; abort fix if concurrent modification
7.5 FIX            Auto-fix critical + warning issues
8.  RE-ASSESS      Scoped re-assessment: only re-run sub-agents affected by the fixes
                   Carry forward fix history to prevent regression
                   FINAL ITERATION: always run all three agents regardless of affected_agents
9.  REPEAT         Loop 5-8 until no critical/warning issues (max 5 iterations)
                   Report remaining issues descriptively if max iterations reached
10. GENERATE TESTS Write defensive Playwright tests with explicit waits
                   Burn-in: run 5x locally; only commit tests that pass all 5 runs
11. BASELINE       Component-level: toHaveScreenshot() on Storybook stories
                   Page-level: structural DOM assertions (element counts, layout, axe-core)
12. REPORT         Summary: changes made, tests generated, remaining info items,
                   suppressed findings, max-iteration status if applicable
```

#### Step 5a: Programmatic Assessment Agent

Deterministic checks — no LLM needed, no false positives on what it covers.

**Accessibility (axe-core)**:
```typescript
import AxeBuilder from '@axe-core/playwright';
const results = await new AxeBuilder({ page }).analyze();
```

Catches: contrast ratios, missing labels, missing alt text, ARIA violations, focus order, landmark regions, heading hierarchy.

**Computed Styles Extraction** (scoped to semantic elements, sampled for performance):
```typescript
const STYLE_SELECTORS = [
  'h1, h2, h3, h4, h5, h6',           // headings
  'button, a, input, select, textarea', // interactive
  'td, th',                             // table cells
  '[class*=card], [class*=Card]',       // cards
  'nav, main, aside, header, footer',   // landmarks
  'li, [role=listitem]',                // list items (sampled)
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

Scoped extraction reduces payload 90%+ vs `querySelectorAll('*')` while covering every heuristic rule. Configurable via `max_style_elements` in `.claude/review-config.json`.

Cross-references against project heuristics if they exist. Flags deviations.

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

#### Step 5b: Vision Assessment Agent

LLM-based assessment using screenshots. Catches holistic issues programmatic tools can't.

**Multi-pass assessment** (one prompt per category):

| Pass | What it catches |
|------|-----------------|
| Information Architecture | Bad categorization, flat lists that should be grouped, missing headers, spec intent misalignment |
| Visual Hierarchy | Buried CTAs, competing focal points, unclear priority, unclear reading path |
| Density & Spacing | Wasted space in data-dense views, cramped content in content-heavy views |
| Empty & Error States | Blank pages, unhelpful errors, missing loading indicators |
| Consistency | Inconsistent buttons, mixed styling patterns, visual outliers |

**Prompt structure for each pass**:
```
You are assessing a web page for UX quality.

SPEC INTENT (what this page should accomplish):
{spec_text or "No spec provided — assess against general UX principles"}

HEURISTIC RULES (apply these):
{general_heuristics}
{project_heuristics if exists}

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

All sub-agent output is validated against Zod schemas. On validation failure, retry once with the validation error appended to the prompt. On second failure, skip that agent's findings for this iteration and log a warning in the report.

**Viewport tiering** (cost optimization — prevents 15 LLM calls per iteration):
- **Primary viewport** (1280px for desktop apps, 375px for mobile-first): Full 5-pass assessment
- **Secondary viewports** (768px, 375px or 1280px respectively): Single combined "Responsive Layout" pass focused on layout/overflow/responsive issues only
- Cross-viewport deduplication removes findings matching the same `(element_selector, category)` across viewports
- Primary viewport configurable via `primary_viewport_width` in `.claude/review-config.json`

#### Step 5c: Interaction Assessment Agent

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

**Budget** (prevents unbounded exploration on complex pages):
- **Max 30 interaction steps** per page
- **Priority ordering**: navigation (1) > form submissions (2) > modals/sheets (3) > keyboard nav (4) > viewport resize (5) > scroll behavior (6) > remaining elements (7)
- **10-second timeout** per Playwright action
- **30-minute total wall clock** for the interaction agent — clean break at timeout, report partial results
- Configurable via `interaction_step_limit`, `interaction_step_timeout_ms`, `interaction_total_timeout_ms` in `.claude/review-config.json`

**How interaction testing works**:
1. Agent reads page DOM to identify interactive elements
2. Generates interaction plan prioritized by element type (see priority ordering above)
3. Executes up to 30 interactions via Playwright
4. Screenshots before and after each interaction
5. LLM assesses the transition: "Was the result expected and usable?"
6. On timeout: stop gracefully, include completed assessments in output

#### Step 6: Deterministic Merge Rules

The merge step is primarily deterministic. LLM judgment is limited to genuinely ambiguous cases.

**Merge rules (applied in order)**:

1. **Programmatic findings always survive.** They are deterministic with no false positives. However, the merge agent can **downgrade severity** (never delete, never upgrade) if the vision agent explicitly contradicts. Example: contrast at 4.4:1 (WCAG AA fail by 0.1) — programmatic finding survives but may be downgraded from critical to warning. `original_severity` is preserved for audit trail.

2. **Programmatic evidence overrides vision on measurable properties.** If the vision agent flags a spacing/contrast/font-size issue, and computed styles show compliance with project heuristics, the vision finding is dismissed with `dismissed_reason: "contradicted by computed styles"`. This prevents LLM hallucinations on quantifiable properties.

3. **Findings flagged by 2+ sub-agents always survive.** No LLM judgment needed.

4. **Single-agent vision/interaction findings: LLM tiebreaker decides.** The merge agent reviews the screenshot and finding, then decides whether to keep (with rationale) or dismiss. This is the only step where LLM non-determinism affects outcomes.

5. **Suppressed findings are excluded.** Read `.claude/review-suppressions.md`, match page + rule ID. Suppressed findings appear in the report as "suppressed" but do not enter the fix loop.

**Output**: Each finding includes `source_agents: string[]` (which sub-agents produced it), `merge_rule` field ("programmatic_pass", "multi_agent_consensus", "merge_agent_decision"), and `merge_rationale` for transparency.

**Non-determinism note**: Results from single-agent vision/interaction findings may vary across runs. This is expected and documented. Programmatic findings and multi-agent consensus findings are stable across runs.

#### Severity Matrix

| Severity | Criteria | Examples |
|----------|----------|---------|
| **Critical** | Blocks functionality, violates WCAG A, crashes, data loss risk | Broken nav, form can't submit, no keyboard access, missing focus trap, page crash at realistic data |
| **Warning** | Degrades usability, violates WCAG AA, misleading UI, poor info architecture | Low contrast (AA fail), missing empty states, ungrouped flat list, inconsistent styling |
| **Info** | Polish, best practice, WCAG AAA, minor inconsistency | Slightly off spacing, could use progressive disclosure, minor visual inconsistency |

#### Step 8: Scoped Re-Assessment (Iterations 2+)

After iteration 1, only re-run sub-agents relevant to the fixes applied.

**`affected_agents` derivation** (deterministic — no LLM judgment):
- Each fix inherits `source_agents` from the merged finding it addresses
- Additionally, any fix that modifies CSS/SCSS/className automatically adds `"vision"` to the list
- ARIA/role/tabIndex changes automatically add `"interaction"`

**Scoping rules**:
- If iteration 1 only fixed contrast issues → re-run programmatic agent only
- If iteration 1 fixed layout + interactions → re-run programmatic + interaction agents
- Vision agent only re-runs if vision findings were fixed (layout changes, grouping changes)
- Merge agent only runs when multiple sub-agents produce findings

**Final iteration full validation**: On the last iteration (whether that is iteration 2 or 5 — when no findings remain or max iterations reached), always run all three agents regardless of `affected_agents` tags. This catches cascading regressions (e.g., contrast fix making two badges visually identical) that scoped re-assessment would miss.

**Fix history carried forward**:
```
FIX HISTORY:
- Iteration 1: Fixed contrast on .status-badge (was 2.8:1, now 4.6:1) [programmatic]
- Iteration 1: Grouped 12 flat items into 3 categories with headers [vision]
- Iteration 2: Added empty state message for zero-data case [vision]
- Iteration 2: Fixed focus trap in filter sheet [interaction]
```

Assessment prompts include fix history with instruction: "Do not flag issues that were already fixed. Do not suggest changes that would undo previous fixes."

**Diminishing severity threshold**:
- Iterations 1-3: Fix critical + warning
- Iterations 4-5: Fix critical only
- After iteration 5: Report remaining issues descriptively ("8 warning-level issues remain after 5 iterations")

#### Step 10: Test Generation

After the page passes review (or hits max iterations), generate defensive Playwright test files.

**Defensive test patterns**:
- `waitForSelector` before assertions
- Configurable timeouts: `toBeVisible({ timeout: 5000 })`
- Retry logic: `test.describe.configure({ retries: 1 })`
- Flakiness-risk comments: `// flakiness-risk: medium — CSS transition timing`

**Burn-in protocol**: Run each generated test 5x locally with full isolation — each run uses a fresh `browser.newContext()` (clean cookies, storage, WebSocket state). Only commit tests that pass all 5 runs. Tests that fail burn-in are saved to `e2e/generated/staging/` with a note for developer review.

**Generated test structure**:
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

  // Accessibility (programmatic agent)
  test('passes axe-core accessibility audit', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  // Layout (programmatic agent)
  test('no horizontal scroll at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });

  // Interaction (interaction agent)
  test('navigation highlights current page', async ({ page }) => {
    // flakiness-risk: low
    const navItem = page.locator('[data-nav="tasks"]');
    await expect(navItem).toHaveAttribute('aria-current', 'page');
  });

  // Keyboard (programmatic agent)
  test('keyboard navigation reaches all interactive elements', async ({ page }) => {
    const count = await page.locator('button, a, input, select, textarea').count();
    for (let i = 0; i < Math.min(count, 20); i++) {
      await page.keyboard.press('Tab');
      // flakiness-risk: medium — focus timing
      const hasFocus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return true; // skip body
        const styles = getComputedStyle(el);
        return styles.outlineStyle !== 'none' || styles.boxShadow !== 'none';
      });
      expect(hasFocus).toBeTruthy();
    }
  });
});
```

**Test locations**:
- Passing tests: `e2e/generated/{page-name}.spec.ts` (committed)
- Failed burn-in: `e2e/generated/staging/{page-name}.spec.ts` (committed, flagged for review)

#### Step 11: Baselines

**Component-level** (Storybook stories): `toHaveScreenshot()` — stable, small surface area, rarely changes unintentionally.

**Storybook Integration Protocol**:
1. Check if Storybook is running at configured port (default 6006, configurable via `storybook_port` in `.claude/review-config.json`)
2. If not running, start via `npx storybook dev --port 6006 --no-open` (or custom `storybook_start_command`), wait up to 60 seconds for startup
3. Discover stories via `http://localhost:{port}/stories.json` index endpoint
4. For each component with a story: navigate to story URL, take screenshot, store baseline in `__screenshots__/` alongside story file
5. **Graceful degradation**: If Storybook fails to start, skip component-level baselines and log warning in report — do not block page-level review

**Page-level**: Structural DOM assertions instead of pixel comparison. Generated tests use element visibility, counts, layout properties, and axe-core checks. This avoids false positives on every intentional UI change.

#### Step 12: Report Format

The review agent writes two files per review run:

**Machine-readable**: `.claude/review-reports/{page-name}.json` (gitignored)
```json
{
  "page": "/tasks",
  "spec": ".pm/todo/tasks-page-v2/01-task-table.md",
  "status": "pass | fail | max_iterations | report_only",
  "iterations": 3,
  "findings": [{ "id": "...", "severity": "...", "merge_rule": "...", "source_agents": [...], "fixed": true }],
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

**Human-readable**: `.claude/review-reports/{page-name}.md` (gitignored) — markdown summary for developer review.

**Contract**: PM agent Phase 6.2 and tdd-agent read the JSON file's `status` field to determine pass/fail. First-run report-only mode checks for this file's existence.

**Token tracking**: Each LLM call is logged with token counts grouped by sub-agent and iteration. Token events are also written to `workflow_events` with `skill_name = 'frontend-review'`.

#### Suppression File

**Location**: `.claude/review-suppressions.md`

Developers add entries to suppress specific heuristic findings on specific pages. Required when the agent's recommendation conflicts with intentional design.

**Format**:
```markdown
# Review Suppressions
# Each entry: page path, rule ID, last-verified date, and rationale (rationale required)
# The agent auto-updates [verified: ...] each time it applies a suppression.
# Entries not verified in 90 days are flagged as "may be stale" in the report.

/tasks: arch-02 [verified: 2026-03-07] — Intentional flat list. User research shows scanning is preferred over drill-down (see .pm/case-studies/task-scanning.md)
/streams: density-02 [verified: 2026-03-07] — Compact rows are intentional for timeline density
```

The merge agent reads this file before finalizing findings. It auto-updates the `[verified: YYYY-MM-DD]` date each time it applies a suppression (confirming the page still matches the suppression context). Suppressed findings appear in the report as "suppressed" but do not enter the fix loop. Entries older than 90 days appear in the report's "stale suppressions" section as a nudge to re-evaluate.

#### Auth Handling

Before each assessment iteration (step 1.5), the agent verifies auth state.

**Auth config** in `.claude/review-config.json`:
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

**Strategies**:
- `"none"` — No auth needed (public pages, no login)
- `"storage_state"` — Replay Playwright `storageState` file. Works for long-lived sessions
- `"script"` — Run a shell command that outputs fresh `storageState` JSON to stdout (e.g., headless login flow). Used when sessions expire frequently
- `"dev_bypass"` — Set an env var the app recognizes to skip auth (e.g., `BYPASS_AUTH=true` added to dev server startup)

**First-run behavior**: If no auth config exists, prompt: "Does this app require authentication? (none / storage_state / script / dev_bypass)"

**Per-iteration check**:
1. Check for a known authenticated element (nav bar, user avatar, app shell)
2. If element is absent → execute the configured auth strategy
3. If re-auth fails → abort with clear error: `error: auth_expired — could not re-authenticate`

This prevents the catastrophic failure of assessing a login page while thinking it's the target page.

#### Conflict Detection (Step 7)

The fix loop may take several minutes. During this time, a developer or another agent may modify the same files.

1. Before starting the fix loop, record the git status of files in scope (`git diff --name-only`)
2. Before each fix, check if the target file has been modified since the loop started
3. If a conflict is detected: skip the fix for that file, add `conflict_detected: true` to the finding, continue to next fix
4. Report conflicts clearly: "Skipped fix for {file} — modified by another process during review. Re-run after changes settle."

This prevents silent overwrites when multiple agents or developers are working concurrently.

#### Prerequisites Check

Before running the full assessment (step 2), verify the page renders meaningful content:

1. Check page is not 404/500
2. Check body is not empty
3. Check for loading indicators (skeletons, spinners) — wait up to 10s with retries
4. If still loading after 10s → return `{ status: "not_ready", reason: "Page shows loading state after 10s — data layer may not be connected" }`
5. Do not proceed to assessment if prerequisites fail

This prevents wasting assessment tokens on incomplete pages.

#### Inputs

- `page_url` — The page to review (e.g., `/tasks`, `/settings`)
- `spec_path` — Path to spec describing intent (optional but recommended)
- `focus` — Specific concern: `density`, `grouping`, `a11y`, `overflow`, `empty-states`, `interactions`, `flow`, or `all` (default)
- `flow` — For multi-page assessment: ordered list of steps (see Deliverable 5)
- `data_fixtures` — Path to test data fixtures for seeding

#### Playwright Requirements

- Agent checks if `@playwright/test` and `@axe-core/playwright` are in project's `package.json`
- If not, prompts: "Missing dependencies. Install them?"
- Screenshots stored in `.claude/screenshots/` (gitignored)
- Generated tests stored in `e2e/generated/` (committed)
- Zod used for all sub-agent output validation

#### Integration Points

- PM agent Phase 6.2: Auto-invoke when **any** sprint task has `type: frontend` or modifies component/page files
- tdd-agent: After GREEN phase for `frontend` type tasks — agent checks prerequisites first
- bug-workflow: Can escalate visual bugs for diagnosis
- CI/CD: Generated tests run on every PR

---

### Deliverable 2: Storybook Component Catalog

**Framework asset**: `templates/storybook-setup/` — a recipe for installing and configuring Storybook in any N2O project.

**Scope**: Storybook itself supports React, Vue, Svelte, Angular. The **auto-story generation** (Deliverable 6) is React + TypeScript only in v1. Framework adapters for other ecosystems are a documented future extension via a `StoryGenerator` interface.

#### Why Storybook

- Industry standard — every dev knows it
- Isolated component development with hot reload
- Auto-generated props docs from TypeScript interfaces
- **Play functions** for component-level interaction testing (built on Testing Library)
- Works with any React framework (Next.js, Remix, Vite) and non-React frameworks
- Directly feeds Chromatic if teams want cross-browser regression later
- Browsable in a browser at its own port (e.g., `localhost:6006`)

#### Storybook vs Playwright: Complementary Testing Layers

| Layer | Tool | Scope |
|-------|------|-------|
| Component isolation | Storybook play functions | Single component: click dropdown, fill input, verify states |
| Page-level | Playwright via review agent | Full page: navigation, forms, empty/overflow, accessibility |
| Multi-page flows | Playwright via review agent | Sequences across pages: create → list → detail → edit |

#### Auto-Story Generation (React/TypeScript v1)

**Scope**: `StoryGenerator` interface defined for future framework adapters. v1 implements React+TS only.

**Incremental by default**: Generate stories only for components touched in the current sprint or explicitly requested via `--component path/to/component.tsx`. On first setup, detect-project offers to scope: "Found 47 components. Generate stories for all, or only for components in `src/components/ui/` (9 components)?"

Process:
1. Scan component directories (from CLAUDE.md Project Structure)
2. Read each component's TypeScript interface / props type
3. Generate a story file with:
   - Default state (required props only)
   - All variants (if component uses `cva` or variant props)
   - Edge cases (empty string, very long string, undefined optional props)
   - Play function for interactive components (buttons, inputs, dropdowns)
4. Flag components that need manual setup (providers, API data, complex state)
   - Present: "Generated 9 stories, 3 need manual setup: AskPanel (requires Apollo), ActivityPanel (requires GraphQL)"

**Generated story template**:
```typescript
// Auto-generated by /detect-project. Edit freely.
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from '@storybook/test';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  component: Badge,
  title: 'Primitives/Badge',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
    },
  },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: 'Badge', variant: 'default' },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '8px' }}>
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const LongText: Story = {
  args: { children: 'This is a very long badge label that might overflow' },
};
```

#### Recipe Contents

```
templates/storybook-setup/
├── README.md                    # Installation + config guide
├── .storybook/
│   ├── main.ts                  # Storybook config (framework: next, addons)
│   ├── preview.ts               # Global decorators, imports project globals.css
│   └── theme.ts                 # Dark theme config (if project uses dark mode)
├── story-templates/
│   ├── component.stories.tsx    # Template for basic component story
│   ├── interactive.stories.tsx  # Template for component with play function
│   └── complex.stories.tsx      # Template for component needing providers
├── StoryGenerator.ts            # Interface for framework adapters (v1: React/TS impl)
└── chromatic-setup.md           # Optional: how to connect Chromatic
```

#### Agent Integration with Storybook

- **Frontend review agent**: Before flagging "Component Reuse" issues, reads story files to know what components exist, variants, and behavior.
- **tdd-agent**: When creating a new UI component, creates a story file. Part of the RED phase — story before component.
- **detect-project**: Scans for existing components and generates initial story stubs (incremental, scoped).

#### Chromatic as Optional Upgrade

Documented in the recipe. Not required, not embedded in agent workflow.
- Teams that want it get: cross-browser snapshots, visual review UI, PR-level diffing
- Free tier (5k snapshots/mo) is enough for small projects

---

### Deliverable 3: Two-Tier UX Heuristics

#### Tier 1: General Heuristics (ships with framework)

**Location**: `03-patterns/ux-heuristics/SKILL.md`

**Principle-based, not pixel-based.** These apply to any project regardless of design style — dense analytics dashboard, consumer marketing site, documentation wiki. No specific pixel values, colors, or font sizes.

| Rule ID | Category | Principle |
|---------|----------|-----------|
| `arch-01` | Info Architecture | Related items must be visually grouped. Grouping should reflect the user's mental model, not the data model. |
| `arch-02` | Info Architecture | Lists exceeding 8 items should be organized into named categories, tabs, or progressive disclosure. |
| `arch-03` | Info Architecture | Page should have clear visual hierarchy — most important information is most prominent. |
| `density-01` | Density | Spacing between related items should be noticeably less than spacing between unrelated groups. |
| `density-02` | Density | Data-dense views should minimize decorative whitespace without sacrificing readability. |
| `density-03` | Density | Content-heavy views should maximize reading comfort — narrower line width, more vertical spacing. |
| `a11y-01` | Accessibility | All interactive elements must have a visible focus indicator meeting WCAG 2.1 AA. |
| `a11y-02` | Accessibility | Text contrast must meet WCAG 2.1 AA: ≥4.5:1 normal text, ≥3:1 large text/UI components. |
| `a11y-03` | Accessibility | Information must not be conveyed by color alone — pair with icon, text, pattern, or position. |
| `a11y-04` | Accessibility | Every form input must have a visible, associated label. Placeholder is not a label. |
| `a11y-05` | Accessibility | Modals and sheets must trap focus and be dismissible via Escape. |
| `a11y-06` | Accessibility | Page must have logical heading hierarchy (h1 → h2 → h3, no skips). |
| `overflow-01` | Overflow | Page must not horizontal-scroll at its target viewport width. |
| `overflow-02` | Overflow | Unbounded content (lists, tables, text) must have truncation, pagination, or virtualization. |
| `overflow-03` | Overflow | Long text must truncate with mechanism to see full text (tooltip, expand, detail view). |
| `empty-01` | Empty States | Zero-data must show descriptive message explaining what would appear and how to add data. |
| `empty-02` | Empty States | Loading must provide visual feedback. Prefer skeleton/shimmer over spinners for content areas. |
| `empty-03` | Empty States | Errors must show clear message with actionable recovery path. |
| `nav-01` | Navigation | Current location must be visually indicated in navigation. |
| `nav-02` | Navigation | Primary views reachable within 2 clicks from any page. |
| `nav-03` | Navigation | Back button and browser history must work correctly. Client-side nav must update URL. |
| `consistency-01` | Consistency | Similar elements must be styled consistently across the application. |
| `consistency-02` | Consistency | Interaction patterns must be predictable — similar actions work the same way everywhere. |
| `feedback-01` | Feedback | User actions must produce visible feedback within 100ms. |
| `feedback-02` | Feedback | Destructive actions must require confirmation. |
| `feedback-03` | Feedback | Success states must be clearly communicated (not just absence of error). |
| `forms-01` | Forms | Validation errors must appear near the relevant field, not just form top. |
| `forms-02` | Forms | Required fields must be visually distinguished from optional. |
| `forms-03` | Forms | Form submission must be possible via keyboard. |

**Note**: WCAG criteria (a11y rules) are checked programmatically via axe-core and confirmed by the vision agent. Other rules assessed by vision agent with programmatic agent providing supporting data.

#### Tier 2: Project-Specific Heuristics (optional, user-controlled)

**Location**: `.claude/ui-heuristics.md` in each project

**Generated by**: `/detect-project` (new optional section) — Option A (user chooses)

1. `/detect-project` scans theme tokens, component library config, font/spacing/color conventions
2. Presents findings: "Detected: 14px base font, 2px border-radius, Geist Sans, dark theme"
3. Asks: **"Would you like to codify these as project heuristics?"**
   - **Yes**: Writes `.claude/ui-heuristics.md` with detected values
   - **No**: Skips — only general heuristics apply
   - **Customize**: Presents detected values, user overrides

**Why optional**: If someone comes to N2O with a bad website, auto-codifying current conventions would encode the badness. Saying "no" means general heuristics serve as the quality standard.

**Project heuristics contain the pixel values** — the numbers that the general tier deliberately omits:

```markdown
# Project UI Heuristics (generated by /detect-project)
# Edit freely — these supplement general heuristics with project-specific values.

## Theme Tokens
- Background: #1C2127 (from --background)
- Surface: #252A31 (from --card)
- Accent: #2D72D2 (from --primary)
- Border radius: 2px (from --radius)
- Base font: 14px Geist Sans

## Component Library
- Framework: shadcn/ui (new-york style)
- Icon library: lucide-react

## Spacing Conventions
- Card padding: 12px
- Card gap: 8px
- Table row height: 32px

## Density Target
- Data-dense analytics dashboard. Prefer compact layouts.
```

**The frontend review agent reads both tiers**. General always applies. Project-specific supplements or overrides.

---

### Deliverable 4: Data Seeding Strategy

The review agent needs controlled data states to test overflow, empty states, and density.

**Three data states**:

| State | Purpose | Profile |
|-------|---------|---------|
| Empty | Test zero-data UX | No items, no activity, fresh install |
| Normal | Test typical use | 10-20 items, realistic names/values, mixed statuses |
| Overflow | Test at scale | 100+ items, very long strings (50+ chars), all statuses |

**Four seeding approaches** (project chooses what fits):

1. **Mock API responses** (for client-side API calls):
   ```typescript
   await page.route('**/graphql', route => {
     route.fulfill({ body: JSON.stringify(overflowFixture) });
   });
   ```
   Fixtures stored in `e2e/fixtures/{page}/{state}.json`

2. **Seed scripts** (for apps with direct DB access):
   `scripts/seed-empty.sh`, `scripts/seed-normal.sh`, `scripts/seed-overflow.sh`

3. **Component-level fixtures** (for Storybook):
   Each story defines its own fixture data via args/decorators

4. **Environment-controlled fixtures** (for Server Components / SSR / static sites):
   App checks `REVIEW_DATA_STATE=empty|normal|overflow` env var and switches data source.
   Review agent restarts dev server with different env vars per data state:
   ```bash
   REVIEW_DATA_STATE=overflow npm run dev
   ```
   Works regardless of data-fetching architecture — app decides how to use the flag.

**Dev Server Restart Protocol** (for env-controlled fixtures):

Restart strategy is configurable based on machine capability. During initial setup (`/detect-project`), the agent detects available RAM:
- **Sequential** (default, <12GB RAM): Restart dev server per data state. Order: normal → overflow → empty (highest value first). After restart, poll target URL every 2 seconds with 30-second timeout until HTTP 200. If dev server fails to start with a given env var, skip that data state with warning.
- **Parallel** (≥12GB RAM): Launch 3 dev server instances on different ports (e.g., 3000, 3001, 3002) with different `REVIEW_DATA_STATE` values. Run all three assessments concurrently. Faster but uses ~1.5GB additional RAM.

Configurable via `data_seeding_strategy: "sequential" | "parallel"`, `dev_server_command`, and `dev_server_ready_timeout_ms` in `.claude/review-config.json`.

**Review agent behavior**:
1. Check if `e2e/fixtures/` exists or `REVIEW_DATA_STATE` is documented in project config
2. If available: run assessment in all three states using the configured restart strategy
3. If not available: assess with whatever data exists, note in report: "No test fixtures found. Empty state and overflow testing skipped."

---

### Deliverable 5: Multi-Page Flow Assessment

Single-page review catches per-page issues. Flow assessment catches cross-page UX problems.

**What flow assessment checks**:
- Navigation correctness
- State persistence across pages (filters, selections)
- Breadcrumb accuracy
- Browser back button behavior with client-side routing
- Multi-step process progress indication
- Data consistency (edit item → return to list → verify update)

**Hybrid flow definition format** (natural language + optional selectors):
```yaml
# Flow: Create and verify a task
steps:
  - navigate: /tasks
    assert: "Task list page loads"
    check: "page.locator('[data-testid=task-list]').isVisible()"

  - action: "Click 'New Task' button"
    selector: "button:has-text('New Task')"
    assert: "Task creation form appears"
    check: "page.locator('[data-testid=task-form]').isVisible()"

  - action: "Fill in task title 'Test Task'"
    action: "Click Submit"
    assert: "Success feedback shown"

  - navigate: /tasks
    assert: "New task appears in list"
```

When `selector` and `check` fields are provided, the agent uses them directly (deterministic). When absent, the LLM interprets the natural language (flexible but non-deterministic). The agent **backfills selectors** after the first successful run so subsequent runs are deterministic.

**How flow assessment works**:
1. Agent reads flow definition. If none exists in `.claude/review-flows/{page-name}.yaml`:
   a. Infers a flow from the spec's Implementation Plan (translates developer tasks → user journeys)
   b. Presents the generated flow as a YAML preview for developer approval
   c. Only proceeds after approval. Stores approved flow in `.claude/review-flows/{page-name}.yaml` for reuse
   d. On subsequent runs, reuses the stored flow without re-prompting
2. Executes each step via Playwright
3. Screenshots at each step
4. Assesses transitions between steps
5. Checks state persistence, URL updates, browser history
6. Reports flow-level issues separately from page-level issues

**Generated flow tests**: After a flow passes, the agent generates a Playwright test that replays the flow — a permanent E2E test.

---

### Deliverable 6: detect-project Integration

**Location**: Update `02-agents/detect-project/SKILL.md` with two new optional sections.

#### Section 1: Detect UI Conventions (Option A)

Scans for:
- CSS custom properties / Tailwind config → theme tokens
- Component library config (`components.json` for shadcn, `theme.ts` for MUI)
- Global stylesheet → base font size, body styles

Presents findings. Asks user: "Codify as project heuristics? (Yes / No / Customize)". Writes `.claude/ui-heuristics.md` only on approval.

#### Section 2: Generate Storybook Stories (React/TypeScript v1)

**Incremental by default**: scoped to changed/new components.

Process:
1. Find component files in directories from CLAUDE.md Project Structure
2. Read props/interface types
3. Generate story file for each component in scope
4. Flag components needing manual setup (providers, API data)
5. Present: "Generated 12 stories, 3 need manual setup"
6. Write story files on approval

**`StoryGenerator` interface** (for future framework adapters):
```typescript
interface StoryGenerator {
  detect(componentPath: string): ComponentMeta | null;
  generate(meta: ComponentMeta): string; // story file content
  framework: 'react' | 'vue' | 'svelte'; // future: add adapters
}
```

v1 ships React/TS implementation only. Vue/Svelte adapters are a documented future extension.

---

## Implementation Plan

| # | Task | Done When |
|---|------|-----------|
| 1 | Create general UX heuristics pattern skill | `03-patterns/ux-heuristics/SKILL.md` exists with 28 principle-based rules, severity matrix, no pixel values. Registered in CLAUDE.md |
| 2 | Create frontend review agent SKILL.md with multi-agent architecture | `02-agents/frontend-review/SKILL.md` defines 12-step loop with 3 sub-agents + deterministic merge, Zod schemas, suppression file support, auth checks, prerequisites, scoped re-assessment, test generation with burn-in, assessment prompt templates. Registered in CLAUDE.md |
| 3 | Create Storybook setup recipe with auto-story generation | `templates/storybook-setup/` contains installation guide, preview config, dark theme config, story templates, StoryGenerator interface (React/TS impl), Chromatic docs. Incremental generation scoped to changed files |
| 4 | Create data seeding templates | `templates/data-seeding/` contains fixture templates for empty/normal/overflow, Playwright route interception examples, seed script templates, env-controlled fixture guide |
| 5 | Add UI convention detection + story generation to detect-project | `02-agents/detect-project/SKILL.md` updated with optional "Detect UI Conventions" (Option A) and incremental "Generate Storybook Stories" sections |
| 6 | Wire frontend-review into PM agent and tdd-agent | PM agent Phase 6.2 auto-invokes when any task is `type: frontend`. tdd-agent invokes after GREEN for frontend tasks (with prerequisites check). Both skill files updated |

---

## Resolved Questions

1. ~~Should the agent auto-fix or report first?~~ **Resolved**: First run for any page is report-only (no prior report exists). Subsequent runs auto-fix. This gives developers a chance to review findings and populate the suppression file before auto-fix begins. Clear inline messaging explains the behavior on first run.

2. ~~How should the merge agent work?~~ **Resolved**: Deterministic merge rules handle most cases. LLM tiebreaker only for single-agent vision/interaction findings. Non-determinism on ambiguous findings is accepted and documented.

3. ~~How should programmatic vs. vision severity conflicts be handled?~~ **Resolved**: Programmatic findings always survive but merge agent can downgrade severity. `original_severity` preserved for audit.

4. ~~How should vision hallucinations be caught?~~ **Resolved**: Programmatic evidence (computed styles) overrides vision findings on measurable properties. Vision findings dismissed with `dismissed_reason`.

5. ~~How should iteration cost be managed?~~ **Resolved**: Scoped re-assessment on iterations 2+ — only re-run agents affected by fixes. Final iteration always runs all agents for full validation. Vision agent uses viewport tiering (full 5-pass on primary, layout-only on secondaries).

6. ~~How should first run on a legacy project work?~~ **Resolved**: First run is report-only (see Q1). Developer reviews report, populates suppressions, then re-runs for auto-fix. No separate "baseline mode" concept.

7. ~~How should auth expiration be handled?~~ **Resolved**: Pluggable auth strategies in `.claude/review-config.json`: `none`, `storage_state`, `script` (shell command outputting fresh storageState), `dev_bypass` (env var). Prompt on first run if no config exists.

8. ~~How should the agent handle incomplete pages?~~ **Resolved**: Prerequisites check before assessment. Return "not ready" with specifics if page isn't rendering meaningful content.

9. ~~How should Server Components data seeding work?~~ **Resolved**: Environment-controlled fixtures via `REVIEW_DATA_STATE` env var. App decides how to use the flag.

10. ~~How should generated tests avoid flakiness?~~ **Resolved**: Conservative patterns (explicit waits, timeouts, retry). 5x burn-in with fresh `browser.newContext()` per run for full isolation. Staging dir for failed burn-in.

11. ~~How should flow definitions handle ambiguity?~~ **Resolved**: Hybrid format — natural language + optional selectors. Agent backfills selectors after first successful run.

12. ~~When should the review auto-invoke?~~ **Resolved**: When any sprint task has `type: frontend` or modifies component/page files.

13. ~~What frameworks does auto-story generation support?~~ **Resolved**: React + TypeScript v1. StoryGenerator interface defined for future framework adapters (Vue, Svelte).

14. ~~How should auto-story generation scale?~~ **Resolved**: Incremental — scoped to changed files or explicit `--component` flag.

15. ~~How should sub-agent output be validated?~~ **Resolved**: Zod schema validation. Retry once on failure. Second failure skips that agent + warning.

16. ~~How should visual regression baselines work?~~ **Resolved**: Component-level screenshots in Storybook stories. Page-level uses structural DOM assertions, not pixel comparison.

---

17. ~~How should the review agent handle pages requiring authentication?~~ **Resolved**: Pluggable auth strategies (`none`, `storage_state`, `script`, `dev_bypass`) in `.claude/review-config.json` with concrete schema. Prompt on first run if no config exists.

18. ~~Should flow definitions be auto-generated from specs?~~ **Resolved**: Yes, but with approval gate. Agent infers flow from spec, presents as YAML preview for developer approval before executing. Approved flows stored in `.claude/review-flows/{page-name}.yaml` for reuse on subsequent runs.

19. ~~Should `.claude/ui-heuristics.md` be gitignored or committed?~~ **Resolved**: Committed. Deliberate project artifact the user opted into. Benefits from code review and manual tuning.

20. ~~Should the first run auto-fix or report only?~~ **Resolved** (second adversarial review): First run is report-only when no prior report exists. Clear inline messaging tells the developer. Subsequent runs auto-fix.

21. ~~How should scoped re-assessment handle cascading CSS regressions?~~ **Resolved**: Final iteration always runs all three agents regardless of `affected_agents` tags.

22. ~~How should `affected_agents` be computed for fixes?~~ **Resolved**: Deterministic derivation from the finding's `source_agents`. CSS/className changes auto-add vision. ARIA/role changes auto-add interaction.

23. ~~Should computed styles extraction query all DOM elements?~~ **Resolved**: Scoped to semantic elements (headings, buttons, inputs, table cells, cards, landmarks). Repeated elements sampled (first 5 + last 1). Capped at 500 elements. Configurable.

24. ~~Should the interaction agent have a resource budget?~~ **Resolved**: Max 30 steps with priority ordering. 10-second per-step timeout. 30-minute total wall clock with clean break.

25. ~~Should token cost be tracked?~~ **Resolved**: Track per sub-agent per iteration. Report includes cost summary. Write to `workflow_events`.

26. ~~How should vision multi-pass scale across viewports?~~ **Resolved**: Primary viewport gets full 5-pass. Secondary viewports get single "Responsive Layout" pass. Cross-viewport deduplication.

27. ~~Should Storybook integration have a runtime protocol?~~ **Resolved**: Check port → start if not running → wait 60s → read stories.json → navigate → screenshot. Graceful degradation if Storybook fails.

28. ~~How should env-controlled fixture restarts be coordinated?~~ **Resolved**: Configurable based on machine capability (sequential <12GB, parallel ≥12GB). Sequential: readiness probe with 30s timeout, order normal → overflow → empty. Skip state on failure.

29. ~~Should burn-in runs be isolated?~~ **Resolved**: Fresh `browser.newContext()` per run for full cookie/storage/WebSocket isolation.

30. ~~What is the report output format?~~ **Resolved**: JSON (machine-readable, with `status` field) + markdown (human-readable). Both gitignored. PM agent reads JSON `status` field.

31. ~~How should stale suppressions be detected?~~ **Resolved**: Auto-updated `[verified: YYYY-MM-DD]` date each time a suppression is applied. Entries older than 90 days flagged as "may be stale" in report.

32. ~~Should auto-generated flow definitions require approval?~~ **Resolved**: Yes. Present as YAML preview, execute only after approval. Store approved flows in `.claude/review-flows/` for reuse.

33. ~~How should the review agent handle concurrent file modifications?~~ **Resolved**: Git-based conflict detection. Record git status before fix loop, check before each fix. Skip conflicted files with clear reporting.

34. ~~How should the review-config.json be structured?~~ **Resolved**: Single config file with sections for auth, Storybook, data seeding, interaction budget, style extraction limits, viewport settings, and dev server commands. Populated incrementally on first run and via detect-project.

---

## Open Questions

None — all questions resolved via two adversarial reviews.

---

## Review Config Reference

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
