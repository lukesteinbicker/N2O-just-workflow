# Coordination Goals Spec

## Overview

N2O works for a single agent on a single machine. The goal: **multiple people, each running multiple agents, on the same project, without thinking about coordination.**

This document defines what coordination must achieve — goals, requirements, success criteria, and recommended design positions. It does not define implementation details, CLI commands, or schema changes. Those come after goals are agreed.

### Principles

- **Local-first**: Core workflow never depends on third-party APIs. Store locally before going external.
- **Automatic**: No manual sync calls, no remembering steps. If a developer has to think about coordination, the system has failed.
- **Efficiency-optimized**: Worth investing time now to get the best possible architecture.
- **Speed over caution**: Optimize for throughput. Minimize reversions. AI handles routine decisions, humans handle ambiguous ones.

### Grounding in the Output/Hour Framework

This spec is grounded in the N2O Output/Hour decomposition (SOP-004):

```
Org Output = Hours to N2O x Output/Hour x Number of People
Output/Hour = Native Output x Tool Leverage
Tool Leverage = Usage x Effectiveness
```

**Coordination is the infrastructure that enables the largest lever in the tool leverage stack: concurrent agents (2-5x).** Without coordination, running 8 agents in parallel produces chaos — duplicate work, overwritten files, merge conflicts. With coordination, it produces 8x throughput. The coordination system exists to make concurrent agent usage reliable, which is the single biggest multiplier on Output/Hour.

Key framework concepts that shape coordination goals:

- **Brain cycles**: The atomic unit of human contribution. Coordination must cost zero brain cycles in the normal workflow.
- **Amdahl's Law / Automation Cliff**: A process that is 99% automated but requires 1% human intervention collapses to human speed. Coordination must be 100% automatic in the happy path.
- **Revert rate**: Optimal is 5-15% (pushing boundaries, most output sticks). Above 15% warrants investigation. Above 30% is net negative. The coordination system must keep revert rates in the healthy range even with 8-10 concurrent agents.
- **Context switching**: 23-minute recovery cost per interruption (Mark et al., 2008). The coordination system must never interrupt an agent or developer for coordination decisions during active work.
- **Context continuity**: Domain knowledge is a component of Native Output. An engineer who has been working on auth tasks has loaded auth context. Routing related tasks to them avoids context-switch cost and leverages existing mental state.

---

## Vision

A developer opens their laptop. The system knows who they are, what they're good at, and what needs doing. Agents start working — the developer doesn't invoke them manually. Tasks are claimed automatically based on skill match, context continuity, and availability. Each agent works in isolation. When work completes, it's integrated automatically — AI resolves straightforward conflicts, humans are brought in for ambiguous ones. PMs see real-time progress without anyone manually updating anything. No one has to think about coordination.

---

## Scenarios

### Scenario A: Solo developer, parallel agents

- Developer has 8 terminal tabs open
- Each agent picks the next available task, works on it, completes it
- No two agents pick the same task
- Work from all agents integrates cleanly
- The developer watches progress, reviews completed work, intervenes when needed

### Scenario B: Two developers, same project

- Developer A is strong at frontend, Developer B at database work
- The system routes frontend tasks to A's agents, database tasks to B's
- Both developers see what the other's agents are working on
- When A's agent and B's agent both need to modify a shared file, the system handles it without data loss

### Scenario B2: Developer finishes their area, picks up adjacent work

- Developer A has been building the chat interface. Developer B has been building the dashboard. These integrate at some shared API/component layer.
- Developer A finishes all chat tasks first
- The routing algorithm sees: Developer B's agents are actively working in `dashboard/analytics/*` and `dashboard/reporting/*`
- Available dashboard tasks include: `dashboard/settings/*`, `dashboard/user-profile/*`, `dashboard/analytics/export/*`
- Routing scores `dashboard/settings/*` and `dashboard/user-profile/*` highest for Developer A — zero file overlap with Developer B's active working set
- `dashboard/analytics/export/*` scores lower — it's in the same module tree as Developer B's active work, higher conflict risk
- Developer A's agents start on the most segmented dashboard tasks, not the ones closest to Developer B's current files
- Result: both developers work on the dashboard simultaneously with minimal conflict risk

