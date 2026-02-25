# N2O Framework Roadmap

## Overview

N2O is a workflow framework for AI-assisted software development. It provides a CLI (`n2o init` / `n2o sync`), SQLite-based task management, and 6 skills (pm-agent, tdd-agent, bug-workflow, detect-project, react-best-practices, web-design-guidelines) coordinated through a manifest-based file ownership model.

**Current version:** 1.0.0

| Goal | Existing Foundation | Maturity |
|------|-------------------|----------|
| 1. Seamless Updates | `n2o sync`, version pinning, selective sync, changelogs, schema migrations | **Done** |
| 2. Best Tooling Always | YAML trigger descriptions, CLAUDE.md auto-invocation instructions, config toggles | **Done** |
| 3. Frictionless Init | `n2o init`, detect-project, E2E test suite (17 tests) | **Done** |
| 4. Team Collaboration | Linear sync scripts, MCP config, sync orchestrator, schema fields | **Done** (Linear sync rework + E2E pending) |
| 5. Parallelization | Worktrees, atomic claiming, merge queue, orchestrator spec | Designed |
| 6. Skill Quality | Skill linter, quality tests, quality spec, 3-subagent audit system | Partial |
| 7. Observability | `workflow_events` table, `n2o stats` CLI, velocity/estimation views, reversion triggers | **Done** |
| 8. Ubiquitous Access | — | Not started |

---

## Dependency Map

```
                    ┌─────────────────┐
                    │ 3. Frictionless  │
                    │    Init          │
                    └────────┬────────┘
                             │ enables onboarding for
                             ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ 1. Seamless  │───▶│ 4. Team         │◀───│ 5. Parallel-     │
│    Updates   │    │    Collaboration │    │    ization       │
└──────┬───────┘    └─────────┬───────┘    └──────────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│ 6. Skill     │───▶│ 2. Best Tooling  │
│    Quality   │    │    Always        │
└──────┬───────┘    └──────────────────┘
       │
       ▼
┌──────────────┐    ┌──────────────────┐
│ 7. Observ-   │───▶│ 8. Ubiquitous    │
│    ability   │    │    Access        │
└──────────────┘    └──────────────────┘
```

| Goal | Depends On | Enables |
|------|-----------|---------|
| 1. Seamless Updates | — | 4, 6 |
| 2. Best Tooling | 6 | (end-user experience) |
| 3. Frictionless Init | 1 (partially) | 4 |
| 4. Team Collaboration | 1, 3, 5 | 8 |
| 5. Parallelization | — | 4 |
| 6. Skill Quality | 7 | 2 |
| 7. Observability | — | 6, 8 |
| 8. Ubiquitous Access | 4, 7 | (broader participation, faster throughput) |

---

## Goal 1: Seamless Updates

Push framework updates to users without overriding their setup. Updates should be available but opt-in.

### Current State — COMPLETE

All Phase 1 items implemented:

- **Version pinning**: `n2o pin` / `n2o pin <version>` / `n2o pin --unpin`. Sync respects pin unless `--force`.
- **Selective sync**: `n2o sync --only=agents,patterns,schema,scripts` syncs specific categories.
- **Readable changelogs**: `n2o release` auto-generates changelog entries from git log. `show_changelog()` displays changes between versions during sync.
- **Schema migrations**: `n2o migrate status`, `n2o migrate run`, `n2o migrate generate` — automated ALTER TABLE ADD/DROP COLUMN, new table/view/index detection, numbered migration files.
- **Backups**: Timestamped backups in `.n2o-backup/` before every sync.
- **Manifest**: `n2o-manifest.json` separates framework vs project file ownership.

### Remaining (Future)

- **Update notifications**: Lightweight mechanism to notify registered projects when a new framework version is available.

---

## Goal 2: Best Tooling Always

Use the best tools and patterns automatically without having to think about it. Skills should fire based on context, not manual summoning.

### Current State — COMPLETE

All auto-invocation infrastructure implemented:

- **YAML trigger descriptions**: All 6 skills have rich `description` fields with explicit trigger phrases, contextual signals, and negative signals (what NOT to use the skill for).
- **CLAUDE.md auto-invocation instruction**: Agent instruction block in `templates/CLAUDE.md` tells Claude to auto-invoke skills based on user intent, prefer false positives, and treat pattern skills as ambient.
- **Pattern skills as ambient**: react-best-practices and web-design-guidelines described as "consult automatically when writing/reviewing relevant code" — passive linters, not explicit invocations.
- **Config toggles**: `auto_invoke_skills` (boolean) and `disabled_skills` (array) in `.pm/config.json` for suppression.
- **Multiple skills simultaneously**: CLAUDE.md instruction explicitly supports multiple skills firing at once.

### Remaining (Future)

- **Sensitivity tuning**: Monitor real-world auto-invocation accuracy and adjust trigger descriptions.
- **Skill quality prerequisite**: Skills must work reliably before aggressive auto-invocation (Goal 6).

---

## Goal 3: Frictionless Init

Make project initialization exceptionally easy. Ideally through simple CLI prompting. Must be fully E2E tested before shipping. Dashboard/HTML interface is a stretch goal.

### Current State — Implemented

- `n2o init` exists with 8-step process: directory creation, file copying, project detection (Node/Rust/Python/Go), interactive prompting, database init, .gitignore setup, config helper generation.
- `--interactive` mode prompts for project name and commands; non-interactive mode auto-detects everything.
- `detect-project` skill fills in CLAUDE.md post-init.
- Re-init detection warns if `.pm/config.json` already exists.
- **E2E test suite**: `tests/test-n2o-init.sh` — 12+ tests covering all project types, idempotency, database integrity, template filling, package manager detection, script permissions.

### Remaining

- **E2E hardening**: Test `--interactive` flag, error paths (invalid paths, missing deps), edge cases (existing `.claude` dir, partial init recovery, monorepo detection).
- **Post-init validation**: Health check verifying scaffolded project is properly configured.
- **Dashboard/HTML interface** (stretch): Web-based setup wizard for teams less comfortable with CLI.

### Priority / Effort

**Near-term** for E2E hardening. **Future** for dashboard. Effort: Low (hardening), High (dashboard).

---

## Goal 4: Team Collaboration

Make it easy for multiple people to work on the same project simultaneously without interfering with each other. Future: task routing algorithm that assigns work intelligently.

### Current State — Implemented

Core Linear sync is fully built but inactive by default:

- **`scripts/linear-sync.sh`** (358 lines): GraphQL API integration with `claim`, `complete`, `blocked`, `sprint-summary` commands. Reads task state from SQLite, pushes state changes to Linear, posts completion comments with time-spent data.
- **`scripts/sync.sh`**: Orchestrator that reads `pm_tool` from config and delegates to the correct adapter (Linear, or future tools).
- **`mcp.json`**: Linear MCP server configured (`https://mcp.linear.app/sse`).
- **Schema ready**: `external_id`, `external_url`, `last_synced_at` columns in tasks table.
- **`developers` table**: Skill ratings, strengths, growth areas.
- **Atomic claiming**: `available_tasks` view filters by `owner IS NULL`.
- **Activation**: Set `pm_tool: "linear"` in `.pm/config.json` + provide `LINEAR_API_KEY`.

### Remaining

- **E2E testing**: No tests exist for Linear sync. Need to test GraphQL calls (mock API or integration), sync orchestrator routing, error handling (missing API key, network failures, missing `external_id`).
- **Tool-agnostic sync layer**: Architecture supports multiple adapters, but only Linear exists. Asana/Jira adapters are future work.
- **Task routing algorithm** (future): Assign tasks based on developer skills, velocity, estimation accuracy, and current load.

### Key Considerations

