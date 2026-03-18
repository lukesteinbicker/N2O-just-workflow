# Phase 6: Async / overnight workflow
> Run any prompt against a repo on remote compute — no developer machine required.

## Why

Today, every agent session runs inside Claude Code on the developer's laptop. This means:
- Long tasks (full sprint execution, deep PR review) block the terminal
- The machine must stay awake and online
- Parallel sessions compete for local resources
- Reviewing merged PRs or open PRs requires the developer to be present

The goal: queue work that runs asynchronously on remote compute, reports results back, and never touches the developer's machine.

## Core primitive

The fundamental unit is: **run a prompt against a repo clone on remote compute**.

```
n2o async run "Review PR #42 for security issues and post findings as a comment"
n2o async run --file review-checklist.md --pr 42
n2o async run --file overnight-sprint.md
```

That's it. The runner has the repo cloned, feeds the prompt to Claude Code, and delivers results. Everything else — PR review, sprint execution, code health — is just a preset prompt with convenience flags.

### How it works

1. User provides a prompt (inline string or `.md` file)
2. CLI posts the job to the **N2O app API**: `{ prompt, repo, branch/PR, ref }`. No tokens in the payload — the API already has the user's connected accounts. The CLI never talks to Fly or Redis directly.
3. The API enqueues the job to Redis, then spins up a **fresh Fly Machine** with the job payload as env vars.
4. Machine boots (~3s), shallow-clones the repo (`git clone --depth 1`, ~10s), runs `claude -p`.
5. `claude -p` runs in headless mode (Sonnet, medium effort, 200 max turns, $30 budget cap). Prompt caching is automatic. Exits when done.
6. All work happens on a PR branch — Claude creates a branch `async/<job-id>`, commits, and opens a draft PR via `gh pr create`.
7. Runner posts result metadata to the N2O API, then exits. Machine is destroyed automatically.

### What the prompt can do

Since the runner is Claude Code in headless mode with full permissions, the prompt can do anything a local session can:
- Read/write files, run tests, commit, push to PR branches
- Use `gh pr comment`, `gh issue create`
- Run any Bash commands
- Access any tool Claude Code has

> **Note**: The `/workflow` skill context is injected into async runner prompts automatically, so the runner follows the same workflow loop (plan → implement → debug) as interactive sessions — just without pausing for approval. The runner does not use `n2o task *` commands — it operates from the prompt, not the task DB (see Task DB Isolation).

The prompt is the interface. The runner is just compute.

### Guardrails

- **PR-scoped**: All async work targets a pull request. The runner never pushes directly to protected branches.
- **Time limit**: Jobs have a wall-clock timeout of 30 minutes.
- **Turn limit**: `--max-turns 200`. Prevents infinite loops.
- **Budget cap**: `--max-budget-usd 30`. Claude exits when spend hits the limit. Hard ceiling per job.
- **Model**: Sonnet (`--model sonnet`). Best cost/performance tradeoff for automated tasks.
- **Effort**: Medium (`--effort medium`). Default reasoning depth.
- **Permissions**: `--dangerously-skip-permissions`. The machine is isolated, single-purpose, and PR-scoped.
- **Cost**: API pricing (`ANTHROPIC_API_KEY`). Prompt caching is automatic (90% savings on cache hits for system prompt, CLAUDE.md, tool definitions). Typical job cost: $1-5.

## What changes

1. **`n2o async` command group** — `run`, `status`, `list`, `view`, `watch`, `logs`, `cancel`, `rm`, `rerun`. Follows `gh` CLI conventions. `run` blocks with clear error if auth tokens are missing (see Authentication).
2. **Job queue (Upstash Redis)** — jobs are enqueued to Upstash Redis via the N2O API. Provides delivery guarantees, retry, deduplication, and job state tracking. The CLI never touches Redis — all queue operations are proxied through the API.
3. **Ephemeral Fly Machines** — each job gets a fresh Fly Machine. Machine starts, runs one `claude -p` command, delivers results, exits. No persistent state, no Volumes, no memory leaks. Shallow clone keeps startup fast (~10s).
4. **Preset prompts** — built-in `.md` templates for common jobs (PR review, sprint exec, health scan). Convenience flags expand to prompts.
5. **Result delivery** — PR comment (primary), with job events synced to the N2O API (Postgres).

## Prompt interface

### Inline prompt

```
n2o async run "Scan for TODO comments older than 30 days and open an issue summarizing them"
```

### From file

```
n2o async run --file .n2o/prompts/nightly-review.md
```

The `.md` file is just a prompt — plain text, markdown, whatever you'd type into Claude Code. Example:

