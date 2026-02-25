# Skill Quality Spec

**Status**: Partial

Quality spec for the N2O workflow framework's skills. Defines what we measure about each skill and why.

Philosophy: capture data now, analyze later.

## 1. Primary Metrics (all skills)

### Token Usage

Per skill invocation:
- Input tokens + output tokens per invocation
- Source: `workflow_events` table (`input_tokens`, `output_tokens` columns)
- Aggregated in: `skill_token_usage` view
- Why: understand cost per skill, identify which skills are most expensive

### Duration

Per skill invocation:
- Seconds from skill start to task completion
- Source: `workflow_events` timestamps (`skill_invoked` -> `task_completed`)
- Aggregated in: `skill_duration` view
- Why: identify slow skills, track speed improvements over time

### Exploration Ratio

Per task:
- Formula: `(unique files read but not modified) / (total unique files read)`
- Source: `workflow_events` tool_call events with `file_path` in metadata
- Read tools: `Read`, `Glob`, `Grep`; Write tools: `Edit`, `Write`
- Aggregated in: `skill_precision` view
- Target: <0.3 (meaning >70% of file reads lead to modifications)
- Why: measures how targeted agents are. High exploration ratio = wasted tokens on unnecessary file reads.
- Lower is better. An exploration ratio of 0.1 means the agent knew exactly which files to read.

## 2. Per-Skill Quality Contracts

> **Contracts are aspirational benchmarks** — targets to measure against, not enforcement gates. They surface in `n2o stats` for visibility. Targets are adjusted as we collect real data.

---

### tdd-agent

**Purpose:** Implement tasks using strict TDD (Red-Green-Refactor-Audit), producing code that passes audit on the first attempt.

#### Success Criteria

| Metric | Target | Source |
|--------|--------|--------|
| First-attempt A-grade rate | >80% | `task_completed` event metadata (`fix_audit_iterations = 0`) |
| Token budget (medium task) | 50k-150k | `skill_token_usage` view |
| Duration (medium task) | <30 min | `skill_duration` view |
| Exploration ratio | <0.3 | `skill_precision` view |
| AUDIT+FIX time share | <40% of total task time | `phase_time_distribution` view |

#### Failure Modes

| Indicator | Threshold | What it means |
|-----------|-----------|---------------|
| Exploration ratio >0.5 | Warning at >0.3, critical at >0.5 | Agent is reading many files it never modifies — wasting tokens on orientation instead of executing |
| FIX AUDIT iterations >2 | Critical | Implementation quality is low; agent is guessing rather than following patterns. Check if SKILL.md patterns are current |
| Tokens >200k on a medium task | Critical | Runaway session — likely looping or exploring without converging. Kill and reassign |

#### Quality Gates

- Testing posture must be grade A (all tests pass, no fake tests, no skipped assertions)
- Pattern audit completed (`pattern_audited = 1`)
- Exploration ratio reported in task completion metadata

---

### pm-agent

**Purpose:** Break specs into well-scoped, executable tasks with accurate estimates and clear done-when criteria.

#### Success Criteria

| Metric | Target | Source |
|--------|--------|--------|
| Downstream success rate | >85% tasks complete with 0 reversions | `tasks.reversions` column |
| Blow-up ratio | 0.8-1.5 | `estimation_accuracy` view |
| Token budget | 30k-80k | `skill_token_usage` view |
| Tasks per spec | 2-4 (median) | Manual audit of task breakdowns |

#### Failure Modes

| Indicator | Threshold | What it means |
|-----------|-----------|---------------|
| Blow-up ratio >2.0 | Critical | Systematic underestimation — tasks are scoped too optimistically or missing hidden complexity |
| Reversion rate >20% | Critical | Specs/done-when criteria are ambiguous. Downstream agents can't tell when they're actually done |
| >50% of tasks immediately available (no dependencies) | Warning | Task graph is too flat — missing sequencing means agents may work on tasks before prerequisites are in place |

#### Quality Gates

- Every task has a non-empty `done_when` field
- Every task has `estimated_hours` and `complexity` set
- Task dependencies are recorded in `task_dependencies` table

---

### bug-workflow

**Purpose:** Diagnose bugs by forming and verifying hypotheses, then creating targeted fix tasks with evidence.

#### Success Criteria

| Metric | Target | Source |
|--------|--------|--------|
| Root cause accuracy | >90% | `tasks` where originating skill is `bug-workflow` and `reversions = 0` |
| Time to hypothesis | <15 min | `skill_duration` view |
| Token budget | 20k-60k | `skill_token_usage` view |
| Exploration ratio | <0.4 | `skill_precision` view |

#### Failure Modes

