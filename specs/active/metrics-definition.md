# Metrics Definition
> Eight leadership metrics derivable from N2O's existing data model, bridging SOPs "Output/Hour x Tool Leverage" framework.

| Field | Value |
|-------|-------|
| Status | Active |
| Owner | Wiley |
| Last Updated | 2026-02-25 |
| Sprint | rollout |

---

## Leadership Metrics

All metrics are derivable from `tasks`, `transcripts`, and `workflow_events` tables plus the fixes in the rollout sprint.

### 1. Throughput
**Definition:** Tasks completed per week.
**Source:** `tasks WHERE status = 'green'`, grouped by `completed_at` week.
**Target:** Trending upward.

### 2. Efficiency
**Definition:** Average minutes per task (start to green).
**Source:** `velocity_report` view — `minutes_to_complete`.
**Target:** Trending downward for same complexity level.

### 3. Quality
**Definition:** A-grade testing posture rate.
**Source:** `developer_quality` view — `a_grade_pct`.
**Target:** >80%.

### 4. Predictability
**Definition:** Blow-up ratio (actual hours / estimated hours).
**Source:** `estimation_accuracy` view — `blow_up_ratio`.
**Target:** Trending toward 1.0.

### 5. Adoption
**Definition:** % of tasks using tdd-agent workflow.
**Source:** `workflow_events WHERE skill_name = 'tdd-agent'` joined to tasks.
**Target:** >90% for implementation tasks.

### 6. Dollar Cost per Task
**Definition:** Output tokens x model rate card, aggregated per task.
**Source:** `transcripts` joined to tasks, multiplied by rate card.
**Formula:** `total_output_tokens * rate_per_output_token`.
**Rate card:** Sonnet: $15/M output, Opus: $75/M output, Haiku: $5/M output.

### 7. Concurrency (three tiers)
Concurrency is measured at three levels — each answers a different question.

**7a. Peak Tasks** — How many tasks had overlapping work windows?
**Source:** `tasks.started_at` / `tasks.completed_at`.

**7b. Peak Sessions** — How many terminals were running Claude Code simultaneously?
**Source:** `transcripts` where `parent_session_id IS NULL`, overlapping `started_at` / `ended_at`.

**7c. Peak Agents** — Total simultaneous agents including subagents?
**Source:** All `transcripts` (parent + subagent), overlapping `started_at` / `ended_at`.

**Target:** Higher is better if quality holds. The ratio between tiers tells you about parallelism depth — e.g., 3 tasks / 3 sessions / 12 agents means each session spawned ~3 subagents.

### 8. Brain Cycles per Task
**Definition:** User message count per task (proxy for human cognitive load).
**Source:** `transcripts.user_message_count` joined to tasks.
**Target:** Lower is better — means less human steering required.

---

## SOPs Bridge

The SOPs framework measures **Output/Hour x Tool Leverage**:
- **Output/Hour** = Throughput (metric 1) / time invested = Efficiency (metric 2)
- **Tool Leverage** = reduction in Brain Cycles (metric 8) x Quality (metric 3)
- **Cost efficiency** = Dollar Cost (metric 6) per unit of Throughput (metric 1)

Combined: a team producing more tasks per week, at lower cost, with fewer human interventions and high quality, is maximizing Tool Leverage.

---

## Display in `n2o stats`

The `n2o stats` command shows a "Leadership Metrics" section:

```
Leadership Metrics (last 7 days / last 30 days)
  Throughput:      12 / 38 tasks completed
  Efficiency:      45 / 52 avg minutes per task
  Quality:         85% / 82% A-grade rate
  Predictability:  1.3x / 1.5x blow-up ratio
  Adoption:        92% / 88% tasks using tdd-agent
  Cost/Task:       $0.42 / $0.51 avg dollar cost
  Peak Tasks:      3 / 4
  Peak Sessions:   3 / 3
  Peak Agents:     9 / 12
  Brain Cycles:    3.2 / 4.1 avg user messages per task
```

---

## Derivable Future Metrics

These metrics are not yet implemented but are derivable from data we already collect. The fundamental data is in place — these are computation on top of it.

### Completion Forecast
**Definition:** Estimated date when remaining sprint/project tasks will be done.
**Derivable from:** `velocity_report` (tasks/day rate), `available_tasks` (remaining count), `task_dependencies` (critical path), `estimation_accuracy` (blow-up ratio correction).
**Formula:** `remaining_tasks × avg_minutes_per_task × avg_blow_up_ratio = estimated_remaining_minutes`. Critical path analysis from `task_dependencies` gives the minimum wall time assuming full parallelism.
**Why not now:** Needs enough historical data to produce stable velocity estimates. Meaningful after 2-3 sprints.

### Velocity Trend
**Definition:** Tasks completed per week, plotted over time. The slope indicates acceleration or deceleration.
**Derivable from:** `tasks.completed_at` grouped by ISO week.
**Why not now:** Already partially in `sprint_velocity` view. Needs a time-series display, not just a snapshot.

### True Parallelism Factor
**Definition:** Ratio of wall-clock time to sequential time. If 8 tasks take 3 hours of wall time but would take 12 hours sequentially, the parallelism factor is 4x.
**Derivable from:** Overlapping `transcripts.started_at`/`ended_at` windows + `tasks.estimated_minutes`.
**Why not now:** Requires completed sprints with enough tasks to compute meaningful ratios.

---

## Deferred to Phase 2

- Observatory dashboard (web surface for stakeholders)
- NLP analysis nodes (sentiment, complexity classification, auto-tagging)
- Cross-project metric aggregation
- Metric alerting (quality drops below threshold)