```markdown
Review all PRs merged in the last 24 hours. For each PR:
1. Check for missing tests
2. Check for security issues (OWASP top 10)
3. Check for N2O pattern compliance

Post a single summary issue titled "Daily review: {date}" with findings grouped by PR.
If everything looks clean, still post the issue but note "All clear."
```

### With context flags

Flags inject context into the prompt automatically:

```
n2o async run --file review.md --pr 42          # adds: "Focus on PR #42 (branch: feature/x, diff: ...)"
n2o async run --file review.md --branch main    # adds: "Working on branch: main"
n2o async run --file sprint.md --ref abc123     # checks out specific commit
```

The flags don't change the prompt — they set up the workspace (which branch to clone, which PR to checkout) and append context to the prompt header.

## Presets

Presets are built-in `.md` prompt templates shipped with N2O. They're convenience shortcuts — the user could write the same prompt themselves.

### `n2o async run review` (preset)

```
n2o async run review --pr 42
n2o async run review --merged --since yesterday
```

Expands to the built-in `templates/async/review.md` prompt with PR context injected. The template invokes code-health + pattern review and posts findings as a PR comment.

### `n2o async run sprint` (preset)

```
n2o async run sprint --sprint auth
```

Expands to `templates/async/sprint.md`. The template instructs Claude to work on the sprint — reading specs and task definitions from the codebase (where agents normally find them), implementing tasks, committing to a work branch, and opening a draft PR. No task DB access needed — sprint context lives in the repo's spec files.

### `n2o async run health` (preset)

```
n2o async run health
```

Expands to `templates/async/health.md`. Runs full code-health scan, creates tech-debt tasks.

## CLI commands

Command structure follows the `gh` CLI pattern (`gh run list`, `gh run view`, `gh run watch`). All UI is styled with Charmbracelet Lip Gloss.

```
n2o async run       Submit a job (with confirmation)
n2o async status    Dashboard: auth, machine, queue, history
n2o async list      List jobs (filterable)
n2o async view      View a single job's details
n2o async watch     Live-stream a running job's progress
n2o async logs      Static log dump of a completed job
n2o async cancel    Cancel a running or queued job
n2o async rm        Remove a queued job
n2o async rerun     Re-submit a failed job
```

### `n2o async run`

Submit a job. Always shows a **confirmation prompt** before enqueuing:

```
$ n2o async run review --pr 42

  ┌─────────────────────────────────────────────────┐
  │  Async Job                                       │
  │                                                  │
  │  Prompt:   preset:review                         │
  │  Target:   PR #42 (feature/auth-middleware)      │
  │  Repo:     my-org/my-app                         │
  │  Limits:   30m / 200 turns / $30 budget          │
  │  Queue:    0 ahead                               │
  └─────────────────────────────────────────────────┘

  Submit? [Y/n] y

  ✓ Queued job abc123 — position 1 (next up)
```

If there are queued jobs ahead, it shows the position:

```
  ✓ Queued job def456 — position 3
```

Skip confirmation with `--yes` / `-y` for scripting:

```
n2o async run review --pr 42 -y
# → ✓ Queued job abc123 — position 1 (next up)
```

### `n2o async status`

Dashboard view of async infrastructure health, current queue, and recent history:

```
$ n2o async status

  ╭─ Async Status ──────────────────────────────────╮
  │                                                  │
  │  Auth                                            │
  │  ✓ Anthropic  configured (sk-ant-ap...)          │
  │  ✓ GitHub     connected (expires 2026-12-01)     │
  │  ✓ N2O        connected                          │
  │                                                  │
  │  Jobs                                            │
  │  ▸ Running:  review PR #42    (12m / 30m)        │
  │    Queued:   sprint auth      (position 1)       │
  │    Queued:   health scan      (position 2)       │
  │                                                  │
  │  Today: 3 completed, 1 running, 2 queued         │
  │                                                  │
  │  Recent History                                  │
  │  ID       TYPE      TARGET    STATUS    DURATION │
  │  ghi789   review    PR #38    ✓ done    4m 12s   │
  │  jkl012   sprint    auth      ✓ done    22m 05s  │
  │  mno345   health    —         ✓ done    8m 31s   │
  ╰──────────────────────────────────────────────────╯
```

### `n2o async list`

Compact list view, filterable:

```
n2o async list
n2o async list --status queued       # only queued jobs
n2o async list --status running      # only running
n2o async list --today               # today's jobs
n2o async list --all                 # include completed/failed history
```

### `n2o async view`

Detailed view of a single job (like `gh run view`):