| Indicator | Threshold | What it means |
|-----------|-----------|---------------|
| Root cause accuracy <70% | Critical | Hypotheses aren't being verified with evidence before creating fix tasks — agent is guessing |
| Duration >30 min | Warning | Agent is going down rabbit holes instead of narrowing systematically |
| Exploration ratio >0.6 | Critical | Agent is reading broadly without converging on the bug location |

#### Quality Gates

- Hypothesis documented before fix task is created
- At least one piece of evidence (log line, failing test, stack trace) linked to the hypothesis
- Fix task references the hypothesis and evidence

---

### detect-project

**Purpose:** Scan a codebase and populate CLAUDE.md with project context (stack, conventions, patterns).

#### Success Criteria

| Metric | Target | Source |
|--------|--------|--------|
| Coverage | >80% of CLAUDE.md sections filled | CLAUDE.md markers (`<!-- FILLED -->` vs `<!-- UNFILLED -->`) |
| Token budget | 15k-40k | `skill_token_usage` view |
| Exploration ratio | 0.5-0.8 (allowed) | `skill_precision` view |

Note: A higher exploration ratio is expected and acceptable for detect-project. This skill is read-heavy by design — it must survey the codebase broadly to produce accurate project context.

#### Failure Modes

| Indicator | Threshold | What it means |
|-----------|-----------|---------------|
| Coverage <50% | Critical | Agent is skipping major sections of CLAUDE.md — output is incomplete and unreliable |
| Tokens >80k | Warning | Agent is reading too deeply instead of surveying. Should sample files, not read entire directories |

#### Quality Gates

- CLAUDE.md is parseable and follows the template structure
- No placeholder text remaining in filled sections

---

### react-best-practices & web-design-guidelines (ambient)

**Purpose:** Provide reference patterns that other skills (primarily tdd-agent) consult during implementation and audit.

These are **ambient skills** — they are read as reference material, not invoked as workflow agents. They do not produce `workflow_events` entries and are not directly measurable via the event pipeline.

#### Quality Measurement

Quality of ambient skills is measured **indirectly** through tdd-agent audit findings:
- Pattern violations flagged in `pattern_audit_notes` that reference UI/design issues indicate gaps in these skills
- A rising rate of pattern violations in frontend tasks suggests the ambient skills need updating
- Source: `common_audit_findings` view, filtered by `type = 'frontend'`

#### Quality Gates

- Reviewed and updated whenever tdd-agent audit findings reveal a pattern gap
- No stale patterns (patterns that reference deprecated APIs or removed components)

## 3. Blow-Up Factor Analysis

Understanding why tasks take much longer than estimated. A task "blows up" when actual time > 2x estimated time.

Factors that correlate with blow-ups:

| Factor | How to identify | Data source |
|--------|----------------|-------------|
| **Dependencies** | Task was blocked on incomplete prerequisite work | `task_dependencies` table, `blocked_tasks` view |
| **Unfamiliar tools/frameworks** | Task uses libraries the team hasn't used before | `type` column on tasks (new types correlate with blow-ups) |
| **Non-standard patterns** | Task doesn't match established patterns in the codebase | `pattern_audit_notes` showing violations, high exploration ratio |
| **Scope creep** | Task turns out bigger than scoped | Actual hours >> estimated hours without audit failures |
| **Audit failures** | Multiple FIX AUDIT iterations before A grade | `fix_audit_iterations` in `task_completed` metadata |
| **Test complexity** | Tests are harder to write than the implementation | Phase timing showing RED phase > GREEN phase by 2x+ |

The `blow_up_factors` view surfaces tasks where actual > 2x estimated along with their type, complexity, and reversion count to help identify patterns.

## 4. Data Collection Architecture

All metrics flow through one pipeline:

1. **Claude Code** saves JSONL transcripts automatically at `~/.claude/projects/{path}/{session}.jsonl`
2. **`scripts/collect-transcripts.sh`** parses JSONL files and loads structured data into `workflow_events` and `transcripts` tables
3. **SQL views** aggregate the raw events into queryable metrics
4. **`n2o stats`** surfaces the metrics in the CLI

Key design decisions:

- **Real columns over JSON parsing**: `input_tokens`, `output_tokens`, `tool_calls_in_msg` are real columns on `workflow_events`, not buried in the `metadata` JSON blob. This enables fast aggregation queries.
- **Per-assistant-message tokens**: Claude's JSONL provides tokens per assistant message, not per tool call. When a message contains multiple tool calls, all tool call rows get the same token count. The `tool_calls_in_msg` column lets views divide accurately.
- **Batch over real-time**: All data collection happens via transcript parsing, not real-time hooks. This avoids adding latency to the development workflow.
- **Views over summary tables**: Views are always current and require no maintenance. If performance becomes an issue at scale, materialized summary tables can be added later.