### Scenario C: PM monitors sprint progress

- PM checks the shared store, sees real-time status of every task
- Can see which developer/agent is working on each task
- Gets notified when tasks are blocked
- Never has to ask "what's the status?" — it's always current
- (Future: this data syncs to Linear, Asana, or a custom dashboard — but the core requirement is that the data exists in the shared store)

### Scenario D: Conflict resolution

- Two agents modify the same file
- The system detects the conflict before either agent moves on
- AI attempts to resolve it (straightforward cases like adding imports, separate functions, etc.)
- If AI can't resolve it cleanly, the developer is notified and brought in
- Neither agent's work is silently overwritten or lost

### Scenario E: Developer joins mid-sprint

- A new developer joins the project
- They run a single setup command
- The system knows what tasks are available, what's in progress, what's done
- Their agents start picking up work immediately
- No one has to brief them on project state

---

## Goal Categories

### A. Parallel Execution

Multiple agents execute simultaneously on the same codebase without interfering with each other.

**Requirements:**

- N agents (target: 8-10) run concurrently on one machine
- Each agent works independently — no shared state that requires locking during execution
- The hot path (agent doing work) has zero network dependency
- If one agent crashes, others are unaffected
- Agent startup is fast — no long synchronization step before work begins

### B. Task Coordination

No two agents work on the same task. Tasks are assigned intelligently.

**Requirements:**

- Claiming is atomic on each machine (SQLite serialization) and verified across machines (Supabase)
- Optimistic claiming: claim locally (near-zero latency), start working immediately, verify with Supabase in background. If rejected (rare: <1-2% with overlap avoidance routing), abandon and claim next. Zero blocking latency.
- The system respects task dependencies — an agent can't claim a task whose prerequisites aren't complete AND merged (not just status "green" — the code must be integrated)
- Manual override: a human can unclaim, reassign, or force-claim at any time
- Available: manual trigger for sync; automatic by default

### C. Isolation

Each agent's work is fully isolated from other agents. Awareness of what other agents are doing comes from the agent registry (metadata), not from shared code state.

**Requirements:**

- Each agent works in its own isolated workspace — uncommitted changes are invisible to other agents
- If two agents modify the same file, the conflict is detected at merge time and resolved (see Goal D)
- Isolation mechanism must work with the existing git-based commit workflow in tdd-agent
- Agents know what FILES other agents are working on (via agent registry in shared store), but don't see the CODE changes until merge

### C2. File Structure for Parallelism

The codebase should be structured so that concurrent agents rarely need to touch the same file.

**Requirements:**

- Files should be small — broken out at the function or component level, not module level
- PM-agent task decomposition should map tasks to independent files wherever possible
- A file size linter or convention that flags files too large for safe parallel editing
- The goal: if files are small enough and tasks are well-scoped, most concurrent agents work on entirely different files, and conflicts become rare rather than common
- This is a prevention-first strategy — reduce conflict frequency through architecture, then handle remaining conflicts through resolution

### D. Conflict Resolution & Integration

When multiple agents' work needs to merge, conflicts are resolved automatically when possible and escalated when necessary.

**Requirements:**

- Clean merges (no overlapping changes) happen automatically, zero human intervention
- For conflicts: AI attempts resolution first
- AI merge resolution handles common cases: separate functions in same file, non-overlapping regions, import additions
- If AI can't resolve cleanly, human is notified with clear context about what conflicts exist
- No work is ever silently lost or overwritten
- An agent that encounters a merge conflict should not be blocked indefinitely — it moves on to other work
- The system minimizes the frequency of conflicts through smart task design (pm-agent decomposes work into independent units)

### E. Sync & Visibility

All coordination data flows to a shared store (Supabase) automatically. PMs need to see sprint progress — it doesn't matter whether they see it in Linear, a custom dashboard, or a Supabase admin view. The requirement is visibility, not a specific tool. PM tool integration (Linear, etc.) is a future layer, not in scope for core coordination.

