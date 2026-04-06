# Linear data mapping
> How every piece of current schema data is represented in Linear using parent/sub-issue hierarchy.

## Conceptual model

```
Old:  Sprint → flat list of Tasks (identified by sprint + task_num)
New:  Cycle → Parent Issues (specs/features) → Sub-issues (work items)
```

A "task" in the old system becomes a **sub-issue** in Linear. What was implicit grouping by sprint string becomes explicit structure: a parent issue represents the spec or feature, and its children are the individual work items.

## Tasks table → Linear Sub-issues

### Fields that map directly

| SQLite column        | Linear field              | Type / notes                              |
|----------------------|---------------------------|-------------------------------------------|
| `sprint`             | `parent.cycle` or `issue.cycle` | Cycle on the parent; sub-issues set explicitly |
| `task_num`           | `issue.identifier`        | e.g. "ENG-42" (team prefix + auto-number) |
| `title`              | `issue.title`             | String, required                          |
| `description`        | `issue.description`       | Markdown                                  |
| `status`             | `issue.state`             | WorkflowState (see mapping below)         |
| `owner`              | `issue.assignee`          | Linear User                               |
| `priority`           | `issue.priority`          | Int: 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low |
| `estimated_minutes`  | `issue.estimate`          | Int (story points, team-configured)       |
| `created_at`         | `issue.createdAt`         | Auto by Linear                            |
| `updated_at`         | `issue.updatedAt`         | Auto by Linear                            |
| `started_at`         | `issue.startedAt`         | Auto when moved to "started" state type   |
| `completed_at`       | `issue.completedAt`       | Auto when moved to "completed" state type |

### Parent issue fields

| Old concept          | Linear parent issue field   | Notes                                    |
|----------------------|-----------------------------|------------------------------------------|
| Spec name / sprint goal | `parent.title`           | e.g. "User authentication flow"          |
| Spec content         | `parent.description`        | Full spec in markdown                    |
| Sprint grouping      | `parent.cycle`              | Assign parent to a cycle                 |
| Task count / progress| `parent.children`           | Query children; auto-completes when all done |

### Fields that map to labels

| SQLite column   | Linear label group | Values                                         |
|-----------------|-------------------|------------------------------------------------|
| `type`          | "Type" labels     | database, actions, frontend, infra, agent, e2e, docs |
| `complexity`    | "Complexity" labels| low, medium, high, unknown                     |
| `horizon`       | State category    | active→started, next→unstarted, later→backlog, icebox→backlog |

### Fields embedded in description

```markdown
## Done when
{done_when content}

## Blocked reason
{blocked_reason content — only when status is blocked}
```

These could alternatively be custom fields if the Linear workspace has them enabled, but description sections are zero-config.

### Fields that map to relations

| SQLite table          | Linear equivalent           |
|-----------------------|-----------------------------|
| `task_dependencies`   | `IssueRelation` type=blocks |

