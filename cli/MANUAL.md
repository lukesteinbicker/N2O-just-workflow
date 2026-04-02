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
n2o init           # Authenticate + scaffold project in current directory
n2o task available --sprint my-sprint
n2o task claim --sprint my-sprint --task 1
```

## Global Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--quiet` | `-q` | Suppress non-essential output |
| `--version` | `-v` | Print CLI version |

---

## Commands

### n2o init

Initialize a new N2O project. Authenticates if needed, downloads framework content from the API, writes skills and schema, and initializes the task database.

```
n2o init [project-path]
```

If `project-path` is omitted, uses the current directory. Prompts for login on first run, then prompts for developer name if not already configured.

**Creates:**
- `.claude/skills/` — all workflow skills
- `.pm/config.json` — project configuration
- `.pm/schema.sql` — database schema
- `.pm/tasks.db` — SQLite task database
- `CLAUDE.md` — AI agent instructions

---

### n2o login

Authenticate with the N2O platform using the device authorization flow (RFC 8628). Opens a browser for verification.

```
n2o login
```

Credentials are saved to `~/.n2o/credentials.json`.

---

### n2o logout

Clear stored credentials.

```
n2o logout
```

---

### n2o sync

Update framework files in an existing project from the API.

```
n2o sync [project-path]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--dry-run` | `false` | Show what would change without writing |
| `--force` | `false` | Overwrite even if project files are newer |
| `--only` | | Sync only a category: `skills` or `schema` |

---

### n2o check

Verify project health: database exists, schema tables present, skills installed, config valid, CLI on PATH.

```
n2o check [project-path]
```

---

### n2o status

Show CLI status: authentication state, pending unsynced events, last sync time.

```
n2o status
```

---

### n2o stats

Show sprint progress and available tasks.

```
n2o stats
```

| Flag | Default | Description |
|------|---------|-------------|
| `--json` | `false` | Output as JSON |
| `--sprint` | | Filter by sprint name |

---

### n2o pin

Pin a project to a specific N2O framework version.

```
n2o pin <version>
```

---

### n2o commit

Create a conventional commit for a completed task. Looks up the task title and type from the database, generates the commit message with trailers.

```
n2o commit --sprint <name> --task <num>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--sprint` | Yes | Sprint name |
| `--task` | Yes | Task number |

**Commit format:**
```
{type}({sprint}): {title}

Sprint: {sprint}
Task: {task_num}
Done-when: {done_when}
```

Type mapping: `docs`→docs, `infra`→chore, `e2e`→test, default→feat.

---

### n2o task

Task management subcommands. All operate on the local `.pm/tasks.db`.

#### n2o task list

```
n2o task list --sprint <name> [--status <status>]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--sprint` | Yes | Sprint name |
| `--status` | No | Filter by status (pending, red, green, blocked) |

#### n2o task available

Show unclaimed, unblocked tasks ready for work.

```
n2o task available --sprint <name>
```

#### n2o task claim

Claim a task (sets owner).

```
n2o task claim --sprint <name> --task <num>
```

#### n2o task status

Update a task's status.

```
n2o task status --sprint <name> --task <num> --status <status>
```

Valid statuses: `pending`, `red`, `green`, `blocked`.

Valid transitions: pending→red, pending→blocked, red→green, red→blocked, green→blocked, blocked→pending.

#### n2o task block

Mark a task as blocked with a reason.

```
n2o task block --sprint <name> --task <num> --reason <text>
```

#### n2o task unblock

Return a blocked task to pending.

```
n2o task unblock --sprint <name> --task <num>
```

#### n2o task commit

Record a git commit hash against a task.

```
n2o task commit --sprint <name> --task <num> --hash <sha>
```

#### n2o task create

Create a new task in a sprint.

```
n2o task create --sprint <name> --title <text> [--type <type>] [--done-when <text>] [--description <text>]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--sprint` | Yes | Sprint name |
| `--title` | Yes | Task title |
| `--type` | No | Task type: database, actions, frontend, infra, agent, e2e, docs |
| `--done-when` | No | Completion criteria |
| `--description` | No | Task description |

#### n2o task dep add

Add a dependency between tasks (same sprint).

```
n2o task dep add --sprint <name> --task <num> --depends-on <num>
```

#### n2o task verify

Mark a task as verified (PM confirmation).

```
n2o task verify --sprint <name> --task <num>
```

---

### n2o sprint

Sprint management subcommands.

#### n2o sprint create

```
n2o sprint create --name <name> [--goal <text>]
```

#### n2o sprint archive

Archive a sprint by deleting all verified tasks.

```
n2o sprint archive --name <name>
```

---

### n2o apikey

API key management subcommands. Requires authentication.

#### n2o apikey create

```
n2o apikey create --name <name>
```

#### n2o apikey list

```
n2o apikey list
```

#### n2o apikey revoke

```
n2o apikey revoke --name <name>
```

---

## API Routes

All routes require `Authorization: Bearer <token>` header.

### Framework

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/framework/latest` | Download latest framework content (skills, schema, templates) |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/device-authorization/authorize` | Request device code for OAuth login |
| POST | `/api/auth/device-authorization/verify-device` | Poll for device authorization status |
| POST | `/api/auth/api-key/create` | Create API key. Body: `{"name": "", "scope": "project"}` |
| GET | `/api/auth/api-key/list` | List API keys |
| POST | `/api/auth/api-key/revoke` | Revoke API key. Body: `{"name": ""}` |

### Project Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/{id}/events` | Push events. Body: `{"events": [...]}` |
| GET | `/api/projects/{id}/events` | Pull events. Params: `user`, `since`, `limit` |
| GET | `/api/projects/{id}/state` | Pull full state snapshot. Params: `user` |

---

## Configuration

### Global (`~/.n2o/config.json`)

```json
{
  "developer_name": "luke"
}
```

### Credentials (`~/.n2o/credentials.json`)

```json
{
  "token": "...",
  "user_id": "...",
  "org_id": "...",
  "app_url": "https://api.n2o.com",
  "expires_at": "2026-05-01T00:00:00Z"
}
```

### Project (`.pm/config.json`)

```json
{
  "n2o_version": "1.0.0",
  "project_name": "",
  "commands": {
    "test": "",
    "typecheck": "",
    "lint": "",
    "build": ""
  },
  "pm_tool": null,
  "auto_invoke_skills": true,
  "disabled_skills": [],
  "claim_tasks": true,
  "team": []
}
```

## Building

```bash
cd cli
make build          # Build for current platform
make cross          # Build for macOS (arm64, amd64) + Windows (amd64)
make install        # Install to $GOPATH/bin
make clean          # Remove build artifacts
```