**Requirements:**

- Sync is automatic by default — happens as a side effect of normal operations (claiming, completing, blocking) and major git actions (commit, merge, push, checkout)
- Manual sync must also be available (for debugging, forcing, etc.)
- Sync failure never blocks local operations — the agent keeps working regardless
- Shared store reflects task state within seconds of a local change
- State that flows to shared store: task status, who's working on it, time spent, blocked status + reason, agent activity, file working sets, developer path history
- State that stays local: audit grades, testing posture, reversion counts, pattern notes (agent-internal data)
- Extensible: architecture supports adding PM tool targets (Linear, Asana, Jira, dashboards) as consumers of the shared store without rewriting agent logic
- Bidirectional eventually: PMs should be able to create tasks or add context through the shared store, and that flows back to local agents

### F. Multi-Machine Coordination

Multiple developers on different machines work on the same project without manual coordination.

**Requirements:**

- Developer B can see what Developer A's agents are working on (without asking)
- A developer joining mid-sprint gets current state automatically
- Task state is consistent enough across machines that duplicate work doesn't happen
- The shared coordination store provides real-time cross-machine visibility
- Latency tolerance: it's okay if cross-machine state is eventually consistent (seconds, not milliseconds)
- Local agent execution must work even if the coordination store is temporarily unreachable — degrade gracefully, sync when reconnected

### G. Developer Experience

Zero friction. The system handles coordination so developers don't have to think about it.

**Requirements:**

- A developer should not have to manually invoke agents — the system handles agent initiation directly
- No manual sync commands in the normal workflow (manual available for debugging)
- No setup steps between "open terminal" and "agents start working" (beyond initial project setup)
- Error states are self-recovering where possible, clearly reported where not
- The system provides clear visibility into what's happening (which agents are working, on what, current status)
- One-command onboarding for new developers joining an existing project

### H. Developer Digital Twin & Intelligent Routing

Inspired by VICA's Student Model (a probabilistic model of what a student knows, how well, and what state they're in), the coordination system maintains a **Developer Digital Twin** — a model of each engineer's current context, capabilities, and state. This is what the routing algorithm reads from.

#### What the Digital Twin Tracks

- **Loaded context**: What files, modules, and domain areas the developer's agents have been working in during the current session. An engineer who's been in the auth module for 2 hours has auth context loaded. Routing a new auth task to them costs zero context-switch overhead. Routing a database task forces a 23-minute context recovery penalty (Mark et al., 2008).
- **Skill profile**: Frontend/backend/database/infra ratings (already in `developers` table). Static, updated by managers.
- **Current state**: Session duration, number of active agents, recent revert rate, recent velocity. Analogous to VICA's fatigue/engagement detection — a developer with degrading revert rates may be fatigued.
- **Path history**: The sequence of tasks they've completed in this session and across recent sessions. What context IS loaded. Files touched, modules worked in, patterns applied.
- **Path trajectory**: Where the developer is GOING — the upcoming tasks in their current feature/dependency chain. If pm-agent decomposes "auth feature" into 5 ordered tasks (login -> session management -> logout -> password reset -> MFA) and this developer completed tasks 1-2, tasks 3-5 are their trajectory. Trajectory is a **weighted signal** in routing — it makes the routing algorithm *prefer* assigning trajectory tasks to this developer (higher score), but does not prevent others from claiming them. If the developer is unavailable, idle developers can still pick up trajectory tasks.
- **Availability**: Expected hours per day, schedule patterns, session duration, time remaining in current session. A developer who works 4 hours/day should not score as highly for trajectory tasks as one who works 8 hours/day. A developer about to end their session should not be assigned a long task. Availability modulates all other routing signals — a developer with high context match but low remaining hours may score lower than a developer with moderate context match but full availability.
- **Velocity profile**: How fast they typically complete frontend tasks vs database tasks vs infra tasks. Enables duration prediction.

