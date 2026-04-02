# CLI changes for Linear migration
> What gets deleted, what gets rewritten, what stays. All commands use `issue` and `cycle` terminology to match Linear.

## Command renaming

All task/sprint commands are renamed to match Linear vocabulary:

| Old command | New command | Notes |
|-------------|------------|-------|
| `n2o task *` | `n2o issue *` | All subcommands renamed |
| `n2o sprint *` | `n2o cycle *` | All subcommands renamed |
| `n2o commit` | `n2o commit` | Unchanged (git operation, not a Linear concept) |
| `n2o stats` | `n2o stats` | Unchanged |

## Packages deleted entirely

### `cli/task/`
All task CRUD, status transitions, dependency cycle detection. Replaced by direct Linear GraphQL calls.

### `cli/api/`
Entire package — the N2O API HTTP client, event push/pull. Issue operations now go directly to Linear. Framework sync (`n2o sync`) and auth (`n2o login`) still hit the N2O API but can use a simpler inline HTTP client or a minimal package in `cli/n2o/` if needed.

## Packages added

### `cli/linear/`
New package — thin GraphQL client for Linear's API.

```go
// cli/linear/client.go
type Client struct {
    APIKey     string
    HTTPClient *http.Client
}

func New(apiKey string) *Client

// Issues (parent and sub-issues share the same API — parentId distinguishes them)
func (c *Client) ListIssues(teamID string, opts IssueListOpts) ([]Issue, error)
func (c *Client) ListChildren(parentID string) ([]Issue, error)
func (c *Client) GetIssue(identifier string) (*Issue, error)
func (c *Client) CreateIssue(input CreateIssueInput) (*Issue, error)    // parentId field for sub-issues
func (c *Client) UpdateIssue(issueID string, input UpdateIssueInput) (*Issue, error)
func (c *Client) CreateIssueRelation(issueID, relatedID string, relType RelationType) error
func (c *Client) AddComment(issueID, body string) error

// Cycles
func (c *Client) ListCycles(teamID string) ([]Cycle, error)
func (c *Client) GetActiveCycle(teamID string) (*Cycle, error)
func (c *Client) CreateCycle(input CreateCycleInput) (*Cycle, error)

// Git automation (see git-integration.md)
func (c *Client) ListGitAutomationStates(teamID string) ([]GitAutomationState, error)
func (c *Client) CreateGitAutomationState(input GitAutomationStateInput) error

// Team introspection (used during init)
func (c *Client) ListTeams() ([]Team, error)
func (c *Client) GetWorkflowStates(teamID string) ([]WorkflowState, error)
func (c *Client) ListProjects(teamID string) ([]Project, error)
func (c *Client) GetMe() (*User, error)
```

```go
// cli/linear/types.go
type Issue struct {
    ID          string
    Identifier  string   // "ENG-42"
    Title       string
    Description string
    BranchName  string   // Linear's suggested branch name for git integration
    State       WorkflowState
    Assignee    *User
    Priority    int
    Estimate    *float64
    Parent      *Issue   // nil for top-level issues
    Children    []Issue  // populated when queried with children
    Labels      []Label
    Cycle       *Cycle
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type CreateIssueInput struct {
    TeamID      string
    Title       string
    Description string
    StateID     string   // from linear_states config
    ParentID    string   // set for sub-issues, empty for parent issues
    CycleID     string
    ProjectID   string
    AssigneeID  string
    Priority    *int
    LabelIDs    []string
}
```

Types are simple Go structs, not the full Linear schema — just what the CLI needs.

Note: API requests may need the `GraphQL-Features: sub_issues` header for sub-issue functionality.

## Commands rewritten

### `cli/cmd/issue.go` (was `cli/cmd/task.go`)

All subcommands rewritten to call `linear.Client`. The key change beyond renaming: `--parent` flag for creating sub-issues, and `children` subcommand for listing sub-issues.

```go
// n2o issue create --parent ENG-10 --title "Database schema"
lc := requireLinear()
issue, err := lc.CreateIssue(linear.CreateIssueInput{
    TeamID:   cfg.LinearTeamID,
    Title:    title,
    ParentID: parentIssueID,  // resolved from "ENG-10" identifier
    CycleID:  activeCycleID,
    StateID:  cfg.LinearStates["pending"],
})

// n2o issue list (lists issues in active cycle)
lc := requireLinear()
issues, err := lc.ListIssues(cfg.LinearTeamID, linear.IssueListOpts{CycleID: activeCycleID})

// n2o issue children ENG-10 (lists sub-issues of a parent)
lc := requireLinear()
children, err := lc.ListChildren(parentIssueID)

// n2o issue claim ENG-42
lc := requireLinear()
me, _ := lc.GetMe()
lc.UpdateIssue(issueID, linear.UpdateIssueInput{AssigneeID: me.ID})

// n2o issue status ENG-42 --state in_progress
lc := requireLinear()
lc.UpdateIssue(issueID, linear.UpdateIssueInput{StateID: cfg.LinearStates["in_progress"]})

// n2o issue block ENG-42 --reason "waiting on API"
lc := requireLinear()
lc.UpdateIssue(issueID, linear.UpdateIssueInput{StateID: cfg.LinearStates["blocked"]})
lc.AddComment(issueID, "Blocked: waiting on API")

// n2o issue available (unassigned, Todo state, no unresolved blockers)
lc := requireLinear()
issues, err := lc.ListIssues(cfg.LinearTeamID, linear.IssueListOpts{
    CycleID: activeCycleID,
    StateID: cfg.LinearStates["pending"],
})
// Filter client-side: unassigned + no blocking relations in non-completed state
```

