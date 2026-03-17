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
n2o async "Review PR #42 for security issues and post findings as a comment"
n2o async --file review-checklist.md --pr 42
n2o async --file overnight-sprint.md
```

That's it. The runner has the repo cloned, feeds the prompt to `claude -p`, and delivers results. Everything else — PR review, sprint execution, code health — is just a preset prompt with convenience flags.

### How it works

1. User provides a prompt (inline string or `.md` file)
2. CLI serializes: `{ prompt, repo, branch/PR, ref, setup_token, github_token, env vars }` and enqueues the job to Upstash Redis (auth tokens were already provisioned at CLI startup — see Authentication)
4. A Fly Machine keyed to `(repo, user)` picks up the job. If the machine is stopped, it auto-starts (sub-second). If it doesn't exist yet, it's created.
5. The machine already has the repo cloned on its Volume (or clones it on first job, then caches). Subsequent jobs do `git fetch`.
6. `claude -p` runs with the user's setup token (`CLAUDE_CODE_OAUTH_TOKEN`) — usage bills against the user's Max subscription, not API pricing.
7. All work happens on a PR branch — the runner always creates or targets a pull request, never pushes directly to main.
8. Output is captured and delivered as a PR comment.

### What the prompt can do

Since the runner is just Claude Code in headless mode, the prompt can do anything a local session can:
- Read/write files, run tests, commit, push to PR branches
- Use `n2o task *` commands
- Use `gh pr comment`, `gh issue create`
- Invoke N2O skills (`/code-health`, `/tdd-agent`, etc.)
- Access any tool Claude Code has

The prompt is the interface. The runner is just compute.

### Guardrails

- **PR-scoped**: All async work targets a pull request. The runner never pushes directly to protected branches.
- **Time limit**: Jobs have a default wall-clock timeout of 30 minutes, configurable via `--timeout`. Maximum 2 hours.
- **Turn limit**: `claude -p` is invoked with `--max-turns` (default 200, configurable via `--max-turns`). Prevents infinite loops.
- **Permissions**: Runner uses `--dangerously-skip-permissions` since each Fly Machine is an isolated, ephemeral environment. PR-scoping + restricted GitHub token are the actual safety layer.
- **Cost attribution**: Job events record the submitting user and prompt. Usage bills against the submitting user's Max subscription.

## What changes

1. **`n2o async` command** — submit a prompt (inline or from file), list/cancel/inspect jobs. Blocks with clear error if auth tokens are missing (see Authentication).
2. **Job queue (Upstash Redis)** — jobs are enqueued to Upstash Redis. Provides delivery guarantees, retry, deduplication, and job state tracking. The Go CLI uses the Upstash REST API (no native Redis driver needed).
3. **Per-repo/user Fly Machines** — each `(repo, user)` pair gets a dedicated Fly Machine with a persistent Volume. The machine caches the git clone and the user's Claude credentials. Multiple jobs for the same repo/user land on the same machine and can run concurrently. Machines auto-stop when idle.
4. **Preset prompts** — built-in `.md` templates for common jobs (PR review, sprint exec, health scan). Convenience flags expand to prompts.
5. **Result delivery** — PR comment (primary), with job events synced to the task DB.

## Prompt interface

### Inline prompt

```
n2o async "Scan for TODO comments older than 30 days and open an issue summarizing them"
```

### From file

```
n2o async --file .n2o/prompts/nightly-review.md
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
n2o async --file review.md --pr 42          # adds: "Focus on PR #42 (branch: feature/x, diff: ...)"
n2o async --file review.md --branch main    # adds: "Working on branch: main"
n2o async --file sprint.md --ref abc123     # checks out specific commit
```

The flags don't change the prompt — they set up the workspace (which branch to clone, which PR to checkout) and append context to the prompt header.

## Presets

Presets are built-in `.md` prompt templates shipped with N2O. They're convenience shortcuts — the user could write the same prompt themselves.

### `n2o async review` (preset)

```
n2o async review --pr 42
n2o async review --merged --since yesterday
```

Expands to the built-in `templates/async/review.md` prompt with PR context injected. The template invokes code-health + pattern review and posts findings as a PR comment.

### `n2o async sprint` (preset)

```
n2o async sprint --sprint auth --tasks 1-10
n2o async sprint --sprint auth --all-available
```

Expands to `templates/async/sprint.md`. The template runs tdd-agent in a loop, claiming and executing tasks, committing to a work branch, and opening a draft PR.

### `n2o async health` (preset)

```
n2o async health
```

Expands to `templates/async/health.md`. Runs full code-health scan, creates tech-debt tasks.

## CLI commands

### `n2o async` (submit)

The command itself submits a job. Returns a job ID.

```
n2o async "Refactor the auth module to use dependency injection"
# → ✓ Queued job abc123 (custom prompt, 47 chars)

