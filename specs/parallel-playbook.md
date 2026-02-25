# Automated Parallel Orchestration
> An agent that reads the task graph, computes the optimal execution plan, and orchestrates concurrent agents — so the developer just opens a terminal and watches.

**Status**: Designed

---

## Recent Changes

| Date | What changed |
|------|-------------|
| 2025-02-25 | v2: Reframed from manual playbook to automated orchestrator |
| 2025-02-25 | v1: Initial draft (manual patterns) |

---

## Current State

Today, the session hook claims **one task** per terminal. The developer manually decides how many terminals to open, which specs to focus on, and when to use Agent Teams vs solo agents. All routing is priority-ordered within `available_tasks` — no awareness of parallelism potential, dependency chains, or spec grouping.

The building blocks exist:
- `available_tasks` view (dependency-gated, unblocked tasks)
- `task_dependencies` table (full dependency graph)
- `spec` column on tasks (feature grouping)
- Worktree isolation per task
- Merge queue for integration
- Agent Teams for same-feature parallelism

What's missing: **an orchestrator that reads the task graph, computes the optimal execution plan, and tells the developer (or agents) what to do.**

**Related specs**: `coordination.md` (goals/architecture), `agent-teams.md` (Claude Code teams integration), `n2o-roadmap.md` Goal 5 (Parallelization).

---

## Vision

Developer opens a terminal and runs `claude`. The orchestrator:

1. **Reads the full task graph** — all tasks, dependencies, specs, types, estimated hours
2. **Computes an execution plan** — which tasks can run in parallel, which must be sequenced, which benefit from teaming, which are candidates for racing
3. **Presents the plan** — compact summary: "4 terminals, 8 tasks, estimated 3 hours. Pattern: Team(dashboard, 3 tasks) + Solo(auth chain) + Solo(infra chain) + Review terminal"
4. **Orchestrates execution** — auto-launches agents (via Agent Teams or terminal instructions), assigns tasks, monitors progress, re-plans when tasks complete and new ones unblock

The developer's job: approve the plan (or amend it), then watch. Intervene only for spec approval, ambiguous conflicts, or race winner selection.

---

## Execution Patterns

The orchestrator selects from these patterns based on task graph analysis. These aren't manual choices — they're strategies the orchestrator applies automatically.

### Pattern 1: Independent Worktrees (default)

**Signal**: Tasks from different specs with no shared files.

Each task runs in its own worktree in a separate terminal/agent. Full isolation, full autonomy. `/tdd-agent` in each.

### Pattern 2: Agent Teams (same-feature parallelism)

**Signal**: 2-4 tasks from the same spec are unblocked simultaneously.

One terminal, Claude creates an Agent Team. Lead coordinates, teammates run `/tdd-agent` in worktrees. Benefits: shared context, inter-agent communication for interface changes, conflict prevention.

### Pattern 3: Competitive Racing (exploratory)

**Signal**: Task is tagged `race: true` or `complexity: unknown` with multiple viable approaches listed in the spec. Or: the developer explicitly requests a race.

2-3 agents implement the same task with different approach constraints. Each in its own worktree branch (`race/<task>-<approach>`). When all finish, the orchestrator collects results and presents a comparison for the developer to pick the winner.

### Pattern 4: Pipeline (sequential dependencies)

**Signal**: Tasks form a chain (A → B → C). Only the head is unblocked.

One agent works the chain sequentially — completes A, merge lands, B unblocks, claims B, etc. Other agents work independent specs concurrently.

### Pattern 5: Spec-then-Implement

**Signal**: A spec exists in `.pm/todo/` but has no tasks loaded yet.

One agent runs `/pm-agent` to decompose the spec into tasks. Once tasks are loaded, the orchestrator re-plans and launches implementation agents.

---

## The Orchestrator

### Input

The orchestrator reads:

```sql
-- All available tasks (unblocked, unclaimed)
SELECT * FROM available_tasks;

-- Full dependency graph
SELECT * FROM task_dependencies;

-- All tasks (for dependency chain analysis)
SELECT sprint, task_num, spec, type, status, estimated_hours, complexity
FROM tasks WHERE sprint = '<current_sprint>';

-- Specs with no tasks (need decomposition)
-- ls .pm/todo/ vs SELECT DISTINCT spec FROM tasks
```

### Computation

