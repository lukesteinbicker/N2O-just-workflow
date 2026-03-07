## Adversarial Review: Frontend Review Sprint

**Instructions**: For each question, reply with the question number and your chosen
option letter (e.g., "1A, 2B, 3C"). The recommended option is marked for each.
If you want to discuss a question further, just say so.

---

### Developer Control & Consent

These questions determine the fundamental operating mode of the review agent. Every subsequent question about fix loops, iteration cost, and disagreement resolution depends on whether the agent auto-fixes or reports first.

**Q1. No developer consent model -- agent changes code without approval**

Step 6 says "FIX: Apply code changes." No approval step between findings and code changes. Could modify files with uncommitted changes, causing merge conflicts.

This matters because auto-fix is the most aggressive default possible. If the agent modifies files the developer is actively editing, or applies opinionated changes to intentional design choices, trust in the system collapses on first use. This is foundational -- the answer changes how every other question about fix loops, iterations, and disagreements works.

| Option | Description |
|--------|-------------|
| A. Always auto-fix | Current spec behavior. Impl note: No change to spec. Core Loop step 6 applies changes directly. |
| **B. Report-first with opt-in auto-fix (Recommended)** | Default: assess and report. Developer reviews, then runs `--fix` to apply. Add `--auto-fix` for CI or experienced users. Impl note: Core Loop restructuring -- default stops after MERGE (step 5), fix only with `--fix` flag. Add `--auto-fix` flag for unattended CI runs. |
| C. Fix-with-rollback | Auto-fix but create git stash first. Developer can revert easily. Impl note: Add `git stash push -m "pre-review"` before step 6, `git stash pop` as rollback command in report. |

**Schema/spec impact**: Core Loop restructuring: default stops after MERGE, fix only with flag. Affects Steps 6-8 and the iteration model.

---

**Q2. No escape hatch -- review agent and developer disagree**

The review agent adds grouping headers to a flat list the developer intentionally designed. Developer reverts. Next review run re-adds grouping. Infinite cycle.

This matters because without a suppression mechanism, the agent becomes adversarial to the developer rather than collaborative. Any opinionated heuristic (like arch-02, "Lists exceeding 8 items should be organized") will create conflicts with intentional design choices. The suppression file is the bridge between "agent has opinions" and "developer has final authority."

| Option | Description |
|--------|-------------|
| **A. Per-page suppression file with rationale (Recommended)** | `.claude/review-suppressions.md` with entries like `/tasks: arch-01 -- intentional flat list per user research`. Suppressions require rationale. Impl note: New file `.claude/review-suppressions.md` with structured format. Merge agent (step 5) reads suppressions before applying severity. Suppressed findings appear as "suppressed" in report but do not enter fix loop. |
| B. Interactive mode during fix phase | Present each finding, ask "Fix? (Y/N/Suppress)". Impl note: Step 6 becomes interactive prompt loop. Requires TTY -- breaks CI/unattended mode. |
| C. Info-only mode by default | Never auto-fix, only report. Impl note: Remove steps 6-8 entirely. Agent becomes read-only. Loses the closed-loop value proposition. |

**Schema/spec impact**: New file spec for `.claude/review-suppressions.md`. Merge agent logic reads suppressions. Report output includes suppressed findings separately.

---

### Multi-Agent Consensus Architecture

These questions address how the three sub-agents and merge agent interact -- disagreement resolution, hallucination handling, and the determinism of the merge step. Getting these right determines whether findings are trustworthy.

**Q3. Merge agent is itself an LLM -- who reviews the reviewer?**

The merge agent receives conflicting findings from three sub-agents and must "decide" which single-agent findings are real. The spec says the merge agent "reviews the screenshot and decides." But the merge agent is a fourth LLM call with its own non-determinism. Run the same assessment twice and the merge agent may keep different findings each time.

This matters because non-deterministic merge undermines developer trust. If the same page produces different findings on different runs, developers will dismiss the tool as unreliable. Making merge rules deterministic where possible (which is most cases) and limiting LLM judgment to genuinely ambiguous cases creates a predictable system.