- Linear API rate limits matter if syncing frequently. Batch operations where possible.
- Task routing needs historical data — depends on Goal 7 generating enough data first.
- The `team` array in config.json should be populated during init (Goal 3).

### Priority / Effort

**Near-term** for E2E testing. **Future** for task routing algorithm. Effort: Low (testing), High (routing).

---

## Goal 5: Parallelization

Allow multiple tasks to execute in parallel, even in the same file. Queue or merge intelligently when conflicts arise. Enforce strong file structure to minimize conflicts.

### Current State

- **Worktree isolation**: Each task runs in its own git worktree (`claim-task.sh` creates worktrees automatically). Full code isolation between agents.
- **Atomic task claiming**: `available_tasks` view filters unblocked, unowned tasks. SQLite serialization prevents double-claiming.
- **Merge queue**: `merge-queue.sh` integrates completed work sequentially — rebase, test, merge. Handles conflicts at integration time.
- **Staging discipline**: tdd-agent enforces "NEVER use `git add .`", explicitly stage files.
- **File size linter**: `scripts/lint-file-size.sh` flags files over N lines for decomposition.
- **Orchestrator spec**: `specs/parallel-playbook.md` defines a multi-tier automated orchestrator with 5 execution patterns (Independent, Team, Racing, Pipeline, Spec-then-Implement), iterative re-planning, and nested parallelism (teams within terminals for ~10 concurrent agents from 4 windows).

### Desired State

The orchestrator spec (`specs/parallel-playbook.md`) defines a 6-layer execution model:

1. **Graph analysis** — read task graph, group by spec, identify chains vs parallel sets
2. **Pattern assignment** — map each group to an execution pattern (Team, Pipeline, Solo, Race, Decompose)
3. **Plan generation** — compute terminal layout + tiers, estimate wall time, format output (`n2o plan`)
4. **Plan execution** — auto-launch tiers via Agent Teams + session hook integration
5. **Iterative re-planning** — monitor tier completions, re-compute plan, reassign freed terminals
6. **Racing** — competing approaches with automatic comparison and winner selection

**v1** (Layers 1-3): Compute and display the plan. Developer launches agents manually. Immediately useful, no Agent Teams integration required.

**v2+** (Layers 4-6): Auto-execution, re-planning loop, competitive racing. See `specs/parallel-playbook.md` for the full design.

### Key Considerations

- Worktree isolation + merge queue already handles the hard part (code isolation + integration). The orchestrator adds the intelligence layer: *what* to run, *where*, and *when*.
- The orchestrator determines WHEN to use Agent Teams (same-spec parallelism) vs solo agents (chains) vs racing (ambiguous approaches). It's the decision layer above `specs/agent-teams.md`.
- Nested parallelism (Agent Teams in multiple terminals) targets 8-10 concurrent agents, matching coordination.md Goal A.
- Small file architecture (coordination.md Goal C2) reduces conflict probability; the merge queue handles remaining conflicts at integration time.

### Priority / Effort

**Medium-term** for v1 (plan computation and display). **Future** for v2+ (auto-execution, re-planning, racing). Effort: Medium (v1), High (v2+).

---

## Goal 6: Skill Quality

Ensure all skills work well. Measure performance. A/B test different versions. Skills should auto-invoke (shared with Goal 2).

### Current State — Partial

Infrastructure exists; per-skill contracts and versioning not yet built:

- **Skill linter**: `scripts/lint-skills.sh` — manifest-driven validation of phase-transition markers in SKILL.md files. Checks all 3 agent skills.
- **Quality tests**: `tests/test-n2o-skills.sh` — 16 tests validating YAML frontmatter, trigger descriptions, auto-invocation config, and CLAUDE.md integration.
- **Quality spec**: `specs/skill-quality.md` — comprehensive measurement framework (token usage, duration, exploration ratio, blow-up factors).
- **3-subagent audits**: tdd-agent runs Pattern Compliance, Gap Analysis, Testing Posture audits per task.
- **CODIFY phase**: Reports patterns for user review rather than auto-documenting.
- No skill versioning, no A/B testing, no per-skill success criteria docs.

