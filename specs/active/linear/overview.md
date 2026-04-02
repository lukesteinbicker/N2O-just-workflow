# Replace local task DB with Linear (direct API)
> Eliminate the SQLite task system and all custom PM logic. Linear becomes the single source of truth for issues, cycles, and dependencies. The CLI talks directly to Linear's GraphQL API using a team-scoped API key configured per project.

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
- Sub-issues created via API with `parentId` do NOT auto-inherit project/cycle — set explicitly
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
| `tasks.priority`         | `Issue.priority`                      | 0-4 scale (None/Urgent/High/Medium/Low)  |
| `tasks.sprint`           | `Cycle`                               | Time-boxed iteration                     |
| `tasks.done_when`        | `Issue.description` (section)         | Embed in description as "## Done when"   |
| `tasks.estimated_minutes`| `Issue.estimate`                      | Story points or time                     |
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

**New CLI command:** `n2o branch ENG-42` — generates and checks out a branch named for the issue.

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
CLI  ──Linear API key──>  Linear GraphQL (api.linear.app/graphql)
     (stored in ~/.n2o/config.json)
```

- No proxy layer — the CLI talks directly to Linear's GraphQL API
- Linear API keys can be scoped to specific teams, providing access control at the source
- Each project config (`.pm/config.json`) specifies which Linear team and project to use
- The API key is stored in the user's global config (`~/.n2o/config.json`), not per-project, since one key can cover multiple teams
- During `n2o init`, the user provides their Linear API key and selects a team + project from what the key has access to

### What the CLI does directly (Linear GraphQL)

These replace the local SQLite task operations:

```graphql
# List sub-issues of a parent issue
query { issue(id: "...") { children { nodes { id identifier title state { name } assignee { name } } } } }

# List issues in current cycle
query { team(id: "...") { cycles(filter: { isActive: { eq: true } }) { nodes { issues { nodes { ... } } } } } }

# Create a sub-issue under a parent
mutation { issueCreate(input: { teamId: "...", title: "...", stateId: "...", parentId: "..." }) { issue { identifier } } }

# Create a parent issue (no parentId)
mutation { issueCreate(input: { teamId: "...", title: "...", projectId: "..." }) { issue { identifier } } }

# Update issue (status, assignee, etc.)
mutation { issueUpdate(id: "...", input: { stateId: "..." }) { issue { identifier } } }

# Create blocking relation
mutation { issueRelationCreate(input: { issueId: "...", relatedIssueId: "...", type: blocks }) { ... } }