## 5. Schema Reference

### Columns on `workflow_events`

- `input_tokens INTEGER` -- tokens in the context window for this turn
- `output_tokens INTEGER` -- tokens generated in this turn's response
- `tool_calls_in_msg INTEGER` -- number of tool calls sharing these tokens

### Views

| View | Purpose |
|------|---------|
| `skill_token_usage` | Token totals and averages per skill per sprint |
| `skill_duration` | Duration per skill invocation in seconds |
| `skill_precision` | Files read vs modified, exploration ratio per task |
| `phase_time_distribution` | Phase durations as % of total task time |
| `token_efficiency_trend` | Avg tokens per task by sprint and complexity |
| `blow_up_factors` | Tasks where actual > 2x estimated, with context |

### Existing views (already in schema)

| View | Purpose |
|------|---------|
| `skill_usage` | Tool invocation frequency |
| `phase_timing` | Phase durations in seconds |
| `estimation_accuracy` | Estimate vs actual hours |
| `developer_quality` | Per-developer reversion and grade stats |
| `velocity_report` | Hours per task |

## 6. How Contracts Are Measured

The per-skill contracts defined in Section 2 are not enforced programmatically — they are surfaced as metrics for human review.

**Measurement pipeline:**

1. Raw data is captured in `workflow_events` and `tasks` tables via transcript parsing
2. SQL views (`skill_token_usage`, `skill_duration`, `skill_precision`, `phase_time_distribution`, etc.) aggregate the raw data into the metrics referenced in each contract
3. `n2o stats` queries these views and displays per-skill dashboards showing current values against contract targets
4. Out-of-range values are highlighted but do not block workflow execution

**What `n2o stats` shows per skill:**

- Current metric values vs. contract targets
- Trend direction (improving, stable, degrading) based on last 3 sprints
- Any metrics in failure-mode range, flagged for attention

Views are the single source of truth. If a contract references a metric, there is a corresponding view or table column that produces it. No metrics are computed outside SQL.

## 7. Adjusting Targets

The targets in Section 2 are initial estimates based on early usage patterns. They will be adjusted as we collect real data.

**Adjustment cadence:** Quarterly, or whenever a target is consistently met or missed across 3+ sprints.

**Adjustment process:**

1. Run `n2o stats --history` to review metric trends across sprints
2. Identify targets that are consistently exceeded (too easy) or consistently missed (too aggressive)
3. Adjust the target value in this spec and note the change date and rationale
4. Update `n2o stats` threshold configuration if applicable

**Principles:**

- Targets should be achievable 80% of the time under normal conditions
- A target that is always met is not providing signal — tighten it
- A target that is never met is demoralizing and ignored — loosen it or investigate root cause
- When loosening a target, document why in the commit message

## 8. Completion-to-Review Latency

The gap between task completion and human verification measures how long work sits before review.

**Definition:** `verified_at - completed_at` on the `tasks` table.

- `completed_at` is auto-set when task status changes to `green` (trigger: `set_completed_at`)
- `verified_at` is set when a user marks the task as verified (manual or via `n2o verify`)

**Why this matters:**

- Long latency means completed work accumulates without feedback, increasing the risk of compounding errors
- Short latency enables faster iteration and earlier detection of spec ambiguity
- Target: <24 hours for active sprint tasks

**Deeper analysis:**

For more granular timing (e.g., how long between the last commit and the first review comment), transcript timestamps can be cross-referenced with git log and external PM tool sync data (`last_synced_at` column).

## 9. Version Comparison (A/B)

Compare metrics across skill versions to measure the impact of SKILL.md changes.

### How It Works

1. Each SKILL.md has a `version:` field in its YAML frontmatter
2. `collect-transcripts.sh` reads this version and populates `skill_version` on `workflow_events`
3. Three comparison views group metrics by `skill_name + skill_version`:
   - `skill_version_token_usage` — token totals per version
   - `skill_version_duration` — duration per version
   - `skill_version_precision` — exploration ratio per version

### Workflow

1. Run skill at current version, collect data via `collect-transcripts.sh`
2. Modify SKILL.md, bump `version:` field (e.g., 1.0.0 → 1.1.0)
3. Run skill at new version, collect data
4. Compare: `n2o stats --compare <skill-name>`

### What to Compare

| Metric | Better = | Why |
|--------|----------|-----|
| avg_tokens_per_call | Lower | Skill is more efficient |
| avg_seconds | Lower | Skill completes faster |
| avg_exploration_ratio | Lower | Skill is more targeted |
| invocations | Context-dependent | More invocations may indicate more granular phases |
