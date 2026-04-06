# N2O CLI Manual

## Installation

Download the binary for your platform and add it to your PATH.

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `n2o-darwin-arm64` |
| macOS (Intel) | `n2o-darwin-amd64` |
| Windows | `n2o-windows-amd64.exe` |

## Quick Start

```bash
# Setup (one-time)
n2o login                                   # Authenticate with N2O
n2o init                                    # Pull Linear key, select team/project

# Daily workflow
n2o issue list --available                  # Find work ready to pick up
n2o issue update ENG-42 --assign me         # Claim an issue
n2o branch ENG-42                           # Create branch (→ In Progress)
# ... develop ...
n2o commit --issue ENG-42                   # Commit with issue ID
n2o rebase                                  # Rebase onto main
n2o pr                                      # Create PR (→ In Review)
# ... review, merge on GitHub ...           # (→ Done, automatic)
```

## Global Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--quiet` | `-q` | Suppress non-essential output |
| `--version` | `-v` | Print CLI version |

---

## Commands

### n2o init

Initialize a new N2O project. Authenticates if needed, downloads framework content, pulls your Linear API key from the N2O API, and guides you through team/project selection.

```
n2o init [project-path]
```

If `project-path` is omitted, uses the current directory.

**Setup flow:**
1. Authenticates with N2O API (runs `n2o login` if needed)
2. Downloads framework files (skills, templates, CLAUDE.md)
3. Pulls your Linear API key from N2O API
4. Validates key with Linear
5. Lists accessible teams — you select one
6. Lists projects in that team — you select one
7. Fetches workflow states — stores name→ID mapping
8. Saves configuration to `.pm/config.json`

**Creates:**
- `.claude/skills/` — all workflow skills
- `.pm/config.json` — project configuration (team, project, state mapping)
- `CLAUDE.md` — AI agent instructions

---

### n2o login

Authenticate with the N2O platform using the device authorization flow. Opens a browser for verification.

```
n2o login
```

Credentials are saved to `~/.n2o/credentials.json` (0600 permissions).

---

### n2o logout

Clear stored credentials (both N2O and Linear).

```
n2o logout
```

---

### n2o sync

Update framework files in an existing project from the N2O API.

```
n2o sync [project-path]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--dry-run` | `false` | Show what would change without writing |
| `--force` | `false` | Overwrite even if project files are newer |
| `--only` | | Sync only a category: `skills` |

---

### n2o check

Verify project health: Linear API key valid, team accessible, skills installed, config valid, CLI on PATH.

```
n2o check [project-path]
```

---

### n2o status

Show CLI status: Linear connection, active cycle info, N2O authentication state.

```
n2o status
```

---

### n2o pin

Pin a project to a specific N2O framework version.

```
n2o pin <version>
```

---

## Issue Commands

Issues follow a parent/sub-issue hierarchy: parent issues represent specs or features, sub-issues are individual work items. All issue operations go directly to Linear's GraphQL API.

### n2o issue list

List issues with optional filters. Defaults to the active cycle.

```
n2o issue list [flags]
```

| Flag | Description |
|------|-------------|
| `--cycle <name>` | Filter to a specific cycle (default: active) |
| `--parent <identifier>` | List sub-issues of a parent (e.g. `--parent ENG-10`) |
| `--state <name>` | Filter by state (e.g. `--state "In Progress"`) |
| `--unassigned` | Only show unassigned issues |
| `--available` | Preset: unassigned + Todo + no unresolved blockers |

**Examples:**
```bash
n2o issue list                              # All issues in active cycle
n2o issue list --parent ENG-10              # Sub-issues of ENG-10
n2o issue list --state "Blocked"            # Blocked issues
n2o issue list --available                  # Ready to pick up
```

### n2o issue get

Show details for a single issue: state, assignee, parent, children count, labels, relations.

```
n2o issue get <identifier>
```

### n2o issue create

Create a new issue. Use `--parent` to create a sub-issue.

```
n2o issue create --title <text> [--parent <identifier>] [--description <text>]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--title` | Yes | Issue title |
| `--parent` | No | Parent issue identifier (creates a sub-issue) |
| `--description` | No | Issue description (markdown) |

New issues start in "Todo" state and are assigned to the active cycle and configured project.

**Examples:**
```bash
n2o issue create --title "User auth flow"                        # Parent issue
n2o issue create --title "Database schema" --parent ENG-10       # Sub-issue
```

### n2o issue update

Update an issue's state, assignee, or add a comment. Flags are composable — set multiple fields in one call.

```
n2o issue update <identifier> [--state <name>] [--assign <user|me>] [--comment <text>]
```

