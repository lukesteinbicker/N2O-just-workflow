# Replace local task DB with Linear (direct API)
> Eliminate the SQLite task system and all custom PM logic. Linear becomes the single source of truth for issues, cycles, and dependencies. The CLI talks directly to Linear's GraphQL API using an OAuth token obtained during project setup.

## Current State

### What exists today

The CLI has a local SQLite database (`.pm/tasks.db`) with:

**Tables:**
- `tasks` — 50+ columns including status FSM, audit tracking, velocity, git tracking, estimation, external sync fields
- `developers` — skill ratings, strengths, growth areas
- `task_dependencies` — blocking relationships with cycle detection
- `workflow_events` — tool calls, skill invocations, phase transitions
- `transcripts` — Claude Code session metadata and token usage
- `messages` — full conversation content
- `tool_calls` — every tool invocation with inputs/outputs
- `developer_context` — session-level developer state
- `skill_versions` — version history per skill
- `event` — event log for sync (unsynced events flush to API)
- `_migrations` — schema migration tracking

**Views (20+):** available_tasks, blocked_tasks, sprint_progress, velocity_report, estimation_accuracy, developer_quality, skill_usage, phase_timing, concurrency, brain_cycles, session_health, etc.

**CLI commands that hit the local DB:**
- `task list/available/claim/status/block/unblock/commit/create/dep/verify`
- `sprint create/archive`
- `stats`
- `commit` (reads task from DB to build conventional commit message)
- `check` (verifies DB tables exist)
- `status` (shows pending events count)

**CLI commands that hit the N2O API:**
- `login/logout` — device flow auth
- `apikey create/list/revoke` — API key management
- `sync` — downloads framework files from API
- `init` — authenticates + downloads framework + creates DB

**Other packages:**
- `api/client.go` — authenticated HTTP client for N2O API
- `api/pull.go` — pulls events/state from N2O API
- `api/push.go` — pushes events to N2O API, flushes pending
- `sync/sync.go` — file sync + skill version extraction
- `auth/` — device flow, credential storage
- `config/` — global config (~/.n2o/config.json) + project config (.pm/config.json)
- `adapter/` — AI tool abstraction (currently only Claude Code)

### What's wrong

1. Reinventing project management — sprints, tasks, dependencies, status transitions, assignment are all things Linear does natively and better
2. Local SQLite means no real-time collaboration, no notifications, no web UI
3. Custom event sync system (push/pull events) is fragile plumbing that Linear's API eliminates
4. Schema is bloated — 50+ columns on tasks, most unused or aspirational
5. The CLI is doing too much: it's a PM tool, an analytics engine, and a framework installer

## What changes

### Issue hierarchy: parent issues and sub-issues

The old "tasks within a sprint" model maps to Linear's parent/sub-issue hierarchy:

```
Linear Project: "my-app"
  └── Cycle: "Sprint 3"
       ├── Parent Issue: "ENG-10: User authentication flow"   ← spec / feature
       │    ├── Sub-issue: "ENG-11: Database schema"          ← work item
       │    ├── Sub-issue: "ENG-12: Login endpoint"
       │    └── Sub-issue: "ENG-13: Frontend form"
       └── Parent Issue: "ENG-20: Observability pipeline"
            ├── Sub-issue: "ENG-21: Logging middleware"
            └── Sub-issue: "ENG-22: Grafana dashboards"
```

**Why sub-issues instead of flat issues:**
- **Progress rolls up** — parent auto-completes when all children are done
- **Grouping is native** — related work items are structurally connected, not just filtered by cycle
- **Sub-issues are full issues** — each has its own state, assignee, priority, labels, cycle
- **API is simple** — `issueCreate` with a `parentId` field is all it takes
- **Maps to the existing mental model** — a "spec" becomes a parent issue, "tasks" become sub-issues