n2o async --file .n2o/prompts/nightly-review.md --pr 42
# → ✓ Queued job def456 (from: nightly-review.md, PR #42)

n2o async review --pr 42
# → ✓ Queued job ghi789 (preset: review, PR #42)

n2o async sprint --sprint auth --all-available
# → ✓ Queued job jkl012 (preset: sprint, auth, 8 tasks)
```

### `n2o async --status`

Quick overview of async infrastructure health and recent jobs:

```
n2o async --status
# Auth:     ✓ Claude connected (expires 2027-03-17)
#           ✓ GitHub connected (expires 2026-12-01)
# Machine:  ✓ Running (performance-2x, 4GB, repo: my-app)
# Queue:    2 queued, 1 running, 14 completed today
#
# Recent:
# ID       PROMPT                        STATUS    STARTED         DURATION
# abc123   "Refactor the auth module..."  running   5m ago          —
# def456   nightly-review.md (PR #42)    queued    —               —
# ghi789   preset:review (PR #38)        done      2h ago          4m12s
```

### `n2o async list`

```
n2o async list
# ID       PROMPT                        STATUS    STARTED         DURATION
# abc123   "Refactor the auth module..."  running   5m ago          —
# def456   nightly-review.md (PR #42)    queued    —               —
# ghi789   preset:review (PR #38)        done      2h ago          4m12s
```

### `n2o async logs`

Stream or tail logs from a running/completed job.

```
n2o async logs abc123
n2o async logs abc123 --follow
```

### `n2o async cancel`

```
n2o async cancel abc123
```

## Runner architecture

### Queue: Upstash Redis

Jobs are enqueued to Upstash Redis via its REST API (no native Redis driver — works from the Go CLI and from Fly Machines without connection pooling concerns).

Job lifecycle: `queued` → `started` → `completed` | `failed` | `cancelled`

The queue provides:
- **Delivery guarantees** — jobs aren't lost if the runner crashes; unacknowledged jobs are re-queued after a visibility timeout
- **Deduplication** — optional idempotency key prevents duplicate jobs (e.g., same prompt + same PR = one job)
- **Job state** — status, logs URL, and result are stored in Redis hashes, keyed by job ID

### Compute: Per-repo/user Fly Machines

Each `(repo, user)` pair gets a **dedicated, persistent Fly Machine** with an attached Volume. The machine is not ephemeral per-job — it stays alive across jobs, caching the git clone and credentials.

```
User A, repo X  →  Fly Machine A  (Volume: repo X clone + user A credentials)
User A, repo Y  →  Fly Machine B  (Volume: repo Y clone + user A credentials)
User B, repo X  →  Fly Machine C  (Volume: repo X clone + user B credentials)
```

**Why per-repo/user:**
- **Credentials isolation** — each user's Claude setup token stays on their own machine. No credential sharing or token races between users.
- **Git clone caching** — the Volume persists the repo clone. After the first job, subsequent jobs do `git fetch` (~seconds) instead of full clone (~minutes).
- **Concurrent jobs** — multiple jobs for the same repo/user run on the same machine. Multiple `claude -p` processes sharing the same credentials file on one machine is reliable (fixed in Claude Code v2.1.76+).
- **No cross-machine token race** — the user's laptop and their Fly Machine use separate session credentials (laptop uses OAuth login, Fly Machine uses setup token).

**Machine lifecycle:**
1. First `n2o async` for a repo/user → machine is created via Fly Machines API, Volume attached
2. Machine boots, clones repo to Volume, writes Claude credentials
3. Job runs. Additional jobs for the same repo/user land on the same machine.
4. Queue drains → machine idles → auto-stops after configurable timeout (default 10 minutes)
5. Next job arrives → machine restarts (sub-second), Volume still has the cached clone + credentials
6. Machine is only destroyed if explicitly removed via `n2o async cleanup`

**Machine spec:**

| Resource | Spec | Cost |
|---|---|---|
| CPU/RAM | `performance-2x` (2 dedicated CPUs, 4GB RAM) | ~$0.09/hr while running |
| Volume | 10GB (git clone + working dirs + cache) | $1.50/mo |
| Idle (stopped) | Volume storage only | $1.50/mo |

Scale up to `performance-4x` (8GB) if jobs run heavy builds/tests concurrently.

**Job execution on the machine:**

1. Runner process polls Upstash Redis for jobs matching its `(repo, user)` key
2. On new job: `git fetch && git checkout <ref>` (fast — clone already on Volume)
3. Write prompt to temp file (avoids shell injection)
4. Set `CLAUDE_CODE_OAUTH_TOKEN` from stored credentials + ensure `~/.claude.json` has `{"hasCompletedOnboarding": true}`
5. Run `claude -p "$(cat /tmp/prompt.md)" --max-turns <N> --dangerously-skip-permissions --output-format json > /tmp/result.json`
6. Run `n2o runner deliver --job $JOB_ID --result /tmp/result.json`
7. Clean up working directory, keep the bare clone cache

The prompt is **never interpolated into a shell command** — it's always read from a file.

**Timeouts**: Each job has a wall-clock limit (default 30m, max 2h). If `claude -p` exceeds `--max-turns`, it exits gracefully. If the job hits the wall-clock limit, the process is killed and the job is marked `failed` with a timeout reason. The machine itself is not killed — it picks up the next job.

**Disk management**: Each job works in an isolated directory (`/work/jobs/<job-id>/`). On completion, the working dir is cleaned up. The git clone cache (bare repo on Volume) persists. If Volume usage exceeds 80%, oldest job artifacts are evicted.

### Future: Claude Agent SDK

Custom runner using the Agent SDK — calls the API directly instead of shelling out to Claude Code CLI. Most efficient, but requires SDK maturity.

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

  ⚠ Claude: not connected — run `n2o auth claude` to enable async jobs
  ⚠ GitHub: token expires in 5 days — run `n2o auth github` to renew
```