```
$ n2o async view abc123

  ╭─ Job abc123 ────────────────────────────────────╮
  │                                                  │
  │  Status:    ✓ Completed                          │
  │  Prompt:    preset:review                        │
  │  Target:    PR #42 (feature/auth-middleware)     │
  │  Duration:  4m 12s                               │
  │  Started:   2026-03-17 12:03:01                  │
  │  Finished:  2026-03-17 12:07:13                  │
  │                                                  │
  │  Result                                          │
  │  PR comment posted: github.com/my-org/my-app/... │
  │  Files reviewed: 12                              │
  │  Issues found: 2 (1 security, 1 missing test)   │
  │                                                  │
  │  Timeline                                        │
  │  12:03:01  ● Fetching repo                       │
  │  12:03:03  ● Checking out PR #42                 │
  │  12:03:04  ● Running claude                       │
  │  12:07:10  ● Posting PR comment                  │
  │  12:07:13  ✓ Done                                │
  ╰──────────────────────────────────────────────────╯
```

### `n2o async watch`

Opens a terminal UI (Bubble Tea TUI) that live-streams the Fly Machine's log output via the **N2O API** (which proxies the Fly Logs API). The CLI never talks to Fly directly. Displays in a bordered "TV" panel:

```
$ n2o async watch abc123

  ╭─ abc123 • review PR #42 ────────── 1m 12s / 30m ╮
  │                                                  │
  │  12:03:01  ● Fetching repo...                    │
  │  12:03:03  ● Checking out PR #42                 │
  │  12:03:04  ● Running claude (preset: review)      │
  │  12:03:04  │ Reading PR diff...                   │
  │  12:03:12  │ Analyzing 12 changed files...        │
  │  12:03:45  │ Running code-health checks...        │
  │  12:04:10  │ Writing review findings...           │
  │  ▌                                                │
  │                                                  │
  ├──────────────────────────────────────────────────┤
  │  q quit • c cancel job                           │
  ╰──────────────────────────────────────────────────╯
```

- Auto-scrolls as new log lines arrive
- Shows elapsed time in the header
- `q` exits the watcher (job keeps running)
- `c` sends a hard stop to the machine (same as `n2o async cancel`)
- Exits automatically when the job completes, showing the final status

If the job is still queued, watch waits for it to start:

```
  ╭─ def456 • sprint auth/1-5 ──────── queued (#2) ╮
  │                                                  │
  │  Waiting for job to start...                     │
  │  Position: 2 (1 job running ahead)               │
  │  ▌                                                │
  │                                                  │
  ╰──────────────────────────────────────────────────╯
```

### `n2o async logs`

Static log dump of a completed or running job (non-streaming):

```
n2o async logs abc123
```

### `n2o async cancel`

Cancel a queued or running job. Queued jobs are removed from the queue. Running jobs are hard-stopped via the N2O API (which destroys the Fly Machine). This should be rare — most jobs should be left to complete or time out naturally.

```
$ n2o async cancel def456
  ✓ Cancelled job def456 (was queued, position 2)

$ n2o async cancel abc123
  ⚠ Job abc123 is currently running (12m elapsed).
  Stop the job? [y/N] y
  ✓ Cancelled job abc123 (machine destroyed)
```

### `n2o async rm`

Remove a queued job from the queue. Only works on `queued` jobs — not running, completed, or failed:

```
$ n2o async rm def456
  ✓ Removed job def456 from queue

$ n2o async rm abc123
  ✗ Cannot remove job abc123 — status is 'running'. Use `n2o async cancel abc123` instead.
```

### `n2o async rerun`

Re-submit a failed job with the same prompt and context (like `gh run rerun`). Uses the same fixed defaults (Sonnet, 200 turns, $30 budget, 30m timeout).

```
$ n2o async rerun abc123

  ┌──────────────────────────────────────────────────┐
  │  Rerun Failed Job                                 │
  │                                                   │
  │  Original:  abc123 (failed: timeout after 30m)    │
  │  Prompt:    preset:sprint auth/1-5                │
  │  Limits:    30m / 200 turns / $30 budget          │
  └──────────────────────────────────────────────────┘

  Submit? [Y/n] y

  ✓ Queued job xyz789 (rerun of abc123) — position 1
```

## Runner architecture

### Queue: Upstash Redis

The N2O API enqueues jobs to Upstash Redis via its REST API. The CLI never talks to Redis directly — all queue operations go through the N2O API.

Job lifecycle: `queued` → `started` → `completed` | `failed` | `cancelled` | `removed`

The queue provides:
- **Concurrency-limited per project** — default max 3 concurrent jobs per `project_id`. Jobs are self-contained (own branch, own ephemeral task DB, no merging), so parallel execution is safe. The limit prevents accidental cost spikes, not data conflicts.
- **Deduplication** — optional idempotency key prevents duplicate jobs (e.g., same prompt + same PR = one job)
- **Job state** — status, position, and result metadata stored in Redis hashes, keyed by job ID. Detailed logs are streamed via the Fly Logs API (proxied through the N2O API).
- **Removable** — queued jobs can be removed before they start running. Running jobs can be cancelled (stops the machine). Completed/failed jobs are immutable history.
- **Short TTL on completed jobs** — completed/failed/cancelled job records expire from Redis after 7 days. Job events are persisted in the N2O API (Postgres). Redis is just the active queue + short-term cache.

