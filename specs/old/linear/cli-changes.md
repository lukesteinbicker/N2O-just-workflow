# CLI changes for Linear migration
> What gets deleted, what gets rewritten, what stays. Fewer commands, composable flags, Linear's own vocabulary.

## Design principles

1. **`issue list` is one command** — filters replace separate subcommands (children, available)
2. **`issue update` is one command** — state, assignee, and comment are all flags on a single mutation
3. **State names are Linear's actual names** — "Todo", "In Progress", "Done" — not N2O aliases
4. **`issue get` shows a single issue** — state, assignee, parent, children count, relations

## Command structure

```
n2o issue list    [--cycle <name>] [--parent <id>] [--state <name>] [--unassigned] [--available]
n2o issue get     <identifier>
n2o issue create  --title <text> [--parent <id>] [--description <text>]
n2o issue update  <identifier> [--state <name>] [--assign <user|me>] [--comment <text>]
n2o issue relate  <identifier> --blocks <identifier>

n2o cycle list
n2o cycle create  --name <text> --starts <date> --ends <date>
n2o cycle active

n2o branch    <identifier>
n2o pr        [--draft]
n2o rebase
n2o worktree  <identifier> | list | rm <identifier>
n2o commit    --issue <identifier>
n2o stats     [--cycle <name>] [--json]

n2o init [project-path]
n2o login
n2o logout
n2o sync [project-path]
n2o check [project-path]
n2o status
n2o pin <version>
n2o apikey create|list|revoke
```

## Packages deleted entirely

### `cli/task/`
All task CRUD, status transitions, dependency cycle detection. Replaced by direct Linear GraphQL calls.

### `cli/api/pull.go` and `cli/api/push.go`
Event pulling/pushing to N2O API. No more event sync — Linear is the source of truth.

## Packages kept

### `cli/api/client.go`
Still needed for N2O API auth (login, logout, apikey, sync) and the new `GET /api/auth/linear-key` endpoint.

## Packages added

### `cli/linear/`
Thin GraphQL client for Linear's API.

```go
// cli/linear/client.go
type Client struct {
    APIKey     string
    HTTPClient *http.Client
}

func New(apiKey string) *Client

// All queries go to POST https://api.linear.app/graphql
// Header: Authorization: <api_key>
// Header: GraphQL-Features: sub_issues (for sub-issue operations)

// Issues
func (c *Client) ListIssues(teamID string, opts IssueListOpts) ([]Issue, error)
func (c *Client) GetIssue(idOrIdentifier string) (*Issue, error)
func (c *Client) CreateIssue(input CreateIssueInput) (*Issue, error)
func (c *Client) UpdateIssue(idOrIdentifier string, input UpdateIssueInput) (*Issue, error)
func (c *Client) CreateIssueRelation(issueID, relatedIssueID string, relType IssueRelationType) error
func (c *Client) AddComment(issueID, body string) error

// Cycles
func (c *Client) GetActiveCycle(teamID string) (*Cycle, error)
func (c *Client) ListCycles(teamID string) ([]Cycle, error)
func (c *Client) CreateCycle(input CreateCycleInput) (*Cycle, error)

// Git automation (see git-integration.md)
func (c *Client) ListGitAutomationStates(teamID string) ([]GitAutomationState, error)
func (c *Client) CreateGitAutomationState(input GitAutomationStateInput) error

// Team introspection (used during init)
func (c *Client) ListTeams() ([]Team, error)
func (c *Client) GetWorkflowStates(teamID string) ([]WorkflowState, error)
func (c *Client) ListProjects(teamID string) ([]Project, error)
func (c *Client) GetMe() (*User, error)

// No token refresh needed — Linear API keys are long-lived
// On 401, CLI suggests `n2o init` to pull a fresh key from N2O API
```

```go
// cli/linear/types.go
type Issue struct {
    ID               string
    Identifier       string         // "ENG-42"
    Title            string
    Description      string
    BranchName       string         // Linear's suggested branch name
    State            WorkflowState
    Assignee         *User
    Priority         int            // 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low
    Estimate         *int           // story points (Int in Linear schema)
    Parent           *Issue         // nil for top-level issues
    Children         []Issue        // populated when queried
    Labels           []Label
    Cycle            *Cycle
    Relations        []IssueRelation
    InverseRelations []IssueRelation
    CreatedAt        time.Time
    UpdatedAt        time.Time
}

type UpdateIssueInput struct {
    StateID    string   // looked up from linear_states config by name
    AssigneeID string   // "me" resolved to current user's ID
    // Comment is handled separately via AddComment, but the CLI
    // composes both calls from a single `issue update` invocation
}

type IssueListOpts struct {
    CycleID    string   // filter to a specific cycle
    ParentID   string   // filter to children of a parent (--parent flag)
    StateName  string   // filter by state name (--state flag)
    Unassigned bool     // filter to unassigned (--unassigned flag)
    Available  bool     // preset: unassigned + Todo + no unresolved blockers
    First      int      // page size, default 250, max 250
    After      string   // cursor for pagination
}

type WorkflowState struct {
    ID   string
    Name string         // "Todo", "In Progress", "Done", etc.
    Type string         // triage, backlog, unstarted, started, completed, canceled
}
```