When everything is healthy, no warnings are shown — clean output. Warnings only appear when action is needed:

| State | Warning |
|-------|---------|
| Claude setup token missing | `⚠ Claude: not connected — run n2o auth claude` |
| Claude token expiring (<30 days) | `⚠ Claude: token expires in N days — run n2o auth claude` |
| GitHub token missing | `⚠ GitHub: not connected — run n2o auth github` |
| GitHub token expiring (<30 days) | `⚠ GitHub: token expires in N days — run n2o auth github` |
| N2O session expired | `⚠ N2O: session expired — run n2o login` |
| All healthy | *(no warnings shown)* |

The check is fast (<50ms) — reads local token files and compares expiry dates. No network calls.

### Auth commands

```
n2o auth claude     # runs `claude setup-token`, stores encrypted token
n2o auth github     # runs `gh auth login` or renews existing token
n2o auth status     # shows current auth state for all providers (Claude, GitHub, N2O)
n2o login           # N2O account login (existing, from phase 4)
```

`n2o auth status` shows the same provider info that `n2o status` (phase 4) includes. `n2o status` is the superset — it also shows sync state, pending events, etc. `n2o auth status` is the focused view for just auth.

### Blocking only on `n2o async`

`n2o async` is the only command that **refuses to proceed** if required tokens are missing:

```
$ n2o async review --pr 42
✗ Cannot submit async job:
  • Claude setup token missing — run `n2o auth claude`
  • GitHub token missing — run `n2o auth github`
```

It does not auto-provision — it tells you exactly what to run. The user stays in control. No surprise browser windows.

### Token storage

