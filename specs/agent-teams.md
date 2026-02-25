# Integrate Claude Code Agent Teams into N2O

> Make Agent Teams the default execution mode: when a developer starts Claude, the session hook automatically creates a team if multiple tasks are available. No manual commands needed.

**Status**: Not Started

---

## Scope

**This spec covers**:
- Prerequisite detection and auto-installation (tmux, iTerm2, Claude Code version)
- Enabling Agent Teams experimental flag via `n2o init`
- Session hook auto-teams: automatically create an agent team when 2+ tasks are available
- Solo fallback: auto-claim a single task when only 1 task is available or prerequisites missing
- iTerm2 + tmux split pane configuration (`teammateMode: "tmux"`)
- Quality gate hooks (TeammateIdle, TaskCompleted) wired to N2O observability
- CLAUDE.md template updates for teammate context
- `n2o team` CLI command as manual override (not the primary path)
- Deprecating `launch-agents.sh` and all Warp-specific code
- Contribution to FRAMEWORK.md: Agent Teams as implementation of Multithreading (1.1.2.2b)

**Relationship to parallel orchestrator**: Agent Teams are one execution pattern within the broader parallel orchestrator (`specs/parallel-playbook.md`). The orchestrator is the decision layer *above* Agent Teams — it reads the full task graph and determines WHEN to use Agent Teams (same-spec parallelism, Pattern 2) vs solo agents (chains) vs racing (ambiguous approaches). In the orchestrator's multi-tier model, each Agent Team is a Tier 1 execution unit managed by the Tier 0 orchestrator.

**Out of scope**:
- Supabase cross-machine coordination (unchanged, works as-is)
- Changes to the TDD/PM/Bug skill workflows (teammates invoke them as normal)

---

## Current State

**What works today**:
- `launch-agents.sh` opens Warp split panes via AppleScript, pastes prompts using `pbcopy`/`Cmd+V`
- Session hook (`n2o-session-hook.sh`) auto-claims tasks on `SessionStart`
- `claim-task.sh` does atomic SQLite claiming + worktree creation
- Agents work in isolated git worktrees, merge queue handles integration

**What's broken**:
- AppleScript keystrokes go to whichever window is focused, not the N2O window
- `AXRaise` window targeting by title is fragile across macOS versions
- Fixed `sleep 12` for Claude init is unreliable (too short or too long)
- `Opt+Cmd+Right` pane switching timing breaks if Warp layout differs
- Warp doesn't properly support tmux (features break inside tmux sessions)
- Warp-only: doesn't work in iTerm2, Terminal.app, or VS Code terminal
- Agents can't communicate with each other (fully isolated)

**What Agent Teams provides natively**:
- iTerm2 + tmux split pane management (no AppleScript needed)
- Team lead coordinates work, assigns tasks to teammates
- Direct inter-agent messaging (teammates share findings, prevent merge conflicts)
- Plan approval workflow (lead reviews before teammate implements)
- Quality gate hooks: `TeammateIdle`, `TaskCompleted`
- `Shift+Down` to cycle teammates in in-process mode (fallback for any terminal)

---

## Design Philosophy

**Team when there's parallelism. Solo when there isn't.**

This follows the framework principle (FRAMEWORK.md 1.1.2.2b): parallel autonomous loops are strictly preferred. But teaming only helps when tasks can actually run concurrently within the same feature area. The system should automatically choose the highest-leverage mode without the developer thinking about it.

### Teaming heuristic: per spec, concurrent tasks only

The teaming decision is based on two signals already in the data model:

1. **Same spec** — tasks from the same spec are building the same feature and benefit from inter-agent communication (shared context, interface changes, conflict prevention)
2. **Actually concurrent** — the `available_tasks` view already filters for tasks whose dependencies are met and merged. Only tasks that appear there can run in parallel right now.

Tasks from different specs are independent by design (MECE principle) and don't benefit from teaming — they run as independent agents.

```
Developer runs `claude`
         │
    SessionStart hook fires
         │
    Query available_tasks, group by spec
         │
    ┌─────────────┬──────────────┐
    │             │              │
  Spec A:       Spec B:        Spec C:
  3 concurrent  1 available    0 available
    │             │
    ▼             ▼
  TEAM (3)      SOLO
  (same feature, (chain: only 1
   can run now)  task unblocked)
```

### Why per spec?