### Desired State

- **Skill-by-skill audit**: Go through each skill and define exactly what it should do, its success criteria, and its failure modes. Document expected behavior as a contract.
- **Performance metrics per skill**: Track speed of execution (time from invocation to completion), accuracy (did the task succeed on first attempt?), code quality (testing posture grade, reversion rate).
- **Skill versioning**: Maintain multiple versions of a skill. Tag versions, track which version was used for each task.
- **A/B testing**: Run two versions of a skill on different developers' machines. Compare outcomes across speed, accuracy, and code quality. Requires Goal 7 (Observability) as a prerequisite.
- **Auto-invocation** (shared with Goal 2): Skills fire based on context. The bar: if you have to think about which technology to use, the technology has failed.

### Key Considerations

- A/B testing requires an experimentation framework: version labels, assignment mechanism, outcome measurement. Start simple — manual version assignment, compare metrics after N tasks.
- Code quality measurement is hard. Proxies: testing posture grade (A-F), reversion count, pattern audit pass rate, time-to-green.
- Observability (Goal 7) is a prerequisite — you need measurement infrastructure before you can compare versions.
- The existing CODIFY phase is a lightweight quality feedback loop. Patterns discovered during implementation feed back into skills. This is valuable but manual.

### Priority / Effort

**Medium-term** for skill audits and metrics. **Future** for A/B testing framework. Effort: Medium-High.

---

## Goal 7: Observability

Track credit usage, Claude activity, skill invocations, conversation transcripts, and reversion frequency.

### Current State — COMPLETE (Phase 1)

Core observability infrastructure implemented:

- **`workflow_events` table**: Records skill invocations, phase transitions, task completions with timestamps, session IDs, and metadata (JSON). Replaces the originally planned `skill_invocations` table with a more general event-sourcing approach.
- **`n2o stats` CLI**: `n2o stats [--json]` command surfaces sprint progress, velocity, estimation accuracy, and developer quality metrics.
- **Analytics views**: `velocity_report`, `sprint_velocity`, `developer_velocity`, `estimation_accuracy`, `developer_quality`, `phase_durations`, `session_activity`.
- **Auto-tracking triggers**: `started_at`, `completed_at`, `reversions` (increment on backward status changes).
- **Per-task quality**: `testing_posture` grade, `pattern_audit_notes`, `commit_hash`.

### Remaining (Future)

- **Credit usage tracking**: Track Claude API token consumption per task/sprint/developer. Depends on what Claude Code exposes.
- **Conversation transcripts**: Full conversation logs for replay and debugging. Storage/retention policy needed.
- **Dashboard integration**: Web dashboard to surface observability data (see `specs/workflow-dashboard.md`).

### Priority / Effort

**Future** for credit tracking and transcripts. Phase 1 observability is complete. Effort: Medium.

---

## Goal 8: Ubiquitous Access

Make it possible for people to contribute meaningful work from anywhere — phone, tablet, a glance at a screen — not just when sitting at a laptop with a terminal open. Lower the bar from "open IDE, run CLI" to "tap, review, approve" for the right kinds of work.

### Current State — Not Started

The framework is entirely CLI-driven. All contribution requires a terminal, git, SQLite, and bash. There is no web UI, no mobile interface, no push notifications. The workflow dashboard spec (`specs/workflow-dashboard.md`) describes a Next.js visualization layer but frames it as read-mostly — viewing status, not taking action.

### Desired State

#### Tier 0: Pre-generated prompt queue (lowest friction, highest leverage)
The system auto-generates ready-to-paste prompts for the next available tasks. Each prompt includes full context: task description, relevant file paths, dependency state, done-when criteria, and the exact command to mark it complete. Prompts are kept current — as tasks complete and dependencies unblock, the queue regenerates. A contributor on their phone just reads the next prompt, copies it into Claude Code (or any Claude interface), and starts working. No CLI setup, no DB queries, no context-gathering. The pm-agent already has most of this information; this tier is about pre-rendering it into a consumable format and keeping it fresh.

