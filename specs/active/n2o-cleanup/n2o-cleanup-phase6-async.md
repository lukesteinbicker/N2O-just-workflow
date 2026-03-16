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

That's it. The runner clones the repo, installs Claude Code + N2O, feeds the prompt to `claude -p`, and delivers results. Everything else — PR review, sprint execution, code health — is just a preset prompt with convenience flags.

### How it works

1. User provides a prompt (inline string or `.md` file)
2. CLI serializes: `{ prompt, repo, branch/PR, ref, env vars, result_delivery }`
3. Runner picks up the job, clones repo, runs `claude -p "<prompt>"` with the repo as cwd
4. Claude Code has full access to the codebase, `n2o` CLI, `gh` CLI, git — same as local
5. Output is captured and delivered (PR comment, issue, webhook, or just stored for `n2o async result`)

### What the prompt can do

Since the runner is just Claude Code in headless mode, the prompt can do anything a local session can:
- Read/write files, run tests, commit, push
- Use `n2o task *` commands
- Use `gh pr comment`, `gh issue create`
- Invoke N2O skills (`/code-health`, `/tdd-agent`, etc.)
- Access any tool Claude Code has

The prompt is the interface. The runner is just compute.

## What changes

1. **`n2o async` command** — submit a prompt (inline or from file), list/cancel/inspect jobs.
2. **Job runner infrastructure** — picks up jobs, spawns Claude Code in headless mode, streams results to storage.
3. **Preset prompts** — built-in `.md` templates for common jobs (PR review, sprint exec, health scan). Convenience flags expand to prompts.
4. **Result delivery** — configurable: PR comment, issue, webhook, or just stored.

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

### `n2o async result`

Show the final output of a completed job.

```
n2o async result abc123
```

## Runner architecture

The runner's job is simple: clone repo → `claude -p "<prompt>"` → capture output → deliver results.

### Option A: GitHub Actions (simplest, start here)

Each job is a `repository_dispatch` event. The workflow is generic — it doesn't know about job types, it just runs the prompt.

```yaml
# .github/workflows/n2o-async.yml
on:
  repository_dispatch:
    types: [n2o-async-job]

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.client_payload.ref }}
      - name: Install Claude Code + N2O
        run: |
          npm install -g @anthropic-ai/claude-code
          ./n2o setup && ./n2o sync
      - name: Execute prompt
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          N2O_JOB_ID: ${{ github.event.client_payload.job_id }}
        run: |
          claude -p "${{ github.event.client_payload.prompt }}" \
            --output-format json > /tmp/result.json
          ./n2o runner deliver --job $N2O_JOB_ID --result /tmp/result.json
```

`n2o async` calls `gh api repos/:owner/:repo/dispatches` to trigger the workflow.
`n2o async list/logs` wraps `gh run list` / `gh run view --log`.

**Pros**: Zero infra to manage, free CI minutes on public repos, secrets managed by GitHub.
**Cons**: Cold start (~30s), CI minute limits on private repos, prompt size limited by dispatch payload (64KB — fine for most prompts, for huge .md files the runner fetches from a URL or artifact).

### Option B: Dedicated runner (future)

A long-running process (`n2o runner serve`) that polls a job queue. Better for high-volume teams. Build when GitHub Actions becomes a bottleneck.

### Option C: Claude Agent SDK (future)

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

The runner needs two keys:
- **`ANTHROPIC_API_KEY`** — for Claude Code API calls
- **`N2O_API_KEY`** — project-scoped API key from `n2o apikey create --name "CI runner"` (see phase 4)

The N2O API key is always project-scoped (inherits the project from `.pm/config.json`). Events pushed by the runner are attributed to the user who created the key. No OAuth device flow needed — the key is long-lived and headless.

For GitHub Actions, both keys are stored as repository secrets. For a dedicated runner, they go in environment variables or `~/.n2o/credentials.json`.