### Compute: Ephemeral Fly Machines

Each job gets a **fresh Fly Machine**. The machine starts, runs one `claude -p` command, delivers results, and exits. No persistent state, no Volumes, no polling loops.

**Why ephemeral:**
- **No memory leaks** — fresh process every job, Claude Code's documented memory growth is irrelevant
- **No dirty state** — no `git reset --hard` needed, no prior job artifacts to clean up
- **No Volumes** — $0 idle cost, no disk management
- **No polling** — the API creates a machine per job with the job payload baked in. No Redis polling, no Upstash rate limit concerns.
- **Simpler runner** — the entrypoint is a linear script (clone → run → deliver → exit), not a polling loop

**How it works:**
1. CLI posts job to N2O API
2. API enqueues job to Redis, then creates a new Fly Machine via the Fly Machines API. Job payload (prompt, repo, ref, user ID) is passed as environment variables.
3. Machine boots from the pre-built Docker image (~3s for image, already cached on Fly)
4. Runner entrypoint (`n2o runner execute`) runs:
   a. Pull GitHub token from N2O API (`GET /api/me/integrations/git/github/token`)
   b. Configure git credential helper + `GITHUB_TOKEN` env var
   c. `git clone --depth 1 --branch <ref> <repo-url> /work/repo` (shallow clone, ~10s)
   d. Write prompt to temp file
   e. `claude -p "$(cat /tmp/prompt.md)" --model sonnet --effort medium --dangerously-skip-permissions --max-turns 200 --max-budget-usd 30 --output-format stream-json --verbose`
   f. Runner processes stream-json output: human-readable progress written to stdout (picked up by Fly Logs API for `watch`), final result JSON captured to `/tmp/result.json`
   g. POST result metadata to N2O API (`n2o runner deliver --job $JOB_ID --result /tmp/result.json`)
5. Runner process exits → Fly Machine stops automatically (auto-destroy on exit)

The prompt is **never interpolated into a shell command** — it's always read from a file.

All preset prompts prepend: "You are running in async headless mode on branch `async/<job-id>`. Act autonomously — do not ask for confirmation, do not wait for user input. When finished, create a PR with `gh pr create`."

**Machine spec:**

| Resource | Spec | Cost |
|---|---|---|
| CPU/RAM | `performance-2x` (2 dedicated CPUs, 4GB RAM) | ~$0.09/hr while running |
| Idle cost | $0 (machine destroyed after job) | — |

**Limits**: Three hard ceilings per job — 30-minute wall clock, 200 turns, $30 budget. Whichever is hit first causes Claude to exit. The job is marked `completed` (if Claude finished normally) or `failed` (if a limit was hit mid-work).

**Docker image contents**: Claude Code, `gh` CLI, `n2o` binary, Node, Go, and common build tools. The runner does not run `n2o init` or `n2o sync` — it operates from the prompt, not the task DB.

### Future: Claude Agent SDK

Custom runner using the Agent SDK — calls the API directly instead of shelling out to Claude Code CLI. Most efficient, but requires SDK maturity.

## Companion docs

1. **[Credential Strategy](n2o-cleanup-phase6-credentials.md)** — Connected accounts model. Users connect GitHub to N2O via the API. Anthropic API key is project-level. No local token storage, no tokens in job payloads. Covers: `integrations/git/github` data model, API endpoints, CLI auth flow, machine credential pull, token renewal.

## Greptile: use it or not?

Greptile indexes codebases and answers natural language queries about them. The question is whether it adds value on top of what Claude Code already does in the runner.

### What Greptile gives you
- Pre-indexed codebase graph (call chains, dependency relationships)
- Fast semantic search across large repos without cloning
- Can answer "which files are affected by changing X?" without running code
- Useful for **read-only analysis** at scale (reviewing many PRs, understanding unfamiliar codebases)

### What it doesn't give you
- Can't write code, run tests, or commit
- Can't execute N2O skills or task commands
- Another API key + billing + vendor dependency
- Overlaps heavily with what Claude Code does when it has the repo cloned

### Verdict: skip for now, revisit for read-heavy workflows

For the core async use case (run prompt → write code / review / commit), Claude Code with a cloned repo does everything. Greptile would only help if:
1. You're reviewing 50+ PRs/day and clone time becomes a bottleneck
2. You want cross-repo analysis ("find all callers of this API across 10 repos")
3. You want to answer questions about repos you don't want to clone at all