**Key behaviors:**
- Sub-issues created via UI auto-copy project and cycle from parent. Via API, set `projectId` and `cycleId` explicitly to be safe.
- The `children` field on an Issue returns all sub-issues (paginated `IssueConnection`)
- The `parent` field on a sub-issue points back to the parent
- Sub-issues can be in different cycles than the parent
- No nesting depth limit, but we use exactly 2 levels: parent + sub-issues
- The `GraphQL-Features: sub_issues` header may be required for some sub-issue API features

### Data that moves to Linear

| Current (SQLite)         | Linear equivalent                     | Notes                                    |
|--------------------------|---------------------------------------|------------------------------------------|
| `tasks.title`            | `Issue.title`                         | Direct (sub-issue title)                 |
| `tasks.description`      | `Issue.description`                   | Markdown                                 |
| `tasks.status`           | `Issue.state` (WorkflowState)         | Map: pending→Todo, red→In Progress, green→Done, blocked→Blocked (custom state) |
| `tasks.type`             | `Issue.labels` or `IssueType`         | Labels: database, frontend, infra, etc.  |
| `tasks.owner`            | `Issue.assignee`                      | Linear User                              |
| `tasks.priority`         | `Issue.priority`                      | Int: 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low |
| `tasks.sprint`           | `Cycle`                               | Time-boxed iteration                     |
| `tasks.done_when`        | `Issue.description` (section)         | Embed in description as "## Done when"   |
| `tasks.estimated_minutes`| `Issue.estimate`                      | Int (story points, team-configured)      |
| `tasks.complexity`       | `Issue.labels`                        | Label: low/medium/high                   |
| `tasks.blocked_reason`   | `Issue.description` or comment        | Update when blocking                     |
| `task_dependencies`      | `IssueRelation` (blocks/blocked_by)   | First-class in Linear                    |
| `tasks.horizon`          | `Issue.state` category or Project     | backlog/unstarted/started/completed      |
| `tasks.spec`             | Parent issue description               | Spec content lives in the parent issue   |
| `developers`             | `User` (Linear workspace members)     | No skill ratings — dropped               |
| Spec / sprint grouping   | Parent issue + sub-issues             | Parent = spec/feature, children = work items |

### Data that gets dropped

Everything not moving to Linear is deleted — no local analytics DB. See `removed-local-analytics.md` for the full inventory.

| Data                    | Action              | Reason                                     |
|-------------------------|---------------------|--------------------------------------------|
| `workflow_events`       | Drop                | Claude Code session analytics — rebuild as standalone tool if needed |
| `transcripts`           | Drop                | Token usage, cost tracking — same          |
| `messages`              | Drop                | Conversation replay — same                 |
| `tool_calls`            | Drop                | Tool usage analytics — same                |
| `developer_context`     | Drop                | Session-level state — unused               |
| `skill_versions`        | Drop                | Framework versioning — derive from files   |
| Audit tracking fields   | Drop                | pattern_audited, testing_posture — skill-session metadata, not issue state |
| Git tracking fields     | Linear GitHub integration | commit_hash, lines_added/removed — Linear links PRs/commits natively |
| Velocity views          | Linear analytics    | Linear has built-in cycle velocity         |
| All 20+ analytics views | Drop                | Most were aspirational / never populated   |

### Git integration (replaces manual git tracking)

Linear's GitHub integration automatically links branches, PRs, and commits to issues based on the issue identifier (e.g. `ENG-42`) in branch names, PR titles, or commit messages. See `git-integration.md` for full details.

**Key impact:** Git automation states move issues through the workflow automatically:
- Branch created → In Progress
- PR opened → In Review
- PR merged → Done

This eliminates manual `issue status` calls for common git flows and replaces all of: `tasks.commit_hash`, `tasks.merged_at`, `tasks.lines_added/removed`, and the old `n2o commit` hash-recording behavior.

**Git workflow commands:**
- `n2o branch ENG-42` — create and checkout a branch named for the issue (triggers → In Progress)
- `n2o pr` — create a GitHub PR pre-filled from the current issue (triggers → In Review)
- `n2o rebase` — rebase current branch onto the default branch
- `n2o worktree ENG-42` — create a worktree for parallel work on an issue