```
# Setup (one-time, from developer's machine)
n2o apikey create --name "async-runner"
# → ✓ Created API key for project my-app: n2o_ak_...
# → Store this key as N2O_API_KEY in your runner's secrets.
```

## Result delivery

| Channel | When | What |
|---------|------|------|
| **PR comment** | PR review completes | Findings, grades, suggestions |
| **Draft PR** | Sprint execution completes | All commits on work branch |
| **Task DB** | Always | Events: `job.queued`, `job.started`, `job.completed`, `job.failed` |
| **Webhook** | If configured | JSON payload with job result summary |
| **CLI** | On `n2o async result` | Formatted output of job results |

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

- **Phase 3 (Go CLI)**: `n2o async` is a new Cobra command group. `n2o runner execute` is the entrypoint the runner calls.
- **Phase 4 (OAuth)**: Jobs authenticate to the N2O API using the same OAuth tokens. Runner uses a service account or the submitting user's token.
- **Phase 5 (task commands)**: The runner uses `n2o task *` commands — same codepath as local execution. No special-casing needed.

## Steps

1. Implement `n2o async` — serialize prompt + context flags, trigger GitHub Actions via `gh api repos/:owner/:repo/dispatches`
2. Implement `n2o async list` — wrap `gh run list` with N2O formatting
3. Implement `n2o async logs` / `cancel` / `result` — wrap `gh run view`
4. Create `.github/workflows/n2o-async.yml` — generic runner workflow template
5. Implement `n2o runner deliver` — post results to configured delivery channels
6. Write preset prompt templates: `templates/async/review.md`, `sprint.md`, `health.md`
7. Implement `--file` flag — read `.md` file, inject context flags as prompt header
8. Implement preset expansion — `n2o async review --pr 42` → load template + inject PR context
9. Add job events to event catalog + schema
10. Add `n2o init` template for the GitHub Actions workflow file (opt-in via `n2o setup --runner`)
11. Add `.n2o/prompts/` convention for project-specific async prompt templates

## Files

### New
```
cmd/n2o/cmd/async.go              (async submit/list/logs/cancel/result)
cmd/n2o/cmd/runner.go             (runner deliver entrypoint)
internal/async/job.go             (job serialization, dispatch to GitHub Actions)
internal/async/deliver.go         (result delivery: PR comment, issue, webhook)
templates/.github/workflows/n2o-async.yml
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

- `n2o async queue review --pr 42` triggers a GitHub Actions run and returns a job ID
- `n2o async list` shows the job with correct status
- `n2o async logs <id> --follow` streams runner output in real time
- Runner clones repo, installs N2O, runs review agents, posts PR comment
- Sprint execution: runner claims tasks, runs tdd-agent, pushes commits, opens draft PR
- Failed tasks are marked blocked — runner continues to next available task
- All job events appear in task DB and sync to remote API
- `n2o async result <id>` shows formatted output after completion
- Works without N2O API login (GitHub Actions secrets handle auth independently)

## Open questions

- ~~Should async jobs use the submitting user's API key or a shared org key?~~ **Org key stored as GitHub secret.** Individual keys would leak across repos.
- Should the runner commit directly to the PR branch or always create a new branch? Direct commit is simpler but riskier for open PRs.
- How should the runner handle merge conflicts when multiple async sprint jobs run in parallel against the same branch?
- Rate limiting: should there be a max concurrent jobs per org to prevent API cost surprises?
- Should the GitHub Actions workflow be auto-installed by `n2o init`, or opt-in via `n2o setup --runner`?
- **Prompt size limits**: GitHub `repository_dispatch` payload is 64KB. For large `.md` prompt files, should the runner fetch from a gist/artifact, or is 64KB always enough?
- **Result format**: Should `claude -p` output be stored raw (JSON), or should `n2o runner deliver` parse and format it per delivery channel?
- **Permissions**: The prompt can do anything Claude Code can (write files, push, create issues). Should there be a sandbox/allowlist for async prompts, or is "you wrote the prompt, you own the consequences" sufficient?