### Pagination

All list methods handle cursor-based pagination transparently:
- Default page size: 250 (max) to minimize round trips
- Default max items: 1000 (safety limit)
- `ListIssues`, `ListCycles` use this internally

### Error handling

```go
type APIError struct {
    StatusCode int
    Message    string
}
```

Retry behavior:
- **429 (rate limited)**: wait until `X-RateLimit-Requests-Reset`, retry once
- **5xx (server error)**: up to 3 retries with exponential backoff (1s, 2s, 4s)
- **401 (unauthorized)**: fail with "Linear API key invalid — run `n2o init` to pull a fresh key"
- **4xx (client error)**: no retry, surface error message

## Commands rewritten

### `cli/cmd/issue.go` (was `cli/cmd/task.go`)

One file, five subcommands: `list`, `get`, `create`, `update`, `relate`.

#### `issue list`

```go
// n2o issue list                              → active cycle, all issues
// n2o issue list --parent ENG-10              → sub-issues of ENG-10
// n2o issue list --state "In Progress"        → filter by state
// n2o issue list --unassigned                 → unassigned issues
// n2o issue list --available                  → unassigned + Todo + no unresolved blockers
// n2o issue list --cycle "Sprint 2"           → specific cycle

lc := requireLinear()
cfg := loadProjectConfig()

opts := linear.IssueListOpts{}

if parentFlag != "" {
    // --parent: query children of a specific issue
    opts.ParentID = parentFlag
} else {
    // Default: issues in active cycle
    cycle, _ := lc.GetActiveCycle(cfg.LinearTeamID)
    opts.CycleID = cycle.ID
}

if stateFlag != "" {
    opts.StateName = stateFlag
}
if unassignedFlag {
    opts.Unassigned = true
}
if availableFlag {
    opts.Available = true  // implies: unassigned + state="Todo" + no unresolved blockers
}

issues, err := lc.ListIssues(cfg.LinearTeamID, opts)
```

The `--available` flag sets a compound filter. Client-side, we additionally filter out issues where `inverseRelations` has a `type="blocks"` relation with a non-completed blocking issue.

#### `issue get`

```go
// n2o issue get ENG-42
lc := requireLinear()
issue, err := lc.GetIssue("ENG-42")

// Display: identifier, title, state, assignee, parent, children count,
// labels, priority, estimate, blocking/blocked-by relations
```

#### `issue create`

```go
// n2o issue create --title "Database schema" --parent ENG-10
// n2o issue create --title "User auth flow"  (top-level parent)
lc := requireLinear()
cfg := loadProjectConfig()
cycle, _ := lc.GetActiveCycle(cfg.LinearTeamID)

stateID := cfg.LinearStates["Todo"]  // new issues start as Todo
issue, err := lc.CreateIssue(linear.CreateIssueInput{
    TeamID:    cfg.LinearTeamID,
    Title:     title,
    ParentID:  parentFlag,          // identifier like "ENG-10", empty for top-level
    CycleID:   cycle.ID,
    ProjectID: cfg.LinearProjectID,
    StateID:   stateID,
    Description: descriptionFlag,
})
```

#### `issue update`

The single command for all field mutations. Flags are composable — set state and comment in one call, assign and change state together, etc.

```go
// n2o issue update ENG-42 --state "In Progress"
// n2o issue update ENG-42 --assign me
// n2o issue update ENG-42 --state "Blocked" --comment "waiting on API design"
// n2o issue update ENG-42 --state "Todo"  (unblocking is just a state change)

lc := requireLinear()
cfg := loadProjectConfig()

input := linear.UpdateIssueInput{}

if stateFlag != "" {
    stateID, ok := cfg.LinearStates[stateFlag]
    if !ok {
        return fmt.Errorf("unknown state %q — valid states: %s", stateFlag, validStates(cfg))
    }
    input.StateID = stateID
}

if assignFlag != "" {
    if assignFlag == "me" {
        me, _ := lc.GetMe()
        input.AssigneeID = me.ID
    } else {
        // Look up user by name/email
        input.AssigneeID = assignFlag
    }
}

lc.UpdateIssue("ENG-42", input)

if commentFlag != "" {
    lc.AddComment("ENG-42", commentFlag)
}
```

