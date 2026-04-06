# Unified Workflow & Version Control
> One command (`/workflow`) enters a self-driving loop. Auto-routes, auto-chains, always outputs a PR. Normal Claude Code usage is unaffected.

## Recent Changes

| Date | What changed |
|------|-------------|
| 2026-03-18 | v5: Judge runs as subagent (not same session). One PR per workflow run (not per task). Async robots use task DB same as interactive. Concrete routing algorithm. Cut phase logging entirely. Simplified phase 6 draft. No backwards compat. |
| 2026-03-18 | v4: Single LLM judge (Spotify-style, pass/fail). Fixed cross-spec inconsistencies. |
| 2026-03-18 | v3: One deterministic entry command (`/workflow`). Descriptive folder names. |
| 2026-03-18 | v2: Merged version control + workflow unification. |
| 2026-03-18 | v1: Initial version control spec. Removed — too many CLI commands. |

## Why

**1. Named commands and manual handoffs don't work.** You type `/pm-agent` to plan, then `/tdd-agent` to implement, then `/bug-workflow` to debug. Nobody at Spotify, Stripe, or GitHub does this.

**2. Async mode can't have manual handoffs.** When `n2o async` runs a prompt on remote compute, there's no human to type the next command. The loop must be self-driving.

## Industry context

Every company shipping AI code at scale: **describe what you want → agent works → PR comes back → human reviews**.

- **Spotify** (Honk): Slack message → agent works → PR. LLM-as-Judge vetoes 25% (scope creep).
- **Stripe** (Minions): One-shot agents, deterministic gates, 2 CI cap. "The walls matter more than the model."
- **GitHub Copilot Agent**: Assign issue to Copilot → draft PR comes back.

Key data: AI PRs have 1.7x more issues (CodeRabbit). 45% of AI code fails security tests, flat across model sizes (Veracode). Refactoring dropped from 25% to <10% with AI (GitClear).

## What changes

### 1. One entry command: `/workflow`

`/workflow` enters the structured loop. That's the only command. Once inside, the workflow auto-routes and auto-chains.

**Outside `/workflow`**, Claude Code works normally.

**In async mode**, the runner's prompt includes `/workflow` context automatically. The robot has its own task DB and follows the same workflow loop as interactive — just without pausing.

### 2. Rename skills to descriptive folders

| Old | New (in `skills/`) |
|-----|-----|
| `pm-agent/` | `plan/` |
| `tdd-agent/` | `test/` |
| `bug-workflow/` | `debug/` |
| `code-health/` | `health/` |
| `detect-project/` | `detect/` |
| `frontend-review/` | `review/` |
| `react-best-practices/` | `react/` |
| `ux-heuristics/` | `ux/` |

No backwards compatibility. Old names are deleted.

### 3. The workflow loop

```
PLAN → BREAK DOWN → IMPLEMENT (loop per task) → PR
                        ↑              ↓
                   DEBUG ←──── can't write failing test?
```

### 4. Auto-routing algorithm

On `/workflow` entry, the orchestrator runs this decision tree:

```
1. Check conversation: did the user describe a feature/change/bug?
   → YES and no spec file referenced → enter PLAN
   → YES and spec file referenced    → go to step 2

2. Query task DB: `n2o task available --sprint <current>`
   → No sprint exists           → enter BREAK DOWN (user has a spec but no tasks)
   → Available tasks returned   → enter IMPLEMENT (pick first available)
   → All tasks green            → enter VERIFY (open PR, summarize, exit)
   → All tasks blocked          → surface to human

3. During IMPLEMENT, if RED phase fails after 2 attempts:
   → enter DEBUG for the current task

4. After DEBUG produces findings:
   → return to IMPLEMENT for the same task with the findings as context
```

The "current sprint" is determined by: explicit user mention > most recent sprint with pending tasks > ask the user.

**Spec detection**: the orchestrator checks `ls .pm/todo/*/` for markdown files. If the user references a spec by name or describes a feature that matches a spec filename, that's the active spec.

### 5. Auto-chaining

Phases flow automatically:
- PLAN completes → BREAK DOWN starts
- BREAK DOWN completes → IMPLEMENT starts
- Task completes → commit to branch, pick next task
- All tasks done → open PR, summarize, exit
- Can't reproduce bug → DEBUG → findings → back to IMPLEMENT

**Interactive pauses at 3 points:**
1. After spec draft — "Does this look right?"
2. After task breakdown — "Ready to implement?"
3. On unrecoverable failure — "I'm stuck, here's what I tried"

**Async pauses at 0 points.** Failures → mark task blocked, move to next.

### 6. Quality gates: deterministic + LLM judge as subagent

**Cut**: 3 parallel audit subagents, A-F grading, FIX_AUDIT loop, codification, phase logging, status tables.

