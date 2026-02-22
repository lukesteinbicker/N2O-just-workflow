# N2O Framework Roadmap

## Overview

N2O is a workflow framework for AI-assisted software development. It provides a CLI (`n2o init` / `n2o sync`), SQLite-based task management, and 6 skills (pm-agent, tdd-agent, bug-workflow, detect-project, react-best-practices, web-design-guidelines) coordinated through a manifest-based file ownership model.

**Current version:** 1.0.0

| Goal | Existing Foundation | Maturity |
|------|-------------------|----------|
| 1. Seamless Updates | `n2o sync`, backup system, manifest file separation | Partial |
| 2. Best Tooling Always | Skill trigger descriptions, YAML frontmatter | Minimal |
| 3. Frictionless Init | `n2o init --interactive`, detect-project skill | Partial |
| 4. Team Collaboration | SQLite schema with `owner`/`developers`, Linear sync design (change 008) | Design only |
| 5. Parallelization | Atomic task claiming, staging discipline in tdd-agent | Minimal |
| 6. Skill Quality | tdd-agent's 3-subagent audit system, CODIFY phase | Minimal |
| 7. Observability | velocity_report, developer_velocity, estimation_accuracy views, reversion triggers | Partial (schema only) |

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
└──────┬───────┘    └─────────────────┘    └──────────────────┘
       │
       ▼
┌──────────────┐    ┌──────────────────┐
│ 6. Skill     │───▶│ 2. Best Tooling  │
│    Quality   │    │    Always        │
└──────┬───────┘    └──────────────────┘
       │
       ▼
