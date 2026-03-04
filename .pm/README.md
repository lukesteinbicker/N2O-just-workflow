# .pm/ — Project Management

SQLite-based task tracking system. Tasks are stored in a queryable database
instead of markdown checklists.

## Contents

| File/Directory | Purpose | In Git? |
|---------------|---------|---------|
| `schema.sql` | Database schema (tables, views, triggers) | Yes |
| `tasks.db` | Live task database | No (gitignored) |
| `backlog/` | Unrefined ideas, temporary | Yes |
| `todo/{sprint}/` | Sprint specs and task seeds | Yes |

## Key Design

- **`tasks.sql` seeds** are in git (diffable, reviewable)
- **`tasks.db`** is gitignored (local state, no merge conflicts)
- The database is regenerated from seeds when needed

**Note**: An example sprint is included at `todo/example-sprint/` showing
the expected format. When you run `/pm-agent`, it creates new sprint folders
here automatically.

## Automatic Tracking (Zero Overhead)

The schema includes features that track data automatically via SQLite triggers,
requiring no extra work from agents or engineers.

### Velocity Tracking

| Field | How it's set | Purpose |
|-------|--------------|---------|
| `started_at` | **Trigger**: Auto-set when status changes from 'pending' | When work began |
| `completed_at` | **Trigger**: Auto-set when status changes to 'green' | When work finished |

This enables velocity queries without any manual tracking:
```sql
-- Average minutes per task this sprint
SELECT * FROM sprint_velocity WHERE sprint = 'auth-sprint';

-- Individual task times
SELECT task_num, title, minutes_to_complete FROM velocity_report;
```

### Git Traceability

| Field | How it's set | Purpose |
|-------|--------------|---------|
| `commit_hash` | **Script**: Set by `./scripts/git/commit-task.sh` | Links task → git commit |

The commit script handles this automatically:
```bash
# Stage your changes, then:
./scripts/git/commit-task.sh auth-sprint 5

# This:
# 1. Looks up task title from tasks.db
# 2. Creates conventional commit: "feat(auth-sprint): Create login form (Task #5)"
# 3. Records commit hash back in tasks.db
```

### Data Integrity

CHECK constraints prevent invalid data:
- `status` must be: pending, red, green, blocked
- `type` must be: database, actions, frontend, infra, agent, e2e, docs
- `testing_posture` must be: A, B, C, D, F

**Why automatic?** Adding columns that agents must manually update creates
overhead and drift. Triggers and scripts ensure data is captured consistently
without adding instructions to skill files.

## Schema Overview

- **2 tables**: `tasks`, `task_dependencies`
- **8 views**: `available_tasks`, `blocked_tasks`, `sprint_progress`,
  `needs_pattern_audit`, `needs_verification`, `refactor_audit`,
  `velocity_report`, `sprint_velocity`
- **3 triggers**: auto-set `started_at`, `completed_at`, `updated_at`

See `schema.sql` for full definitions.

## Common Commands
```bash
# Initialize database
sqlite3 .pm/tasks.db < .pm/schema.sql

# Load a sprint's tasks
sqlite3 .pm/tasks.db < .pm/todo/{sprint}/tasks.sql

# See available (unblocked) tasks
sqlite3 .pm/tasks.db "SELECT * FROM available_tasks WHERE sprint = '{sprint}';"

# Check sprint progress
sqlite3 .pm/tasks.db "SELECT * FROM sprint_progress;"

# Reset database
rm .pm/tasks.db && sqlite3 .pm/tasks.db < .pm/schema.sql
```