1. **Group by spec** — tasks that share a spec are building the same feature
2. **Build dependency chains** — for each spec, identify parallel sets (tasks that can run simultaneously) and sequential chains (tasks that must wait)
3. **Score parallelism** — for each spec: `concurrent_tasks = count(available AND unblocked tasks in spec)`
4. **Assign patterns**:
   - `concurrent_tasks >= 2` within a spec → Pattern 2 (Agent Team)
   - `concurrent_tasks == 1` with downstream dependents → Pattern 4 (Pipeline)
   - `concurrent_tasks == 1`, standalone → Pattern 1 (Independent)
   - Task marked `race: true` → Pattern 3 (Racing)
   - Spec in `.pm/todo/` with no tasks → Pattern 5 (Spec-then-Implement)
5. **Compute terminal layout** — how many agents, what each does
6. **Estimate total time** — based on `estimated_hours` and critical path analysis

### Output: The Execution Plan

```
=== EXECUTION PLAN ===
Sprint: coordination | 8 tasks | Critical path: 4.5h

Terminal 1: TEAM (dashboard) — 3 concurrent tasks
  → dashboard#4: Add velocity chart
  → dashboard#5: Add sprint progress bar
  → dashboard#6: Add task breakdown table
  Pattern: Agent Team (lead + 2 teammates)
  Skill: /tdd-agent per teammate

Terminal 2: PIPELINE (auth) — 3 tasks, chain
  → auth#1: Add login endpoint (unblocked)
  → auth#2: Add session middleware (blocked by #1)
  → auth#3: Add logout endpoint (blocked by #1)
  Notes: #2 and #3 unblock after #1 merges. Agent auto-claims.

Terminal 3: PIPELINE (infra) — 2 tasks, chain
  → infra#7: Add Dockerfile (unblocked)
  → infra#8: Add CI pipeline (blocked by #7)

Terminal 4: REVIEW — developer monitors, reviews merges

Estimated wall time: 3.2h (vs 8.5h sequential)
Parallelism factor: 2.7x
===
```

### Re-planning

The plan isn't static. When tasks complete and merge:
- New tasks may unblock (dependency chain advances)
- A spec group that had 1 available task may now have 3 → switch from Pipeline to Team
- All tasks in a spec may be done → that terminal is freed for the next spec
- The orchestrator re-runs the computation and updates the plan

### Where it runs

The orchestrator is a **function in the session hook + a CLI command**:

- **`n2o plan`** — compute and display the execution plan for the current sprint. Developer reviews, approves, or amends.
- **Session hook enhancement** — instead of blindly claiming one task, the hook calls the orchestrator. If the orchestrator detects multi-terminal potential, it outputs the plan as context for Claude (who can then create Agent Teams, or instruct the developer to open more terminals).
- **Re-plan trigger** — after each task completion + merge, re-run the orchestrator to see if the plan should change.

---

## Maximizing Autonomy

### What's fully autonomous (no human needed)
- Pattern 1 (Independent Worktrees): `/tdd-agent` runs to completion, merge queue integrates
- Pattern 4 (Pipeline): agent auto-claims next task in chain after merge
- Re-planning: orchestrator re-computes automatically on task completion

### What needs human approval
- Initial execution plan (developer reviews terminal layout before agents launch)
- Pattern 3 (Racing): developer picks the winner after all approaches complete
- Pattern 5 (Spec decomposition): developer approves spec and task breakdown
- Ambiguous merge conflicts (rare with small files)

### Reducing human touchpoints over time
- If the developer approves the plan without changes 5 times in a row, offer to auto-approve future plans
- Racing winner selection could be semi-automated: run a comparison scoring function, present recommendation, developer confirms
- Spec approval could be skipped for well-defined task types with strong `done_when` criteria

---

## Session Choreography Example

A developer sits down with a sprint containing 8 tasks across 3 specs:

```
Spec "auth":      tasks 1, 2 (unblocked), task 3 (blocked by 1)
Spec "dashboard": tasks 4, 5, 6 (all unblocked)
Spec "infra":     tasks 7 (unblocked), task 8 (blocked by 7)
```

**Orchestrator computes**:

| Terminal | Pattern | Tasks | Rationale |
|----------|---------|-------|-----------|
| T1 | Agent Team | dashboard#4, #5, #6 | 3 concurrent tasks, same spec → team |
| T2 | Pipeline | auth#1 → auth#2, auth#3 | Chain: #1 first, then #2 and #3 unblock in parallel |
| T3 | Pipeline | infra#7 → infra#8 | Chain: #7 first, #8 unblocks after |
| T4 | Review | — | Developer monitors progress |

