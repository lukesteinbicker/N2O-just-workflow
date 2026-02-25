# N2O Observatory v2

**Status**: Draft

## Table of Contents

1. [The Observatory is the measurement system for the Tool Leverage equation](#1-governing-thought)
2. [The RADAR model defines five maturity levels, and we're stuck at level 1](#2-radar-maturity-model)
3. [The equation tree defines what to measure — and reveals our blind spots](#3-the-equation-tree)
   - 3.1 [Allocation — we can measure phase distribution but not routing, context loading, or waiting waste](#31-allocation)
   - 3.2 [Leverage — concurrency is our strongest signal; decision framing is invisible](#32-leverage)
   - 3.3 [Yield — reversions are well-covered; the optimal rate is not zero](#33-yield)
   - 3.4 [Sustainability — session length is available but flow state is unmeasurable](#34-sustainability)
   - 3.5 [Cost — token and model data is complete; cost-per-task is derivable](#35-cost)
   - 3.6 [Adoption — broken today but fixable; this is the prerequisite for everything else](#36-adoption)
   - 3.7 [Proficiency — A-grade rate and blow-up ratio are proxies; prompt quality is a blind spot](#37-proficiency)
   - 3.8 [Coverage matrix: what we can measure vs what's blind](#38-coverage-matrix)
4. [Reversions are the most important quality signal, and we're only capturing half the picture](#4-reversions)
   - 4.1 [Phase events already record the state machine — we just haven't been reading them that way](#41-phase-events-are-the-state-machine)
   - 4.2 [What we can derive today vs what we're missing](#42-what-we-can-derive)
   - 4.3 [The fix: enrich phase events with reasons, then build a trajectory view](#43-the-fix)
5. [The current dashboard has two blocking data problems](#5-whats-broken)
   - 5.1 [Developer attribution is broken — everything shows as "unassigned"](#51-developer-attribution)
   - 5.2 [Skill tracking shows raw tools (Read/Edit/Bash) instead of N2O skills (tdd-agent/pm-agent)](#52-skill-tracking)
6. [Attribution must be solved at the workflow level, not patched in the dashboard](#6-attribution-design)
7. [The smallest useful version is one page that covers Adoption, Yield, and Leverage for one developer](#7-mvp)
8. [Build order: data layer first, then one page, then expand](#8-build-order)

---

## 1. Governing Thought

The Observatory is the measurement system for the **Tool Leverage equation**:

```
Tool Leverage = Tool Potential × Realization Rate

Tool Potential = (Productivity × Sustainability) ÷ (Cost × Time)

Productivity = Allocation × Leverage × Yield
```

> *"Every node in the equation tree should map to at least one automatically captured metric. Nodes with no metric are blind spots."* — Tool Leverage Framework §2.3.2

The Observatory's job is to make every node in this tree visible. Not all nodes are equally measurable today — some have rich data, others are completely blind. The ideal Observatory covers them all. The practical Observatory starts with the ones we can measure and expands.

The governing question is: **"Is N2O making us faster and better?"** The equation tree tells us what "faster" and "better" actually mean:

- **Faster** = higher Allocation (right work) × higher Leverage (more output per brain cycle, especially via concurrency) × lower Cost per unit of output
- **Better** = higher Yield (output that sticks, not reverted) × higher Sustainability (sustained flow, not burnout) × higher Adoption and Proficiency (people use the framework and use it well)

Right now, we can't answer this. The data exists in SQLite (25 views, 40+ GraphQL queries) but the dashboard doesn't connect it to the equation. Developer attribution is broken. Skill names are wrong. There's no trend analysis. We have a display layer with no working retrieval or augmentation underneath it.

---

## 2. RADAR Maturity Model

The Observatory should follow a RADAR process — each level builds on the one below it. We're currently stuck between levels 1 and 3, trying to display data we haven't properly retrieved or cleaned.

| Level | Name | What it does | Current state |
|-------|------|-------------|---------------|
| **R** | Retrieve | Collect session, event, and task data automatically | Partially working. Transcripts and workflow_events are collected. But developer identity and skill names are often missing. |
| **A** | Augment | Clean the data. Attribute sessions to developers. Link skills to invocations. Compute derived metrics. | **Not done.** This is the gap. Raw data goes straight to display without cleaning. |
| **D** | Display | Show dashboards that answer the key questions | Built but broken. 5 pages exist but show "unassigned" developers and wrong skill names. |
| **A** | Alert | Notify when metrics cross thresholds (blow-up > 3x, A-grade drops below 80%, skill adoption falls) | Not started. |
| **R** | React | Take action on behalf of the user. Auto-assign tasks to developers with capacity. Flag risky estimations before work starts. Suggest skill improvements based on audit patterns. | Not started. |

**The key insight**: We jumped to Display (level 3) without doing Augment (level 2). The result is a dashboard full of nulls and wrong labels. We need to go back and fix levels 1 and 2 before Display can work.

---

## 3. The Equation Tree

The equation tree defines what the Observatory must measure. Each subsection below is one node in the tree. For each node: what questions it answers, what data we have, what's blind.

```
Tool Leverage
├── Tool Potential = (Productivity × Sustainability) ÷ (Cost × Time)
│   ├── Productivity = Allocation × Leverage × Yield
│   │   ├── 3.1 Allocation — brain cycles on highest-value work
│   │   ├── 3.2 Leverage — output per brain cycle (concurrency, autonomy)
│   │   └── 3.3 Yield — fraction of output that sticks (reversions)
│   ├── 3.4 Sustainability — flow state, session length, context switching
│   └── 3.5 Cost — tokens, model tiers, cost per task
└── Realization Rate = Adoption × Proficiency
    ├── 3.6 Adoption — are people using the framework?
    └── 3.7 Proficiency — how well are they using it?
```

### 3.1 Allocation

> *"Allocation is about directing brain cycles to the highest-value work. The system should surface the right task at the right time so the person never has to wonder 'what should I work on next?'"* — Framework §1.1.1

**Questions the Observatory should answer:**

- What fraction of time is spent on implementation (RED/GREEN) vs overhead (AUDIT/FIX_AUDIT)?
- How long does it take to go from "task available" to "work started"? (routing efficiency)
- Is the system routing developers to the right tasks, or are they overriding task order?
- How much time is wasted on context loading between tasks?

**What we can measure today:**

| Metric | Source | Quality |
|--------|--------|---------|
| Phase time distribution (RED/GREEN/REFACTOR/AUDIT) | `phase_time_distribution` view | Good — shows where time goes within the TDD cycle |
| Time between task claim and first RED event | `workflow_events` timestamps | Derivable — compare claim time to first `phase_entered` |
| Task reordering (did dev skip available tasks?) | `tasks.owner` + `available_tasks` view ordering | Weak — no explicit override tracking |

**What's blind:**

- **Routing cost**: How long does the developer spend deciding which task to pick? No data. The framework says this should be "zero effort — the next task is surfaced automatically." We can't measure whether N2O achieves this.
- **Context loading time**: How long after starting a task does meaningful work begin? We have the first `phase_entered` event but not when the developer started reading the spec, understanding the codebase, etc. The transcript could contain this (early Read/Grep calls before any Edit), but we don't parse it.
- **Waiting waste**: When an agent is running, is the developer idle or working on something else? We can see concurrent sessions (developer has multiple active sessions) but can't distinguish "productive multitasking" from "waiting for one task while poking at another."

**What "good" looks like:** RED+GREEN time > 60% of total. Routing time near zero (task surfaced, developer starts immediately). Low context-switching overhead between tasks.

### 3.2 Leverage

> *"Full autonomy enables a second-order effect: multithreading. When agent loops are self-validating, a single person can kick off multiple loops simultaneously."* — Framework §1.1.2.2(b)

Leverage is output per brain cycle. The framework identifies two key mechanisms: **decision framing** (how efficiently human judgment is captured) and **autonomy/multithreading** (how much the system does without coming back for more input). Concurrency is the strongest observable proxy for leverage — more concurrent autonomous loops = more output per brain cycle.

**Questions the Observatory should answer:**

- How many concurrent workstreams does each developer sustain? (multithreading)
- What fraction of sessions are fully autonomous (run to completion without human intervention)?
- How many human touchpoints does each task require? (brain cycles per task)
- When agents escalate for a decision, how well-framed is the question? (decision cost spectrum)
- Are subagent loops self-validating (passing verification) or failing back to the developer?

**What we can measure today:**

| Metric | Source | Quality |
|--------|--------|---------|
| Peak concurrent primary sessions per developer | `sessionTimeline` (overlapping timestamps, `parentSessionId IS NULL`) | Good — direct measure of multithreading |
| Subagent count per session | `sessionTimeline.subagents` | Good — shows how much parallel work the framework spawns |
| Autonomous loop completion (audit subagents that pass vs fail) | `workflow_events` (AUDIT → COMMIT vs AUDIT → FIX_AUDIT) | Good — FIX_AUDIT means the loop didn't self-validate |
| Tool call count per session | `transcripts.tool_call_count` | Available but crude — high tool calls might mean efficiency or might mean thrashing |

**What's blind:**

- **Brain cycles per task**: The framework's atomic unit. We cannot count how many times the developer intervened during a task. The transcript *contains* this (user messages vs assistant messages), but we don't parse it. This is the single highest-value blind spot in the entire Observatory.
- **Decision framing quality**: When the system asks the developer a question, is it open-ended ("what should I do?") or well-framed ("I recommend A because X; confirm?")? The transcript contains this too, but extracting it requires NLP or manual tagging.
- **Amdahl's Law violations**: Which loops are "almost autonomous" but still require one human step? A 99%-automated loop that needs confirmation collapses to human speed. We can't detect this without parsing interaction patterns.

**What "good" looks like:** Peak concurrency of 3-5 workstreams per developer. >80% of audit subagent loops pass on first try (self-validating). Brain cycles per task trending down over sprints.

### 3.3 Yield

> *"The optimal reversion rate is not zero. A zero revert rate signals that the system is being too cautious."* — Framework §1.1.3

Yield is the fraction of output that ships and stays. This maps directly to the reversion rate — see [Section 4](#4-reversions) for the detailed treatment. The framework provides the diagnostic table:

| Revert rate | Signal |
|---|---|
| ~0% | System too cautious — leaving output on the table |
| 5–15% | Healthy — pushing boundaries, most output sticks |
| 15–30% | Worth investigating — prompt quality? task scoping? tool fit? |
| 30%+ | Net negative — output costs more to review and revert than to produce manually |

**Questions the Observatory should answer:**

- What's the overall reversion rate, and is it in the healthy 5-15% range?
- What *causes* reversions? (fake tests, pattern violations, missing coverage — see §4.2)
- Are reversions trending down as the framework matures?
- Per-developer reversion rates — who's in the healthy range, who's too cautious, who's too aggressive?
- Recovery time per reversion — how quickly do we bounce back?

**What we can measure today:** Rich — see Section 4. Reversion count, timing, trajectory, and (with the §4.3 fix) reasons.

**What's blind:** Whether a 0% reversion rate is genuinely excellent or too cautious. The framework says to investigate both extremes.

### 3.4 Sustainability

> *"A rate of 10x that burns out in 30 minutes produces less total output than 3x sustained all day."* — Framework §1.2

Sustainability is how long the developer can sustain the productivity rate. The framework identifies flow state as the primary mechanism and context switching as the primary killer (23-minute recovery cost per interruption).

**Questions the Observatory should answer:**

- How long are working sessions? Are they getting shorter (fatigue) or longer (flow)?
- Does output quality or velocity drop off within a session? (late-session degradation)
- How often does a developer switch between tasks mid-session? (context switching)
- Are there patterns in session timing? (productive hours vs dead hours)
- Is the framework itself causing interruptions? (audit failures breaking flow, too many human checkpoints)

**What we can measure today:**

| Metric | Source | Quality |
|--------|--------|---------|
| Session duration | `transcripts.startedAt / endedAt` | Good — direct measure |
| Sessions per day / per developer | `sessionTimeline` grouped by date | Derivable |
| Task switches within a session | Multiple different `sprint/task_num` in `workflow_events` for same `session_id` | Derivable but haven't built the query |
| FIX_AUDIT as flow interruption | `workflow_events` phase events | Good proxy — an audit failure forces a context switch back to fixing |

**What's blind:**

- **Flow state**: Unmeasurable directly. We can see session length as a proxy (longer uninterrupted sessions ≈ more flow), but we can't distinguish focused flow from distracted puttering.
- **Context switching cost**: We can see task switches but not the recovery time. The 23-minute figure from Mark et al. is a population average — we can't measure it per-developer.
- **Late-session degradation**: We'd need to compare output quality (A-grade rate, reversions) in the first hour vs last hour of a session. The data exists but the query doesn't.
- **Energy/time-of-day effects**: The framework suggests routing different work to different times of day. We have timestamps but haven't analyzed them for patterns.

**What "good" looks like:** Sessions of 60-120 minutes (sustained focus). Minimal mid-session task switching. No late-session quality degradation. FIX_AUDIT loops < 1 per task (audit isn't constantly breaking flow).

### 3.5 Cost

> *"Use the expensive model for decisions that matter and the cheap model for autonomous execution loops."* — Framework §1.3.1

**Questions the Observatory should answer:**

- What's the cost per completed task? Is it trending down?
- What fraction of tokens go to the expensive model vs cheap models?
- Which skills are most expensive? Which are most efficient?
- Is token cost justified by output? (high token cost + low reversions = worth it)
- Per-skill version comparison: did v2 reduce cost vs v1?

**What we can measure today:**

| Metric | Source | Quality |
|--------|--------|---------|
| Tokens per task (input + output) | `token_efficiency_trend`, `transcripts` | Good |
| Tokens per skill invocation | `skill_token_usage`, `skill_version_token_usage` | Good |
| Model distribution per session | `transcripts.model` | Good — shows which model tier was used |
| Skill version cost comparison | `skill_version_token_usage` | Good — v1 vs v2 side by side |

**What's blind:**

- **Dollar cost**: We have token counts but not dollar cost. Token → dollar conversion depends on model and is knowable but not computed. This is a straightforward enrichment (multiply tokens by per-model rate).
- **Cost efficiency**: Cost per *shipped* task (excluding reverted work). Requires joining cost data with yield data.
- **Expensive-for-decisions vs cheap-for-loops**: We know the model per session but not whether the expensive model was used for the judgment-heavy part and the cheap model for execution. Subagent sessions use their own model — we could compare parent model (decisions) vs subagent model (execution).

**What "good" looks like:** Tokens per task trending down. Expensive model used only for primary sessions; cheap model for subagent loops. Cost per shipped task (net of reversions) decreasing.

### 3.6 Adoption

> *"A tool with high potential but zero adoption produces zero leverage."* — Framework §2.1

This is unchanged from the original spec but now positioned correctly in the equation tree — Adoption is part of the **Realization Rate** denominator, not Productivity. If no one uses the framework, nothing else matters. This is the prerequisite.

**Questions the Observatory should answer:**

- Which N2O skills are being invoked? (tdd-agent, pm-agent, bug-workflow — NOT Read/Edit/Bash)
- Which developers use which skills?
- Is usage growing sprint-over-sprint?
- What percentage of tasks go through the TDD workflow vs ad-hoc?

**What we can measure today:** Broken. The `skill_usage` view tracks raw tool calls, not N2O skill invocations. `sessionTimeline.skillName` is null for most sessions. We literally cannot answer "is the framework being used?" with the current data.

**The fix:** Ensure tdd-agent/pm-agent emit `skill_invoked` events; create N2O-specific skill adoption view that filters to framework skills only. See §5.2.

**What "good" looks like:** Every developer uses tdd-agent. Skill invocations increase each sprint. New skills are adopted within 1-2 sprints. Framework adoption rate > 80% of tasks.

### 3.7 Proficiency

> *"Prompt quality — well-specified prompts achieve 75-85% accuracy; vague prompts achieve 30-50%. Same tool, different results."* — Framework §2.2

Proficiency answers: when someone uses the framework, how well do they use it? Two developers can both invoke tdd-agent but get very different results based on how they delegate, what they specify, and how they calibrate trust.

**Questions the Observatory should answer:**

- What's each developer's A-grade rate? (higher = better use of the framework)
- What's the blow-up ratio per developer? (lower = better estimation and delegation)
- Are developers improving over time? (learning rate)
- What's the exploration ratio per skill? (lower = skill is well-targeted, developer uses it correctly)
- How often do developers override the framework's recommendations?

**What we can measure today:**

| Metric | Source | Quality |
|--------|--------|---------|
| A-grade rate per developer | `developer_quality` view | Good |
| Blow-up ratio trend per developer | `developer_learning_rate` view | Good — shows improvement over sprints |
| Exploration ratio per skill | `skill_precision` view | Good — files read vs files modified |
| Fake test incidents per developer | `common_audit_findings` view | Good |

**What's blind:**

- **Prompt quality**: How well-specified are the developer's prompts to the framework? We can't measure this without NLP analysis of transcript contents. A proxy: developers whose sessions have fewer tool calls and lower token counts for the same task complexity are likely giving better prompts.
- **Delegation decisions**: Is the developer delegating the right tasks to the framework? Over-delegation (tasks too complex for autonomous execution) shows up as high reversion rates. Under-delegation (doing manually what the framework could handle) shows up as low skill adoption. Both are observable.
- **Trust calibration**: Is the developer checking autonomous results too much (wasting brain cycles) or too little (letting errors through)? The transcript would show this as frequent user interruptions of autonomous loops, but we don't parse it.

**What "good" looks like:** A-grade rate > 85%. Blow-up ratio < 1.5x and trending toward 1.0. Exploration ratio decreasing per skill version. Zero fake test incidents.

### 3.8 Coverage Matrix

Every node in the equation tree, with its measurement status:

| Equation node | Observable? | Primary metric | Data source | Status |
|---|---|---|---|---|
| **Allocation** | Partial | Phase time distribution | `phase_time_distribution` | ✅ Available |
| — Routing | Blind | Time from available → first RED | `workflow_events` | ⚠️ Derivable, not built |
| — Context loading | Blind | (no metric) | Would need transcript parsing | ❌ Blind |
| — Waiting waste | Blind | (no metric) | Would need idle time detection | ❌ Blind |
| **Leverage** | Partial | Peak concurrent sessions | `sessionTimeline` | ✅ Available |
| — Autonomy | Partial | Audit first-pass rate | `workflow_events` | ✅ Derivable |
| — Brain cycles/task | Blind | (no metric) | Would need transcript user-message count | ❌ Blind — **highest-value gap** |
| — Decision framing | Blind | (no metric) | Would need NLP on prompts | ❌ Blind |
| **Yield** | Good | Reversion rate + reasons | `workflow_events`, `task_trajectory` | ✅ With §4.3 fix |
| **Sustainability** | Partial | Session duration | `transcripts` | ✅ Available |
| — Flow state | Blind | (no metric) | Unmeasurable directly | ❌ Blind |
| — Context switching | Partial | Mid-session task switches | `workflow_events` | ⚠️ Derivable, not built |
| — Late-session degradation | Blind | (no metric) | Quality by session-hour | ⚠️ Derivable, not built |
| **Cost** | Good | Tokens per task | `token_efficiency_trend` | ✅ Available |
| — Dollar cost | Partial | Token × model rate | `transcripts.model` + rate card | ⚠️ Derivable, not built |
| — Model tier split | Good | Parent model vs subagent model | `transcripts` | ✅ Available |
| **Adoption** | Broken | Skill invocation count | `skill_usage` (wrong data) | ❌ Needs fix (§5.2) |
| **Proficiency** | Partial | A-grade rate, blow-up ratio | `developer_quality`, `developer_learning_rate` | ✅ Available |
| — Prompt quality | Blind | (no metric) | Would need NLP | ❌ Blind |

**Summary:** 7 nodes with good/available data. 5 nodes derivable but not built. 6 nodes blind (no feasible metric today). 1 node broken (fixable).

The ideal Observatory covers all 19 nodes. The practical Observatory starts with the 7 available + 5 derivable = 12 measurable nodes, plus the 1 fixable Adoption node. The 6 blind spots are research problems, not engineering problems.

---

## 4. Reversions

Reversions are the most important quality signal the Observatory tracks. A reversion means work that was thought to be done, wasn't — the task moved backward from `green` to `red` or `blocked`. High reversion rates mean the framework isn't catching problems early enough. Low reversion rates mean TDD + audit is working.

Today we capture reversions as a counter (`tasks.reversions INTEGER DEFAULT 0`) incremented by a trigger. This tells us *how many* but not *why*, *when*, or *how long recovery took*. We can do much better without building anything new — the data is already being collected, just not read correctly.

### 4.1 Phase events are the state machine

The tdd-agent already emits `phase_entered` events into `workflow_events` with timestamps for every phase transition:

```
workflow_events for task #7:
┌──────────────────────┬───────────────┬───────────┐
│ timestamp            │ event_type    │ phase     │
├──────────────────────┼───────────────┼───────────┤
│ 2026-02-20 09:00     │ phase_entered │ RED       │
│ 2026-02-20 09:30     │ phase_entered │ GREEN     │
│ 2026-02-20 10:15     │ phase_entered │ AUDIT     │
│ 2026-02-20 10:45     │ phase_entered │ FIX_AUDIT │  ← this IS a reversion
│ 2026-02-20 11:15     │ phase_entered │ AUDIT     │  ← re-audit after fix
│ 2026-02-20 11:30     │ phase_entered │ COMMIT    │
│ 2026-02-20 11:31     │ task_completed│ REPORT    │
└──────────────────────┴───────────────┴───────────┘
```

A `FIX_AUDIT` entry after `AUDIT` means the audit failed and work went backward. That's a reversion — and it already has a timestamp and session_id. We just haven't been reading phase events as state transitions.

The mapping between phases and task status:

| Phase event | Implies task status | Direction |
|-------------|-------------------|-----------|
| RED | `status = 'red'` | Forward (work starting) |
| GREEN | `status = 'green'` | Forward (tests pass) |
| REFACTOR | still `green` | Forward |
| AUDIT | still `green` | Forward |
| FIX_AUDIT | back to `red` | **Backward — reversion** |
| COMMIT | `green` (final) | Forward |

### 4.2 What we can derive today vs what we're missing

**Available now from phase events (no changes needed):**

- **Reversion count per task**: Count `FIX_AUDIT` entries for that task
- **When each reversion happened**: Timestamp on the `FIX_AUDIT` event
- **Recovery time**: Time between `FIX_AUDIT` and the next `AUDIT` or `COMMIT`
- **Full trajectory**: The ordered sequence of phases shows how clean or messy the path was
- **Session attribution**: Which session (and therefore which developer) caused the reversion

Compare two tasks by reading their phase events:

```
Task #5: RED → GREEN → AUDIT → COMMIT              (clean — one pass)
Task #7: RED → GREEN → AUDIT → FIX_AUDIT → AUDIT → FIX_AUDIT → AUDIT → COMMIT
                                                    (messy — three audit passes)
```

Both end at COMMIT. The current counter says `reversions = 0` and `reversions = 2`. The phase events tell the full story.

**Not available — the gap:**

- **Why the reversion happened.** The `FIX_AUDIT` event doesn't carry the audit findings. The `metadata` JSON column exists on `workflow_events` but tdd-agent doesn't populate it for phase events. The reason ends up in `tasks.pattern_audit_notes` as free text, disconnected from the specific reversion event.
- **Reversions outside tdd-agent.** If someone manually sets a task back to `red` without going through the workflow, there's no phase event — only the trigger catches it. This is an acceptable gap for now since the workflow should be the standard path.

### 4.3 The fix

Two changes, both small. No new tables or triggers.

**Change 1: Enrich FIX_AUDIT events with the reason.**

When tdd-agent emits the `FIX_AUDIT` phase event, include the audit findings in `metadata`:

```sql
-- Current (in tdd-agent SKILL.md):
INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id)
VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'FIX_AUDIT', '...');

-- Changed:
INSERT INTO workflow_events (sprint, task_num, event_type, skill_name, phase, session_id, metadata)
VALUES ('${sprint}', ${taskNum}, 'phase_entered', 'tdd-agent', 'FIX_AUDIT', '...',
  '{"reason": "${auditGrade}", "findings": "${auditFindings}"}');
```

One line change in the skill. Now every reversion carries its cause.

**Change 2: Add a `task_trajectory` SQL view.**

A view that reconstructs the state machine from phase events:

```sql
CREATE VIEW IF NOT EXISTS task_trajectory AS
SELECT
    sprint,
    task_num,
    COUNT(*) as total_phases,
    SUM(CASE WHEN phase = 'FIX_AUDIT' THEN 1 ELSE 0 END) as audit_reversions,
    MIN(CASE WHEN phase = 'RED' THEN timestamp END) as first_red,
    MAX(CASE WHEN phase IN ('COMMIT', 'REPORT') THEN timestamp END) as completed_at,
    GROUP_CONCAT(phase, ' → ') as trajectory
FROM workflow_events
WHERE event_type = 'phase_entered'
GROUP BY sprint, task_num;
```

This gives you rows like:

```
sprint-1 | #5 | 4 phases | 0 reversions | RED → GREEN → AUDIT → COMMIT
sprint-1 | #7 | 7 phases | 2 reversions | RED → GREEN → AUDIT → FIX_AUDIT → AUDIT → FIX_AUDIT → AUDIT → COMMIT
```

**What this unlocks for the Observatory:**

- **Effectiveness section (3.2)**: Show reversion rate with *reasons* — "3 reversions this sprint: 2 from fake tests, 1 from pattern violations"
- **Improvement section (3.3)**: Track reversion rate trending over sprints — are we reverting less as the framework matures?
- **Developer profiles**: Show each developer's trajectory cleanliness — "alice: 80% clean first-pass, bob: 50% clean first-pass"
- **Alert layer (future)**: Notify when a task hits its 3rd FIX_AUDIT loop — something is structurally wrong, not just a minor fix

---

## 5. What's Broken

Two other problems block the dashboard. Fix these alongside the reversion enrichment.

### 5.1 Developer Attribution

**Problem:** `sessionTimeline.developer` is null for most sessions.

**Why:** The resolver gets developer from `tasks.owner` via a JOIN on `sprint` and `task_num`. If the transcript doesn't have a matching task, or the task has no owner, the developer is null.

**Impact:** Every developer-centric view shows "unassigned." Developer contribution cards, per-developer skill adoption, concurrency-per-developer — all useless.

**Current reality:** Right now, there's one developer (Wiley Simonds) who is linked to tasks. But even this linkage only works when transcripts have matching sprint/task_num values.

### 5.2 Skill Tracking

**Problem:** The skill adoption chart shows Read, Edit, Bash, Glob, Grep — these are Claude's internal tools, not N2O workflow skills.

**Why:** The `skill_usage` view aggregates from `workflow_events WHERE event_type = 'tool_call'`, which captures every tool Claude uses. N2O skill invocations are a separate event type (`skill_invoked`) that is rarely recorded.

**Impact:** The core adoption question — "are developers using tdd-agent?" — is unanswerable. The chart shows tool usage instead of framework usage.

---

## 6. Attribution Design

> How do we make sure attribution works when we hand this workflow to other developers?

Attribution can't be patched in the dashboard. It needs to be solved at the workflow level — when a session starts, we need to know who's running it and what skill they invoked.

**Options:**

| Approach | How it works | Tradeoff |
|----------|-------------|----------|
| **Task claim** (current) | Developer sets `tasks.owner` when claiming a task; transcript inherits via sprint/task_num JOIN | Only works when every session maps to a task. Ad-hoc sessions are invisible. |
| **Session hook** | `n2o-session-hook.sh` writes developer identity into transcript metadata at session start | Works for all sessions. Requires the hook to be installed. Already partially implemented in `scripts/coordination/n2o-session-hook.sh`. |
| **Git identity** | Infer developer from `git config user.name` or `git config user.email` at transcript collection time | Zero setup. Works automatically. But can be wrong if git config is shared/default. |
| **Explicit config** | Developer sets their name in `.pm/config.json` or environment variable; all events inherit it | Simple, reliable, one-time setup per machine. |

**Recommendation:** Use explicit config as the primary source (set once in `.pm/config.json`), fall back to git identity, and use task claim for task-specific attribution. The session hook should stamp the developer name onto every transcript and workflow event automatically.

For N2O skill tracking: the `Skill` tool invocation in Claude already records `skill_invoked` events. The problem is that these events aren't always recorded, or the `skill_name` field is null. Fix: ensure the tdd-agent and pm-agent skills emit a `skill_invoked` event with the correct name at the start of every invocation.

---

## 7. MVP

> What's the smallest useful version?

**One page. One developer. Five equation nodes.**

Since Wiley is the only developer with data right now, the MVP doesn't need multi-developer views. It needs to cover the five most-measurable nodes of the equation tree for one person:

| Equation node | MVP metric | Display |
|---|---|---|
| **Adoption** (§3.6) | Skill invocation count this sprint | KPI card |
| **Yield** (§3.3) | Reversion rate + trajectory sparklines | KPI card + inline trajectories |
| **Leverage** (§3.2) | Peak concurrent sessions + subagent count | KPI card |
| **Cost** (§3.5) | Tokens per task, trending | KPI card with trend |
| **Proficiency** (§3.7) | A-grade rate + blow-up ratio trend | Line chart (learning rate across sprints) |

Allocation and Sustainability are deferred — both require derived metrics that don't exist yet.

**What the MVP page looks like:**

```
┌─────────────────────────────────────────────────────────────────┐
│  N2O Observatory                                  Wiley Simonds │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐│
│  │ ADOPTION     │ │ YIELD        │ │ LEVERAGE     │ │ COST    ││
│  │ 12 skill     │ │ 8% revert    │ │ 3 peak       │ │ 38K tok ││
│  │ invocations  │ │ rate ✓       │ │ concurrent   │ │ /task ↓ ││
│  │ +4 vs last   │ │ (healthy)    │ │ workstreams  │ │ -5K     ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PROFICIENCY (learning rate across sprints)                     │
│  3.0x ┤                                                         │
│  2.0x ┤  ●                                                      │
│  1.5x ┤   ╲                                                     │
│  1.0x ┤    ●───●───●  blow-up ratio trending toward 1.0         │
│       └──sprint-1──sprint-2──sprint-3──                         │
│                                                                 │
│  A-grade: 87% (+5%) │ Fake tests: 0 │ Pattern violations: 0    │
│                                                                 │
├──────────────────────────────┬──────────────────────────────────┤
│  SKILL ADOPTION              │  TASK TRAJECTORIES               │
│  tdd-agent    ████████ 8    │  #5: RED→GREEN→AUDIT→COMMIT  ✓   │
│  pm-agent     ███░░░░░ 3    │  #7: RED→GREEN→AUDIT→FIX→AUD→COM│
│  bug-workflow █░░░░░░░ 1    │  #9: RED→GREEN→AUDIT→COMMIT  ✓   │
│                              │  #12: RED→GREEN→AUD→FIX→FIX→COM │
│                              │                                  │
│                              │  Clean first-pass: 60%           │
└──────────────────────────────┴──────────────────────────────────┘
```

**KPI cards map to equation nodes.** Each card shows one node with a trend delta, framed by the framework's diagnostic ranges (e.g., 5-15% reversion rate = "healthy" per §1.1.3.1).

**Task trajectories** are the reversion detail from Section 4 — reconstructed from phase events, shown inline so you can see which tasks were clean and which bounced.

**To get here, we need:**
1. Fix skill invocation tracking — Augment layer (§5.2)
2. Fix developer attribution for the one developer — Augment layer (§5.1)
3. Build `task_trajectory` view — Augment layer (§4.3)
4. Build one page that queries five things — Display layer

---

## 8. Build Order

Each step unlocks the next. Don't skip ahead. Steps 0-2 are Augment (fixing the data layer). Steps 3-5 are Display (building the dashboard). Steps 6-7 are Alert and React (the advanced maturity levels).

| Step | RADAR | Equation nodes covered | What | Unlocks |
|------|-------|----------------------|------|---------|
| **0** | Augment | Adoption, all nodes | Fix developer attribution: add developer name to `.pm/config.json`, stamp onto transcripts and events via session hook | Developer-specific views stop showing "unassigned" |
| **1** | Augment | Adoption | Fix skill invocation tracking: ensure tdd-agent/pm-agent emit `skill_invoked` events; create SQL view for N2O skill adoption (not raw tool calls) | Adoption node becomes measurable |
| **2** | Augment | Yield | Enrich reversions: add `metadata` to FIX_AUDIT phase events in tdd-agent; add `task_trajectory` SQL view | Yield node gets reasons and trajectories |
| **3** | Display | Adoption, Yield, Leverage, Cost, Proficiency | Build MVP page: five equation nodes for one developer (see §7) | First useful dashboard |
| **4** | Display | + Allocation, Sustainability | Expand Observatory: add phase timing, session duration, concurrency timeline, task routing analysis | Full equation tree coverage (minus blind spots) |
| **5** | Display | All | Rebuild remaining pages (Velocity, Skills, Team, Activity) using equation-tree structure | Each page maps to a subtree of the equation |
| **6** | Alert | Yield, Proficiency, Adoption | Add threshold alerts: reversion rate outside 5-15% range, A-grade < 80%, skill adoption drops to 0, 3rd FIX_AUDIT loop, brain-cycle-per-task spike | Proactive notification of equation node degradation |
| **7** | React | Allocation, Leverage | Auto-actions: flag risky estimations before work starts, suggest skill improvements based on audit patterns, auto-route tasks to developers by capacity and skill match | Outsources the allocation and decision-framing brain cycles |

**The ideal end state** (step 7 complete): The Observatory doesn't just display the equation tree — it *optimizes* it. Allocation waste is reduced by auto-routing. Leverage is increased by flagging tasks that should be fully autonomous but aren't. Yield is maintained in the healthy 5-15% range by alerting on both extremes. Sustainability is protected by detecting flow-breaking patterns and batching interruptions. The developer's brain cycles are spent on the irreducible minimum: the decisions only they can make.
