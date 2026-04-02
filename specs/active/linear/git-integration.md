# Git integration with Linear
> How Linear's GitHub integration replaces manual git tracking and simplifies the CLI's commit/branch workflow.

## How Linear's GitHub integration works

Linear's GitHub integration links branches, PRs, and commits to issues automatically. The link is based on the **issue identifier** (e.g. `ENG-42`) appearing in:

1. **Branch name**: `eng-42-user-authentication` (case-insensitive match)
2. **PR title**: `[ENG-42] Add user authentication`
3. **PR body or commit message**: magic words + identifier — `fixes ENG-42`, `closes ENG-42`, etc.

Magic words: `close`, `closes`, `closed`, `closing`, `fix`, `fixes`, `fixed`, `fixing`, `resolve`, `resolves`, `resolved`, `resolving`, `complete`, `completes`, `completed`, `completing`.

## Automatic state transitions (git automation states)

Linear moves issues through workflow states based on git events:

| Git event | Default state change | Notes |
|-----------|---------------------|-------|
| Branch created | → In Progress | Issue linked by branch name |
| PR opened (draft) | _(configurable)_ | Can move to a "Draft" state |
| PR opened / ready for review | → In Review | If you have an "In Review" state |
| PR approved / checks pass | _(configurable)_ | Can move to a "Ready to Merge" state |
| PR merged | → Done | Completes the issue |

These are fully configurable per team and per target branch via the `GitAutomationState` API:

```graphql
# Configure: when a PR targeting "main" is merged, move to "Done" state
mutation {
  gitAutomationStateCreate(input: {
    teamId: "..."
    branchPattern: "main"     # target branch
    event: merge              # git event type
    stateId: "state-uuid-done"
  }) { success }
}

# Events: start, draft, review, mergeable, merge
# Set stateId to null to explicitly take no action
```

Per-target-branch configuration means you can have different automations for `main` vs `develop` vs `staging`.

## What this replaces in the old system

| Old N2O feature | Linear replacement |
|-----------------|-------------------|
| `n2o commit --sprint X --task N` (build commit msg + record hash) | `n2o commit --issue ENG-42` (build commit msg). Hash tracking is automatic via GitHub integration. |
| `tasks.commit_hash` column | Linear links commits/PRs to issues automatically |
| `tasks.merged_at` column | PR merge tracked by Linear + auto state change |
| `tasks.lines_added`, `tasks.lines_removed` | Available in linked PR on Linear |
| Manual `issue status` after merging | Automatic: PR merged → Done |
| Manual `issue status` when starting work | Automatic: branch created → In Progress |

## Impact on CLI commands

### `n2o commit --issue ENG-42`

The old command read the task from SQLite and built a conventional commit message. The new command:

1. Fetches the issue from Linear (`GetIssue("ENG-42")`)
2. Builds a conventional commit message from the issue title + labels
3. Includes the issue identifier in the commit message (so Linear links it)

```
feat(frontend): Login form component

Fixes ENG-42
```

No need to record the commit hash in Linear — the GitHub integration handles it.

### `n2o issue status` — partially replaced

With git automations enabled:
- **Starting work**: create a branch with the issue ID → Linear moves to In Progress automatically
- **Opening PR**: Linear moves to In Review automatically
- **Merging**: Linear moves to Done automatically

The CLI's `issue status` command is still useful for:
- Moving to Blocked (not a git event)
- Moving back to Todo (unblocking)
- Manual overrides when git automation doesn't cover the case

### Branch naming

The CLI could offer a helper command:

```bash
# Generate and checkout a branch named for the issue
n2o branch ENG-42
# → git checkout -b luke/eng-42-login-form-component
```

The branch name format is `username/team-id-issue-title` (configurable in Linear's GitHub integration settings). The CLI can read the issue title and user's name to generate this.

## Git automation state configuration during `n2o init`

During init, after selecting the team and mapping workflow states, the CLI could optionally configure git automation states:

```
Git automations for target branch "main":
  Branch created  → In Progress  (state-uuid-in-progress)
  PR ready        → In Review    (state-uuid-in-review, if exists)
  PR merged       → Done         (state-uuid-done)

Apply these automations? [Y/n]
```

This is optional — teams may already have git automations configured in the Linear UI. The CLI should check existing automations before creating new ones.

## Additional GraphQL for git integration

```graphql
# Query existing git automation states for a team
query {
  team(id: "...") {
    gitAutomationStates {
      nodes {
        id
        branchPattern
        event       # start, draft, review, mergeable, merge
        state { id name }
      }
    }
  }
}

# Get branch name for an issue
query {
  issue(id: "...") {
    branchName    # Linear's suggested branch name
    identifier    # "ENG-42"
    title
  }
}
```

## What the CLI does NOT need to do

- **Track commit hashes** — Linear's GitHub integration handles this
- **Track merge status** — Linear knows when a PR is merged
- **Track lines added/removed** — available in the linked PR
- **Manually transition states on git events** — git automations handle this
- **Parse git history** — Linear's GitHub integration does this natively

The CLI's git-related responsibility shrinks to: build a good commit message with the issue identifier, and optionally generate branch names.
