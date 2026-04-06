# N2O Remote API — Schema & Routes
> Postgres schema for the remote event log + API route reference for CLI sync.

## Postgres Schema

### events (append-only event log)

The canonical source of truth. CLI pushes events here. CDC streams to Tinybird for analytics.

```sql
CREATE TABLE events (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL UNIQUE,           -- client-generated, for idempotency
    event_type      TEXT NOT NULL,                   -- task.created, task.claimed, etc.
    user_id         UUID NOT NULL REFERENCES "user"(id),
    project_id      UUID NOT NULL REFERENCES project(id),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Denormalized task context (not FK — events are self-contained)
    sprint          TEXT,
    task_num        INTEGER,

    -- Typed payload columns (destructured from CLI JSON)
    payload         JSONB NOT NULL,                  -- full event payload

    -- Specific fields extracted for indexing/querying
    old_status      TEXT,                            -- for task.status_changed
    new_status      TEXT,
    owner           TEXT,                            -- for task.claimed
    commit_hash     TEXT,                            -- for task.committed
    blocked_reason  TEXT,                            -- for task.blocked
    title           TEXT,                            -- for task.created
    done_when       TEXT,                            -- for task.created
    task_type       TEXT                             -- for task.created
);

-- Scoped queries for pull (most common access pattern)
CREATE INDEX idx_events_user_project ON events(user_id, project_id);

-- Append-only time-series: BRIN is 500x smaller than B-tree
CREATE INDEX idx_events_created_brin ON events USING BRIN(created_at);

-- Idempotency checks on push
-- (covered by UNIQUE on event_id)

-- Time-based partitioning (daily, 30-day retention via pg_partman)
-- CREATE TABLE events PARTITION BY RANGE (created_at);
-- SELECT partman.create_parent('public.events', 'created_at', 'native', 'daily');
-- UPDATE partman.part_config SET retention = '30 days' WHERE parent_table = 'public.events';
```

### Event Types

| Event Type | When | Key Payload Fields |
|-----------|------|-------------------|
| `task.created` | `n2o task create` | sprint, task_num, title, type, done_when, description |
| `task.claimed` | `n2o task claim` | sprint, task_num, owner, session_id |
| `task.status_changed` | `n2o task status` | sprint, task_num, old_status, new_status |
| `task.blocked` | `n2o task block` | sprint, task_num, blocked_reason |
| `task.unblocked` | `n2o task unblock` | sprint, task_num |
| `task.committed` | `n2o task commit` | sprint, task_num, commit_hash, lines_added, lines_removed |
| `task.verified` | `n2o task verify` | sprint, task_num |
| `dep.created` | `n2o task dep add` | sprint, task_num, depends_on_sprint, depends_on_task |
| `sprint.created` | `n2o sprint create` | sprint, goal |
| `sprint.archived` | `n2o sprint archive` | sprint |

### project