Tokens are stored locally at `~/.config/n2o/credentials/<repo-slug>/`:

```
~/.config/n2o/credentials/
  my-org--my-repo/
    claude-token.enc       # Claude setup token (encrypted)
    github-token.enc       # GitHub fine-grained PAT (encrypted)
```

Encrypted with a key derived from the user's N2O credentials. Included in job payloads so the Fly Machine can use them.

### Claude Code: setup token (Max subscription)

`claude -p` in headless mode requires explicit credentials. `claude setup-token` generates a long-lived OAuth token (valid ~1 year, prefix `sk-ant-oat01-`) tied to the user's Max subscription. **Async jobs bill against the user's existing subscription — no separate API pricing.**

The Fly Machine sets the token as `CLAUDE_CODE_OAUTH_TOKEN` + writes `{"hasCompletedOnboarding": true}` to `~/.claude.json` before running `claude -p`.

### GitHub: fine-grained token

The runner needs a GitHub token for `gh` CLI and git push. On provisioning, the CLI creates (or reuses) a fine-grained personal access token scoped to the target repo with permissions: `contents: write`, `pull-requests: write`, `issues: write`. No access to protected branches.

If the user already has `gh` authenticated, the CLI can extract a token via `gh auth token`. Otherwise, it triggers `gh auth login` with the required scopes.

### N2O API: project-scoped key

The Fly Machine also needs an `N2O_API_KEY` for syncing events to the task DB. This is a long-lived, headless key from `n2o apikey create` (see phase 4). It's stored as a Fly Machine secret, shared across all machines for the project — not per-user.

```
# Setup (one-time, by project admin)
n2o apikey create --name "async-runner"
# → ✓ Created API key for project my-app: n2o_ak_...
```

## Result delivery

| Channel | When | What |
|---------|------|------|
| **PR comment** | Always | Findings, summary, or completion status posted to the target PR |
| **Draft PR** | Sprint execution | All commits on a work branch, opened as draft PR |
| **Task DB** | Always | Events: `job.queued`, `job.started`, `job.completed`, `job.failed` |
| **Webhook** | If configured | JSON payload with job result summary |

## Event additions

New events for the async system (sync to remote API):

| Event | Payload | When |
|-------|---------|------|
| `job.queued` | job_id, job_type, target, submitted_by | Job submitted |
| `job.started` | job_id, runner_id, started_at | Runner picks up job |
| `job.completed` | job_id, duration_seconds, tasks_completed, tasks_failed | Job finishes |
| `job.failed` | job_id, error, failed_at | Job errors out |
| `job.cancelled` | job_id, cancelled_by | Job cancelled |

## Interaction with existing phases

- **Phase 3 (Go CLI)**: `n2o async` is a new Cobra command group. `n2o runner execute` is the entrypoint the runner process calls.
- **Phase 4 (OAuth/API keys)**: The runner uses a project-scoped `N2O_API_KEY` for task DB events. Claude Code authenticates via the submitting user's setup token (Max subscription).
- **Phase 5 (task commands)**: The runner uses `n2o task *` commands — same codepath as local execution. No special-casing needed.

## Steps

1. Set up Upstash Redis instance and configure access credentials
2. Implement auth status warnings — on any `n2o` command, check local token files and display non-blocking warnings beneath output if tokens are missing/expiring
3. Implement `n2o auth claude` / `n2o auth github` / `n2o auth status` — explicit auth provisioning commands
4. Implement `n2o async` — serialize prompt + context flags + auth tokens, enqueue job to Upstash Redis via REST API. Block with clear error if tokens are missing.
5. Implement `n2o async list` — query job state from Upstash Redis
6. Implement `n2o async logs` / `cancel` — query/update job state in Redis
7. Build runner Docker image (Claude Code + N2O + gh CLI pre-installed)
8. Implement Fly Machine lifecycle management — create/start/stop machines keyed by `(repo, user)`, attach Volumes
9. Implement `n2o runner execute` — poll queue, set up credentials, fetch repo, write prompt to file, run `claude -p`, deliver results
10. Implement `n2o runner deliver` — post results as PR comment, update job state
11. Implement disk management — git clone caching, job working dir cleanup, Volume usage monitoring
12. Write preset prompt templates: `templates/async/review.md`, `sprint.md`, `health.md`
13. Implement `--file` flag — read `.md` file, inject context flags as prompt header
14. Implement preset expansion — `n2o async review --pr 42` → load template + inject PR context
15. Add job events to event catalog + schema
16. Add `.n2o/prompts/` convention for project-specific async prompt templates