**Keep**:
- TDD discipline (RED → GREEN → REFACTOR)
- Deterministic gates from `.pm/config.json`: test, typecheck, lint, build
- **One LLM judge** — runs as a **subagent** (not the same session) with only the diff + task `done_when` + task description as context. No memory of implementation decisions. Pass/fail: does the diff match the acceptance criteria and stay in scope?
- 2-attempt cap on failures before marking blocked

**Why a subagent?** The main session wrote the code — it can't objectively judge its own work. The subagent sees only the diff and the task definition, same as a human reviewer would. This mirrors Spotify's architecture where the judge is a separate evaluation pipeline.

**On judge fail**: Interactive → surface reason, let human decide. Async → mark blocked, move to next.

### 7. One PR per workflow run

The workflow commits all tasks to a single branch and opens **one PR** at the end. Not one PR per task.

**Branch**: `workflow/{sprint}` (or `async/<job-id>` for remote runs)

**During the run**: each task gets a commit with trailers:
```
feat(auth): implement token refresh

Done-When: refresh token rotates on expiry and updates stored credential
Task: auth/42
Assisted-by: claude-opus-4-6 [workflow]
```

**At the end**: `gh pr create` with the PR template. The PR contains all commits from the workflow run. Reviewer sees one diff, one PR, with per-task commits for granularity.

**PR template**:
```markdown
## What
<!-- 1-2 sentences: what this workflow run accomplished -->

## Tasks completed
<!-- list of sprint/task_num with done_when for each -->

## How to verify
<!-- test results, done_when criteria -->

## Review focus
<!-- 1-2 areas where human attention matters most -->
```

### 8. Refactoring budget

Every sprint includes at least one `type=refactor` task. Enforced in `skills/plan/SKILL.md` during BREAK DOWN: the plan phase checks the task list before finishing and adds a refactor task if none exists.

### 9. Code health is optional standalone

Not part of the main loop. Quality enforcement happens through deterministic gates + LLM judge.

## Skill architecture

### The workflow SKILL.md is self-contained

`skills/workflow/SKILL.md` (~300 lines) contains ALL essential instructions inline:
- Routing algorithm (section 4 above)
- TDD cycle summary (RED → GREEN → REFACTOR → gates → judge → commit)
- Quality gate commands
- Version control procedures (branch, commit trailers, PR)
- Interactive vs async behavior

The phase detail files (`skills/plan/SKILL.md`, `skills/test/SKILL.md`, `skills/debug/SKILL.md`) are **optional deep-dive references**. The orchestrator CAN Read() them for detailed instructions, but the critical path never depends on it. If Read() is skipped, the workflow still functions from the inline instructions.

### Folder structure

```
skills/
├── workflow/SKILL.md        (orchestrator — /workflow entry point, self-contained)
├── plan/SKILL.md            (detailed planning instructions, loaded as reference)
├── test/SKILL.md            (detailed TDD instructions, loaded as reference)
├── debug/SKILL.md           (detailed debug instructions, loaded as reference)
├── health/SKILL.md          (optional standalone)
├── detect/SKILL.md          (project detection)
├── review/SKILL.md          (frontend review)
├── react/SKILL.md           (ambient pattern)
├── ux/SKILL.md              (ambient pattern)
└── design/                  (micro-skills)

.claude/skills/
├── workflow -> ../../skills/workflow
├── health -> ../../skills/health
├── detect -> ../../skills/detect
├── react -> ../../skills/react
├── ux -> ../../skills/ux
└── design -> ../../skills/design
```

`plan/`, `test/`, `debug/` are NOT symlinked — internal to the workflow.

### CLAUDE.md integration

```markdown
## Workflow

This project uses the N2O workflow system. Enter the structured loop with `/workflow`.

Outside of `/workflow`, Claude Code works normally — ask questions, make edits, explore.

Inside `/workflow`, the system auto-routes between phases (plan → implement → debug)
based on context. No further commands needed. One PR is opened at the end.

Pattern skills (react, design, ux) are ambient — consulted automatically during
relevant work regardless of whether /workflow is active.
```

## Async: same workflow, same task DB

The async runner's robot has its own task DB (scoped per `(robot_id, project_id)` — see phase 6). The robot follows the **exact same workflow** as interactive mode:

1. Robot clones repo
2. Workflow context injected from CLAUDE.md + `skills/workflow/SKILL.md`
3. Robot uses `n2o task *` commands against its own local `workflow.db`
4. Commits to branch, opens PR at the end

**Concurrency**: Jobs are self-contained — each gets its own branch, own ephemeral task DB, doesn't merge. Parallel runs are safe. The queue limits concurrent jobs per project (default: 3) to prevent cost spikes, not data conflicts.

## Simplified phase 6 alternative

The current phase 6 spec is comprehensive (Upstash Redis, Fly Machines, robot records, 9 subcommands). For v1, GitHub Actions with [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) achieves the same core primitive with far less infrastructure:

```
n2o async "implement the auth feature"
```

**What happens**:
1. CLI calls `gh api repos/:owner/:repo/dispatches` with the prompt as payload
2. A generic `.github/workflows/n2o-async.yml` fires
3. Workflow uses `anthropics/claude-code-action` — Claude Code is pre-configured, no manual install
4. `n2o` binary must be available in the runner. Options: (a) download a pre-built release binary in a setup step, (b) `go install` from source, or (c) check in a statically-linked binary to the repo. Release binary is simplest — add a `setup-n2o` step that curls the latest release from GitHub.
5. Claude follows the workflow loop (plan → tasks → implement → PR)
6. Robot's task DB lives in the runner's workspace (ephemeral, not synced)
7. PR is the output. Job is done.

**CLI surface**: `n2o async run`, `n2o async list` (wraps `gh run list`), `n2o async cancel` (wraps `gh run cancel`). Three commands.

**n2o in the sandbox**: `claude-code-action` runs in a GitHub Actions runner (Ubuntu), not a custom Docker image. The `n2o` binary needs to be installed at runtime. The workflow template (shipped in `integrations/github/`) handles this:

```yaml
- name: Install n2o
  run: |
    curl -sL https://github.com/lukes/n2o/releases/latest/download/n2o-linux-amd64 -o /usr/local/bin/n2o
    chmod +x /usr/local/bin/n2o
    n2o init --non-interactive
```

This lives in `integrations/github/` alongside other GitHub-specific integration files (workflow templates, action configs).

**Concurrency**: Jobs are self-contained — each robot works on its own branch, doesn't merge, and subsequent runs can't see prior changes until they're merged by a human. Parallel runs are fine. The main concern is cost — to prevent users from accidentally spinning up many concurrent jobs, add a `concurrency` group with a configurable max (default: 3 per repo):

```yaml
concurrency:
  group: n2o-async-${{ github.repository }}
  # GitHub Actions queues excess jobs automatically
```

**Tradeoffs vs full phase 6**:
- No custom infra (Redis, Fly) — just GitHub Actions
- Cold start ~30s vs ~3s (acceptable for async work)
- CI minute limits on private repos
- Prompt limited to 64KB dispatch payload (fine for most prompts)
- No connected accounts model — `ANTHROPIC_API_KEY` as repo secret
- `n2o` binary must be installed at runtime (release download, ~15MB, <5s)

This is a "start here" option. The full Fly-based architecture from phase 6 can replace it later if GitHub Actions becomes a bottleneck.

## Steps

### During phase 2 (flatten + unify)

1. Rename folders: `pm-agent` → `plan`, `tdd-agent` → `test`, etc. Delete old names.
2. Create `skills/workflow/SKILL.md` — self-contained orchestrator with routing, TDD cycle, gates, version control
3. Simplify `skills/plan/SKILL.md` — extract from pm-agent, remove ceremony
4. Simplify `skills/test/SKILL.md` — extract from tdd-agent, remove audit/codify/phase-logging
5. Simplify `skills/debug/SKILL.md` — extract from bug-workflow
6. Update `templates/CLAUDE.md` — `/workflow` description
7. Create `templates/.github/PULL_REQUEST_TEMPLATE.md`

### During phase 3 (Go CLI)

8. Add `Assisted-by` and `Done-When` trailers to `n2o commit`

## Verification

- `/workflow` enters the loop; normal usage without it is unaffected
- Auto-routing: "plan auth" → PLAN; "pick next task" → IMPLEMENT; available tasks exist → IMPLEMENT
- PLAN → auto-chains to BREAK DOWN → pauses for approval (interactive)
- All tasks complete → one PR opened with all commits
- LLM judge runs as subagent, only sees diff + task definition
- Async mode: full loop runs, robot uses its own task DB, one PR at end
- Concurrent jobs each get their own branch — no conflicts
- Blocked tasks (2 gate failures) → marked blocked, next task picked

## Sources

| Source | Key insight |
|--------|------------|
| [Spotify Honk](https://engineering.atspotify.com/2025/11/spotifys-background-coding-agent-part-1) | LLM-as-Judge vetoes 25% (scope creep), separate eval pipeline |
| [Stripe Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2) | Deterministic gates, 2 CI cap, "walls > model" |
| [GitHub Copilot Agent](https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/) | Issue assignment → draft PR |
| [CodeRabbit](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) | AI PRs: 1.7x more issues |
| [Veracode](https://www.veracode.com/blog/genai-code-security-report/) | 45% security failure, flat across models |
| [GitClear](https://www.gitclear.com/ai_assistant_code_quality_2025_research) | Refactoring cratered; copy-paste 4x baseline |
| [Linux Kernel](https://docs.kernel.org/process/coding-assistants.html) | `Assisted-by` attribution |