**Design principle: optimize for brain cycles, not tokens.** The scarcest resource is human attention. A prompt that saves 2,000 tokens but takes 3 extra minutes to read is a bad trade. Every prompt should be designed so a person can scan it in under 30 seconds, decide "yes" or "yes, but...", and go.

**Prompt structure** (human-first, machine-executable):

```
## [One-line: what this task does]
[One sentence: why it matters / what it unblocks]

### What you'll change
- file_a.ts (add X)
- file_b.ts (modify Y)

### Key decisions (override any of these)
- Using approach A because [reason]
- Skipping Z because [reason]

---
[Full task context below — skim or skip]
...detailed prompt for the AI...
```

The top section is for the human — 5-10 lines max, scannable on a phone screen. The section below the `---` is for the AI — detailed context, file paths, schema, done-when criteria. The human doesn't need to read it unless something looks wrong.

**Modification by exception**: The human doesn't rewrite the prompt. They prepend a one-liner:

- "Follow the prompt below." *(approve as-is)*
- "Follow the prompt below, but use Postgres instead of SQLite." *(one override)*
- "Follow the prompt below. Skip the test file — I'll add tests later." *(scope reduction)*
- "Follow the prompt below. Also update the README when you're done." *(scope addition)*

This is the same pattern as CLAUDE.md (defaults you override locally) or a PR review (approve / request changes). The prompt is the default plan. The human's job is to approve or amend, not to author.

**Two-phase architecture**: Generation and refinement are separate. Generation is cheap (bash/jq, <1s, fires on every merge or status change). Refinement is expensive (LLM, reads transcripts and outcomes). Keeping them separate means the system is useful from day one — prompts exist immediately, and the learning loop is additive.

**How generation works**:
- `n2o prompts generate` renders tasks from `available_tasks` view into `.pm/prompts/next-NNN.md` files
- Each prompt is self-contained: paste it and go
- Prompts are ordered by priority (unblocked dependencies first, then by sprint order)
- Stale prompts (for tasks that got claimed or completed) are automatically removed
- Post-merge hook in `merge-queue.sh` triggers regeneration when code or task state changes
- Optionally hosted as a simple web page or Supabase row for phone access

**Prompt Refinement Agent**: Three distinct jobs with different triggers and costs. The core principle: **run on signal, not on schedule.**

| Job | What | Trigger | Cost |
|-----|------|---------|------|
| **A. Code freshness** | Update file paths and code references in prompts | After each merge (bash, no LLM) | ~0 |
| **B. User preference learning** | Compare generated prompts vs. what users actually pasted, learn systematic modifications | Signal-driven: when user modifies a prompt (hash mismatch detected) | ~5K tokens |
| **C. Outcome learning** | Correlate prompt patterns with task outcomes (testing posture, reversions, blow-up ratio) | Signal-driven: when quality signals change (reversion, low grade, high blow-up) | ~10K tokens |

**Job A (code freshness)** runs after every merge — it's free. If task 3 refactored the auth module, the prompt for task 7 (which touches auth) gets updated file paths and recent changes automatically.

**Job B (user preferences)** runs when there's actually something to learn — the system detects a hash mismatch between the generated prompt and what the user pasted. It reads transcripts (Goal 7), classifies what the user changed (structural, contextual, stylistic, or scope), and bakes persistent patterns into `.pm/prompts/preferences.json`. Over time, the gap between "generated prompt" and "what the user actually sends" shrinks toward zero. Measured by a **convergence score** (edit distance ratio — approaching 1.0 means the system has learned).

**Job C (outcome learning)** runs when quality signals change — a reversion, testing posture below A, blow-up ratio > 2x. These are the moments something went wrong and there's something to learn. When everything is going well, don't burn tokens analyzing success. The agent correlates prompt content with outcomes and identifies patterns/anti-patterns.