### Other Linear features to leverage

| Feature | What it does | How we use it |
|---------|-------------|---------------|
| **Issue history** | Full audit trail via `IssueHistory` — tracks state, assignee, priority, label changes with from/to values and actor | Replaces old `reversions` tracking. Queryable for analytics if needed. |
| **Attachments** | URL-based links on issues with metadata | Link specs, docs, external resources to issues |
| **Initiatives** | Sits above Projects: Initiative → Project → Issue | Optional roadmap-level grouping, not needed for CLI v1 |
| **Triage** | Optional workflow state type for incoming/unscreened work | Useful if teams want a review step before Todo |
| **Git automation states** | Configurable per team and per target branch via API | Set up during `n2o init`, see `git-integration.md` |
| **Saved views/filters** | Custom views with filter criteria, creatable via API | Could expose as `n2o view` commands later |

**Not available in Linear** (notable gaps):
- **Custom fields** — Linear uses labels instead. Fine for our use case (type, complexity are labels).
- **Time tracking** — No native support. The old `estimated_minutes` and Toggl integration are dropped. Use Linear's estimate field for story points.

### API architecture

```
n2o login  ──device flow──>  N2O API  (authenticates user)
n2o init   ──bearer token──> N2O API  (pulls Linear API key for this user)
n2o issue  ──Linear API key──> Linear GraphQL (api.linear.app/graphql)
```

- **N2O API manages Linear API keys** — each N2O user has an associated Linear API key stored server-side
- During `n2o init`, after authenticating with N2O, the CLI pulls the user's Linear API key from the N2O API
- The Linear API key is stored locally in `~/.n2o/credentials.json` with 0600 permissions
- The CLI talks directly to Linear's GraphQL API using this key — no proxy for issue operations
- Each project config (`.pm/config.json`) specifies which Linear team and project to use
- Linear API keys can be team-scoped, so N2O API controls exactly what each user can access

**Why N2O API manages the keys (not OAuth or manual key entry):**
- **Single auth flow** — `n2o login` is the only authentication step. No separate Linear OAuth or key copy-paste.
- **Centralized access control** — N2O API decides which Linear key each user gets, scoped to the right team(s)
- **Works headless** — no browser needed for Linear auth. The existing N2O device flow works over SSH.
- **Key rotation** — N2O API can rotate Linear keys without users re-authenticating
- **Revocation** — disabling an N2O account disables Linear access (on next init/refresh)

### Identifier resolution

Linear's `issue(id: ...)` query accepts both UUIDs and human-readable identifiers (e.g. `"ENG-42"`). The CLI always passes the identifier the user typed — no UUID lookup step needed. Same for `issueId`/`relatedIssueId` in mutations like `issueRelationCreate`.

### Pagination

All Linear list queries return paginated connections. The `cli/linear/` client must handle cursor-based pagination:

- Default page size: **50**, max: **250**
- Connection fields: `nodes`, `pageInfo { hasNextPage, endCursor }`
- The client should paginate transparently for list operations, fetching all pages up to a reasonable limit
- For `stats` and `available`, fetch all issues in a cycle (typically <100, well within one page at `first: 250`)

### Rate limiting and error handling

Linear rate limits: **5,000 requests/hour**, **250,000 complexity points/hour** per user.

Response headers: `X-RateLimit-Requests-Remaining`, `X-RateLimit-Complexity-Remaining`, `X-RateLimit-Requests-Reset`.

The CLI should:
- Check `X-RateLimit-Requests-Remaining` and warn if low
- Retry on 429 (rate limited) with backoff using the `Reset` header
- Retry on 5xx errors (Linear down) up to 3 times with exponential backoff
- Surface clear error messages: "Linear API key invalid — run `n2o init` to refresh" (401), "rate limited, retry in Xs" (429), "Linear is unavailable" (5xx)
- Not retry on 4xx client errors (bad input, not found, etc.)
- On 401: suggest `n2o init` to pull a fresh key from N2O API

### What the CLI does directly (Linear GraphQL)