None of these are day-one problems. If they become real, Greptile could sit as an optional MCP server that the runner prompt can call — `"Use Greptile to find all callers of AuthService.refresh() across our org, then review each call site."` But that's additive, not foundational.

## Authentication

Auth state is checked on every `n2o` CLI invocation and surfaced as **non-blocking warnings** beneath command output. Provisioning is explicit via `n2o auth` commands — the CLI never opens a browser without the user asking.

### Status warnings (non-blocking)

The CLI displays persistent auth warnings beneath command output. These are **non-blocking** — all non-async commands work regardless of auth state. The user fixes auth when they're ready, not when the CLI forces them to.

```
$ n2o task list
  ID   TITLE                    STATUS      SPRINT
  1    Add auth middleware       in_progress auth
  2    Write login tests         available   auth
  ...

  ⚠ Anthropic: not configured — run `n2o auth anthropic` to enable async jobs
  ⚠ GitHub: token expires in 5 days — run `n2o auth github` to renew
```

When everything is healthy, no warnings are shown — clean output. Warnings only appear when action is needed:

| State | Warning |
|-------|---------|
| Anthropic API key missing | `⚠ Anthropic: not configured — run n2o auth anthropic` |
| GitHub token missing | `⚠ GitHub: not connected — run n2o auth github` |
| GitHub token expiring (<30 days) | `⚠ GitHub: token expires in N days — run n2o auth github` |
| N2O session expired | `⚠ N2O: session expired — run n2o login` |
| All healthy | *(no warnings shown)* |

The check is fast (<50ms) — reads cached integration status (5-minute TTL from API). On cache hit, no network calls.

### Auth commands

```
n2o auth anthropic  # stores Anthropic API key via N2O API (project-level)
n2o auth github     # runs `gh auth login` or renews existing token (per-user)
n2o auth status     # shows current auth state for all providers (Anthropic, GitHub, N2O)
n2o login           # N2O account login (existing, from phase 4)
```

`n2o auth status` shows the same provider info that `n2o status` (phase 4) includes. `n2o status` is the superset — it also shows sync state, pending events, etc. `n2o auth status` is the focused view for just auth.

### Blocking only on `n2o async run`

`n2o async run` is the only command that **refuses to proceed** if required tokens are missing:

```
$ n2o async run review --pr 42
✗ Cannot submit async job:
  • Anthropic API key not configured — run `n2o auth anthropic`
  • GitHub token missing — run `n2o auth github`
```

It does not auto-provision — it tells you exactly what to run. The user stays in control. No surprise browser windows. Other `n2o async` subcommands (`status`, `list`, `view`, etc.) work regardless of auth state.

### Connected accounts (see [credential strategy](n2o-cleanup-phase6-credentials.md))

Users connect their GitHub account to N2O via `n2o auth github`. The API stores the GitHub token server-side under `integrations/git/github`. **No GitHub tokens are stored locally or embedded in job payloads.**

The Anthropic API key is stored as a **project-level secret** in the N2O API (not per-user), since it's a pay-per-token key shared across the project. Set via `n2o auth anthropic` or the web app.

At job start, the Fly Machine pulls credentials from the N2O API:
- `ANTHROPIC_API_KEY` — project-level, for Claude Code headless mode
- GitHub token — per-user, for git operations and `gh` CLI
- No tokens in Redis (only user_id and project_id references)
- A compromised CLI cannot extract raw tokens (the `/token` endpoints require machine auth)

The runner uses `claude -p` in **headless mode** with `--dangerously-skip-permissions --max-turns <N> --output-format json`. This gives:
- **Auto-exit** — processes prompt and exits, no PTY needed
- **Structured output** — JSON result for delivery
- **Turn limits** — `--max-turns` works in headless mode
- **No tool allowlist** — `--dangerously-skip-permissions` auto-approves everything

> **Why not OAuth?** Anthropic blocked OAuth tokens (`CLAUDE_CODE_OAUTH_TOKEN`) for all programmatic/third-party use in February 2026. API key pricing is the only compliant path for automation. If this policy changes, the runner can switch to OAuth with minimal code changes.

### Machine secrets

The Fly Machine needs two secrets (stored as Fly Machine secrets, managed by the N2O API):
- **`N2O_API_KEY`** — project-scoped key for: pulling user credentials, syncing task events, authenticating to Redis. From `n2o apikey create` (phase 4).
- **`ANTHROPIC_API_KEY`** — project-scoped key for Claude Code API calls. From the Anthropic console.

```
# Setup (one-time, by project admin)
n2o apikey create --name "async-runner"
# → ✓ Created N2O API key: n2o_ak_...

n2o auth anthropic
# → Paste your Anthropic API key: sk-ant-...
# → ✓ Stored for project my-app
```

