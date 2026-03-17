# Version Control & Review Strategy for AI-Generated Changes
> The PR is the gate. All agent work — local or async — produces a pull request that a human reviews before merge.

## Why this matters

Spotify's background coding agents ("Honk") have their LLM-as-Judge layer veto ~25% of agent sessions. Stripe ships 1,300+ fully autonomous PRs/week but enforces mandatory human review on every single one. Google's automated tooling generates 60%+ of all commits but routes them through tiered review.

The pattern is universal: **every company that ships AI code at scale gates it behind a pull request reviewed by a human**. No exceptions. The PR is the unit of trust.

Without this, N2O's parallel agent sessions and async runners produce unreviewed, unattributed changes that erode trust — the exact failure mode every industry leader has built against.

## Current state

Today, tdd-agent commits directly to the working branch via `commit-task.sh`. There's no PR, no attribution of which model produced the change, no scope verification, and no standardized review gate. When async runners land (phase 6), this gets worse — remote agents pushing code nobody has reviewed.

## The model: PRs all the way down

The version control strategy is the same whether you're running tdd-agent locally or kicking off `n2o async`:

```
Agent does work → commits to a task branch → opens a PR → CI runs → human reviews → merge
```

That's it. The PR is where review happens. The commit trailers are how you know what produced the code. CI gates are what run before a human even looks at it. No new CLI commands for the user to learn — the existing workflow (`/tdd-agent`, `/pm-agent`) and async (`n2o async`) both funnel into the same PR-based review.

### How this maps to local vs async

| | Local (tdd-agent on your machine) | Async (n2o async on remote compute) |
|---|---|---|
| **Branch** | `task/{sprint}/{num}` off current branch | `task/{sprint}/{num}` off target branch |
| **Commits** | Agent commits locally with trailers | Agent commits remotely with trailers |
| **PR** | Opened when task reaches GREEN | Opened as draft PR by the runner |
| **CI** | Runs on push | Runs on push (same) |
| **Review** | You review before merging | You review before merging (same) |

The only difference is where the compute happens. The review surface is identical.

## What changes

### 1. Branch strategy

```
main (protected)
 └── task/{sprint}/{num}    (one branch per task, created at COMMIT phase)
```

- tdd-agent's COMMIT phase creates a task branch and opens a PR instead of committing to the current branch
- Async runners do the same — they always work on a task branch
- No agent pushes directly to main, ever
- Optionally, teams can use a `sprint/{name}` integration branch and merge task PRs into that first — but it's not required

### 2. Commit attribution

Every agent commit includes trailers so you can trace what produced it:

```
feat(auth): implement token refresh

Done-When: refresh token rotates on expiry and updates stored credential
Task: auth/42
Assisted-by: claude-opus-4-6 [tdd-agent]
```

| Trailer | Purpose |
|---------|---------|
| `Task` | Links commit to the sprint task |
| `Assisted-by` | Model and skills that produced the code (Linux kernel convention) |
| `Done-When` | The acceptance criteria this commit satisfies |

That's the full list. Simple enough that `commit-task.sh` (and later the Go equivalent) can generate it automatically from the task DB.

### 3. PR template

Every agent-opened PR uses a consistent template so the reviewer knows exactly what to look at:

```markdown
## What
<!-- 1-2 sentences from task description -->

## Task
<!-- sprint/task_num, link to spec if exists -->

## How to verify
<!-- done_when criteria from the task, plus test results -->

## Review focus
<!-- 1-2 areas where human attention matters most -->
```

This is a GitHub PR template, not a new command. It gets scaffolded into projects by `n2o init`.

### 4. CI as the quality gate

The existing CI pipeline is the gate — not new N2O commands. What matters is that the pipeline runs these checks before a human reviews:

1. **Lint + typecheck** — deterministic, fast
2. **Tests** — the TDD suite the agent just wrote
3. **Scope check** (optional, for teams that want it) — an LLM-as-Judge step in CI that compares the diff against the task's `done_when`. Catches the #1 failure mode Spotify identified: agent exceeding prompt scope.

The scope check is a CI step, not a CLI command. Teams add it to their pipeline if they want it. It's a single script that reads the task from the DB and compares against the diff.

**CI iteration cap**: If CI fails twice on an agent PR, the PR is marked as needing human intervention (label or comment). The agent doesn't keep retrying — Stripe found "diminishing marginal returns if an LLM runs indefinitely."

### 5. Refactoring budget

GitClear data shows refactoring dropped from 25% to <10% of changed lines with AI adoption. To counteract:

- pm-agent's SPRINT_PLANNING phase must include at least one `type=refactor` task per sprint
- tdd-agent's REFACTOR phase (phase 4) remains mandatory — audit checks it wasn't skipped

This is a policy change in the existing agents, not a new tool.

## How async fits in

Phase 6's `n2o async` already does the right thing — the runner works on a PR branch and posts results as PR comments. The version control strategy just codifies what async already assumes:

1. Runner clones repo, creates `task/{sprint}/{num}` branch
2. Runs the prompt (tdd-agent, review, health scan, whatever)
3. Commits with trailers, pushes, opens draft PR
4. Human reviews the PR at their convenience

The async runner doesn't need special review commands. It produces PRs. You review PRs. Same as local.

## Industry research — why this works

### Spotify (650+ agent PRs/month merged)
- **LLM-as-Judge vetoes ~25% of sessions** — most common trigger: agent exceeding prompt scope (unrelated refactoring, disabled tests, bonus features)
- **Three failure modes by severity**: (1) agent fails to produce PR — acceptable; (2) PR fails CI — frustrating; (3) PR passes CI but is functionally wrong — trust-destroying
- Agent self-corrects ~50% of the time after a veto
- Agent access is deliberately limited: view code, edit files, run verifiers only