These replace the local SQLite task operations. All queries verified against the Linear GraphQL schema.

```graphql
# Get active cycle and its issues (Team has a direct activeCycle field)
query {
  team(id: "TEAM_UUID") {
    activeCycle {
      id name startsAt endsAt
      issues(first: 250) {
        nodes {
          id identifier title
          state { id name type }
          assignee { id name }
          parent { id identifier }
          labels { nodes { name } }
          priority estimate
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}

# List sub-issues of a parent (children field on Issue)
query {
  issue(id: "ENG-10") {
    children(first: 250) {
      nodes {
        id identifier title
        state { id name type }
        assignee { id name }
        priority estimate
      }
    }
  }
}

# Available issues: unassigned + Todo state (combined filter, one query)
# Then filter client-side for unresolved blockers using inverseRelations
query {
  team(id: "TEAM_UUID") {
    issues(
      filter: {
        assignee: { null: true }
        state: { name: { eq: "Todo" } }
        cycle: { id: { eq: "ACTIVE_CYCLE_ID" } }
      }
      first: 250
    ) {
      nodes {
        id identifier title priority estimate
        parent { id identifier }
        inverseRelations {
          nodes {
            type
            issue { state { type } }
          }
        }
      }
    }
  }
}
# Client-side: filter out issues where any inverseRelation has type="blocks"
# and the blocking issue's state.type is NOT "completed" or "canceled"

# Create a sub-issue under a parent
mutation {
  issueCreate(input: {
    teamId: "TEAM_UUID"
    title: "Database schema"
    parentId: "ENG-10"           # accepts identifier, not just UUID
    stateId: "STATE_UUID_TODO"
    cycleId: "CYCLE_UUID"        # set explicitly — API may inherit from parent but be safe
    projectId: "PROJECT_UUID"    # same
  }) {
    success
    issue { id identifier title }
  }
}

# Create a parent issue (no parentId)
mutation {
  issueCreate(input: {
    teamId: "TEAM_UUID"
    title: "User authentication flow"
    projectId: "PROJECT_UUID"
    cycleId: "CYCLE_UUID"
  }) {
    success
    issue { id identifier title }
  }
}

# Update issue (status, assignee, etc.)
mutation {
  issueUpdate(id: "ENG-42", input: { stateId: "STATE_UUID" }) {
    success
    issue { id identifier state { name } }
  }
}

# Create blocking relation
mutation {
  issueRelationCreate(input: {
    issueId: "ENG-42"           # accepts identifier
    relatedIssueId: "ENG-43"   # accepts identifier
    type: blocks
  }) {
    success
  }
}

# Create cycle
mutation {
  cycleCreate(input: {
    teamId: "TEAM_UUID"
    name: "Sprint 3"
    startsAt: "2026-04-07T00:00:00Z"
    endsAt: "2026-04-21T00:00:00Z"
  }) {
    success
    cycle { id name startsAt endsAt }
  }
}

# Add comment (for block reasons, etc.)
mutation {
  commentCreate(input: {
    issueId: "ENG-42"           # accepts identifier
    body: "Blocked: waiting on API design"
  }) {
    success
  }
}
```

The CLI contains a thin GraphQL client that builds these queries. No intermediate REST API needed.

### CLI changes

All CLI commands use `issue` and `cycle` terminology for consistency with Linear. Commands are composable — fewer subcommands, more flags.

**Design principles:**
- **`issue list`** is one command with filters, not three (list/children/available)
- **`issue update`** is one command for all mutations (state, assignee, comment), not four (status/claim/block/unblock)
- **State names are Linear's actual names** — "Todo", "In Progress", "Done", "Blocked" — not N2O aliases. Users see what they see in Linear's UI.
- **`issue get`** for viewing a single issue (state, assignee, parent, relations)