| Flag | Description |
|------|-------------|
| `--state <name>` | Set workflow state (uses Linear's state names) |
| `--assign <user\|me>` | Set assignee (`me` for yourself) |
| `--comment <text>` | Add a comment to the issue |

State names are your Linear team's actual workflow states (as shown in `.pm/config.json`). Common states: "Todo", "In Progress", "In Review", "Blocked", "Done".

**Examples:**
```bash
n2o issue update ENG-42 --assign me                              # Claim
n2o issue update ENG-42 --state "In Progress"                    # Start work
n2o issue update ENG-42 --state "Blocked" --comment "waiting on API"  # Block with reason
n2o issue update ENG-42 --state "Todo"                           # Unblock
n2o issue update ENG-42 --state "Done"                           # Complete
n2o issue update ENG-42 --assign me --state "In Progress"        # Claim + start
```

Invalid state names produce a clear error listing valid states:
```
Error: unknown state "InProgress" — valid states: Backlog, Todo, In Progress, In Review, Blocked, Done, Canceled
```

Note: with git automations enabled, many state transitions happen automatically — branch created → In Progress, PR merged → Done. Manual updates are mainly for blocking, unblocking, and edge cases.

### n2o issue relate

Create a blocking dependency between two issues.

```
n2o issue relate <identifier> --blocks <identifier>
```

**Example:**
```bash
n2o issue relate ENG-42 --blocks ENG-43    # ENG-42 blocks ENG-43
```

---

## Cycle Commands

### n2o cycle active

Show the active cycle: name, date range, issue count by state.

```
n2o cycle active
```

### n2o cycle list

List cycles for the configured team.

```
n2o cycle list
```

### n2o cycle create

Create a new cycle.

```
n2o cycle create --name <name> --starts <date> --ends <date>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Cycle name (e.g. "Sprint 3") |
| `--starts` | Yes | Start date (YYYY-MM-DD) |
| `--ends` | Yes | End date (YYYY-MM-DD) |

---

## Git Commands

These commands tie into Linear's GitHub integration. Together they cover the full lifecycle: start work → develop → submit → merge. See the git-integration spec for details on how Linear auto-transitions issue states from git events.

### n2o branch

Create and checkout a git branch named for a Linear issue. The branch name contains the issue identifier, which triggers Linear's git automations (auto-transition to In Progress).

```
n2o branch <identifier>
```

**Example:**
```bash
n2o branch ENG-42
# → git checkout -b luke/eng-42-login-form-component
```

Uses Linear's suggested branch name if available, otherwise generates `{username}/{identifier}-{slugified-title}`.

### n2o pr

Create a GitHub PR pre-filled from the current Linear issue. Detects the issue identifier from the current branch name. Includes `Fixes ENG-42` in the body to trigger Linear's auto-close on merge.

Requires the `gh` CLI to be installed and authenticated.

```
n2o pr [--draft]
```

| Flag | Description |
|------|-------------|
| `--draft` | Create as a draft PR |

**Example:**
```bash
# On branch luke/eng-42-login-form-component
n2o pr
# → gh pr create --title "[ENG-42] Login form component" --body "...Fixes ENG-42"

n2o pr --draft
# → same, but as a draft PR
```

**What this triggers in Linear:**
- PR opened → In Review (via git automation)
- `Fixes ENG-42` in body → auto-close on merge (→ Done)

### n2o rebase

Fetch the latest default branch and rebase the current branch onto it. Detects the default branch automatically (main, master, etc.).

```
n2o rebase
```

**Example:**
```bash
n2o rebase
# → git fetch origin && git rebase origin/main
# Rebased onto origin/main
```

If the rebase fails due to conflicts:
```
Rebase failed — resolve conflicts, then: git rebase --continue
Or abort: git rebase --abort
```

This does NOT do interactive rebase, force push, or conflict resolution — use git directly for those.

### n2o worktree

Manage git worktrees tied to Linear issues. Each worktree is a separate working directory with its own branch, sharing git history with the main repo. Enables working on multiple issues simultaneously without stashing.

Especially useful for running parallel AI coding agents (Claude Code, Codex), where each agent gets its own worktree.

#### Create a worktree

```
n2o worktree <identifier>
```

Creates a worktree in a sibling directory, checks out the issue's branch (creating it if needed).

```bash
n2o worktree ENG-42
# → Created worktree at ../eng-42-login-form/
# → Branch: luke/eng-42-login-form-component
# → Remember to install dependencies: cd ../eng-42-login-form && npm install
```

#### List worktrees

```
n2o worktree list
```

Shows active worktrees with their Linear issue state. Warns about worktrees for completed or canceled issues.

```
ENG-42  In Progress  ../eng-42-login-form/
ENG-43  Todo         ../eng-43-api-endpoint/
ENG-44  Done         ../eng-44-tests/  ⚠ issue is Done — consider removing
```

#### Remove a worktree

```
n2o worktree rm <identifier> [--force]
```

Removes the worktree and prunes git metadata. Refuses if there are uncommitted changes (use `--force` to override).

```bash
n2o worktree rm ENG-42
# → Removed worktree at ../eng-42-login-form/
```

### n2o commit

Create a conventional commit for an issue. Fetches the issue from Linear, builds a commit message with the identifier so Linear's GitHub integration links it automatically.

```
n2o commit --issue <identifier>
```

**Commit format:**
```
{type}({scope}): {title}

Fixes {identifier}
```

Type mapping from issue labels: `docs`→docs, `infra`→chore, `e2e`→test, default→feat.

The `Fixes ENG-42` trailer triggers Linear's auto-close when the PR is merged.

### Typical workflow

```bash
n2o issue list --available           # 1. Find work
n2o issue update ENG-42 --assign me  # 2. Claim it
n2o branch ENG-42                    # 3. Create branch (→ In Progress)
# ... develop ...
n2o commit --issue ENG-42            # 4. Commit with issue ID
n2o rebase                           # 5. Rebase onto main
n2o pr                               # 6. Create PR (→ In Review)
# ... review, merge on GitHub ...    # 7. (→ Done, automatic)
```

For parallel work, replace step 3 with `n2o worktree ENG-42`, then clean up with `n2o worktree rm ENG-42` after merge.

---

## Stats

Show cycle progress with parent issue rollup and sub-issue breakdown.

```
n2o stats [--cycle <name>] [--json]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--json` | `false` | Output as JSON |
| `--cycle` | _(active)_ | Filter by cycle name |

---

## API Key Commands

N2O API key management. These manage keys for the N2O API, not Linear.

```
n2o apikey create --name <name>
n2o apikey list
n2o apikey revoke --name <name>
```

---

## API Routes

### N2O API

All routes require `Authorization: Bearer <token>` header (N2O auth token).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/framework/latest` | Download latest framework content |
| POST | `/api/auth/device-authorization/authorize` | Request device code for login |
| POST | `/api/auth/device-authorization/verify-device` | Poll for authorization status |
| POST | `/api/auth/api-key/create` | Create N2O API key |
| GET | `/api/auth/api-key/list` | List N2O API keys |
| POST | `/api/auth/api-key/revoke` | Revoke N2O API key |
| GET | `/api/auth/linear-key` | Get user's Linear API key |

### Linear GraphQL API

The CLI talks directly to `https://api.linear.app/graphql`.

- **Auth:** `Authorization: <linear_api_key>` header
- **Rate limits:** 5,000 requests/hour, 250,000 complexity points/hour
- **Pagination:** Default page size 50, max 250. CLI handles pagination transparently.
- **Identifiers:** Linear's `id` parameter accepts both UUIDs and identifiers like "ENG-42".

---

## Configuration

### Global (`~/.n2o/config.json`)

```json
{
  "developer_name": "luke"
}
```

### Credentials (`~/.n2o/credentials.json`)

Stored with 0600 permissions. Not checked into version control.

```json
{
  "token": "...",
  "user_id": "...",
  "org_id": "...",
  "app_url": "https://api.n2o.com",
  "expires_at": "2026-05-01T00:00:00Z",
  "linear_api_key": "lin_api_xxxxx"
}
```

### Project (`.pm/config.json`)

Checked into the repo. All team members share the same team/project/state config.

```json
{
  "n2o_version": "1.2.0",
  "project_name": "my-app",
  "ai_tool": "claudecode",
  "linear_team_id": "team-uuid",
  "linear_team_key": "ENG",
  "linear_project_id": "project-uuid",
  "linear_states": {
    "Backlog": "state-uuid-1",
    "Todo": "state-uuid-2",
    "In Progress": "state-uuid-3",
    "In Review": "state-uuid-4",
    "Blocked": "state-uuid-5",
    "Done": "state-uuid-6",
    "Canceled": "state-uuid-7"
  },
  "commands": {
    "test": "",
    "typecheck": "",
    "lint": "",
    "build": ""
  },
  "auto_invoke_skills": true,
  "disabled_skills": []
}
```

The `linear_states` map contains your team's actual Linear workflow state names and their IDs. This is populated automatically during `n2o init`.

## Building

```bash
cd cli
make build          # Build for current platform
make cross          # Build for macOS (arm64, amd64) + Windows (amd64)
make install        # Install to $GOPATH/bin
make clean          # Remove build artifacts
```