| Grouping | Problem |
|----------|---------|
| Per sprint | Too broad — sprint may span unrelated features, teaming adds overhead with no communication benefit |
| Per dependency chain | Too narrow — dependencies are a sequencing signal, not a teaming signal. Chained tasks can't run in parallel anyway |
| Per file overlap | Ideal but impossible to predict before work starts |
| **Per spec** | **Right level — one coherent feature, tasks that touch related code, benefit from shared context** |

### What happens as tasks complete

When a teammate finishes a task, the `TeammateIdle` hook fires. It queries `available_tasks` for the same spec. If a previously blocked task is now unblocked (e.g., task 2 was waiting on task 1), the teammate claims it and keeps working. The team naturally works through the dependency chain — parallel tasks run simultaneously, sequential tasks are picked up as they unblock.

---

## What Changes

### 1. Prerequisite detection and auto-installation

`n2o init` gains a prerequisite check phase that runs before project setup:

```
$ n2o init ./my-project

Checking prerequisites...
  Claude Code:    found (v1.x.x)
  tmux:           not found — installing via brew...
  iTerm2:         not found — installing via brew cask...

Prerequisites installed.
```

**What gets installed**:
- `tmux` via `brew install tmux`
- iTerm2 via `brew install --cask iterm2`
- Verify Claude Code version supports Agent Teams (warn if too old)

If brew is not available, print manual install instructions instead of failing.

The check is also available standalone: `n2o check <path>` already exists and should include prerequisite status.

### 2. Session hook auto-teams (the core change)

The session hook (`n2o-session-hook.sh`) becomes the primary entry point for teams. Today it auto-claims one task. The new behavior groups available tasks by spec and teams when there's parallelism:

```bash
# Skip if we're a teammate — the lead assigned our work
if [[ "${N2O_TEAMMATE:-0}" == "1" ]]; then
  exit 0
fi

# Find the spec with the most concurrent (available) tasks
BEST_SPEC=$(sqlite3 .pm/tasks.db "
  SELECT spec, COUNT(*) as cnt
  FROM available_tasks
  GROUP BY spec
  ORDER BY cnt DESC
  LIMIT 1;
")
SPEC_NAME=$(echo "$BEST_SPEC" | cut -d'|' -f1)
SPEC_COUNT=$(echo "$BEST_SPEC" | cut -d'|' -f2)

if [[ "$SPEC_COUNT" -ge 2 ]] && has_prerequisites; then
  # AUTO-TEAM MODE: create a team for this spec's concurrent tasks
  TEAM_SIZE=$(( SPEC_COUNT < 4 ? SPEC_COUNT : 4 ))
  echo "--- TEAM MODE ---"
  echo "Create an agent team with $TEAM_SIZE teammates for spec: $SPEC_NAME"
  echo "Available tasks in this spec:"
  sqlite3 .pm/tasks.db "
    SELECT task_num, title, done_when
    FROM available_tasks
    WHERE spec = '$SPEC_NAME';"
  echo "Each teammate should claim a task, create a worktree, invoke /tdd-agent..."
  echo "Set N2O_TEAMMATE=1 in each teammate's environment."
else
  # SOLO: only 1 task available in any spec, or prerequisites missing
  claim-task.sh ...
fi
```

**Team size**: `min(concurrent_tasks_in_spec, 4)` — matches actual parallelism, caps at 4 to keep coordination manageable.

**Spec selection**: Picks the spec with the most concurrent tasks. If multiple specs have parallelism, the developer can open additional `claude` sessions — each one picks the next best spec.

**Teammate guard**: When a teammate is spawned by the lead, the `SessionStart` hook also fires. The hook detects `N2O_TEAMMATE=1` and skips — the lead already assigned work.

### 3. Settings configuration (via `n2o init`)