#### Trajectory Sources

- **pm-agent task decomposition**: Ordered task sequences within a feature form natural trajectories
- **Dependency chains**: If task B depends on task A and Developer X completed A, task B is in X's trajectory
- **Feature ownership**: A developer working on tasks 1-3 of a feature implicitly owns tasks 4-5's trajectory

#### Availability Sources

- **Configuration**: Expected hours per day, working days per week (set per developer)
- **Session tracking**: Session start time, elapsed duration, average session length for this developer
- **Pattern inference**: Over time, the system learns when each developer typically starts and stops (e.g., "Developer A usually works 9am-5pm, Developer B usually works 12pm-8pm")

#### How the Twin is Populated

- Claude Code session hooks (`SessionStart`, `PreToolUse`, `PostToolUse`) fire automatically and update the twin's loaded-context and current-state fields
- Task completion events update velocity profile and path
- Skill profile is manually maintained by managers (same as VICA's Student Model bootstrapping from a diagnostic)

#### Routing Requirements

- Routes tasks based on: context continuity (strongest signal), skill match, current load, historical velocity
- **Working set overlap avoidance**: When scoring tasks, apply a negative weight for tasks whose files overlap with another active developer's current working set. This is the primary mechanism for safe parallel work across developers — route to the most segmented available work.
- **Trajectory weighting**: Upcoming tasks in a developer's feature/dependency chain receive a scoring bonus when that developer claims. This is a weighted signal, not a lock — if the trajectory developer is unavailable, at capacity, or about to sign off, other developers can still claim those tasks. The weight balances context continuity against sprint velocity.
- **Path storage**: The system stores the full task path: history (completed sequence, files/modules touched) and trajectory (upcoming tasks in the same feature arc). This enables: (a) routing continuity, (b) retrospective analysis (which paths produce the best outcomes), (c) conflict prediction (two converging paths will eventually need integration)
- Actively claims tasks for agents (not just filtering available tasks, but making assignment decisions)
- Uses historical data: estimation accuracy, blow-up ratios, time-to-green by task type
- Graceful degradation: if routing data is insufficient (new project, new developer), falls back to round-robin or manual assignment
- Predictions: estimates task duration based on similar completed tasks by this developer on this task type

### H2. Efficiency

The coordination system itself must be efficient — it exists to multiply output, not add overhead.

**Requirements (derived from Output/Hour framework):**

- Coordination must cost zero brain cycles in the normal workflow — no manual steps, no decisions about coordination
- The coordination system must not interrupt agents or developers during active work (Amdahl's Law: any human intervention collapses parallel throughput to human speed)
- Revert rate target: 5-15% is healthy (pushing boundaries, most output sticks). The coordination system must keep revert rates in this range even with 8-10 concurrent agents. If revert rates exceed 15%, the coordination system is introducing too many conflicts. If revert rates are near 0%, agents are being too cautious (perhaps over-isolating, avoiding shared areas).
- Output-that-sticks rate: 80%+ of agent output ships to production. Coordination overhead (merge conflicts, duplicate work, reverted merges) should not push this below 80%.
- Overhead budget: the coordination system's own resource cost (CPU, network, disk, tokens) should be <5% of total agent resource usage

---

## Success Criteria

| Goal | Metric | Target |
|------|--------|--------|
| Parallel Execution | Concurrent agents, zero interference | 8-10 agents on one machine |
| Task Coordination | Duplicate work incidents | Zero |
| Task Coordination | Claim latency (optimistic local) | Near-zero (async Supabase verification) |
| Isolation | Silent overwrites | Zero |
| File Structure | Files that need concurrent editing by 2+ agents | <10% of tasks |
| Conflict Resolution | Merges requiring zero human intervention | >95% |
| Conflict Resolution | Merges requiring human intervention | <5% |
| Conflict Resolution | Work lost to conflicts | Zero |
| Sync & Visibility | State propagation to shared store (Supabase) | <5 seconds |
| Sync & Visibility | Local operations blocked by sync failure | Zero |
| Multi-Machine | Duplicate work across machines | Zero (within sync latency) |
| Developer Experience | Manual steps between "open terminal" and "agents working" | Zero (after initial setup) |
| Developer Experience | Manual sync/coordination commands in normal workflow | Zero |
| Developer Experience | Brain cycles spent on coordination per hour | Zero |
| Routing | Tasks routed to context-compatible engineer | >80% |
| Routing | Tasks routed with zero file overlap to other active developers | >90% |
| Routing | Context switches forced by task routing | <1 per hour per engineer |
| Routing | Duration prediction accuracy | Within 2x of actual |
| Efficiency | Revert rate with 8-10 concurrent agents | 5-15% (healthy range) |
| Efficiency | Output-that-sticks rate | >80% |
| Efficiency | Coordination system overhead (% of total agent resources) | <5% |

---

## Anti-Goals

- **Not self-hosted infrastructure**: The shared coordination store is a managed service (Supabase free tier), not something we build, deploy, or maintain. Zero operational burden.
- **Not real-time multiplayer editing**: Agents don't need to see each other's code changes. Full isolation. Awareness comes from the agent registry (metadata), not from shared uncommitted state.
- **Not a PM tool replacement**: PM tool integration (Linear, Asana, etc.) is a future consumer of the shared store, not part of the core coordination system. The shared store (Supabase) IS the single source of truth. PM tools are optional sync targets.
- **Not one-size-fits-all**: Single-agent mode keeps working exactly as it does today. Coordination features layer on top without changing the single-agent experience.
- **Not manual process**: If a developer has to remember to run a command for coordination to work, we've failed.
- **Not high-overhead coordination**: The coordination system must not itself become a source of cognitive load, context switching, or wasted brain cycles. If engineers are spending time thinking about coordination instead of producing output, the system is net negative.

---

## Design Questions with Recommended Positions

These are the key design decisions. For each, the spec takes a clear position with reasoning. Implementation planning can revisit, but having a starting position prevents analysis paralysis.

### Q1: Should agents see each other's uncommitted changes?

**Position: Full isolation.** Agents should NOT see each other's uncommitted changes.

Reasoning:
- Simpler mental model — each agent works as if it's the only one
- No risk of reading partially-written code or building on code that gets reverted
- Matches how git branches work naturally
- Well-understood pattern (every developer already understands branch isolation)
- The *awareness* of what other agents are working on (which files, which modules) comes from the **agent registry**, not from reading their code. The registry tells Agent B "Agent A is currently modifying auth/login.ts" without Agent B needing to see the actual edits.

### Q2: Where does coordination state live?

**Position: Supabase.** Coordination metadata (who's claimed what, agent activity, file working sets) lives in Supabase — a managed Postgres service with built-in real-time subscriptions.

**Why Supabase specifically:**

| Vendor | Real-time push | Data model | Lock-in | Free tier |
|--------|---------------|------------|---------|-----------|
| **Supabase** | Built-in (WebSocket subscriptions) | Postgres (SQL, portable) | Low (standard Postgres) | 500MB, 50K rows |
| Firebase/Firestore | Built-in | NoSQL (proprietary) | High (Google) | Generous |
| Neon/PlanetScale | None — you'd build your own pub/sub layer | Postgres | Low | Varies |
| Self-hosted Postgres | None built-in (LISTEN/NOTIFY + custom WebSocket) | Postgres | None | N/A (you host it) |

The deciding factor is **real-time subscriptions**. When Agent A on Machine 1 claims a task, Agent B on Machine 2 needs to know immediately — not on the next poll cycle. Supabase provides this out of the box: `supabase.channel('tasks').on('UPDATE', callback)`. Neon and PlanetScale would require building a separate real-time layer (WebSocket server + change detection), which is substantial work and violates the "not self-hosted infrastructure" anti-goal. Firebase has real-time but locks you into a NoSQL model that's harder to query relationally.

Reasoning:
- SQLite can't be shared across machines — it's a file-level lock
- Git is wrong for real-time state — push/pull cycles are too slow and ceremonious
- "What is Agent 3 on Machine B working on right now?" is trivial with an online DB, nearly impossible with local-only tools
- Real-time subscriptions enable instant propagation of claims, status changes, and working set updates
- It's just Postgres — if we outgrow Supabase, we migrate to any Postgres host
- Row-level security provides claim arbitration as native Postgres transactions
- SQLite stays as the local agent execution store (fast, offline, no network in hot path). The online store is for **coordination visibility**, not for agent execution. Agent hot path never touches network.

### Q3: What role does git play?

**Position: Git worktrees for code isolation. Not coordination.** Each agent gets its own git worktree — a separate working directory backed by the same `.git` database. This is strictly better than branches for concurrent agents.

```
project/
  .git/                    # shared git database
  worktree-agent-1/        # Agent 1's workspace (branch: task/auth-1)
  worktree-agent-2/        # Agent 2's workspace (branch: task/db-3)
  worktree-agent-3/        # Agent 3's workspace (branch: task/api-2)
```

Why worktrees over branches:
- Each agent has its own working directory — no risk of corrupting another agent's files
- No branch switching (which would disrupt all agents sharing a directory)
- No shared index file — each worktree has its own
- `git worktree add` is milliseconds, zero infrastructure
- Merge is natural: merge worktree's branch into base branch when task completes
- Cleanup: `git worktree remove` when task is done

Why git is NOT the coordination layer:
- Git operations are slow relative to SQLite (hundreds of ms vs microseconds) — wrong for high-frequency coordination updates
- Git is designed for human-paced collaboration, not 8 agents producing commits every few minutes
- Task state (who's working on what) doesn't naturally fit in git — it fits in a database
- Separation of concerns: git handles code lifecycle (worktree, commit, merge), the online store handles coordination lifecycle (claim, track, sync)

### Q4: What does the coordination platform look like?

**Position: Two-layer architecture** with clear separation. PM visibility tools (Linear, dashboards) are a future sync target, not part of the core coordination system.

**Layer 1 — Local execution store (SQLite)**

What it does: Fast local reads/writes for agent execution. `available_tasks`, dependency resolution, velocity views.

Properties: Microsecond access, zero network, works offline. Agents read/write this and nothing else in their hot path.

**Layer 2 — Shared coordination store (Supabase)**

What it does: Cross-machine visibility and real-time coordination.

Contains:
- **Task registry**: What work exists, what's available, what's claimed, what's done
- **Agent registry**: What agents are running, what each is working on, what files each is touching (the Developer Digital Twin data)
- **Activity log**: What happened, when, by whom — for metrics, routing, and debugging
- **Claim arbitration**: Atomic claiming across machines (Supabase's row-level security + transactions)

Properties: Real-time subscriptions, cross-machine, eventual consistency with local SQLite.

**Future Layer 3 — PM visibility (Linear, dashboards, etc.)**

Not in scope for now. When needed, sync from Layer 2 to whichever PM tool is appropriate.

Data flow: SQLite -> Supabase (automatic, event-driven). Supabase -> PM tools (future).

#### Cross-machine claiming: optimistic local claim with async Supabase verification

The agent claims locally and starts working immediately. Supabase verifies in the background.

1. Agent queries local SQLite for available tasks + routing scores (fast, local, no network)
2. Agent claims locally from SQLite (microseconds) and **immediately starts working**
3. In background, the claim is broadcast to Supabase: `UPDATE tasks SET owner = $agent WHERE id = $task AND owner IS NULL`
4. Supabase confirms -> great, continue (the normal case, >98% of claims)
5. Supabase rejects (someone else on another machine claimed it first) -> agent stops current task, claims next best task from scored list

**Claim latency: near-zero.** The agent never waits for the network. The Supabase verification happens in parallel with the agent starting its work.

**Duplicate claim risk:** Two agents on different machines could claim the same task within the ~150ms broadcast window. With working-set overlap avoidance in routing (developers are naturally steered to different task areas), this should be extremely rare (<1-2% of claims). When it does happen, one agent wastes a few seconds of work before the rejection arrives — trivially small compared to any synchronous approach.

### Q5: Merge strategy

**Position: Sequential merge queue with AI conflict resolution and dependency awareness. Target: >95% of merges require zero human intervention.**

How merges become invisible:

1. Agent completes task -> work enters merge queue -> agent immediately moves to next task (never waits)
2. Merge queue (background process) attempts `git merge` of the agent's worktree branch into base branch
3. **Clean merge (no conflicts)**: Auto-merge. Done. No human involvement. This is the overwhelming majority of merges when files are small and tasks are well-scoped.
4. **Conflict detected -> AI resolver examines it**:
   - **Auto-resolvable** (both sides added imports, both added separate functions, edits in different regions of same file): AI resolves, tags the merge as AI-resolved for audit trail
   - **Not auto-resolvable** (both sides modified same function, semantic contradiction, structural conflict): Queue the conflict, notify the developer with clear context (what files, what's conflicting, what each agent was trying to do), continue merging other completed work
5. Developer reviews flagged conflicts when they get to them — not urgent, not blocking other agents' work

The small-files strategy (Goal C2) is what makes this work: if every file is one function or one component, the probability of two agents editing the same file drops dramatically. Conflicts concentrate in shared files (imports, types, config) which are the easiest for AI to resolve.

**Target: >95% of merges are clean or AI-resolved. Human intervention on <5% of merges.**

**Dependency-aware**: A task's dependents do NOT become available in `available_tasks` until the predecessor's merge has landed — not just until status is "green." This prevents agents from building on unmerged code.

Merge queue runs as a background process on the developer's machine (if machine sleeps, merges queue up and resume on wake).

**Known risk**: If the merge queue backs up (unlikely with small files + clean merges taking seconds), it blocks dependent tasks. Monitoring: if average merge queue time exceeds 30 seconds, investigate.

### Q6: Sync triggers (SQLite -> Supabase)

**Position: Event-driven at key transitions + git hooks on major git actions.**

**Workflow event triggers** (fire automatically as side effects of N2O operations):
- Task claimed, task blocked, task completed, merge landed, agent started/stopped

**Git hook triggers** (installed automatically during `n2o init`, fire on major git actions):
- `post-commit`: Sync task progress (agent just committed work for task X)
- `post-merge`: Sync merge result (agent's work integrated into base branch)
- `pre-push`: Sync all pending state before pushing to remote
- `post-checkout`: Sync when switching contexts (worktree management)

These two trigger sources complement each other: workflow events catch N2O-specific transitions, git hooks catch code-level transitions that happen through git directly.

**Properties:**
- Not periodic (wastes calls when nothing changed), not on every state change (too noisy)
- Background, non-blocking: sync failure doesn't affect local operation
- Manual `n2o sync` command available for forcing sync at any time
- Future: add PM tool sync targets (Linear, etc.) as additional consumers of the same events

### Q7: Agent initiation

**Position: Claude Code session hooks. Developer opens terminals however they want. No launcher needed.**

The intelligence is in the hooks, not in how terminals are opened. The developer opens Warp tabs, iTerm splits, tmux panes — whatever they prefer. When they start Claude Code in each terminal:

1. `SessionStart` hook fires automatically
2. Hook handles: register agent in coordination store (Supabase) -> query Developer Digital Twin for routing context (loaded context, skill profile, path history + trajectory) -> claim best available task via optimistic local claim -> begin tdd-agent workflow automatically
3. When task completes, the cycle repeats: auto-claim next best task -> continue working
4. Developer's role: watch, review completed work, intervene when stuck. Never manually claims or invokes skills.
5. Developer controls how many agents by how many terminals they open

No launcher command needed. A convenience launcher could be built later as sugar, but it's not core infrastructure. The hooks are the infrastructure.

### Q8: Routing implementation

**Position: Local computation, centralized data. No coordinator process.**

The routing algorithm runs locally on the agent's machine at claim time. It reads twin data from both local SQLite and Supabase, scores available tasks, and claims the best one. There is no centralized routing service.

**What's centralized (Supabase) — the data:**
- Other developers' Digital Twin state (loaded context, working sets, path history, trajectory)
- Agent registry (who's running where, what files they're touching)
- This data MUST be centralized because routing needs cross-machine visibility. You can't compute overlap avoidance if you can't see other machines' working sets.

**What's local (SQLite + scoring function) — the computation:**
- The scoring function itself runs locally at claim time
- Agent queries Supabase for: other developers' active working sets, other agents' current tasks (~100-200ms, once per task claim)
- Agent queries local SQLite for: available_tasks, own twin data (loaded context, path history)
- Scoring runs locally: weighs context match, trajectory, skill, availability, overlap avoidance
- Returns ranked list, claims top-scored task

**Why not centralized computation?**
- Adds network latency to every routing decision
- Creates a single point of failure — if Supabase is slow, agents can't claim
- The computation is cheap (score 10-20 available tasks) — no reason to offload it

**Graceful degradation:** If Supabase is unreachable, routing skips cross-machine signals (overlap avoidance, other developers' trajectories) and routes based on local-only signals (own loaded context, skill match, priority ordering). The agent keeps working.

Scoring weights (initial, tunable):
- context_match: 0.35 — overlap between task's expected files and developer's loaded context
- trajectory_match: 0.25 — is this task next in the developer's feature/dependency chain?
- skill_match: 0.15 — developer's skill rating for this task's type
- availability_fit: 0.10 — does estimated_hours fit within remaining session time?
- overlap_avoidance: 0.10 — negative score for files overlapping another active developer's working set
- dependency_unlock: 0.05 — does completing this task unblock other high-value tasks?

---

## Existing Foundation

What's already built that we can build on:

| Component | Status | Relevance |
|-----------|--------|-----------|
| `available_tasks` view with dependency filtering | Done (needs `owner IS NULL` filter) | Core of task claiming |
| `developers` table with skill ratings | Done | Foundation for routing |
| `owner` column + `session_id` on tasks | Done | Task assignment tracking |
| `external_id`, `external_url`, `last_synced_at` columns | Done | Sync linkage |
| `linear-sync.sh` (358 lines) | Done | One-way sync adapter |
| `sync.sh` orchestrator | Done | Multi-adapter routing |
| Atomic claiming design (change 005) | Designed, not applied | Need to apply |
| Developer tracking design (change 007) | Designed, applied to schema | Routing data source |
| Hybrid architecture design (change 008) | Designed, partially built | SQLite/Supabase division |
| Velocity/estimation views | Done | Routing algorithm inputs |
| `workflow_events` table | Done | Activity tracking |
| tdd-agent staging discipline | Done | Isolation-compatible |

---

## References

**Foundational framework:**
- `N2O-SOPs/documents/output-hour-tool-leverage/FRAMEWORK.md` — Brain cycles, autonomy spectrum, Amdahl's Law, revert rate diagnostics, context switching research
- `N2O-SOPs/documents/output-hour-tool-leverage/v1/part-01-equation.md` — Output/Hour = Native Output x Tool Leverage decomposition
- `N2O-SOPs/documents/output-hour-tool-leverage/v1/part-03-tool-leverage.md` — Leverage stack (concurrent agents as largest multiplier), revert rate targets, output-that-sticks targets
- `N2O-SOPs/documents/VICA/functional-spec.md` — Student Model / Digital Twin concept: probabilistic model of learner state. Directly inspires the Developer Digital Twin for context-aware routing.

**Existing design docs:**
- `changes/005-task-claiming.md` — atomic claiming design
- `changes/007-developer-tracking.md` — developer profiles, performance metrics
- `changes/008-online-task-database.md` — hybrid architecture, why not MCP in hot path
- `specs/workflow-dashboard.md` — adapter interface design, dashboard views
- `specs/n2o-roadmap.md` — Goal 4 (Team Collaboration) and Goal 5 (Parallelization)