**Subcommands:**
| Subcommand | Description |
|-----------|-------------|
| `issue list` | List issues in active cycle (or `--cycle <name>`) |
| `issue children <identifier>` | List sub-issues of a parent issue |
| `issue create` | Create an issue (`--parent` for sub-issue) |
| `issue available` | Show unassigned, unblocked sub-issues ready for work |
| `issue claim <identifier>` | Assign issue to self |
| `issue status <identifier> --state <state>` | Update issue state |
| `issue block <identifier> --reason <text>` | Set to Blocked + add comment |
| `issue unblock <identifier>` | Set back to Todo |
| `issue dep add <identifier> --blocks <identifier>` | Create blocking relation |
| `issue verify <identifier>` | Set to Done/Verified state |
| `issue commit <identifier> --hash <hash>` | Add commit hash as comment (mostly superseded by GitHub integration) |

### `cli/cmd/branch.go` (new)

Generates and checks out a git branch named for a Linear issue:

```go
// n2o branch ENG-42
lc := requireLinear()
issue, err := lc.GetIssue("ENG-42")
// Use issue.branchName if available, else generate: username/eng-42-issue-title
branchName := issue.BranchName
if branchName == "" {
    branchName = fmt.Sprintf("%s/%s-%s", userName, strings.ToLower(issue.Identifier), slugify(issue.Title))
}
exec.Command("git", "checkout", "-b", branchName).Run()
```

This ensures the branch name contains the issue identifier, which triggers Linear's git automations (auto-transition to In Progress). See `git-integration.md`.

### `cli/cmd/cycle.go` (was `cli/cmd/sprint.go`)

```go
// n2o cycle create --name "Sprint 3" --starts 2026-04-07 --ends 2026-04-21
lc := requireLinear()
lc.CreateCycle(linear.CreateCycleInput{
    TeamID:   cfg.LinearTeamID,
    Name:     cycleName,
    StartsAt: startDate,
    EndsAt:   endDate,
})

// n2o cycle list
lc := requireLinear()
cycles, err := lc.ListCycles(cfg.LinearTeamID)
```

`cycle archive` → dropped (Linear handles cycle completion natively).

**Subcommands:**
| Subcommand | Description |
|-----------|-------------|
| `cycle list` | List cycles for the team |
| `cycle create` | Create a new cycle |

### `cli/cmd/stats.go`

Rewrite to query Linear. Can show progress per parent issue (sub-issue rollup):

```go
lc := requireLinear()
cycle, err := lc.GetActiveCycle(cfg.LinearTeamID)
issues, err := lc.ListIssues(cfg.LinearTeamID, linear.IssueListOpts{CycleID: cycle.ID})

// For each parent issue, show sub-issue progress
for _, parent := range parentIssues {
    children, _ := lc.ListChildren(parent.ID)
    // Count by state: 3/5 done, 1 in progress, 1 blocked
}
```

### `cli/cmd/commit.go`

Fetch issue from Linear instead of local DB. The commit message includes the issue identifier so Linear's GitHub integration links the commit automatically:

```go
// n2o commit --issue ENG-42
lc := requireLinear()
issue, err := lc.GetIssue(issueIdentifier) // e.g. "ENG-42"

// Build conventional commit message
// e.g. "feat(frontend): Login form component\n\nFixes ENG-42"
// The "Fixes ENG-42" trailer triggers Linear's auto-close on merge
```

The `--task` flag becomes `--issue`.

With git automations enabled, this commit + the eventual PR merge will automatically move the issue to Done — no manual `issue status` call needed.

### `cli/cmd/check.go`
Remove SQLite table checks. Replace with:
- Linear API key valid? (`GetMe()`)
- Linear team accessible? (`ListTeams()` and check configured team is present)
- Skills installed?
- Config valid? (linear_team_id, linear_states populated)

### `cli/cmd/status_cmd.go`
Remove pending events / N2O auth sections. Replace with:
- Linear connection status (API key valid, team accessible)
- Active cycle info (name, date range, issue count)
- N2O auth status (for framework sync, if still relevant)