During `n2o init`, add Agent Teams config to the project's `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "teammateMode": "tmux"
}
```

Also update `register_session_hook()` in the `n2o` CLI to merge these settings idempotently.

### 4. Quality gate hooks

Add `TeammateIdle` and `TaskCompleted` hooks to `.claude/settings.json`:

- **TaskCompleted**: Runs a script in `scripts/coordination/` that logs the completion event to `workflow_events`, updates the task status in SQLite, and syncs to Supabase if configured.
- **TeammateIdle**: Checks if more tasks are available in `available_tasks` view. If yes, exit code 2 with message "Claim next available task from .pm/tasks.db" to keep the teammate working. If no tasks remain, exit 0 (let teammate go idle).

### 5. CLAUDE.md team context

Add an "Agent Teams" section to the CLAUDE.md template (`templates/CLAUDE.md`) that teammates auto-load on spawn:

- How to query `available_tasks` from `.pm/tasks.db`
- How to claim atomically (`UPDATE ... WHERE owner IS NULL`)
- How to create worktrees via `scripts/coordination/create-worktree.sh`
- That they should invoke `/tdd-agent` for implementation
- How to message the team lead on completion or blockers

### 6. `n2o team` command (manual override)

For when the developer wants explicit control — custom team size, specific sprint, specific model. Not the primary path.

```bash
n2o team <project-path> [--size 3] [--sprint <name>] [--model sonnet]
```

Generates and copies a team prompt to clipboard. User pastes into Claude.

### 7. Deprecate Warp launcher

- Remove `launch-agents.sh`
- Remove Warp launch config generation (`~/.warp/launch_configurations/`)
- Update references in `specs/coordination.md` and any other docs

### 8. FRAMEWORK.md contribution

Add a "Current Implementation" subsection under 1.1.2.2(b) Multithreading in the N2O-SOPs repo:

- Agent Teams as the concrete realization of parallel autonomous loops
- Session hook auto-teaming as the mechanism for zero-friction multithreading
- TeammateIdle hook as the implementation of "fill waiting time with productive work" (1.1.1.1)
- Link to this spec for technical details

---

## What Stays the Same

| Component | Why |
|-----------|-----|
| `claim-task.sh` | Still used for atomic claiming (solo fallback + teammates) |
| Git worktrees | Each teammate works in its own worktree (isolation preserved) |
| Merge queue | `merge-queue.sh` still merges completed work sequentially |
| SQLite task DB | Source of truth for task state; Agent Teams' ephemeral task list is secondary |
| Skill system | Teammates load CLAUDE.md + skills normally |
| Supabase sync | Background sync continues via git hooks |

---

## Suggested Tasks

| # | Task | Done When |
|---|------|-----------|
| 1 | Add prerequisite detection and auto-install to `n2o init` | `n2o init` checks for tmux, iTerm2, and Claude Code version. Installs missing deps via brew (or prints manual instructions). `n2o check` also reports prerequisite status. |
| 2 | Rewrite session hook for auto-teaming | `n2o-session-hook.sh` groups available tasks by spec. If any spec has 2+ concurrent tasks, outputs a team creation prompt scoped to that spec. If all specs have 0-1 available tasks, claims a single task (solo). Teammates detected via `N2O_TEAMMATE=1` skip the hook. |
| 3 | Configure Agent Teams settings in `n2o init` | `n2o init` adds `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, `teammateMode: "tmux"`, and quality gate hooks to `.claude/settings.json`. Idempotent. |
| 4 | Add TeammateIdle + TaskCompleted hook scripts | TeammateIdle checks available_tasks and keeps teammate working if tasks remain (exit 2). TaskCompleted logs to workflow_events and syncs state. Both in `scripts/coordination/`. |
| 5 | Add team context to CLAUDE.md template | `templates/CLAUDE.md` includes "Agent Teams" section with claiming, worktree, skill, and messaging instructions. |
| 6 | Add `n2o team` CLI command (manual override) | `n2o team <path>` queries available_tasks and outputs a team prompt. Copies to clipboard. Accepts `--size`, `--sprint`, `--model` flags. For when developer wants explicit control. |
| 7 | Deprecate Warp launcher | Remove `launch-agents.sh`, remove Warp launch config generation, update docs/specs references. |
| 8 | Add "Current Implementation" to FRAMEWORK.md | Short subsection under 1.1.2.2(b) Multithreading linking Agent Teams as the concrete realization of parallel autonomous loops. In the N2O-SOPs repo. |

---

## Terminal Decision

**iTerm2 is the primary terminal for team sessions.** Reasons:
- Deep tmux integration (`tmux -CC` gives native iTerm2 splits)
- Recommended by Agent Teams docs
- Warp doesn't properly support tmux (Warp features break inside tmux sessions)
- Free, stable, widely used on macOS

For solo sessions, any terminal works (Warp, iTerm2, Terminal.app) — no tmux needed.

---

## References

- Agent Teams docs: https://code.claude.com/docs/en/agent-teams
- Warp tmux incompatibility: https://github.com/warpdotdev/Warp/discussions/501
- Current launcher: `scripts/coordination/launch-agents.sh` (to be deprecated)
- Session hook: `scripts/n2o-session-hook.sh`
- Settings template: `n2o` CLI `register_session_hook()` function