┌──────────────┐
│ 7. Observ-   │
│    ability   │
└──────────────┘
```

| Goal | Depends On | Enables |
|------|-----------|---------|
| 1. Seamless Updates | — | 4, 6 |
| 2. Best Tooling | 6 | (end-user experience) |
| 3. Frictionless Init | 1 (partially) | 4 |
| 4. Team Collaboration | 1, 3, 5 | (multi-user usage) |
| 5. Parallelization | — | 4 |
| 6. Skill Quality | 7 | 2 |
| 7. Observability | — | 6 |

---

## Goal 1: Seamless Updates

Push framework updates to users without overriding their setup. Updates should be available but opt-in.

### Current State

- `n2o sync` overwrites `framework_files` (agents, patterns, schema.sql, scripts) and never touches `project_files` (config.json, schema-extensions.sql, CLAUDE.md, tasks.db).
- Timestamped backups created in `.n2o-backup/` before every sync.
- `--dry-run` mode shows what would change. `--all` syncs every registered project.
- Schema migration prompts the user when schema.sql changes.
- Manifest (`n2o-manifest.json`) cleanly separates framework vs project ownership.
- Version pinning field (`n2o_version_pinned`) designed but not yet implemented.

### Desired State

- **Version pinning**: Projects pin to a framework version and explicitly upgrade. `n2o sync` respects the pin unless `--force` is passed.
- **Readable changelogs**: `n2o sync --dry-run` shows a human-readable summary of what changed and why, not just file diffs.
- **Selective sync**: Sync only skills, only schema, or only scripts (`n2o sync --only=agents`).
- **Update notifications**: A lightweight mechanism to notify registered projects when a new framework version is available.
- **Schema migrations**: Automated, non-destructive migrations (ALTER TABLE additions) rather than relying solely on CREATE TABLE IF NOT EXISTS.

### Key Considerations

- Current "overwrite framework files" approach works for a small team but risks breaking project customizations as adoption grows.
- Schema migrations are the hardest part — adding columns is safe, but restructuring requires migration scripts.
- Git submodules, npm packages, and git subtree were already considered and rejected (change 006). Sync script is the right call for 5-10 projects. Revisit at 20+.

### Priority / Effort

**Near-term refinement.** Most infrastructure exists; needs version pinning, selective sync, and changelog polish. Effort: Medium.

---

## Goal 2: Best Tooling Always

Use the best tools and patterns automatically without having to think about it. Skills should fire based on context, not manual summoning.

### Current State

- Skills have trigger descriptions in YAML frontmatter (e.g., bug-workflow triggers on "found a bug", "something's broken").
- All skills require manual invocation via slash commands (`/pm-agent`, `/tdd-agent`, etc.).
- tdd-agent has a cross-reference table mapping task types to skills.
- detect-project auto-triggers when CLAUDE.md has `<!-- UNFILLED -->` markers — proof that context-based triggering works.
- Pattern skills (react-best-practices, web-design-guidelines) are only consulted when explicitly invoked.

### Desired State

- **Context-based auto-invocation**: When a user says "I found a bug", bug-workflow activates without needing `/bug-workflow`. When someone writes React code, react-best-practices is consulted automatically.
- **Skill router**: A lightweight routing layer in CLAUDE.md that maps user intent to the right skill. The technology should be invisible — if you have to think about which skill to invoke, the system has failed.
- **Pattern skills as always-on**: react-best-practices and web-design-guidelines should be ambient during relevant work, not point-in-time audits.
- **Graceful fallback**: Auto-invocation should never be annoying. If the wrong skill fires, the cost should be near-zero.

### Key Considerations

- Claude Code's skill system already supports description-based trigger matching. The question is how reliable this matching is in practice.
- Over-eager auto-invocation could slow down simple tasks. Need to tune sensitivity.
- Depends on Goal 6 — skills must actually work well before auto-invoking them at scale.

### Priority / Effort

**Medium-term.** Requires experimentation with Claude Code's skill matching behavior and tuning trigger descriptions. Effort: Medium.

---

## Goal 3: Frictionless Init

Make project initialization exceptionally easy. Ideally through simple CLI prompting. Must be fully E2E tested before shipping. Dashboard/HTML interface is a stretch goal.

### Current State

- `n2o init` exists with 8-step process: directory creation, file copying, project detection (Node/Rust/Python/Go), interactive prompting, database init, .gitignore setup, config helper generation.
- `--interactive` mode prompts for project name and commands; non-interactive mode auto-detects everything.
- `detect-project` skill fills in CLAUDE.md post-init.
- Re-init detection warns if `.pm/config.json` already exists.
- No E2E tests exist for the init flow.

### Desired State

- **Zero-thought init**: `n2o init .` detects everything, applies sensible defaults, and just works. No prompts needed for the common case.
- **Full E2E test coverage**: Test the entire init flow — directory creation, file scaffolding, database init, config generation — in a test harness with temp directories. Test across project types (Node, Python, Go, Rust). This must be done before shipping to new users.
- **Post-init validation**: After init, run a health check that verifies the scaffolded project is properly configured (schema loaded, config valid, skills accessible).
- **Dashboard/HTML interface** (stretch): A web-based setup wizard for teams less comfortable with CLI. Could generate the `n2o init` command or run it directly.
- **Edge case handling**: Existing .claude directory, partial init recovery, monorepo detection.

### Key Considerations

- E2E testing a bash CLI requires a test harness (create temp dirs, run init, validate output, clean up). Could use bats (Bash Automated Testing System) or a simple shell test suite.
- The dashboard is a significant scope expansion — separate spec, likely builds on `specs/workflow-dashboard.md`.
- Init must remain idempotent — running it twice shouldn't break anything.

### Priority / Effort

**Near-term** for CLI polish and E2E tests. **Future** for dashboard. Effort: Low-Medium (CLI), High (dashboard).

---

## Goal 4: Team Collaboration

Make it easy for multiple people to work on the same project simultaneously without interfering with each other. Future: task routing algorithm that assigns work intelligently.

### Current State

- SQLite is local per developer. `tasks.db` is gitignored — no merge conflicts on the database.
- `developers` table exists with skill ratings, strengths, growth areas.
- `available_tasks` view filters by `owner IS NULL` for atomic claiming.
- Change 008 fully designs a hybrid architecture: SQLite for agents (speed), Linear for humans (visibility), connected by a sync script.
- Schema has `external_id`, `external_url`, `last_synced_at` columns ready for external tool integration.
- `config.json` has `pm_tool` (null) and `team` (empty array) fields.
- `scripts/linear-sync.sh` exists as a starting point.

### Desired State

- **No interference**: Two developers working on the same project at the same time. Each has their own local tasks.db, claims tasks atomically, and works in feature branches. Conflicts resolved at git merge time, not during development.
- **Team visibility**: A shared view (Linear, or a simple dashboard) where everyone can see sprint progress, who's working on what, and what's blocked.
- **Linear sync** (or similar): Implement the hybrid architecture from change 008. PM agent creates/updates Linear issues via MCP. Sync script keeps SQLite and Linear in agreement.
- **Task routing algorithm** (future): Assign tasks based on developer skills (`developers` table), velocity (`developer_velocity` view), estimation accuracy (`estimation_accuracy` view), and current load. Predict task duration based on historical data.
- **Tool-agnostic sync layer**: While Linear is the first target, the sync architecture should accommodate Asana, Jira, or other tools later.

### Key Considerations

- The SQLite-local + Linear-remote hybrid is well-designed (change 008). Implementation is the bottleneck, not design.
- Linear API rate limits matter if we're syncing frequently. Batch operations where possible.
- Task routing needs historical data — depends on Goal 7 (Observability) generating enough data first. Minimum viable routing: assign by task type matching developer skills.
- The `team` array in config.json should be populated during init (Goal 3).

### Priority / Effort

**Medium-term** for Linear sync scripts. **Future** for task routing algorithm. Effort: High.

---

## Goal 5: Parallelization

Allow multiple tasks to execute in parallel, even in the same file. Queue or merge intelligently when conflicts arise. Enforce strong file structure to minimize conflicts.

### Current State

- Atomic task claiming via `available_tasks` view (filters unblocked, unowned tasks).
- tdd-agent enforces staging discipline: "NEVER use `git add .`", explicitly stage files.
- pm-agent documents parallel execution: "User opens new tab, invokes `/tdd-agent` there."
- Sprint-end squash consolidates commits per task.
- No file locking, conflict detection, or merge queuing exists.

### Desired State

- **File lock table**: A `file_locks` table in tasks.db mapping file paths to the agent/task currently modifying them. Agents check locks before editing, queue if locked.
- **Conflict detection**: Before committing, detect if another agent has modified the same files. Alert rather than silently overwrite.
- **Branch-per-task**: Each task works in its own branch. Merge to sprint branch when complete. Git handles most conflicts automatically.
- **Strong file structure**: Enforce small, focused files as a convention. A file size linter or skill rule that flags files over N lines that could be decomposed.
- **Intelligent merging** (future): When two agents modify the same file, attempt semantic merge (understanding code structure) rather than line-based merge. Fall back to queuing if merge fails.
- **Merge queue**: If two tasks touch the same file and can't be merged automatically, queue the second to run after the first commits.

### Key Considerations

- Branch-per-task is the simplest path to parallelization and leverages git's existing merge capabilities. Most conflicts resolve automatically.
- File locking adds complexity. Start with branch isolation; add locking only if branch-per-task proves insufficient.
- Small file architecture is a convention/culture issue more than a tooling issue. Can be reinforced through skills and pm-agent task decomposition.
- SQLite's file-level locking provides atomicity for task claiming but doesn't help with source code conflicts.

### Priority / Effort

**Medium-term** for branch-per-task and conflict detection. **Future** for intelligent merging. Effort: High.

---

## Goal 6: Skill Quality

Ensure all skills work well. Measure performance. A/B test different versions. Skills should auto-invoke (shared with Goal 2).

### Current State

- 6 skills: pm-agent (1041 lines), tdd-agent (1297 lines), bug-workflow (373 lines), detect-project (159 lines), react-best-practices, web-design-guidelines.
- tdd-agent already runs 3-subagent audits (Pattern Compliance, Gap Analysis, Testing Posture).
- CODIFY phase reports patterns for user review rather than auto-documenting.
- No skill versioning, no A/B testing, no performance metrics.

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

### Current State

- Schema has analytics views: `velocity_report`, `sprint_velocity`, `developer_velocity`, `estimation_accuracy`, `developer_quality`.
- Triggers auto-track: `started_at`, `completed_at`, `reversions` (increment on backward status changes).
- `testing_posture` grade and `pattern_audit_notes` capture per-task quality data.
- `commit_hash` column links tasks to git commits.
- No credit usage tracking, no Claude activity logging, no skill invocation logging, no conversation transcript capture.

### Desired State

- **Skill invocation logging**: A `skill_invocations` table recording timestamp, skill name, task ID (if applicable), duration, and outcome (success/failure/partial). This is the foundation for Goal 6 metrics.
- **Credit usage tracking**: Track Claude API token consumption per task, per sprint, per developer. Requires integration with Claude's usage reporting (likely parsing session metadata or billing data).
- **Claude activity logging**: Which tools are called, how many turns per task, conversation length. Helps identify inefficiency patterns (e.g., excessive file reads, repeated failed commands).
- **Conversation transcripts**: Store full conversation logs for replay, debugging, and training. Need a storage and retention policy — transcripts are large and potentially sensitive.
- **Reversion dashboard**: Surface the existing `reversions` counter and `developer_quality` view in a queryable format. How often is work being undone? Which task types have the highest reversion rates?
- **Dashboard integration**: The existing `specs/workflow-dashboard.md` spec covers a web dashboard that could surface all of this data. Observability data feeds the dashboard.

### Key Considerations

- Credit/token tracking depends on what Claude Code exposes. May need to parse session logs or hook into Claude Code's reporting.
- Conversation transcripts are the most storage-intensive item. Consider: store locally per project? Centralize? Summarize instead of full logs?
- Start with skill invocation logging (simple, high value) and build up to full observability.
- The existing SQLite views are powerful but require command-line SQL to query. A dashboard or simple CLI reporting command (`n2o stats`) would make this accessible.

### Priority / Effort

**Near-term** for skill invocation table and basic reporting. **Medium-term** for credit tracking and transcripts. Effort: Medium.

---

## Implementation Phases

### Phase 1 — Foundation (Near-term)
- **Goal 1**: Version pinning, selective sync, readable changelogs
- **Goal 3**: E2E test suite for `n2o init`, zero-thought defaults
- **Goal 7**: `skill_invocations` table, `n2o stats` CLI command

### Phase 2 — Multi-User Basics (Medium-term)
- **Goal 4**: Linear sync scripts (implement change 008 design)
- **Goal 5**: Branch-per-task workflow, conflict detection
- **Goal 6**: Skill-by-skill audit, define success criteria per skill

### Phase 3 — Automation (Medium-term)
- **Goal 2**: Skill auto-invocation, context-based routing
- **Goal 6**: Skill versioning, basic A/B comparison
- **Goal 7**: Credit tracking, conversation logging, reversion dashboard

### Phase 4 — Intelligence (Future)
- **Goal 4**: Task routing algorithm, duration prediction
- **Goal 5**: Intelligent merging, merge queue
- **Goal 3**: Dashboard/HTML init interface
- **Goal 6**: Full A/B testing framework

---

## Open Questions

1. Should `n2o sync` support per-skill opt-in (e.g., skip react-best-practices for Go projects)?
2. What's the right granularity for skill auto-invocation — too eager is annoying, too conservative defeats the purpose?
3. How many completed tasks are needed before the task routing algorithm provides useful recommendations?
4. Should conversation transcripts be stored locally or centrally? What's the retention policy?
5. Is Linear the right default PM tool, or should the sync layer be tool-agnostic from day one?
6. How do we E2E test the init flow across macOS and Linux?
7. What's the minimum viable A/B test — manual version assignment with metric comparison, or does it need automated assignment?