### `cli/cmd/root.go`
- Remove `dbPath()` helper
- Add `requireLinear()` helper that loads API key from global config and returns a `linear.Client`
- Add `loadProjectLinearConfig()` helper that reads team/project/state IDs from `.pm/config.json`
- Keep `resolveProjectPath()` for framework/config operations

### `cli/cmd/init_cmd.go`
Remove SQLite DB creation. Add Linear setup flow:

```go
// Remove: db.InitFromSchemaBytes(tasksDB, schemaContent)
// Add:
// 1. Prompt for Linear API key (or check if already in ~/.n2o/config.json)
// 2. Call GetMe() to validate key
// 3. Call ListTeams() → user selects team
// 4. Call ListProjects(teamID) → user selects project (optional)
// 5. Call GetWorkflowStates(teamID) → auto-map or user confirms state mapping
// 6. Save team_id, project_id, state mapping to .pm/config.json
```

### `cli/cmd/sync.go`
Remove event sync. Keep framework file download.
Remove dependency on `cli/api/` — inline a simple HTTP client for the N2O API download, or move to `cli/n2o/`.

## Packages that stay unchanged

- `cli/auth/` — device flow, credential storage (for N2O API auth, used by `sync`/`login`)
- `cli/adapter/` — AI tool abstraction
- `cli/ui/` — terminal formatting
- `cli/manifest/` — skill manifest parsing
- `cli/git/` — git operations
- `cli/cmd/login.go` — unchanged (N2O API auth for framework sync)
- `cli/cmd/logout.go` — unchanged
- `cli/cmd/apikey.go` — unchanged (N2O API keys)
- `cli/cmd/version.go` — unchanged
- `cli/cmd/pin.go` — unchanged

## Packages deleted (analytics-related)

### `cli/db/`
Entire package deleted. No more local SQLite — `Open()`, `AutoMigrate()`, `InitFromSchema()`, `InitFromSchemaBytes()` all go. The `modernc.org/sqlite` dependency is removed from `go.mod`.

### `cli/sync/sync.go`
- Delete `ExtractSkillVersions()` — wrote to the now-deleted `skill_versions` table
- Delete `parseSkillFrontmatter()`, `parseYAMLLine()` — only used by `ExtractSkillVersions`
- Keep `SyncDirectory()`, `FileChecksum()`, `copyFile()` only if still used by framework file sync in `cli/cmd/sync.go`. If `sync.go` now gets framework files directly from the API bundle (already the case), delete the entire `cli/sync/` package.

### `cli/event/`
Delete entirely — only supported the event log table which is removed.

### `cli/config/`
Updated — not deleted. Changes:

```go
type GlobalConfig struct {
    DeveloperName string `json:"developer_name,omitempty"`
    LinearAPIKey  string `json:"linear_api_key,omitempty"` // NEW
}

type ProjectConfig struct {
    N2OVersion       string            `json:"n2o_version,omitempty"`
    ProjectName      string            `json:"project_name,omitempty"`
    AITool           string            `json:"ai_tool,omitempty"`
    LinearTeamID     string            `json:"linear_team_id,omitempty"`     // NEW
    LinearTeamKey    string            `json:"linear_team_key,omitempty"`    // NEW (e.g. "ENG")
    LinearProjectID  string            `json:"linear_project_id,omitempty"` // NEW (optional)
    LinearStates     map[string]string `json:"linear_states,omitempty"`     // NEW: n2o status → Linear state ID
    Commands         CommandsConfig    `json:"commands,omitempty"`
    AutoInvokeSkills bool              `json:"auto_invoke_skills,omitempty"`
    DisabledSkills   []string          `json:"disabled_skills,omitempty"`
    // Removed: PMTool, ClaimTasks, Team
}
```

## Flag changes

| Current flag        | New flag              | Reason                        |
|---------------------|-----------------------|-------------------------------|
| `--sprint <name>`   | `--cycle <name>`      | Linear terminology            |
| `--task <int>`      | `--issue <identifier>` | Linear uses "ENG-42" format  |
| `--status <string>` | `--state <string>`    | Linear terminology            |
| _(new)_             | `--parent <identifier>` | Create sub-issue under parent |

## Dependencies

### Added
None — Linear GraphQL is plain HTTP/JSON POST to `api.linear.app/graphql`.

### Removed
- `modernc.org/sqlite` (`modernc.org/sqlite`) — no more local database
- Any migration-related code or schema files

## Files deleted

- `.pm/schema.sql` — entire schema file
- `.pm/tasks.db` — local database (not checked in, but `n2o init` no longer creates it)
- `.pm/migrations/` — migration directory

## Files renamed

- `cli/cmd/task.go` → `cli/cmd/issue.go`
- `cli/cmd/sprint.go` → `cli/cmd/cycle.go`