**Command mapping (old → new):**
| Old command | New command | Notes |
|-------------|------------|-------|
| `task list --sprint X` | `issue list [--cycle X]` | Defaults to active cycle |
| `task list --sprint X --status Y` | `issue list --state "In Progress"` | Uses Linear state names |
| _(children view)_ | `issue list --parent ENG-10` | Filter by parent |
| `task available` | `issue list --available` | Preset: unassigned + Todo + no unresolved blockers |
| _(no equivalent)_ | `issue get ENG-42` | Show single issue details |
| `task claim` | `issue update ENG-42 --assign me` | |
| `task status` | `issue update ENG-42 --state "In Progress"` | |
| `task block` | `issue update ENG-42 --state "Blocked" --comment "reason"` | State + comment in one call |
| `task unblock` | `issue update ENG-42 --state "Todo"` | Just a state change |
| `task create` | `issue create --title "..." [--parent ENG-10]` | |
| `task dep add` | `issue relate ENG-42 --blocks ENG-43` | Flat, not nested under `dep` |
| ~~`task verify`~~ | _(dropped)_ | Parent auto-completes |
| ~~`task commit`~~ | _(dropped)_ | GitHub integration handles it |
| `commit` | `commit --issue ENG-42` | Builds commit msg with identifier |
| `sprint create` | `cycle create --name "..." --starts ... --ends ...` | |
| `sprint archive` | _(dropped)_ | Linear handles cycle completion |
| _(no equivalent)_ | `cycle active` | Show active cycle info |
| `stats` | `stats [--cycle X]` | Defaults to active cycle |
| `check` | `check` | Verifies Linear connectivity + config |
| `status` | `status` | Linear connection + active cycle |
| _(no equivalent)_ | `branch ENG-42` | Create git branch for issue |

**Full command reference:**

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
```

**Commands that don't change:**
- `login`, `logout`, `apikey` — still hit N2O API auth endpoints (via `cli/api/`)
- `sync` — still downloads framework files from N2O API (via `cli/api/`)
- `init` — still authenticates with N2O API + downloads framework, now also pulls Linear API key + team/project selection
- `pin`, `version` — unchanged

**Packages deleted:**
- `cli/task/` — entire package (replaced by Linear GraphQL)
- `cli/db/` — entire package (no more local SQLite)
- `cli/api/pull.go` — event pulling (no more event sync)
- `cli/api/push.go` — event pushing (no more event sync)
- `cli/sync/sync.go` — `ExtractSkillVersions` (wrote to deleted skill_versions table). Keep `SyncDirectory`/`FileChecksum`/`copyFile` only if still used by framework sync.
- `cli/event/` — if it only supports the deleted event log table

**Packages kept:**
- `cli/api/client.go` — still needed for N2O API auth (login, logout, apikey, sync, init)

**Packages added:**
- `cli/linear/` — thin GraphQL client for Linear API (queries, mutations, types)

**Packages modified:**
- `cli/cmd/root.go` — remove `dbPath()`, add `requireLinear()` (loads key from credentials)
- `cli/config/config.go` — add `LinearTeamID`, `LinearProjectID` to ProjectConfig
- `cli/auth/` — add `linear_api_key` field to credentials storage
- `cli/api/client.go` — add `GET /api/auth/linear-key` endpoint call

**File renames:**
- `cli/cmd/task.go` → `cli/cmd/issue.go`
- `cli/cmd/sprint.go` → `cli/cmd/cycle.go`

### State mapping

Linear workflow states are custom per team. During `n2o init`, the CLI fetches the team's workflow states and stores the name→ID mapping. **Users interact with Linear's actual state names** — no N2O aliases.

```
State name      State type    Git automation
──────────────────────────────────────────────
Backlog         backlog       —
Todo            unstarted     —
In Progress     started       branch created
In Review       started       PR ready for review
Blocked         started       —
Done            completed     PR merged
Canceled        canceled      —
```

The CLI stores the team's state names and their IDs in `.pm/config.json`:

```json
"linear_states": {
  "Backlog": "state-uuid-1",
  "Todo": "state-uuid-2",
  "In Progress": "state-uuid-3",
  "In Review": "state-uuid-4",
  "Blocked": "state-uuid-5",
  "Done": "state-uuid-6",
  "Canceled": "state-uuid-7"
}
```

When a user runs `n2o issue update ENG-42 --state "In Progress"`, the CLI looks up the state ID from this map. Tab completion can be added later using the keys of this map.

**During `n2o init`:** The CLI calls `GetWorkflowStates(teamID)` and stores all states. No auto-detection or name matching needed — we store whatever the team has configured.

### Authentication and project config

**Linear credentials flow through the N2O API** — users never interact with Linear auth directly.

```
Setup flow (one-time per user):
1. n2o login                     → authenticates with N2O API (existing device flow)
2. n2o init                      → authenticates with N2O API if needed
   a. Downloads framework        → existing behavior
   b. GET /api/auth/linear-key   → N2O API returns the user's Linear API key
   c. Store key in credentials   → ~/.n2o/credentials.json (0600 permissions)
   d. Validate key with Linear   → GetMe() to confirm access
   e. List teams/projects        → user selects team + project
   f. Map workflow states        → auto-detect + confirm
   g. Save to .pm/config.json   → checked into repo