**After auth#1 completes**: auth#2 and auth#3 both unblock. T2 now has 2 concurrent tasks → orchestrator could upgrade to Agent Team, or T2 takes #2 while a freed terminal (maybe T3 finished infra) takes #3.

All 8 tasks execute with maximum parallelism. Developer actively codes in 0 terminals.

---

## Competitive Racing Detail

Racing is the most novel pattern. It deserves explicit design.

### When to race

- Task has `complexity: unknown` and multiple approaches listed in the spec
- Developer explicitly tags a task `race: true` in task creation
- The orchestrator detects ambiguity: a task with no clear implementation path and high estimated variance

### How it works

1. Orchestrator creates N worktree branches: `race/<sprint>-<task_num>-<approach>`
2. Each agent gets the same task description plus an approach constraint: "Implement using [approach]. Do not use [other approaches]."
3. Agents run `/tdd-agent` independently
4. When all finish, orchestrator collects:
   - Test results (pass/fail, coverage)
   - Code metrics (LOC, files touched, dependencies added)
   - Performance benchmarks (if task includes benchmark criteria)
   - Estimated maintenance cost (complexity, abstraction count)
5. Presents comparison table to developer
6. Developer picks winner (or hybrid). Winner branch merges. Losers deleted.

### Future: `n2o race`

```bash
n2o race <sprint>#<task_num> --approaches "LRU,Redis,SQLite"
# Creates worktrees, launches agents, collects results
```

---

## Multi-Tier Execution

The patterns above describe what happens in a single terminal or team. But the real power comes from **running multiple tiers simultaneously** — Agent Teams in multiple terminals, each working a different spec or approach, with an outer orchestration loop managing the whole session.

### The Tier Model

```
┌─────────────────────────────────────────────────┐
│  TIER 0: Orchestrator (session hook / n2o plan)  │
│  Reads task graph, computes plan, assigns tiers  │
└──────────┬──────────┬──────────┬────────────────┘
           │          │          │
     ┌─────▼────┐ ┌───▼──────┐ ┌▼───────────┐
     │ TIER 1a  │ │ TIER 1b  │ │ TIER 1c    │
     │ Terminal │ │ Terminal │ │ Terminal   │
     │ Team(3)  │ │ Solo     │ │ Team(2)   │
     │ dashboard│ │ auth     │ │ race:cache│
     └──┬─┬─┬──┘ └────┬─────┘ └──┬────┬───┘
        │ │ │          │          │    │
       agents      one agent   approach A  approach B
```

**Tier 0 (Orchestrator)**: The outer loop. Runs once on session start, then re-runs when tiers complete. Decides what tiers to launch. This is what `n2o plan` computes.

**Tier 1 (Execution units)**: Each is a terminal running either a solo agent, an Agent Team, or a competitive race. Tier 1 units are independent — they don't coordinate with each other (worktree isolation handles that). They only report results upward (task completion, merge success/failure).

**Tier 2 (Teammates within a team)**: Inside an Agent Team, the lead spawns teammates. Each teammate is its own execution unit working on a worktree. The team lead is a lightweight Tier 1.5 — it coordinates teammates within the team but doesn't touch other terminals.

### Iterative Re-planning

Tiers complete at different times. When a tier finishes:

1. **Merge queue integrates** its work
2. **Orchestrator re-plans** — the task graph has changed (new tasks unblocked, possibly new specs ready)
3. **Freed terminal** gets a new tier assignment
4. **Pattern upgrades** — a spec that was Pipeline (1 available) may now be Team (3 available after dependencies resolved)

This creates an iterative loop:

```
Plan → Launch tiers → Tier completes → Re-plan → Launch new tiers → ...
```

The loop continues until all tasks are complete or all remaining tasks are blocked on external factors.

### Example: Full Session with 15 Tasks

```
Sprint has 15 tasks across 4 specs:
  auth:      #1→#2→#3, #4 (independent)     [4 tasks, 2 available]
  dashboard: #5, #6, #7 (all independent)    [3 tasks, 3 available]
  api:       #8→#9, #10→#11, #12            [5 tasks, 3 available]
  infra:     #13→#14→#15                     [3 tasks, 1 available]
```

**Iteration 1** (8 tasks executable):
| Terminal | Tier | Pattern | Tasks | Why |
|----------|------|---------|-------|-----|
| T1 | 1a | Team(3) | dashboard#5,#6,#7 | 3 concurrent, same spec |
| T2 | 1b | Team(3) | api#8,#10,#12 | 3 concurrent (heads of 2 chains + 1 standalone) |
| T3 | 1c | Team(2) | auth#1,#4 | 2 concurrent (head of chain + standalone) |
| T4 | 1d | Solo | infra#13 | 1 available, chain behind it |