The exact trigger thresholds for Jobs B and C are open design questions — the principle is locked in (signal-driven), but the right thresholds will emerge from real usage. See `.claude/plans/modular-nibbling-dusk.md` for the full design spec.

The agent doesn't need to be sophisticated at first — even a simple "regenerate all prompts with current file state + append user's common preamble" covers 80% of the value. The learning loop from transcripts and outcomes is the long-term differentiator.

#### Tier 1: Mobile-friendly contribution surfaces
- **Task review & approval from phone**: See what's pending, read diffs/summaries, approve or request changes. The 80% of PM work that doesn't require writing code.
- **Quick task creation**: Capture ideas, bug reports, and feature requests from anywhere. Voice-to-task, photo-to-bug-report.
- **Status updates**: Mark tasks blocked, add context notes, reassign work — all from a mobile browser or PWA.
- **Notifications**: Push notifications for things that need your attention (merge conflicts, blocked tasks, completed reviews).

#### Tier 2: Ambient displays
- **Team screens**: Wall-mounted or always-on displays showing sprint progress, who's working on what, velocity trends. Information radiators that keep the team aligned without meetings.
- **Personal dashboards**: A "what should I do next" view that surfaces the highest-impact available task based on your skills and current context.

#### Tier 3: Lightweight code contribution
- **AI-assisted mobile edits**: For small changes (copy fixes, config tweaks, CSS adjustments), provide a guided editing experience where AI does the heavy lifting and you just review and confirm.
- **Conversation-driven work**: Start a task from your phone by describing what you want, let AI draft the implementation, review the diff when you're back at your desk.

### Key Considerations

- **Not everything needs to be mobile.** Deep coding belongs at a desk. The goal is to unlock the 30-40% of work that's review, triage, communication, and small edits.
- **PWA vs native app**: PWA is faster to ship and works cross-platform. Native app only if push notifications or offline access demand it.
- **The dashboard spec is a foundation**: `specs/workflow-dashboard.md` already describes the data layer (Supabase), real-time subscriptions, and task claiming. Goal 8 builds on that by making the surfaces actionable and mobile-first.
- **Security**: Mobile access to code and task data needs auth. Supabase Auth handles this, but the threat model changes when devices are on public networks.

### Priority / Effort

**Future**. Depends on Goal 4 (team collaboration infrastructure) and Goal 7 (data to display). The workflow dashboard (from `specs/workflow-dashboard.md`) is the natural first step — once it exists, making it mobile-responsive and adding action buttons is incremental. Effort: Medium (mobile contribution), High (ambient displays, AI-assisted edits).

---

## Implementation Phases

### Phase 1 — Foundation (COMPLETE)
- **Goal 1**: ~~Version pinning, selective sync, readable changelogs, schema migrations~~ ✅
- **Goal 2**: ~~Skill auto-invocation, context-based routing~~ ✅
- **Goal 7**: ~~`workflow_events` table, `n2o stats` CLI command~~ ✅

### Phase 2 — Implementation (COMPLETE, needs E2E hardening)
- **Goal 3**: ~~`n2o init` E2E test suite~~ ✅ (12+ tests, all project types)
- **Goal 4**: ~~Linear sync scripts~~ ✅ (claim/complete/blocked/sprint-summary, MCP config)
- **Goal 6**: ~~Skill linter, quality tests, quality spec~~ ✅ (partial — infrastructure, not per-skill contracts)

