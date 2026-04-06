# Git integration with Linear
> How Linear's GitHub integration replaces manual git tracking, and the git workflow commands the CLI provides.

## How Linear's GitHub integration works

Linear's GitHub integration links branches, PRs, and commits to issues automatically. The link is based on the **issue identifier** (e.g. `ENG-42`) appearing in:

1. **Branch name**: `eng-42-user-authentication` (case-insensitive match)
2. **PR title**: `[ENG-42] Add user authentication`
3. **PR body or commit message**: magic words + identifier — `fixes ENG-42`, `closes ENG-42`, etc.

Magic words: `close`, `closes`, `closed`, `closing`, `fix`, `fixes`, `fixed`, `fixing`, `resolve`, `resolves`, `resolved`, `resolving`, `complete`, `completes`, `completed`, `completing`.

Linear doesn't care about merge strategy — rebase, squash merge, and regular merge all work. The branch name and PR merge event are what trigger state transitions.

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
mutation {
  gitAutomationStateCreate(input: {
    teamId: "..."
    branchPattern: "main"
    event: merge              # start, draft, review, mergeable, merge
    stateId: "state-uuid-done"
  }) { success }
}
```

## Git workflow commands

The CLI provides four git commands that tie into Linear's integration. Together with `n2o commit`, they cover the full lifecycle: start work → develop → submit → merge.

### `n2o branch <identifier>` — start work

Creates and checks out a branch named for a Linear issue. The branch name contains the issue identifier, which triggers Linear's git automation (→ In Progress).

```bash
n2o branch ENG-42
# → git checkout -b luke/eng-42-login-form-component
```

**Implementation:**
```go
lc := requireLinear()
issue, err := lc.GetIssue("ENG-42")

branchName := issue.BranchName  // Linear's suggested name
if branchName == "" {
    me, _ := lc.GetMe()
    branchName = fmt.Sprintf("%s/%s-%s",
        slugify(me.Name),
        strings.ToLower(issue.Identifier),
        slugify(issue.Title))
}

exec.Command("git", "checkout", "-b", branchName).Run()
```

### `n2o pr [--draft]` — submit for review

Creates a GitHub PR pre-filled from the current Linear issue. Detects the issue from the current branch name (parses the identifier). Includes `Fixes ENG-42` in the body to trigger Linear's auto-close on merge.

```bash
n2o pr
# → gh pr create --title "[ENG-42] Login form component" --body "..."

n2o pr --draft
# → gh pr create --draft --title "[ENG-42] Login form component" --body "..."
```

**Implementation:**
```go
// 1. Detect issue from current branch name
branch := getCurrentBranch()  // e.g. "luke/eng-42-login-form-component"
identifier := extractIdentifier(branch)  // "ENG-42"

// 2. Fetch issue from Linear
lc := requireLinear()
issue, err := lc.GetIssue(identifier)

// 3. Build PR title and body
title := fmt.Sprintf("[%s] %s", issue.Identifier, issue.Title)
body := fmt.Sprintf("## %s\n\n%s\n\nFixes %s",
    issue.Title,
    issue.Description,  // or a summary
    issue.Identifier)

// 4. Create PR via gh CLI
args := []string{"pr", "create", "--title", title, "--body", body}
if draftFlag {
    args = append(args, "--draft")
}
exec.Command("gh", args...).Run()
```

**Requires:** `gh` CLI installed and authenticated. The command checks for this and provides a clear error if missing.

**What this triggers in Linear:**
- PR opened → In Review (via git automation)
- `Fixes ENG-42` in body → auto-close on merge (→ Done)

### `n2o rebase` — keep branch current

Fetches the latest default branch and rebases the current branch onto it. The most common rebase operation and the one most likely to go wrong (forgetting to fetch first).

```bash
n2o rebase
# → git fetch origin && git rebase origin/main
```

**Implementation:**
```go
// 1. Detect default branch (main, master, develop, etc.)
defaultBranch := detectDefaultBranch()  // checks remote HEAD or common names

// 2. Fetch + rebase
exec.Command("git", "fetch", "origin").Run()
result := exec.Command("git", "rebase", "origin/" + defaultBranch).CombinedOutput()

if err != nil {
    // Clear error message with instructions
    fmt.Println("Rebase failed — resolve conflicts, then run:")
    fmt.Println("  git rebase --continue")
    fmt.Println("Or abort with:")
    fmt.Println("  git rebase --abort")
    return
}

fmt.Printf("Rebased onto origin/%s\n", defaultBranch)
```

**What this does NOT do:**
- Interactive rebase (`-i`) — inherently interactive, use git directly
- Force push — the user decides when to push
- Auto-resolve conflicts — too contextual

### `n2o worktree <identifier> | list | rm <identifier>` — parallel work

Creates a git worktree tied to a Linear issue. Each worktree is a separate working directory with its own branch, sharing git history with the main repo. This enables working on multiple issues simultaneously without stashing or committing WIP.

Especially useful for running parallel AI coding agents (Claude Code, Codex), where each agent gets its own worktree.

#### `n2o worktree ENG-42` — create

Creates a worktree in a sibling directory, checks out the issue's branch (creating it if needed).

```bash
n2o worktree ENG-42
# → Created worktree at ../eng-42-login-form/
# → Branch: luke/eng-42-login-form-component
# → Remember to install dependencies: cd ../eng-42-login-form && npm install
```

**Implementation:**
```go
lc := requireLinear()
issue, err := lc.GetIssue("ENG-42")