## N2O API endpoints (phase 6 additions)

All async operations go through the N2O app API. The CLI authenticates with its phase 4 bearer token.

```
POST   /api/projects/:id/async/jobs              — Submit a job (create robot if first run, enqueue to Redis, spin up Fly Machine)
GET    /api/projects/:id/async/jobs              — List jobs (filterable by status, date)
GET    /api/projects/:id/async/jobs/:job_id      — Get single job details
DELETE /api/projects/:id/async/jobs/:job_id      — Remove queued job / cancel running job (destroys machine)
POST   /api/projects/:id/async/jobs/:job_id/rerun — Rerun a failed job

GET    /api/projects/:id/async/jobs/:job_id/logs — WebSocket/SSE: proxy Fly log stream for this job's machine

GET    /api/projects/:id/async/status            — Aggregate: auth, queue, history (for dashboard)
```

The API holds the Fly API token and Upstash Redis credentials. The CLI never sees them.

## Result delivery

Claude handles its own output — the prompt instructs it to create PRs, post comments, or create issues as appropriate. The runner does not parse or reformat Claude's output.

| Channel | Who creates it | What |
|---------|---------------|------|
| **PR comment** | Claude (via `gh pr comment`) | Findings, review summary, or completion status |
| **Draft PR** | Claude (via `gh pr create`) | Work branch with commits + summary description |
| **GitHub issue** | Claude (via `gh issue create`) | Health scan findings, tech-debt items |
| **N2O API** | Runner (`n2o runner deliver`) | Job metadata: status, duration, token usage, PR URL (extracted from JSON output) |

`n2o runner deliver` reads the `--output-format json` result to extract metadata (duration, tokens, cost) and updates the job record in Redis + the N2O API. It does not post to GitHub — Claude already did that.

## Task DB: robots use the same workflow

The robot has its own task DB scoped per `(robot_id, project_id)`. It follows the **exact same workflow** as interactive mode — including `n2o task *` commands against its own local `workflow.db`. This means:

- The robot's `workflow.db` is populated during the BREAK DOWN phase (same as interactive)
- The robot uses `n2o task claim`, `n2o task status`, `n2o task commit`, etc.
- The submitting user's task DB is completely separate — no interference
- The queue is serial per project, so only one robot runs at a time per repo (no merge conflicts, no DB contention)

**This is important**: async and interactive follow the same code path. The only difference is that async doesn't pause for human approval.

### Runner bot users

Each `(human_user, project)` pair gets a **robot** record, created automatically by the N2O API on the first `n2o async run`.

```
Human user: luke@example.com
  └─ Robot: runner:luke:my-org--my-app
       └─ Ephemeral Fly Machines (one per job, destroyed after)
```

**Robot record** (separate `robot` table in Postgres, not the `user` table):

```sql
CREATE TABLE robot (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES "user"(id),  -- the human who owns this robot
    project_id  UUID NOT NULL REFERENCES project(id),
    name        TEXT NOT NULL,                          -- e.g. "luke/my-org--my-app"
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(owner_id, project_id)                        -- one robot per (human, project)
);
```

The `robot` table is distinct from the `user` table — robots never appear in team lists, analytics, seat counts, or `n2o sync` pulls. The `user` table stays clean (humans only).

**How it works:**
1. User runs `n2o async run` for the first time on a project
2. CLI posts job to N2O API
3. API checks: does a robot exist for `(owner_id, project_id)`?
   - No → inserts into `robot` table
   - Yes → uses the existing robot
4. The robot ID is stored in the job record (`robot_id`)
5. API spins up a fresh Fly Machine for this job. The machine's `workflow.db` is scoped to the robot — completely separate from the human's task state.

**Visible in:**
- Job event audit trails — `submitted_by: <user.id>`, `executed_by: <robot.id>`
- `n2o async view` — shows robot name
- Admin views in the web app (for debugging)

## Event additions

New events for the async system (sync to remote API):

| Event | Payload | When |
|-------|---------|------|
| `job.queued` | job_id, job_type, target, submitted_by, position | Job submitted |
| `job.started` | job_id, runner_id, started_at | Runner picks up job |
| `job.progress` | job_id, phase (fetching/running/delivering), detail | Runner reports phase change |
| `job.completed` | job_id, duration_seconds, tasks_completed, tasks_failed, pr_url | Job finishes |
| `job.failed` | job_id, error, failed_at | Job errors out |
| `job.cancelled` | job_id, cancelled_by | Running job killed |
| `job.removed` | job_id, removed_by | Queued job removed before starting |
| `job.retried` | job_id, original_job_id, changes | Failed job re-submitted |

## Interaction with existing phases