### Phase 2.5 — E2E Testing & Hardening (COMPLETE)
155 tests across 9 suites, all passing. Coverage:
- **Goal 1**: Sync E2E — version pinning, selective sync, changelogs, backups, dry-run, `--all`, migration workflows (33 tests)
- **Goal 3**: Init hardening — existing `.claude`, no unresolved placeholders, no-args error, reinit warning (17 tests)
- **Goal 7**: Stats E2E — terminal sections, JSON format, required keys, SQL queries against known data, empty DB (9 tests)
- **Transcripts**: Basic parsing, token extraction, tool calls, subagents, idempotency, reparse, error handling (10 tests)
- **Helpers**: `version_compare`, `format_number`, `file_checksum`, `check_deps` (22 tests)
- **Release**: `bump_version`, `generate_changelog_entry`, manifest updates (10 tests)
- **Git**: `commit-task.sh` argument validation, conventional prefix mapping, hash recording (12 tests)
- **Skills**: YAML frontmatter, trigger quality, lint-skills.sh validation, auto-invocation config (21 tests)
- **Migrate**: Schema, apply, generate, seed idempotency (30 tests)
- **Deferred**: Linear sync E2E (awaiting rework), `--interactive` flag, monorepo detection

### Phase 3 — Parallelization & Automation (Medium-term)
- **Goal 5**: Orchestrator v1 (plan computation + display), pattern assignment (see `specs/parallel-playbook.md`)
- **Goal 6**: Skill versioning, basic A/B comparison
- **Goal 7**: Credit tracking, conversation logging, reversion dashboard

### Phase 4 — Intelligence & Surfaces (Future)
- **Goal 4**: Task routing algorithm, duration prediction
- **Goal 5**: Orchestrator v2+ (auto-execution, iterative re-planning, competitive racing)
- **Goal 3**: Dashboard/HTML init interface
- **Goal 6**: Full A/B testing framework
- **Goal 8**: Workflow dashboard (read + action), mobile-responsive, task claiming/review from phone
- **Workflow Coach**: Proactive coaching system that observes developer patterns and suggests improvements (see `specs/workflow-coach.md`). Three layers: workflow coaching (embedded, uses existing data), system/environment coaching (native app), tool recommendations (curated knowledge base). Start with Layer 1 embedded in session hook to validate concept.

### Phase 5 — Ubiquitous Access (Future)
- **Goal 8**: Mobile-first contribution surfaces (PWA), push notifications, quick task creation
- **Goal 8**: Ambient displays — team screens, personal "what's next" dashboards
- **Goal 8**: AI-assisted mobile edits — conversation-driven lightweight contributions

---

## Open Questions

1. ~~Should `n2o sync` support per-skill opt-in?~~ **Resolved**: `--only=agents,patterns,schema,scripts` implemented.
2. ~~What's the right granularity for skill auto-invocation?~~ **Resolved**: YAML descriptions + "prefer false positives" instruction. Tuning ongoing.
3. How many completed tasks are needed before the task routing algorithm provides useful recommendations?
4. Should conversation transcripts be stored locally or centrally? What's the retention policy?
5. ~~Is Linear the right default PM tool?~~ **Resolved**: Linear is first adapter. `sync.sh` orchestrator supports adding others.
6. ~~How do we E2E test the init flow across macOS and Linux?~~ **Partially resolved**: `test-n2o-init.sh` exists. Cross-platform CI not yet set up.
7. What's the minimum viable A/B test — manual version assignment with metric comparison, or does it need automated assignment?
8. What's the right approach for E2E testing Linear sync — mock GraphQL server, recorded responses, or live integration tests with a test workspace?
9. **Windows/Microsoft compatibility**: The framework relies on `shasum`, `sed`, `awk`, `stat -f` (macOS), and bash-specific features (arrays, `<()` process substitution). These do not work natively on Windows. Options: (a) declare macOS/Linux-only, (b) add WSL requirement for Windows, (c) rewrite critical paths in a portable language (e.g., Python or Node). Low priority unless Windows users are a target audience.
10. **Mobile contribution scope**: What's the minimum viable mobile surface — read-only status + notifications, or does v1 need task creation and approval actions?
11. **PWA vs native**: Is a PWA sufficient for push notifications and offline, or do we need native apps?
12. **Ambient displays**: Physical screens (Raspberry Pi + browser), or just a dedicated "TV mode" URL in the dashboard?