### Stripe (1,300+ autonomous PRs/week, "The walls matter more than the model")
- **Six-layer architecture**: deterministic orchestrator → scoped tool selection → isolated VM → pre-push lint → CI gating (max 2 runs) → mandatory human review
- **Every PR gets human review**. No exceptions.
- **2 CI attempt cap**, then escalate. "Diminishing marginal returns if an LLM runs indefinitely."
- Years of investment in CI gates and structured tooling — not just better models

### Google (60%+ of commits from automated tools)
- **Tiered review**: low-risk automated changes → designated "global approvers"; higher-risk → domain experts
- **Rosie** shards large-scale changes into atomically submittable pieces based on ownership boundaries
- **TAP** runs 1,000 random tests per change, then the full affected suite

### Microsoft (600K+ PRs/month with AI review)
- Author retains full control — must explicitly approve all AI suggestions
- All changes attributed in commit history
- Teams define repository-specific review prompts

### Linux kernel (most mature attribution model)
- `Assisted-by: AGENT_NAME:MODEL_VERSION [TOOL1] [TOOL2]`
- AI agents MUST NOT add `Signed-off-by` — only humans certify
- Human submitter bears full responsibility

### Key numbers

| Finding | Source |
|---------|--------|
| AI PRs have 1.7x more issues than human PRs (10.83 vs 6.45) | CodeRabbit, 470 PRs |
| 45% of AI code fails security tests — flat across model sizes | Veracode, 100+ LLMs |
| Refactoring dropped from 25% to <10% of changed lines | GitClear, 211M lines |
| Copy-pasted code at 4x baseline (8.3% → 12.3%) | GitClear |
| 25% more AI adoption → 7.2% decrease in delivery stability | DORA 2024-2025 |
| Year 2+ of unmanaged AI code: 4x maintenance cost | CISQ/Forrester |

## Steps

1. Update tdd-agent COMMIT phase: create task branch, commit with trailers, open PR
2. Add PR template to `templates/.github/PULL_REQUEST_TEMPLATE.md`
3. Update `commit-task.sh` to include `Task`, `Assisted-by`, and `Done-When` trailers
4. Add optional CI scope-check script to `templates/` (reads task from DB, compares against diff)
5. Add refactoring task enforcement to pm-agent SPRINT_PLANNING
6. Document branch naming convention in workflow-reference.md

## Files

### New
```
templates/.github/PULL_REQUEST_TEMPLATE.md       (PR template for agent PRs)
templates/ci/scope-check.sh                      (optional CI step: diff vs done_when)
```

### Edit
```
02-agents/tdd-agent/SKILL.md                     (COMMIT phase: branch + PR + trailers)
02-agents/pm-agent/SKILL.md                      (SPRINT_PLANNING: refactor task requirement)
specs/active/n2o-cleanup/workflow-reference.md    (add version control section)
```

## Verification

- tdd-agent COMMIT phase creates `task/{sprint}/{num}` branch and opens a PR
- Commits include `Task`, `Assisted-by`, and `Done-When` trailers
- PR body matches template
- Async runner produces identical PR structure to local tdd-agent
- CI scope check (when enabled) catches an agent that modifies files outside its task
- Every generated sprint contains at least one refactor task

## Open questions

- Should scope check be opt-in or default? It adds an LLM call to CI, which costs money and adds latency. Probably opt-in initially.
- ~~What attribution format?~~ **Linux kernel's `Assisted-by` trailer.** Most mature, explicit about model + tools.
- For teams that want auto-merge on low-risk PRs (test-only, docs, <50 lines): is a GitHub Actions rule with path/size filters sufficient, or does this need framework support?

## Sources

| Source | Key insight |
|--------|------------|
| [Spotify Background Coding Agent (Parts 1-3)](https://engineering.atspotify.com/2025/11/spotifys-background-coding-agent-part-1) | LLM-as-Judge vetoes 25%; scope creep is #1 failure mode |
| [Stripe Minions (Part 2)](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2) | "The walls matter more than the model"; 2 CI cap; mandatory human review |
| [Google SWE Book (Ch. 19, 22)](https://abseil.io/resources/swe-book/html/ch22.html) | Tiered review; Rosie sharding; TAP random sampling |
| [Microsoft AI Code Reviews](https://devblogs.microsoft.com/engineering-at-microsoft/enhancing-code-quality-at-scale-with-ai-powered-code-reviews/) | Author retains control; repo-specific prompts; 600K PRs/month |
| [Linux Kernel Coding Assistants](https://docs.kernel.org/process/coding-assistants.html) | `Assisted-by` attribution; human responsibility |
| [CodeRabbit AI vs Human Report](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) | 1.7x more issues; 2.74x more security issues |
| [Veracode GenAI Security](https://www.veracode.com/blog/genai-code-security-report/) | 45% security failure, flat across models |
| [GitClear 2025](https://www.gitclear.com/ai_assistant_code_quality_2025_research) | Refactoring cratered; copy-paste 4x baseline |
| [DORA 2024-2025](https://www.infoq.com/news/2025/11/ai-code-technical-debt/) | More AI → less stable delivery |
| [Addy Osmani: Code Review + AI](https://addyo.substack.com/p/code-review-in-the-age-of-ai) | PR Contract framework |
| [OCaml 13K-line PR Rejection](https://devclass.com/2025/11/27/ocaml-maintainers-reject-massive-ai-generated-pull-request/) | Reviewability limits are real |