**Iteration 2** (after dashboard and auth finish first, ~1.5h in):
- Dashboard done (3/3 green). T1 freed.
- Auth#1 and #4 done. #2 and #3 unblock. T3 continues as Pipeline.
- Infra#13 done. #14 unblocks. T4 continues as Pipeline.
- Api still in progress.

Re-plan: T1 freed → assign to help: nothing new to assign, T1 becomes review terminal.

**Iteration 3** (after api chains complete, ~3h in):
- Api#8→#9 and #10→#11 done. All api green.
- Auth#2,#3 done. All auth green.
- Infra#14 done. #15 unblocks. T4 continues.

Re-plan: Only infra#15 left. All terminals converge to review + T4 finishes last task.

**Total wall time**: ~3.5h. Sequential would be ~12h. **Parallelism: 3.4x.**

### Teams in Multiple Terminals (Nested Parallelism)

The key insight: **each terminal can contain an Agent Team**, so the actual concurrent agent count is `terminals × avg_team_size`. With 4 terminals averaging 2.5 teammates each, that's 10 concurrent agents from 4 terminal windows.

```
4 terminals × ~2.5 agents/terminal = ~10 concurrent agents
```

This matches the coordination spec's target of 8-10 concurrent agents (coordination.md, Goal A). The orchestrator's job is to maximize this multiplier by putting teams where they help (same-spec concurrent tasks) and solos where teams would add overhead (single chains).

### Racing Across Tiers

Competitive racing naturally fits the tier model. A race is just a tier where multiple agents solve the same problem:

```
TIER 1c: RACE (caching strategy)
  ├── Agent A: In-memory LRU (worktree: race/cache-lru)
  ├── Agent B: Redis (worktree: race/cache-redis)
  └── Agent C: SQLite WAL (worktree: race/cache-sqlite)
```

The race tier completes when all agents finish. The orchestrator collects results and presents the comparison to the developer. The winning branch merges; losers are cleaned up. Then the orchestrator re-plans with the freed terminal.

Races can run **alongside** normal execution tiers. While the race is running, other terminals are doing productive work on non-contested tasks.

---

## Extensibility

The orchestrator is designed as layers, each independently useful:

| Layer | What it does | Depends on |
|-------|-------------|------------|
| 1. Graph analysis | Read task graph, group by spec, identify chains vs parallel sets | SQLite schema (exists) |
| 2. Pattern assignment | Map each group to execution pattern | Layer 1 |
| 3. Plan generation | Compute terminal layout + tiers, estimate time, format output | Layer 2 |
| 4. Plan execution | Launch tiers (agents/teams), assign tasks, create worktrees | Layer 3 + Agent Teams |
| 5. Iterative re-planning | Monitor tier completions, re-compute plan, reassign freed terminals | Layer 4 + merge queue hooks |
| 6. Racing | Create competing branches, collect results, present comparison | Layer 4 + comparison logic |

**v1 scope**: Layers 1-3 (compute and display the plan). The developer launches agents manually based on the plan output. Immediately useful, no Agent Teams integration required.

**v2 scope**: Layer 4 (auto-launch via Agent Teams + session hook). The orchestrator becomes executable — it doesn't just recommend, it acts.

**v3 scope**: Layer 5 (iterative re-planning). The orchestrator watches for tier completions and re-plans automatically. This is where it becomes a true outer loop.

**v4 scope**: Layer 6 (racing). Competitive approaches with automatic comparison and winner selection.

---

## Open Questions

1. Should `n2o plan` be a CLI command (bash) or a skill that Claude executes? CLI is simpler, skill is more flexible (can explain reasoning, handle edge cases).
2. What's the right max team size before coordination overhead outweighs parallelism? (agent-teams.md says 4, needs empirical validation)
3. For competitive racing, should losing branches be preserved for reference or always deleted?
4. How should the orchestrator handle cross-spec dependencies (task in spec A depends on task in spec B)?
5. Should re-planning be aggressive (re-compute on every tier completion) or conservative (re-compute only when the current plan is suboptimal)?
6. What's the maximum useful number of concurrent terminals? At some point, merge queue throughput or developer review capacity becomes the bottleneck, not task availability.
7. For nested parallelism (teams within terminals), should the orchestrator set team size or let the Agent Team lead decide based on available tasks?