- **Phase 3 (Go CLI)**: `n2o async` is a new Cobra command group. `n2o runner execute` is the entrypoint the runner process calls.
- **Phase 4 (OAuth/API keys)**: The runner uses a project-scoped `N2O_API_KEY` for task DB events and credential pulls. Claude Code authenticates via the project's `ANTHROPIC_API_KEY`.
- **Phase 5 (task commands)**: The runner operates as its own user scope — it does not read or write the submitting user's task DB. The prompt contains everything the runner needs. If the runner creates tasks (e.g., health scan findings), they're in the runner's scope.

## Steps

1. Set up Upstash Redis instance and configure access credentials
2. Implement auth status warnings — on any `n2o` command, check cached integration status from API and display non-blocking warnings beneath output if accounts are disconnected/expiring
3. Implement `n2o auth anthropic` / `n2o auth github` / `n2o auth status` — explicit auth provisioning commands
4. Implement N2O API endpoints for async (job CRUD, Fly Machine creation/destruction, log proxy) — see API endpoints section
5. Implement `n2o async run` — confirmation UI (Lip Gloss styled box, queue position, estimated wait), `--yes` flag. Posts to API. Block with clear error if tokens are missing.
6. Implement `n2o async status` — dashboard view fetched from `GET /api/.../async/status`
7. Implement `n2o async list` — filterable job list (`--status`, `--today`, `--all`)
8. Implement `n2o async view` — detailed single-job view with timeline
9. Implement `n2o async watch` — Bubble Tea TUI, streams logs via WebSocket/SSE from API
10. Implement `n2o async logs` — static log dump of completed job
11. Implement `n2o async rm` — remove queued jobs (reject if running/completed)
12. Implement `n2o async cancel` — cancel running jobs (with confirmation) or queued jobs
13. Implement `n2o async rerun` — re-submit failed jobs with same fixed defaults
14. Build runner Docker image (Claude Code + n2o binary + gh CLI + Node + Go)
15. Implement `n2o runner execute` — linear script: pull credentials, shallow clone, run `claude -p`, deliver results, exit
16. Implement `n2o runner deliver` — POST result metadata to N2O API, update job state in Redis
18. Write preset prompt templates: `templates/async/review.md`, `sprint.md`, `health.md`
19. Implement `--file` flag — read `.md` file, inject context flags as prompt header
20. Implement preset expansion — `n2o async run review --pr 42` → load template + inject PR context
21. Add job events to event catalog + schema (including progress, removed, retried)
22. Add `.n2o/prompts/` convention for project-specific async prompt templates

## Files

### New
```
cmd/n2o/cmd/auth.go               (auth anthropic/github/status commands)
cmd/n2o/cmd/async.go              (async run/status/list/view/watch/logs/cancel/rm/rerun)
cmd/n2o/cmd/runner.go             (runner execute/deliver entrypoint)
internal/auth/warnings.go         (startup auth check, non-blocking warning display)
internal/async/jobs.go            (N2O API client — submit, list, view, cancel, rm, rerun jobs)
internal/async/job.go             (job serialization, payload types)
internal/async/deliver.go         (result delivery: POST metadata to N2O API)
internal/async/integrations.go    (N2O API client — connected accounts, credential pull for runner)
internal/async/ui.go              (Bubble Tea TUI for `watch` command)
Dockerfile.runner                 (runner image: Claude Code + n2o binary + gh CLI + Node + Go)
templates/async/review.md         (preset: PR review prompt)
templates/async/sprint.md         (preset: sprint execution prompt)
templates/async/health.md         (preset: code health prompt)
.pm/migrations/011-async-jobs.sql  (numbered after phase 5's 010; phase 1 deletes old 011+)
```

### Edit
```
specs/active/n2o-cleanup/n2o-cleanup.md          (add phase 6 to table)
specs/active/n2o-cleanup/workflow-events.md       (add job events)
```

## Verification