| Option | Description |
|--------|-------------|
| **A. Deterministic merge rules with LLM as tiebreaker only (Recommended)** | Define explicit merge rules: (1) programmatic findings always survive, (2) findings flagged by 2+ agents always survive, (3) LLM merge agent only decides on single-agent vision/interaction findings. Log the merge decision rationale. Impl note: Rewrite spec's "Merge logic" section to codify rules 1-2 as deterministic code (no LLM). LLM merge agent receives only the subset of single-agent-only vision/interaction findings. Add `merge_rationale` field to each finding's JSON. |
| B. Run merge agent 3 times and majority-vote | Triple the merge cost but get statistical stability. Impl note: Merge step runs 3x, findings that appear in 2+ runs survive. Triples cost of step 5 (3 additional LLM calls per assessment). |
| C. Accept non-determinism, document it | Tell developers that results may vary across runs. Focus on critical findings (which are mostly programmatic and stable). Impl note: Add "Results may vary" disclaimer to report. No code change. |

**Schema/spec impact**: Spec's "Merge logic" section (Step 5) needs rewrite to make deterministic rules primary and LLM decision secondary. Finding JSON gains `merge_rationale` field.

---

**Q4. Sub-agent disagreement on severity, not existence**

The programmatic agent flags a contrast ratio at 4.4:1 (fails WCAG AA by a hair). The vision agent says "contrast looks fine, readability is good." The interaction agent does not weigh in. The merge agent now faces a 1-of-3 disagreement, but the spec says "Programmatic findings always survive." The developer gets a critical finding for a 0.1:1 miss that the human eye cannot distinguish, and the review agent forcibly changes their intentional design choice (e.g., they chose that exact shade for brand reasons).

This matters because the spec gives programmatic findings absolute authority ("always survive, no false positives") but axe-core does produce findings that are technically correct yet practically insignificant. The fix loop will burn iterations on micro-violations while missing bigger holistic issues.

Changed from B to A -- reason: The dual-severity model (option B) adds schema complexity for a problem that option A solves more simply. What the developer actually needs is: "this technically fails WCAG AA, but it's borderline and your call." Downgrading severity achieves that without adding a second severity dimension to every finding. The compliance detail (exact ratio, threshold) is already in the programmatic finding's description. A separate `compliance_severity` field adds cognitive overhead for reviewers parsing the report.