# Create cycle
mutation { cycleCreate(input: { teamId: "...", name: "...", startsAt: "...", endsAt: "..." }) { ... } }
```

The CLI contains a thin GraphQL client that builds these queries. No intermediate REST API needed.

### CLI changes

All CLI commands use `issue` terminology for consistency with Linear.

**Commands that change:**
| Old command | New command | Before | After |
|-------------|------------|--------|-------|
| `task list` | `issue list` | Query local SQLite | GraphQL: sub-issues of a parent, or issues in active cycle |
| `task available` | `issue available` | Query `available_tasks` view | GraphQL: sub-issues where state=Todo, unassigned, no unresolved blockers |
| `task claim` | `issue claim` | `UPDATE tasks SET owner` | `issueUpdate` with assigneeId = self |
| `task status` | `issue status` | Validate FSM + `UPDATE tasks` | `issueUpdate` with stateId |
| `task block` | `issue block` | Set blocked + reason | `issueUpdate` to Blocked state + `commentCreate` with reason |
| `task unblock` | `issue unblock` | Reset to pending | `issueUpdate` back to Todo state |
| `task create` | `issue create` | `INSERT INTO tasks` | `issueCreate` with teamId, parentId, title, description |
| `task dep add` | `issue dep add` | Insert + cycle detection | `issueRelationCreate` with type=blocks |
| `task verify` | `issue verify` | Set verified flag | `issueUpdate` to Done/Verified state |
| `task commit` | `issue commit` | Record hash in DB | `commentCreate` or `attachmentCreate` with commit hash |
| `commit` | `commit` | Read task from DB, build commit msg | GraphQL query for issue, then build commit msg |
| `sprint create` | `cycle create` | Insert placeholder task | `cycleCreate` with name, startsAt, endsAt |
| `sprint archive` | _(dropped)_ | Delete verified tasks | Handled by Linear cycle completion |
| `stats` | `stats` | Query sprint_progress view | GraphQL: parent issue children grouped by state |
| `check` | `check` | Verify DB tables exist | Verify Linear API key valid + team accessible |
| `status` | `status` | Show pending events | Show Linear connection status + active cycle |

**New commands:**
| Command | Purpose |
|---------|---------|
| `issue create --parent ENG-10` | Create a sub-issue under a parent |
| `issue create` (no --parent) | Create a top-level / parent issue |
| `issue children ENG-10` | List sub-issues of a parent issue |
| `branch ENG-42` | Generate and checkout a git branch named for the issue (see `git-integration.md`) |

**Commands that don't change:**
- `login`, `logout`, `apikey` — still hit N2O API auth endpoints
- `sync` — still downloads framework files from N2O API
- `init` — still authenticates + downloads framework, now also prompts for Linear API key + team/project selection
- `pin`, `version` — unchanged

**Packages deleted:**
- `cli/task/` — entire package (replaced by Linear GraphQL)
- `cli/db/` — entire package (no more local SQLite)
- `cli/api/` — entire package (N2O API client, event push/pull — replaced by direct Linear GraphQL)
- `cli/sync/sync.go` — `ExtractSkillVersions` (wrote to deleted skill_versions table). Keep `SyncDirectory`/`FileChecksum`/`copyFile` only if still used by framework sync.
- `cli/event/` — if it only supports the deleted event log table

**Packages added:**
- `cli/linear/` — thin GraphQL client for Linear API (queries, mutations, types)

**Packages modified:**
- `cli/cmd/root.go` — remove `dbPath()`, add Linear client init from config
- `cli/config/config.go` — add `LinearTeam`, `LinearProject` to ProjectConfig; add `LinearAPIKey` to GlobalConfig

**File renames:**
- `cli/cmd/task.go` → `cli/cmd/issue.go`
- `cli/cmd/sprint.go` → `cli/cmd/cycle.go`

### Status mapping

Linear workflow states are custom per team. During `n2o init`, the CLI fetches the team's workflow states and the user maps them (or we auto-detect by state type):

```
N2O status    Linear state type    Suggested name        Git automation
──────────────────────────────────────────────────────────────────────────
pending       unstarted            "Todo"                —
red           started              "In Progress"         branch created
(new)         started              "In Review"           PR ready for review
green         completed            "Done"                PR merged
blocked       started              "Blocked" (custom)    —
```

The mapping is stored in `.pm/config.json` so the CLI knows which state IDs to use for transitions. Auto-detection: match by state type (unstarted, started, completed) and fall back to name matching.

### Project config changes

```json
// ~/.n2o/config.json (global — user-level)
{
  "developer_name": "luke",
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
    "pending": "state-uuid-todo",
    "in_progress": "state-uuid-in-progress",
    "in_review": "state-uuid-in-review",
    "blocked": "state-uuid-blocked",
    "done": "state-uuid-done"
  }
}
```

- The Linear API key lives in the user's global config (`~/.n2o/config.json`), never in the repo
- Team/project IDs and state mappings are per-project and checked in, so all team members share the same config
- Each team member provides their own API key (scoped to the same team) in their global config
- During `n2o init`, the CLI validates the API key, lists accessible teams/projects, and lets the user select

## What doesn't change

- N2O API auth flow for framework sync (device flow login, bearer tokens, API keys for `n2o sync`)
- Framework sync (`n2o sync`)
- Adapter abstraction (Claude Code, future tools)
- Skill system (skills/, SKILL.md files)

## Open questions

1. ~~Should the CLI cache Linear data locally for offline use?~~ No — keep it simple, require connectivity for issue operations.
2. Should `done_when` be a custom field in Linear or embedded in description? Description section is simpler and doesn't require Linear admin setup.
3. How to handle the `available` logic (dependency-gated, unclaimed, pending)? CLI can query sub-issues + relations from Linear and filter client-side, or use Linear's filtering if sufficient.
4. Do we need a "Verified" workflow state in Linear, or is "Done" sufficient? Could use a label instead.
5. ~~Should the N2O API use a single org-wide Linear API key or per-user OAuth tokens?~~ Resolved: each user provides their own team-scoped Linear API key. No proxy needed.