- `n2o task list` with missing Anthropic API key shows `⚠ Anthropic: not configured` warning beneath output — command still works
- `n2o auth anthropic` stores API key via N2O API, warning disappears on next command
- `n2o auth github` provisions GitHub token, warning disappears
- `n2o auth status` shows all provider states (connected/missing/expiring)
- Token within 30 days of expiry shows renewal warning
- No warnings shown when all tokens are healthy
- Auth check is <50ms (cached API status, 5-minute TTL)
- `n2o async run review --pr 42` shows styled confirmation box with prompt, target, machine state, then enqueues on confirm
- `n2o async run review --pr 42 -y` skips confirmation (for scripting)
- Confirmation shows queue position and estimated wait time if jobs are ahead
- `n2o async status` shows auth health, machine state, current/queued jobs, and recent history in a styled dashboard
- `n2o async list` shows jobs filterable by status, supports `--today` and `--all`
- `n2o async view <id>` shows detailed job info with timeline and result summary
- `n2o async watch <id>` opens TUI with live log stream, elapsed time, `q` to quit, `c` to cancel
- `n2o async watch <id>` on a queued job shows "waiting" state with queue position, transitions to live logs when job starts
- `n2o async logs <id>` dumps static log output for completed jobs
- `n2o async rm <id>` removes a queued job instantly. Rejects running/completed jobs with clear error.
- `n2o async cancel <id>` on a running job prompts for confirmation, then destroys the machine
- `n2o async cancel <id>` on a queued job removes it immediately (same as rm)
- `n2o async rerun <id>` re-submits a failed job with same prompt and fixed defaults
- Each job gets a fresh Fly Machine — no persistent state, no memory leaks, no dirty state
- Shallow clone (`git clone --depth 1`) completes in ~10s for typical repos
- Claude Code authenticates via `ANTHROPIC_API_KEY` — headless mode, auto-exit, stream-json output
- Claude creates branch `async/<job-id>`, commits, and opens draft PR via `gh pr create`
- Sprint execution: Claude reads sprint specs from the repo, implements tasks, pushes commits, opens draft PR
- User can keep working on their own tasks locally during async job — no interference (separate user scopes)
- First `n2o async run` for a project auto-creates robot record — no manual setup
- Robot does not appear in user table, team lists, analytics, or seat counts
- Job events show both `submitted_by` (user.id) and `executed_by` (robot.id) for audit trail
- Robot is reused across subsequent jobs for the same `(user, project)` pair
- All job events (including progress, removed, retried) synced to N2O API (Postgres)
- Jobs that exceed `--max-turns`, wall-clock timeout, or budget cap are marked `failed` with reason
- Duplicate submissions with the same idempotency key are rejected
- $0 idle cost — machines are destroyed after each job
- All UI elements use Charmbracelet Lip Gloss styling consistent with the rest of the CLI

## Open questions

- ~~Should async jobs use the submitting user's API key or a shared org key?~~ **Project-level `ANTHROPIC_API_KEY` (API pricing).** OAuth/Max subscription billing blocked by Anthropic for automation (Feb 2026).
- ~~Should the runner commit directly to the PR branch or always create a new branch?~~ **Always targets a PR.** All async work is PR-scoped.
- ~~How should the runner handle merge conflicts when multiple async sprint jobs run in parallel against the same branch?~~ **Each job gets its own PR branch.** No branch collisions.
- ~~Permissions: sandbox/allowlist for async prompts?~~ **`--dangerously-skip-permissions` in headless mode. Machine is isolated and PR-scoped.**
- ~~Setup token renewal~~ **N/A — using `ANTHROPIC_API_KEY` (doesn't expire). GitHub token expiry warnings handled via cached integration status.**
- ~~Machine idle timeout~~ **N/A — machines are ephemeral, destroyed after each job. $0 idle cost.**
- ~~Multi-user repos~~ **N/A — each job gets its own machine. No shared state.**
- **Upstash plan sizing**: What Upstash tier is needed for expected job volume? Free tier allows 10K commands/day. No polling (API pushes, machine reads once), so usage is proportional to job count, not time.
- ~~Startup auth latency~~ **Non-blocking warnings on all commands, explicit `n2o auth` commands for provisioning. Only `n2o async` blocks if tokens are missing.**
- ~~Warning placement~~ **Auth warnings appear beneath non-async commands. `n2o async status` has its own auth section in the dashboard, so no duplicate warnings needed there.**
- **Notification on completion**: Should the CLI send a terminal bell or desktop notification when a remote job finishes? Useful if the user submits a job and keeps working locally.
- ~~Token security in transit~~ **Resolved by connected accounts model. Tokens stored server-side in the N2O API. No tokens in Redis payloads — only user_id references. Machine pulls credentials from API at job start.**
- **GitHub token branch restrictions**: Fine-grained PATs support limiting which branches the token can push to. Should the runner's token be restricted to only `n2o-async/*` branches? Would prevent any accidental push to non-PR branches.
- **OAuth for automation**: Anthropic blocked OAuth tokens for all programmatic use (Feb 2026). If this policy reverses, switch from `ANTHROPIC_API_KEY` to `CLAUDE_CODE_OAUTH_TOKEN` — the runner code barely changes (swap one env var). Would eliminate API costs.
- ~~Model selection~~ **Fixed: Sonnet, medium effort, 200 max turns, $30 budget cap. No user configuration.**
- ~~Fly Logs API access~~ **N2O API proxies all Fly operations (machine lifecycle, log streaming). CLI never holds Fly credentials.**