| Option | Description |
|--------|-------------|
| **A. Programmatic findings always survive but severity is adjustable (Recommended)** | Programmatic findings enter the merge as "confirmed" (not deletable), but the merge agent can downgrade severity from critical to warning or info if the vision agent explicitly contradicts. Impl note: Merge logic step 2 amendment: programmatic findings survive but severity can be overridden downward (never upward) if vision agent provides explicit contradicting assessment. Add `original_severity` field to preserve audit trail. |
| B. Introduce a "compliance" vs. "usability" severity split | Programmatic findings get a dual severity: compliance severity (WCAG level) and usability severity (merge agent's judgment). Impl note: Finding JSON gains `compliance_severity` field alongside `severity`. Fix loop uses usability severity for iteration decisions, compliance severity for report. Doubles severity logic complexity. |
| C. Add a threshold tolerance to programmatic rules | Allow a configurable tolerance (e.g., contrast within 5% of threshold counts as warning, not critical). Impl note: Add tolerance config to programmatic agent. E.g., `{ "contrast_tolerance": 0.05 }` in `.claude/review-config.json`. Makes programmatic layer slightly fuzzy. |

**Schema/spec impact**: Finding JSON gains `original_severity` field to preserve audit trail when merge agent downgrades. Merge logic section updated.

---

**Q5. LLM vision assessment hallucinates issues that do not exist**

The vision agent reports density violations on a table with padding that exactly matches project heuristics. The programmatic agent's computed styles confirm compliance.

This matters because LLM vision hallucinations are the biggest threat to developer trust. If the vision agent flags phantom issues, developers learn to ignore all findings. The cross-reference rule creates a natural check: if the vision agent claims spacing is wrong but computed styles say it matches project heuristics, the vision agent is hallucinating.

| Option | Description |
|--------|-------------|
| **A. Programmatic evidence overrides vision findings on measurable properties (Recommended)** | If vision flags spacing/contrast/font-size and computed styles show compliance, merge agent dismisses the vision finding. Impl note: Merge logic gains a "measurable property cross-reference" rule: for vision findings about spacing, contrast, font-size, border-radius, or any property in project heuristics, merge agent checks programmatic agent's computed styles. If computed styles confirm compliance, vision finding is dismissed with `dismissed_reason: "contradicted by computed styles"`. |
| B. Vision findings on measurable properties always downgraded to info | Any vision finding about measurable properties is automatically severity: info. Impl note: Category-based severity cap in merge logic. Vision findings tagged with measurable-property categories get `max_severity: info`. |
| C. Require vision agent to cite specific pixel values | Force the vision prompt to output values it "sees." Cross-reference with computed styles. Impl note: Update vision assessment prompt to require numeric values for spacing/sizing claims. Add cross-reference step comparing vision-claimed values against computed styles. |

**Schema/spec impact**: Merge logic needs a cross-reference rule for measurable properties. Finding JSON can include `dismissed_reason` for transparency.

---

### Cost & Iteration Control

These questions address the practical economics of running the review agent. A system that costs too many tokens or runs too many iterations will not be used, regardless of quality.

**Q6. Three sub-agents plus merge agent on every iteration -- cost explosion**

A page with 8 issues goes through 5 iterations. Each iteration runs 3 sub-agents plus merge. The vision agent alone takes 5 LLM calls per iteration (one per assessment category). Over 5 iterations that is 35+ LLM calls for a single page.

This matters because token cost is the primary reason developers stop using AI tools. If a single page review costs $5-10 in API calls, adoption collapses. Scoped re-assessment on iterations 2+ is the obvious optimization: if iteration 1 only fixed contrast issues, there is no reason to re-run all 5 vision passes.

| Option | Description |
|--------|-------------|
| **A. Scoped re-assessment on iterations 2+ (Recommended)** | After iteration 1, only re-run sub-agents relevant to the fixes applied. If iteration 1 only fixed contrast issues, re-run programmatic agent only. Impl note: Fix history (step 7) tags each fix with the sub-agent category that flagged it. Steps 7-8 use these tags to determine which sub-agents re-run. Add `affected_agents: ["programmatic"]` to fix history entries. Merge agent on iteration 2+ only processes new findings + unchanged findings from prior iteration. |
| B. Reduce vision passes on later iterations | Run only vision categories that had findings in the previous iteration. Impl note: Vision agent receives a `categories_to_assess` parameter. Iteration 2+ only includes categories that produced findings in iteration N-1. |
| C. Hard cap on total LLM calls per review | Set a budget (e.g., 50 LLM calls per page). Impl note: Add call counter. Agent stops iteration loop when budget exhausted, reports remaining issues as unfixed. Add `--budget` flag. |
| D. Single-agent mode for iterations 2+ | Subsequent iterations use a single combined assessment agent. Impl note: Iteration 2+ replaces 3-agent + merge with single "verification agent" that checks whether specific fixes were applied correctly. Much cheaper but loses multi-agent consensus benefit. |

**Schema/spec impact**: Core Loop steps 7-8 need a "scoped re-assessment" protocol. Fix history gains `affected_agents` field.

---

**Q7. First review run on project with extensive tech debt**

First run on legacy page: 45 findings (12 critical, 18 warning, 15 info). Fix loop hits 5-iteration max without resolving all critical issues.

This matters because first-run experience determines adoption. If the first review produces an overwhelming wall of issues and the fix loop cannot resolve them all, the developer's first impression is "this tool is broken." Baseline mode makes the first run useful (comprehensive report) without making it overwhelming (only fix the easy wins, backlog the rest).

| Option | Description |
|--------|-------------|
| **A. Baseline mode for first run (Recommended)** | First run: assess and report, only auto-fix isolated critical issues (those fixable in a single file change). Commit remaining as backlog. Subsequent runs operate on delta from baseline. Impl note: Add `--baseline` flag (auto-detected on first run for a page). Baseline results stored in `.claude/review-baselines/{page-name}.json`. Subsequent runs diff against baseline -- only new findings enter the fix loop. |
| B. Configurable severity threshold for first run | Allow `--min-severity=warning` on first run. Impl note: Add `--min-severity` flag. Fix loop skips findings below threshold. Simple but doesn't track baseline for delta comparison. |
| C. Per-page review maturity levels | Track maturity: unreviewed -> baselined -> passing. Impl note: Add maturity tracking to `.claude/review-baselines/`. More state to manage but provides clear progression visibility. |

**Schema/spec impact**: Add baseline storage mechanism in `.claude/review-baselines/`. Core Loop step 1 checks for existing baseline.

---

### Runtime Prerequisites & Failure Modes

These questions address what happens when the environment is not in the state the review agent expects. Auth expiration, missing data, and premature invocation all produce silently wrong results.

**Q8. Auth token expires during fix loop iterations**

Auth token expires during iteration 3. Vision agent assesses login page, reports "all clear" -- catastrophically wrong.

This matters because silent failure is the worst kind of failure. The agent produces a clean report for a login page while thinking it reviewed the actual application. Every finding from that iteration is garbage. An auth health check before each iteration is cheap (one DOM assertion) and prevents catastrophic waste.

| Option | Description |
|--------|-------------|
| **A. Auth health check before each iteration (Recommended)** | Verify auth state by checking for known element (e.g., nav bar, user avatar, app shell) before each assessment. Re-authenticate if expired. Fail with clear error if re-auth fails. Impl note: Core Loop gains step 1.5: "AUTH CHECK -- verify known authenticated element is present. If absent, attempt re-auth using stored auth config. If re-auth fails, abort with `error: auth_expired`." Auth config read from `.claude/review-config.json` or Playwright `storageState`. |
| B. Use Playwright's `storageState` with auto-refresh | Save and restore auth state per iteration. Impl note: Playwright `context.storageState()` saved after initial auth. Restored before each iteration. Does not handle token expiry -- only session cookies. |
| C. Require long-lived dev tokens | Document `REVIEW_AUTH_TOKEN` requirement. Impl note: Add env var requirement to Playwright Requirements section. Simplest but shifts burden to developer and does not work for all auth systems. |

**Schema/spec impact**: Core Loop needs AUTH CHECK sub-step between CONNECT and NAVIGATE. Auth configuration added to project config.

---

**Q9. tdd-agent invokes review after GREEN -- but GREEN doesn't mean page is wired up**

GREEN phase means "tests pass," not "page is running with data." The review agent connects to localhost but the page shows a loading spinner or placeholder content because the data layer is not implemented yet.

This matters because invoking review on an incomplete page wastes all assessment tokens and produces meaningless findings ("page shows a loading spinner" is not a useful UX finding). The review agent needs to verify it is looking at real content before spending tokens on assessment.

| Option | Description |
|--------|-------------|
| A. Only invoke after final task in spec | Wait until all spec tasks are done. Impl note: PM agent Phase 6.2 checks all tasks in spec are `status: done` before invoking review. Simple but delays feedback -- developer gets all review findings at the end instead of incrementally. |
| **B. Review agent checks prerequisites before running (Recommended)** | Before running, verify page renders meaningful content (not just a spinner or skeleton). If not ready, return structured "not ready" response with what is missing. Impl note: Core Loop step 1 expanded: after CONNECT, check for `[data-testid="loading"]`, skeleton elements, or empty body. If page appears to be loading/empty, wait up to 10s with retries. If still not ready, return `{ status: "not_ready", reason: "Page shows loading state after 10s" }` and do not proceed to assessment. |
| C. Add a `review_ready` flag to task schema | tdd-agent sets flag when page is reviewable. Impl note: Add `review_ready BOOLEAN DEFAULT 0` to tasks table. tdd-agent sets to 1 when page is wired up with data. Review agent checks flag before running. Requires schema migration. |

**Schema/spec impact**: Core Loop step 1 gains a content-readiness check. No schema change needed.

---

**Q10. Data seeding strategy assumes API-driven or DB-driven apps**

Next.js App Router with Server Components uses RSC `fetch` -- no client-side API calls to intercept via Playwright route mocking. The three seeding strategies in Deliverable 4 (mock API, seed scripts, component fixtures) all miss this case.

This matters because Server Components are the default in Next.js 14+ (and this project uses Next.js 16). Playwright `page.route()` intercepts network requests at the browser level, but RSC fetches happen on the server. The review agent's data seeding will silently fail on the most common modern React architecture.

| Option | Description |
|--------|-------------|
| **A. Add environment-controlled fixtures (Recommended)** | Projects define `REVIEW_DATA_STATE=empty|normal|overflow`. App reads this and switches data sources (e.g., mock DB, fixture files, conditional fetch URLs). Review agent restarts dev server with different env vars per data state. Impl note: Deliverable 4 gains a fourth seeding approach: "Environment-controlled fixtures." Review agent sets env var, restarts dev server (`REVIEW_DATA_STATE=overflow npm run dev`), waits for ready, then assesses. App code must check this env var. Add template to `templates/data-seeding/env-fixtures.md`. |
| B. Proxy the dev server | Intercept and replace HTML responses at the network level. Impl note: Run a proxy between Playwright and dev server that can swap response bodies. Heavy infrastructure, fragile with streaming RSC responses. |
| C. Accept that some projects cannot be seeded | Document the limitation for RSC apps. Impl note: Add "Limitations" section to Deliverable 4 noting that RSC apps require env-controlled fixtures or seed scripts. No code change. |

**Schema/spec impact**: Deliverable 4 needs a fourth seeding approach for server-side rendering architectures. Template addition to `templates/data-seeding/`.

---

### Test Generation Reliability

These questions address whether the generated Playwright tests are actually useful -- flaky tests or ambiguous flow definitions undermine the entire test generation value proposition.

**Q11. Generated Playwright tests are flaky from day one**

The interaction agent clicks a dropdown, waits for it to open, then the test generator encodes this as a click + visibility check. But the dropdown has a 150ms CSS transition. The generated test passes during generation but fails 30% of the time in CI due to timing.

This matters because flaky tests erode trust faster than no tests. If the first batch of generated tests fails intermittently in CI, developers will delete the entire `e2e/generated/` directory and never use the feature again. The test generator must produce defensive tests that account for real-world browser timing.

| Option | Description |
|--------|-------------|
| A. Run generated tests 3 times before committing | Execute each generated test 3 times; only commit tests that pass all 3 runs. Impl note: Step 9 gains a burn-in sub-step: run each test 3x, discard tests that fail any run. Reduces flaky tests but 3 runs may not catch 30% flake rate reliably. |
| **B. Conservative test generation with explicit waits and retry (Recommended)** | Generate tests with defensive patterns: `waitForSelector`, configurable timeouts, retry logic. Include a `// flakiness-risk: medium` comment on timing-sensitive assertions. Run 5 times locally before committing. Impl note: Test generation templates updated to use `await page.waitForSelector('.dropdown-content', { state: 'visible' })` instead of bare assertions. Add `test.describe.configure({ retries: 1 })` to generated test files. Each test gets a flakiness-risk comment. Step 9 runs 5x burn-in before committing. |
| C. Generate tests as "draft" -- never auto-commit | Place generated tests in staging directory. Developer reviews and promotes manually. Impl note: Tests written to `e2e/draft/` instead of `e2e/generated/`. Developer moves to `e2e/` after review. Safest but highest friction -- most drafts will never be promoted. |

**Schema/spec impact**: Step 9 (Test Generation) needs a burn-in protocol and defensive test patterns in the generation templates.

---

**Q12. Flow definition YAML uses natural language -- LLM interprets ambiguously**

`action: "Click 'New Task' button"` could map to multiple Playwright selectors. Same flow definition may produce different Playwright actions across runs, making flow tests non-deterministic.

This matters because flow definitions are the input to both flow assessment (Deliverable 5) and generated flow tests. If the same YAML produces different Playwright actions on different runs, the flow tests are unreliable and the assessment results are not reproducible.

| Option | Description |
|--------|-------------|
| **A. Hybrid format: natural language + optional selectors (Recommended)** | Allow optional Playwright selectors alongside natural language. Use selector when provided, LLM interpretation when absent. Impl note: Flow YAML format gains optional `selector` and `check` fields per step. E.g., `action: "Click 'New Task' button"` becomes `action: "Click 'New Task' button"\n  selector: "button:has-text('New Task')"`. Agent auto-populates selectors after first successful run so subsequent runs are deterministic. |
| B. Natural language only with screenshots at each step | Accept non-determinism, verify via screenshots after each step. Impl note: Each flow step captures before/after screenshots. Vision agent verifies expected outcome. Handles ambiguity but doubles screenshot cost. |
| C. Structured-only format | Replace natural language with Playwright commands entirely. Impl note: Flow YAML becomes Playwright script syntax. Deterministic but defeats the purpose -- developers could just write Playwright tests directly. |

**Schema/spec impact**: Flow definition format (Deliverable 5) gains optional `selector` and `check` fields. Agent backfills selectors after first successful run.

---

### Integration & Scope Boundaries

These questions address how the review agent integrates with the rest of the N2O framework -- when it runs, what it covers, and what it explicitly does not cover.

**Q13. Who decides if a sprint is "UI-heavy" enough for review?**

The spec says PM agent Phase 6.2 invokes `/frontend-review` for "UI-heavy sprints" but provides no definition of "UI-heavy." PM agent either always invokes review (wasting time on backend sprints) or never does (missing UI sprints).

This matters because the invocation trigger needs to be deterministic. If it depends on LLM judgment ("is this sprint UI-heavy?"), different runs will make different invocation decisions. A simple ratio threshold based on task metadata makes the decision predictable.

| Option | Description |
|--------|-------------|
| **A. Auto-invoke based on task type ratio (Recommended)** | If >30% of sprint tasks have `type: frontend` or touch files in `src/app/` or `src/components/`, auto-invoke on all modified pages. Impl note: PM agent Phase 6.2 queries task DB: `SELECT COUNT(*) FROM tasks WHERE sprint_id = ? AND type = 'frontend'`. If ratio > 0.3, invoke `/frontend-review` for each page URL found in task `page_url` or inferred from modified file paths. Add `page_url` field to tasks if not present. |
| B. Always invoke with `--fast` for non-UI sprints | Run review on every sprint, lighter mode for non-UI ones. Impl note: PM agent always invokes. `--fast` skips interaction agent and runs only 2 vision passes. Wastes some tokens on pure backend sprints but never misses a UI sprint. |
| C. Let the developer decide | Prompt at sprint completion: "Run frontend review? (Y/N)". Impl note: PM agent Phase 6.2 prompts before invoking. Simple but adds friction and depends on developer remembering. |

**Schema/spec impact**: PM agent Phase 6.2 needs threshold rule. Tasks table may need `page_url` column.

---

**Q14. Auto-story generation assumes React with TypeScript interfaces**

The spec says auto-story generation reads TypeScript interfaces to generate stories. A project using Vue, Svelte, or React with PropTypes gets zero auto-generated stories.

This matters because the spec claims to be "framework-level" and "project-agnostic" but auto-story generation is React+TypeScript-specific. This is fine for v1 but needs to be stated explicitly so no one is surprised.

| Option | Description |
|--------|-------------|
| **A. Scope v1 to React/TypeScript, document framework interface (Recommended)** | Explicitly state React + TypeScript target in Deliverables 2 and 6. Define a `StoryGenerator` interface (input: component file path + parsed props, output: story file content) for future framework adapters. Impl note: Add "Scope: React + TypeScript" callout to Deliverables 2 and 6. Define `StoryGenerator` interface in spec. Future Vue/Svelte support implements this interface. No code change beyond documentation. |
| B. Build framework adapters from day one | Plugin system with React, Vue, Svelte adapters. Impl note: Abstract story generation behind adapter pattern. Ship React adapter, stub Vue/Svelte. Significant extra design work for frameworks that may never be used. |
| C. Drop auto-story generation entirely | Make Storybook setup manual-only. Impl note: Remove auto-story generation from Deliverables 2 and 6. Storybook recipe remains but stories are always hand-written. Loses a key automation feature. |

**Schema/spec impact**: Deliverables 2 and 6 need explicit "Scope: React + TypeScript" callout. Optional `StoryGenerator` interface definition.

---

**Q15. 500+ components -- auto-story generation at scale**

Large project generates 500 stories. Half fail to render (missing providers, complex dependencies, API data requirements). Developer gets "247 need manual setup" -- an unusable ratio that makes the feature feel broken.

This matters because auto-story generation's value depends on hit rate. If >50% of generated stories fail, the feature creates more work (triaging failures) than it saves (writing stories). Scoping to changed files keeps the ratio manageable and aligns with the incremental workflow.

| Option | Description |
|--------|-------------|
| **A. Incremental story generation scoped to changed files (Recommended)** | Generate stories only for components touched in current sprint or explicitly requested via `--component` flag. Impl note: Story generation reads git diff or sprint task file list to determine scope. `detect-project` generates stories only for new/modified components. Add `--component path/to/component.tsx` flag for explicit single-component generation. |
| B. Tier components by complexity | Only auto-generate for simple components (no providers, no hooks, <3 props). Impl note: Static analysis of component imports. Components importing context providers, API hooks, or having >N props are skipped with "needs manual story" note. |
| C. Hard cap at 50 components per invocation | Prioritize by variant count or usage frequency. Impl note: Sort components by prop count (proxy for complexity), generate top 50. Arbitrary limit that may miss important components. |

**Schema/spec impact**: Deliverable 6 needs scoping mechanism. Story generation accepts `--component` flag or reads from sprint file list.

---

### New Questions (Gaps Identified)

**Q16. No structured output schema validation -- sub-agents return malformed JSON**

The spec defines JSON output formats for each sub-agent (vision findings, interaction findings, programmatic findings) but does not specify what happens when an LLM sub-agent returns malformed JSON, missing required fields, or an unexpected schema. The merge agent receives garbage input and either crashes or produces unreliable results silently.

This matters because LLM-generated JSON is notoriously unreliable. Even with structured output prompts, models omit fields, hallucinate extra fields, or return partial JSON. Without validation, one malformed sub-agent response can corrupt the entire merge.

| Option | Description |
|--------|-------------|
| **A. Zod schema validation with retry on failure (Recommended)** | Define Zod schemas for each sub-agent's output. Parse output through schema validation. On validation failure, retry the sub-agent call once with the validation error appended to the prompt. On second failure, skip that sub-agent's findings for this iteration and log a warning. Impl note: Add Zod schemas for `ProgrammaticFindings`, `VisionFindings`, `InteractionFindings`, and `MergedFindings`. Each sub-agent call wraps response in `schema.safeParse()`. Retry logic: `if (!result.success) { retry with error context }`. Second failure: `findings = []` for that agent + warning in report. |
| B. Best-effort parsing with fallback | Parse what you can, ignore malformed sections. Impl note: Lenient JSON parser that extracts valid findings even from partially malformed output. Risk: silently drops findings. |
| C. Require function calling / structured outputs mode | Use model's native structured output feature (e.g., OpenAI function calling, Anthropic tool use). Impl note: Restructure prompts as tool definitions with typed parameters. Dependent on model provider capabilities. |

**Schema/spec impact**: Add output schema definitions (Zod or JSON Schema) to each sub-agent section. Add retry-on-validation-failure protocol to the Core Loop.

---

**Q17. Visual regression baselines break on every intentional design change**

Step 10 (BASELINE) runs `toHaveScreenshot()` to create visual regression baselines. But any intentional design change (new feature, theme update, layout adjustment) will break these baselines. The developer must manually update baselines after every intentional change, or CI blocks on false-positive screenshot diffs. At scale (20+ pages), baseline maintenance becomes a full-time job.

This matters because visual regression testing is only valuable if the signal-to-noise ratio is high. If every PR triggers baseline failures because of intentional changes, developers will either disable the tests or auto-approve all diffs -- both of which eliminate the safety net.

| Option | Description |
|--------|-------------|
| **A. Component-level baselines + page-level structural assertions (Recommended)** | Use `toHaveScreenshot()` only for isolated Storybook component stories (stable, small surface area). For page-level regression, generate structural assertions (element counts, layout properties, accessibility checks) instead of pixel-based screenshots. Impl note: Step 10 split: Storybook stories get `toHaveScreenshot()` baselines (isolated, stable). Page-level tests use DOM assertions (`expect(page.locator('table')).toBeVisible()`, axe-core checks) instead of screenshot comparison. Remove page-level `toHaveScreenshot()` from generated tests. |
| B. Auto-update baselines when review passes | After review agent approves a page, automatically update its screenshot baselines. Impl note: Step 10 always overwrites existing baselines after a passing review. Risk: hides regressions if review agent misses an issue. |
| C. Keep pixel baselines, add threshold tolerance | Allow small pixel-diff tolerance (e.g., 0.1% change is acceptable). Impl note: Configure `toHaveScreenshot({ maxDiffPixelRatio: 0.001 })`. Reduces false positives from anti-aliasing but does not help with intentional layout changes. |

**Schema/spec impact**: Step 10 (BASELINE) needs restructuring. Page-level tests shift from screenshot baselines to structural assertions. Storybook stories retain screenshot baselines.