branchName := issue.BranchName
if branchName == "" {
    me, _ := lc.GetMe()
    branchName = fmt.Sprintf("%s/%s-%s",
        slugify(me.Name),
        strings.ToLower(issue.Identifier),
        slugify(issue.Title))
}

// Worktree directory: sibling to current repo
repoRoot := getRepoRoot()
worktreeDir := filepath.Join(filepath.Dir(repoRoot),
    fmt.Sprintf("%s-%s", strings.ToLower(issue.Identifier), slugify(issue.Title)))

// Check if branch exists on remote
branchExists := exec.Command("git", "rev-parse", "--verify", branchName).Run() == nil

if branchExists {
    exec.Command("git", "worktree", "add", worktreeDir, branchName).Run()
} else {
    exec.Command("git", "worktree", "add", "-b", branchName, worktreeDir).Run()
}

ui.PrintSuccess(fmt.Sprintf("Created worktree at %s", worktreeDir))
ui.PrintInfo(fmt.Sprintf("Branch: %s", branchName))

// Detect package manager and remind about dependencies
if fileExists(filepath.Join(worktreeDir, "package.json")) {
    ui.PrintWarn(fmt.Sprintf("Install dependencies: cd %s && npm install", worktreeDir))
}
```

#### `n2o worktree list` — show active worktrees

Lists active worktrees with their associated Linear issue identifiers and states.

```bash
n2o worktree list
# ENG-42  In Progress  ../eng-42-login-form/
# ENG-43  Todo         ../eng-43-api-endpoint/
```

**Implementation:**
```go
// 1. git worktree list --porcelain → parse paths and branches
// 2. Extract issue identifiers from branch names
// 3. Batch-fetch issue states from Linear
// 4. Display with issue state

// Warn about worktrees for completed/canceled issues
for _, wt := range worktrees {
    if wt.Issue.State.Type == "completed" || wt.Issue.State.Type == "canceled" {
        ui.PrintWarn(fmt.Sprintf("%s is %s — consider removing: n2o worktree rm %s",
            wt.Identifier, wt.Issue.State.Name, wt.Identifier))
    }
}
```

#### `n2o worktree rm ENG-42` — remove

Removes the worktree and prunes git's worktree metadata.

```bash
n2o worktree rm ENG-42
# → Removed worktree at ../eng-42-login-form/
```

**Implementation:**
```go
// Find worktree by issue identifier (scan branch names)
worktreeDir := findWorktreeByIdentifier("ENG-42")
exec.Command("git", "worktree", "remove", worktreeDir).Run()
exec.Command("git", "worktree", "prune").Run()
```

**Safety:** Refuses to remove a worktree with uncommitted changes. Use `--force` to override.

## The full git workflow

With all commands together, the issue lifecycle looks like:

```
1. n2o issue list --available           # Find work
2. n2o issue update ENG-42 --assign me  # Claim it
3. n2o branch ENG-42                    # Create branch (→ In Progress)
   — or —
   n2o worktree ENG-42                  # Create worktree for parallel work
4. # ... develop ...
5. n2o commit --issue ENG-42            # Commit with issue ID
6. n2o rebase                           # Rebase onto main
7. n2o pr                               # Create PR (→ In Review)
8. # ... review, merge on GitHub ...    # (→ Done, automatic)
9. n2o worktree rm ENG-42               # Clean up worktree (if used)
```

Steps 3–8 map to Linear state transitions, most of which are automatic via git automations. The user only needs to manually set state for Blocked/unblocking.

## What this replaces in the old system

| Old N2O feature | New approach |
|-----------------|-------------|
| `n2o commit --sprint X --task N` (build msg + record hash) | `n2o commit --issue ENG-42` (build msg). Hash tracking automatic. |
| `tasks.commit_hash` column | Linear links commits/PRs automatically |
| `tasks.merged_at` column | PR merge tracked by Linear + auto state change |
| `tasks.lines_added/removed` | Available in linked PR on Linear |
| Manual `issue status` after merging | Automatic: PR merged → Done |
| Manual `issue status` when starting work | Automatic: branch created → In Progress |
| No PR creation support | `n2o pr` creates PR pre-filled from Linear issue |
| No rebase support | `n2o rebase` for the common case |
| No parallel work support | `n2o worktree` for parallel issues/agents |

## What the CLI does NOT do

- **Interactive rebase** — inherently interactive, use git directly. Squash merge on GitHub makes commit cleanup unnecessary.
- **Stacked PRs** — complex to implement correctly. Use Graphite if you need this.
- **Merge conflict resolution** — too contextual to automate
- **Force push** — dangerous, user should run `git push --force-with-lease` themselves
- **Cherry-pick, bisect** — use git directly

## Git automation state configuration during `n2o init`

During init, after selecting the team and mapping workflow states, the CLI could optionally configure git automation states:

```
Git automations for target branch "main":
  Branch created  → In Progress
  PR ready        → In Review
  PR merged       → Done

Apply these automations? [Y/n]
```

Optional — teams may already have these configured in the Linear UI. The CLI checks existing automations before creating new ones.

## Additional GraphQL for git integration

```graphql
# Query existing git automation states for a team
query {
  team(id: "...") {
    gitAutomationStates {
      nodes {
        id branchPattern event
        state { id name }
      }
    }
  }
}

# Get branch name for an issue
query {
  issue(id: "...") {
    branchName
    identifier
    title
  }
}
```