Linear handles cycle detection natively (won't create circular blocking relations).

Note: sub-issues under the same parent can block each other — this replaces the old `task_dependencies` table for intra-sprint deps. Cross-parent blocking also works via `IssueRelation`.

Linear exposes both `relations` (this issue is source) and `inverseRelations` (this issue is target) on the Issue type. To check if an issue is blocked: look at `inverseRelations` for entries with `type: "blocks"` where the blocking issue's `state.type` is not `"completed"` or `"canceled"`.

### Fields handled by Linear's GitHub integration

See `git-integration.md` for full details on how this works.

| SQLite column    | Linear mechanism             | Notes |
|------------------|------------------------------|-------|
| `commit_hash`    | Linked PR/commit via GitHub integration | Automatic when issue ID is in branch name, PR title, or commit msg |
| `merged_at`      | PR merge tracked by Linear + auto state change to Done | Via git automation states |
| `lines_added`    | Available in linked PR       | |
| `lines_removed`  | Available in linked PR       | |
| `started_at`     | Auto when branch created (git automation: → In Progress) | Replaces old SQLite trigger |
| `completed_at`   | Auto when PR merged (git automation: → Done) | Replaces old SQLite trigger |

### Fields dropped (no Linear equivalent needed)

| SQLite column          | Reason to drop                                          |
|------------------------|---------------------------------------------------------|
| `spec`                 | Spec content lives in the parent issue description      |
| `blocked_reason`       | Embed in description or comment (see above)             |
| `skills`               | N2O skill routing — not PM data, stays in skill system  |
| `pattern_audited`      | Skill-session metadata, not issue state                 |
| `pattern_audit_notes`  | Same                                                    |
| `skills_updated`       | Same                                                    |
| `skills_update_notes`  | Same                                                    |
| `tests_pass`           | CI handles this, not PM                                 |
| `testing_posture`      | Analytics concern, not PM                               |
| `verified`             | Dropped — parent auto-completes when all sub-issues done |
| `verified_at`          | Dropped — tracked by parent's completedAt               |
| `complexity_notes`     | Embed in description if needed                          |
| `reversions`           | Tracked via Linear state history (activity log)         |
| `priority_reason`      | Comment or description                                  |
| `assignment_reason`    | Comment or description                                  |
| `session_id`           | N2O analytics, not PM                                   |
| `external_id`          | Unnecessary — Linear IS the system now                  |
| `external_url`         | Same                                                    |
| `last_synced_at`       | No sync needed                                          |

## Developers table → Linear Users

Linear Users have: `name`, `email`, `displayName`, `avatarUrl`, `active`, `isMe`.

**What Linear doesn't have** (drop entirely):
- Skill ratings (skill_react, skill_node, etc.)
- Role, strengths, growth areas
- Time tracking user ID

These are N2O-specific developer profile data. Drop them — if needed in the future, they can be added as metadata in the N2O API or as custom Linear user properties.

## Sprints → Linear Cycles

| SQLite (implicit)     | Linear Cycle field    |
|-----------------------|-----------------------|
| Sprint name (string)  | `cycle.name`          |
| (no dates)            | `cycle.startsAt`, `cycle.endsAt` |
| (no goals)            | `cycle.description`   |
| Sprint archive        | Cycle auto-completes  |

Linear cycles are richer — they have date ranges, auto-scheduling, and completion tracking. The current system's sprints are just string labels with no dates, which is a significant upgrade.

Parent issues are assigned to cycles. Sub-issues should also be assigned to the same cycle explicitly (the API does not auto-inherit).

## Status FSM → Linear Workflow States

Current transitions:
```
pending → red → green
    ↓       ↓
  blocked ← ┘
blocked → pending
```

Linear workflow states have a `type` field (triage, backlog, unstarted, started, completed, canceled). States within the same type can be freely transitioned. Cross-type transitions are unrestricted in the API.

**Recommended Linear team workflow:**

| State name    | State type  | Maps from      | Git automation trigger |
|---------------|-------------|----------------|----------------------|
| Backlog       | backlog     | horizon=later  | — |
| Todo          | unstarted   | pending        | — |
| In Progress   | started     | red            | Branch created |
| In Review     | started     | (new)          | PR ready for review |
| Blocked       | started     | blocked        | — |
| Done          | completed   | green          | PR merged |
| Canceled      | canceled    | (new)          | — |

The CLI stores the team's state names and their IDs in `.pm/config.json` (populated during `n2o init`). Users specify Linear's actual state names in commands: `n2o issue update ENG-42 --state "In Progress"`. No N2O-specific aliases.

**Transition enforcement:** Dropped. Linear doesn't enforce transitions — any state can move to any state. Let Linear be Linear.

**Parent issue auto-completion:** When all sub-issues reach a "completed" state type, Linear automatically marks the parent as done. This replaces the old manual `verify` step.

## Views → Linear queries

| SQLite view                    | Replacement                                      |
|--------------------------------|--------------------------------------------------|
| `available_tasks`              | CLI: query sub-issues of a parent where state=Todo, unassigned, then filter out those with unresolved blocking relations client-side |
| `blocked_tasks`                | Linear filter: state=Blocked                     |
| `sprint_progress`              | Query parent issue's `children`, group by state — or use Linear's built-in cycle progress |
| `needs_pattern_audit`          | Drop (skill-session concern)                     |
| `needs_verification`           | Drop — parent auto-completes when all sub-issues done |
| `velocity_report`              | Linear analytics (built-in cycle velocity)       |
| `sprint_velocity`              | Linear analytics                                 |
| `developer_velocity`           | Linear analytics                                 |
| `estimation_accuracy*`         | Linear analytics or drop                         |
| `developer_quality`            | Drop                                             |
| `blow_up_factors`              | Drop                                             |
| `concurrency_*`                | Drop (see `removed-local-analytics.md`)          |
| `brain_cycles_per_task`        | Drop (see `removed-local-analytics.md`)          |
| `session_health`               | Drop (see `removed-local-analytics.md`)          |
| `skill_*`                      | Drop (see `removed-local-analytics.md`)          |
| `phase_*`                      | Drop (see `removed-local-analytics.md`)          |
| `context_loading_time`         | Drop (see `removed-local-analytics.md`)          |

## Event sync → eliminated

The current `event` table and `api/push.go`/`api/pull.go` implement a custom event sourcing system to sync local state to the N2O API. With Linear as the source of truth, this entire layer is unnecessary:

- **No more local event log** for issue operations
- **No more push/pull sync** — reads and writes go directly to Linear's GraphQL API
- **No proxy** — the CLI holds its own team-scoped Linear API key

## All local tables dropped

No local SQLite database remains. Everything that was in `.pm/tasks.db` is either moved to Linear or dropped entirely. See `removed-local-analytics.md` for the full inventory of dropped analytics tables, views, triggers, and indexes.

The `.pm/schema.sql` file and `.pm/tasks.db` are both deleted. The `_migrations` table and migration infrastructure are no longer needed.