**Invalid state names** produce a clear error listing valid states from the config:
```
Error: unknown state "InProgress" — valid states: Backlog, Todo, In Progress, In Review, Blocked, Done, Canceled
```

#### `issue relate`

```go
// n2o issue relate ENG-42 --blocks ENG-43
lc := requireLinear()
lc.CreateIssueRelation("ENG-42", "ENG-43", linear.RelationBlocks)
```

### `cli/cmd/cycle.go` (was `cli/cmd/sprint.go`)

Three subcommands: `list`, `create`, `active`.

```go
// n2o cycle active
lc := requireLinear()
cfg := loadProjectConfig()
cycle, err := lc.GetActiveCycle(cfg.LinearTeamID)
// Display: name, date range, issue count by state

// n2o cycle list
cycles, err := lc.ListCycles(cfg.LinearTeamID)

// n2o cycle create --name "Sprint 3" --starts 2026-04-07 --ends 2026-04-21
lc.CreateCycle(linear.CreateCycleInput{
    TeamID:   cfg.LinearTeamID,
    Name:     name,
    StartsAt: startsAt,  // "2026-04-07T00:00:00Z"
    EndsAt:   endsAt,
})
```

### `cli/cmd/branch.go` (new)

```go
// n2o branch ENG-42
lc := requireLinear()
issue, err := lc.GetIssue("ENG-42")
branchName := issue.BranchName
if branchName == "" {
    me, _ := lc.GetMe()
    branchName = fmt.Sprintf("%s/%s-%s", slugify(me.Name), strings.ToLower(issue.Identifier), slugify(issue.Title))
}
exec.Command("git", "checkout", "-b", branchName).Run()
```

### `cli/cmd/pr.go` (new)

Creates a GitHub PR pre-filled from the current Linear issue. Requires `gh` CLI.

```go
// n2o pr [--draft]
branch := getCurrentBranch()
identifier := extractIdentifier(branch)  // parse "ENG-42" from branch name

lc := requireLinear()
issue, err := lc.GetIssue(identifier)

title := fmt.Sprintf("[%s] %s", issue.Identifier, issue.Title)
body := fmt.Sprintf("%s\n\nFixes %s", issue.Description, issue.Identifier)

args := []string{"pr", "create", "--title", title, "--body", body}
if draftFlag {
    args = append(args, "--draft")
}
exec.Command("gh", args...).Run()
// Triggers Linear: → In Review (git automation)
// "Fixes ENG-42" in body → auto-close on merge (→ Done)
```

### `cli/cmd/rebase.go` (new)

Fetches and rebases onto the default branch.

```go
// n2o rebase
defaultBranch := detectDefaultBranch()  // main, master, etc.
exec.Command("git", "fetch", "origin").Run()
err := exec.Command("git", "rebase", "origin/" + defaultBranch).Run()
if err != nil {
    fmt.Println("Rebase failed — resolve conflicts, then: git rebase --continue")
    fmt.Println("Or abort: git rebase --abort")
}
```

### `cli/cmd/worktree.go` (new)

Manages worktrees tied to Linear issues. See `git-integration.md` for full details.

```go
// n2o worktree ENG-42 — create worktree for issue
lc := requireLinear()
issue, err := lc.GetIssue("ENG-42")
branchName := issueBranchName(issue)
worktreeDir := filepath.Join(filepath.Dir(repoRoot),
    fmt.Sprintf("%s-%s", strings.ToLower(issue.Identifier), slugify(issue.Title)))

branchExists := exec.Command("git", "rev-parse", "--verify", branchName).Run() == nil
if branchExists {
    exec.Command("git", "worktree", "add", worktreeDir, branchName).Run()
} else {
    exec.Command("git", "worktree", "add", "-b", branchName, worktreeDir).Run()
}
// Remind about dependency installation

// n2o worktree list — show worktrees with Linear issue state
// Parses `git worktree list --porcelain`, extracts identifiers, fetches states from Linear
// Warns about worktrees for completed/canceled issues

// n2o worktree rm ENG-42 — remove worktree + prune
// Refuses if uncommitted changes (override with --force)
exec.Command("git", "worktree", "remove", worktreeDir).Run()
exec.Command("git", "worktree", "prune").Run()
```

### `cli/cmd/commit.go`

```go
// n2o commit --issue ENG-42
lc := requireLinear()
issue, err := lc.GetIssue(issueIdentifier)
// Build: "feat(frontend): Login form component\n\nFixes ENG-42"
```

### `cli/cmd/stats.go`