```sql
CREATE TABLE project (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,                   -- e.g., "my-app"
    repo            TEXT NOT NULL UNIQUE,             -- e.g., "github.com/org/repo"
    organization_id TEXT,                             -- better-auth org ID
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### project_member

```sql
CREATE TABLE project_member (
    project_id  UUID NOT NULL REFERENCES project(id),
    user_id     UUID NOT NULL REFERENCES "user"(id),
    role        TEXT NOT NULL DEFAULT 'member',      -- admin, member
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);
```

### integration (phase 6 — connected accounts)

```sql
CREATE TABLE integration (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES project(id),     -- NULL for user-scoped
    user_id         UUID REFERENCES "user"(id),       -- NULL for project-scoped
    provider        TEXT NOT NULL,                    -- anthropic, github
    category        TEXT NOT NULL,                    -- ai, git
    scope_level     TEXT NOT NULL,                    -- project, user
    token           TEXT NOT NULL,                    -- encrypted at rest
    token_prefix    TEXT,                             -- first 8 chars for display
    expires_at      TIMESTAMPTZ,
    scopes          TEXT[],                           -- e.g., {contents:write, pull-requests:write}
    repo_scope      TEXT,                             -- e.g., "my-org/my-app"
    connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'active',   -- active, revoked

    CHECK (scope_level IN ('project', 'user')),
    CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX idx_integration_project ON integration(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_integration_user ON integration(user_id) WHERE user_id IS NOT NULL;
```

### Better-auth managed tables

These are created automatically by better-auth plugins:

```
user            — user accounts (email, name, image, etc.)
session         — active sessions (bearer tokens)
account         — OAuth provider accounts
verification    — email verification tokens
organization    — org records
member          — org membership
invitation      — org invites
deviceCode      — device flow pending authorizations (RFC 8628)
apiKey          — long-lived API keys (project-scoped)
```

---

## API Routes

### Auth (provided by better-auth — automatic)

```
POST   /api/auth/device-authorization/authorize
       → Issue device_code + user_code for CLI login
       Request:  { client_id: "n2o-cli" }
       Response: { device_code, user_code, verification_uri, interval, expires_in }

POST   /api/auth/device-authorization/verify-device
       → Exchange device_code for bearer token (CLI polls this)
       Request:  { device_code }
       Response: { token, user: { id, name, email } }
       Errors:   authorization_pending, slow_down, expired_token

GET    /api/auth/get-session
       → Validate bearer token, return user info
       Auth:     Bearer <token>
       Response: { user: { id, name, email }, session: { ... } }

POST   /api/auth/api-key/create
       → Create project-scoped API key
       Auth:     Bearer <token>
       Request:  { name, metadata: { project_id } }
       Response: { key, id, name }

GET    /api/auth/api-key/list
       → List API keys for authenticated user
       Auth:     Bearer <token>
       Response: { keys: [{ id, name, created_at, last_used_at }] }

POST   /api/auth/api-key/revoke
       → Revoke an API key
       Auth:     Bearer <token>
       Request:  { id }
```

### Event sync (custom — reads/writes Postgres)

```
POST   /api/projects/:id/events
       → Accept events from CLI
       Auth:     Bearer <token> or API key
       Request:  { events: [{ event_id, event_type, timestamp, payload }] }
       Response: { accepted: N, rejected: [{ event_id, reason }] }
       Notes:    Tags events with user_id from session.
                 Duplicate event_id → accepted (idempotent, no re-insert).
                 INSERTs to Postgres. CDC streams to Tinybird async.

GET    /api/projects/:id/events
       → Pull events for authenticated user
       Auth:     Bearer <token>
       Query:    ?user=me&since=<event_id>&limit=1000
       Response: { events: [...], cursor: "last_event_id", has_more: bool }
       Notes:    Filtered by (user_id, project_id). Paginated.

GET    /api/projects/:id/state
       → Pull materialized task state
       Auth:     Bearer <token>
       Query:    ?user=me
       Response: { tasks: [...], dependencies: [...], as_of_event: "event_id" }
       Notes:    Used by `n2o sync --rebuild`. State derived from events.

GET    /api/projects/:id/me
       → Developer profile for this project
       Auth:     Bearer <token>
       Response: { user_id, name, role, ... }

GET    /api/projects/:id/config
       → Project configuration
       Auth:     Bearer <token>
       Response: { project_id, name, repo, ... }
```

### Connected accounts (phase 6)

```
GET    /api/me/integrations
       → List all connected accounts with status
       Auth:     Bearer <token>
       Response: { integrations: [{ provider, category, status, expires_at, token_prefix }] }

POST   /api/projects/:id/integrations/ai/anthropic
       → Store Anthropic API key (project-level, admin only)
       Auth:     Bearer <token> (must be project admin)
       Request:  { api_key }
       Response: { status: "configured", token_prefix }
       Notes:    Validates key against Anthropic API. Encrypts and stores.

POST   /api/me/integrations/git/github
       → Connect GitHub (store PAT, per-user)
       Auth:     Bearer <token>
       Request:  { token, scopes }
       Response: { status: "connected", expires_at }

DELETE /api/projects/:id/integrations/ai/anthropic
       → Remove Anthropic API key
       Auth:     Bearer <token> (must be project admin)

DELETE /api/me/integrations/git/github
       → Disconnect GitHub
       Auth:     Bearer <token>

GET    /api/me/integrations/git/github/token
       → Return decrypted GitHub token (machine auth only)
       Auth:     N2O_API_KEY + X-On-Behalf-Of header
       Response: { token, expires_at, scopes }
       Notes:    User bearer tokens cannot access this endpoint (403).
```

### Async jobs (phase 6 — GitHub Actions approach for v1)

v1 uses GitHub Actions via `repository_dispatch`. No server-side job management needed.

```
CLI runs: gh api repos/{owner}/{repo}/dispatches \
  -f event_type=n2o-async \
  -f client_payload='{"prompt":"..."}'

CLI lists: gh run list --workflow=n2o-async.yml
CLI cancels: gh run cancel <run-id>
```

Full Fly Machines approach (future):
```
POST   /api/projects/:id/async/jobs          — Submit async job
GET    /api/projects/:id/async/jobs          — List jobs
GET    /api/projects/:id/async/jobs/:id      — Job details
DELETE /api/projects/:id/async/jobs/:id      — Cancel job
POST   /api/projects/:id/async/jobs/:id/rerun — Rerun failed job
GET    /api/projects/:id/async/jobs/:id/logs — Stream job logs
GET    /api/projects/:id/async/status        — Dashboard aggregate
```

### Analytics (phase 4b — deferred, Tinybird)

Frontend calls Tinybird published endpoints directly with JWT:

```
GET    /v0/pipes/sprint_progress.json?project_id=X
GET    /v0/pipes/team_velocity.json?org_id=X&since=DATE
GET    /v0/pipes/estimation_accuracy.json?project_id=X
GET    /v0/pipes/activity_feed.json?project_id=X&limit=50
Auth:  Bearer <tinybird_jwt>
```

JWT minted by the app:
```
POST   /api/tinybird/jwt
       → Mint Tinybird JWT for authenticated frontend user
       Auth:     Bearer <token>
       Response: { jwt, expires_in }
       Notes:    Includes org_id in fixed_params for row-level security.
```

---

## Local Schema Additions (`.pm/workflow.db`)

The `event` table in local SQLite mirrors the push format:

```sql
CREATE TABLE event (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    event_type      TEXT NOT NULL,
    timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id         TEXT,                    -- NULL if logged out
    project_id      TEXT,
    payload         TEXT NOT NULL,           -- JSON blob
    synced_at       DATETIME,               -- NULL = not yet synced
    sync_attempts   INTEGER DEFAULT 0,
    sync_error      TEXT
);
```

Events with `user_id = NULL` are local-only (never pushed). Events with `synced_at IS NULL` are queued for push on next `n2o sync` or lazy flush.