```

**N2O API endpoint (new):**
```
GET /api/auth/linear-key
Authorization: Bearer <n2o_token>

Response:
{
  "linear_api_key": "lin_api_xxxxx",
  "scoped_teams": ["team-uuid-1"],    // which Linear teams this key can access
  "permissions": ["read", "write"]     // key permission level
}
```

The N2O API admin creates Linear API keys in Linear's settings (Settings → Security → API Keys), scoped to specific teams with appropriate permissions (read + write). These keys are then associated with N2O user accounts. When a user runs `n2o init`, the CLI pulls their assigned key.

**Linear API key properties:**
- Can be scoped to specific teams at creation time (in Linear's settings)
- Permission levels: Read, Write, Admin, Create issues, Create comments
- Long-lived (no expiration), but revocable
- N2O API can rotate keys centrally without users re-authenticating

```json
// ~/.n2o/credentials.json (user-level, 0600 permissions, NOT checked in)
{
  "n2o_token": "...",
  "n2o_expires_at": "...",
  "linear_api_key": "lin_api_xxxxx"
}

// .pm/config.json (project-level, checked into repo)
{
  "n2o_version": "1.2.0",
  "ai_tool": "claudecode",
  "project_name": "my-app",
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
  }
}
```

- The Linear API key lives in the credentials file alongside the N2O token (secure, not in repo)
- Team/project IDs and state mappings are per-project and checked in, so all team members share the same config
- Each team member runs `n2o init` once to pull their Linear key and select team/project
- Key refresh: `n2o init` can be re-run to pull an updated key if the N2O admin rotates it

## What doesn't change

- N2O API auth flow for framework sync (device flow login, bearer tokens, API keys for `n2o sync`)
- N2O API client (`cli/api/client.go`) for auth endpoints
- Framework sync (`n2o sync`)
- Adapter abstraction (Claude Code, future tools)
- Skill system (skills/, SKILL.md files)

## Open questions

1. ~~Should the CLI cache Linear data locally for offline use?~~ No — keep it simple, require connectivity for issue operations.
2. Should `done_when` be a custom field in Linear or embedded in description? Description section is simpler and doesn't require Linear admin setup.
3. ~~How to handle `available` logic?~~ Resolved: single query with filters (unassigned + state=Todo + cycle), plus `inverseRelations` for blocker check, filter client-side.
4. ~~Do we need a "Verified" workflow state?~~ Resolved: dropped. Parent auto-completes when all sub-issues done.
5. ~~Should the N2O API proxy Linear calls?~~ Resolved: no proxy. N2O API manages keys, CLI talks to Linear directly.
6. ~~Identifier resolution?~~ Resolved: Linear's `id` parameter accepts both UUIDs and identifiers like "ENG-42".
7. ~~How does auth work?~~ Resolved: N2O API stores Linear API keys per user. CLI pulls key during `n2o init`. Single auth flow via existing `n2o login`.