```go
// n2o stats [--cycle "Sprint 2"] [--json]
lc := requireLinear()
cfg := loadProjectConfig()
cycle, _ := lc.GetActiveCycle(cfg.LinearTeamID)  // or lookup by name
issues, _ := lc.ListIssues(cfg.LinearTeamID, linear.IssueListOpts{CycleID: cycle.ID})

// Group: parent issues with sub-issue rollup, standalone issues by state
// Display: cycle name, date range, total/by-state counts, parent breakdowns
```

### `cli/cmd/check.go`

```
- Linear API key valid? (GetMe())
- Team accessible? (ListTeams() + check configured team present)
- Skills installed?
- Config valid? (linear_team_id, linear_states populated)
```

### `cli/cmd/status_cmd.go`

```
- Linear: connected as <name> (team: ENG)
- Active cycle: Sprint 3 (Apr 7 – Apr 21, 12 issues)
- N2O: authenticated as <user>
```

### `cli/cmd/root.go`

- Remove `dbPath()` helper
- Add `requireLinear()`: loads Linear API key from `~/.n2o/credentials.json`, creates `linear.Client`
- Add `loadProjectConfig()`: reads team/project/state config from `.pm/config.json`
- Keep `resolveProjectPath()`

### `cli/cmd/init_cmd.go`

```go
// 1. Authenticate with N2O API if needed (existing device flow)
// 2. GET /api/auth/linear-key → pull user's Linear API key
// 3. Store key in ~/.n2o/credentials.json (0600)
// 4. GetMe() to validate + greet user
// 5. ListTeams() → user selects team
// 6. ListProjects(teamID) → user selects project
// 7. GetWorkflowStates(teamID) → store all state name→ID mappings
// 8. Save to .pm/config.json
```

### `cli/cmd/sync.go`

Remove event sync. Keep framework file download. Still uses `cli/api/client.go`.

## Packages that stay unchanged

- `cli/auth/` — device flow, credential storage
- `cli/api/client.go` — N2O API HTTP client
- `cli/adapter/` — AI tool abstraction
- `cli/ui/` — terminal formatting
- `cli/manifest/` — skill manifest parsing
- `cli/git/` — git operations
- `cli/cmd/login.go`, `logout.go`, `apikey.go`, `version.go`, `pin.go` — unchanged

## Packages deleted (analytics-related)

### `cli/db/`
Entire package. `modernc.org/sqlite` removed from `go.mod`.

### `cli/sync/sync.go`
Delete `ExtractSkillVersions()` and helpers. Keep `SyncDirectory()`/`FileChecksum()`/`copyFile()` only if still used by framework sync.

### `cli/event/`
Delete entirely.

### `cli/config/`
Updated:

```go
type ProjectConfig struct {
    N2OVersion       string            `json:"n2o_version,omitempty"`
    ProjectName      string            `json:"project_name,omitempty"`
    AITool           string            `json:"ai_tool,omitempty"`
    LinearTeamID     string            `json:"linear_team_id,omitempty"`
    LinearTeamKey    string            `json:"linear_team_key,omitempty"`
    LinearProjectID  string            `json:"linear_project_id,omitempty"`
    LinearStates     map[string]string `json:"linear_states,omitempty"`     // state name → state ID
    Commands         CommandsConfig    `json:"commands,omitempty"`
    AutoInvokeSkills bool              `json:"auto_invoke_skills,omitempty"`
    DisabledSkills   []string          `json:"disabled_skills,omitempty"`
}
```

## Flag changes

| Current flag        | New flag              | Reason                        |
|---------------------|-----------------------|-------------------------------|
| `--sprint <name>`   | `--cycle <name>`      | Linear terminology            |
| `--task <int>`      | `<identifier>` (positional) | "ENG-42" as argument, not flag |
| `--status <string>` | `--state <name>`      | Linear's actual state names   |
| _(new)_             | `--parent <id>`       | Filter list / create sub-issue |
| _(new)_             | `--assign <user\|me>` | Set assignee in update        |
| _(new)_             | `--comment <text>`    | Add comment in update         |
| _(new)_             | `--unassigned`        | Filter list to unassigned     |
| _(new)_             | `--available`         | Preset filter for ready work  |
| _(new)_             | `--blocks <id>`       | Create blocking relation      |
| _(new)_             | `--draft`             | Create PR as draft            |
| _(new)_             | `--force`             | Force worktree removal        |

## Files deleted

- `.pm/schema.sql`, `.pm/tasks.db`, `.pm/migrations/`
- `cli/api/pull.go`, `cli/api/push.go`

## Files renamed

- `cli/cmd/task.go` → `cli/cmd/issue.go`
- `cli/cmd/sprint.go` → `cli/cmd/cycle.go`