## Files

### New
```
cmd/n2o/cmd/auth.go               (auth claude/github/status commands)
cmd/n2o/cmd/async.go              (async submit/list/logs/cancel)
cmd/n2o/cmd/runner.go             (runner execute/deliver entrypoint)
internal/auth/warnings.go         (startup auth check, non-blocking warning display)
internal/async/queue.go           (Upstash Redis client — enqueue, dequeue, status)
internal/async/job.go             (job serialization, payload types)
internal/async/deliver.go         (result delivery: PR comment, webhook)
internal/async/machines.go        (Fly Machines API — create/start/stop, keyed by repo+user)
internal/async/credentials.go     (setup token provisioning, encryption, storage)
Dockerfile.runner                 (runner image: Claude Code + N2O + gh CLI)
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

- `n2o task list` with missing Claude token shows `⚠ Claude: not connected` warning beneath output — command still works
- `n2o auth claude` runs `claude setup-token`, stores encrypted token, warning disappears on next command
- `n2o auth github` provisions GitHub token, warning disappears
- `n2o auth status` shows all provider states (connected/missing/expiring)
- Token within 30 days of expiry shows renewal warning
- No warnings shown when all tokens are healthy
- Auth check is <50ms (local file reads only)
- `n2o async --status` shows auth health, machine state, queue summary, and recent jobs
- `n2o async review --pr 42` enqueues a job and returns a job ID
- Fly Machine for `(repo, user)` is created on first job, reused on subsequent jobs
- Stopped machine restarts in <1s when new job arrives
- `n2o async list` shows the job with correct status (queued → started → completed)
- `n2o async logs <id> --follow` streams runner output in real time
- Runner uses cached git clone (`git fetch` instead of full clone on subsequent jobs)
- Claude Code authenticates via setup token — usage appears on user's Max subscription, not API billing
- Sprint execution: runner claims tasks, runs tdd-agent, pushes commits, opens draft PR
- Failed tasks are marked blocked — runner continues to next available task
- All job events appear in task DB and sync to remote API
- Jobs that exceed `--max-turns` or wall-clock timeout are marked `failed` with reason
- Duplicate submissions with the same idempotency key are rejected
- Volume disk usage stays under control — old job artifacts evicted when >80% full

## Open questions

- ~~Should async jobs use the submitting user's API key or a shared org key?~~ **User's own Max subscription via setup token.** No API pricing.
- ~~Should the runner commit directly to the PR branch or always create a new branch?~~ **Always targets a PR.** All async work is PR-scoped.
- ~~How should the runner handle merge conflicts when multiple async sprint jobs run in parallel against the same branch?~~ **Each job gets its own PR branch.** No branch collisions.
- ~~Permissions: sandbox/allowlist for async prompts?~~ **PR-scoped + time/turn limits + `--dangerously-skip-permissions` in isolated VM.**
- ~~Setup token renewal~~ **Proactive renewal at CLI startup when within 30 days of expiry.**
- **Machine idle timeout**: How long should a Fly Machine stay alive after the queue drains? Longer = faster next job (no restart), shorter = lower cost. Default 10 minutes?
- **Multi-user repos**: If User A and User B both submit jobs for the same repo, they get separate machines. Is this wasteful for the git clone, or is credential isolation worth the duplication?
- **Upstash plan sizing**: What Upstash tier is needed for expected job volume? Free tier allows 10K commands/day — sufficient for early use?
- ~~Startup auth latency~~ **Non-blocking warnings on all commands, explicit `n2o auth` commands for provisioning. Only `n2o async` blocks if tokens are missing.**
- **Warning placement**: Warnings appear beneath command output. Should they also appear in `n2o async list` output, or only on commands that don't already show async-related info?
