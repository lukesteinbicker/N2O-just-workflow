# Phase 6: Credential Strategy — Connected Accounts
> Users connect GitHub accounts and configure their Anthropic API key via N2O. The API stores credentials server-side. No tokens in job payloads or local files.

## Why

The original design had the CLI storing encrypted tokens locally, embedding them in Redis job payloads, and the Fly Machine decrypting them. This is fragile:
- Tokens travel through Redis (attack surface)
- CLI manages encryption keys derived from N2O credentials (complex)
- Token renewal requires re-submitting to every machine
- Multiple local files to manage per repo (`~/.config/n2o/credentials/<repo-slug>/`)

The connected accounts model is simpler: the API is the credential store. Tokens never leave the server except over authenticated HTTPS to Fly Machines at job start.

> **Why not OAuth/Max subscription?** Anthropic blocked OAuth tokens (`CLAUDE_CODE_OAUTH_TOKEN`) for all programmatic/third-party use in February 2026. The `ANTHROPIC_API_KEY` (pay-per-token) is the only compliant authentication method for automation. If Anthropic reverses this policy, the architecture can switch to OAuth with minimal changes.

## Data model

```
integrations/
  ai/
    anthropic       — Anthropic API key (project-level, pay-per-token)
  git/
    github          — GitHub fine-grained PAT (per-user)
```

Two scoping levels:
- **Project-level**: `integrations/ai/anthropic` — one API key per project, shared across all users. Stored by the project admin.
- **Per-user**: `integrations/git/github` — each user connects their own GitHub account. GitHub tokens may be per-repo (fine-grained PATs are repo-scoped) or per-org depending on scope.

### Integration record

```
project_id:       UUID (for project-level integrations)
user_id:          UUID (for per-user integrations, NULL for project-level)
provider:         "anthropic" | "github"
category:         "ai" | "git"
scope_level:      "project" | "user"
token:            encrypted string (server-side encryption at rest)
token_prefix:     first 8 chars (for display: "sk-ant-ap...")
expires_at:       timestamp (NULL if no expiry — API keys don't expire)
scopes:           string[] (e.g., ["contents:write", "pull-requests:write"])
repo_scope:       string (e.g., "my-org/my-app") — NULL for account-wide tokens
connected_at:     timestamp
last_used_at:     timestamp
status:           "active" | "revoked"
```

## CLI flow

### Configuring Anthropic API key

```
$ n2o auth anthropic
  Configure Anthropic API key for project my-app...

  → Paste your API key (from console.anthropic.com): sk-ant-api03-...
  → Validating key...

  Storing with N2O API...
  ✓ Anthropic API key configured for project my-app (sk-ant-ap...)
```

Under the hood:
1. CLI prompts for API key (paste, not browser flow)
2. CLI sends `POST /api/projects/:id/integrations/ai/anthropic` with the key
3. API validates the key (calls Anthropic API to check it works), encrypts, and stores it
4. CLI confirms success — no local storage needed
5. This is a **project-level** operation — any project member with admin role can set it

### Connecting GitHub

```
$ n2o auth github
  Connecting your GitHub account to N2O...

  → Detected `gh` CLI (authenticated as @lukes)
  → Extracted token via `gh auth token`

  Storing with N2O API...
  ✓ GitHub connected (repo: my-org/my-app, expires 2026-12-01)
```

If `gh` is not authenticated:
```
  → GitHub CLI not authenticated. Running `gh auth login`...
    (browser opens, user authenticates)
  → Token received

  Storing with N2O API...
  ✓ GitHub connected
```

The CLI determines the required scopes (`contents:write`, `pull-requests:write`, `issues:write`) and validates the token has them before sending to the API.

### Checking status

```
$ n2o auth status

  ╭─ Connected Accounts ───────────────────────────╮
  │                                                 │
  │  AI                                             │
  │  ✓ Anthropic  configured (sk-ant-ap...)         │
  │               project: my-app (API pricing)     │
  │                                                 │
  │  Git                                            │
  │  ✓ GitHub     connected (expires 2026-12-01)    │
  │               repo: my-org/my-app, @lukes       │
  │                                                 │
  │  N2O                                            │
  │  ✓ Logged in as luke@example.com                │
  ╰─────────────────────────────────────────────────╯
```

### Disconnecting

```
$ n2o auth disconnect anthropic
  ✓ Anthropic API key removed for project my-app. Async jobs will not work until reconfigured.

$ n2o auth disconnect github
  ✓ GitHub disconnected for my-org/my-app.
```

## Non-blocking warnings

Same as before, but the CLI checks integration status via the API (cached locally with short TTL to keep it <50ms):

```
$ n2o task list
  ID   TITLE                    STATUS      SPRINT
  1    Add auth middleware       in_progress auth
  ...

  ⚠ Claude: not connected — run `n2o auth claude`
  ⚠ GitHub: token expires in 5 days — run `n2o auth github`
```

The CLI caches the result of `GET /api/me/integrations` locally with a 5-minute TTL. The cache file is lightweight (just provider + status + expiry). On cache miss, the CLI makes one API call. On cache hit, the check is <1ms.

## How Fly Machines get credentials

The `ANTHROPIC_API_KEY` is set as a Fly Machine secret (managed by the N2O API when the machine is created). It doesn't change per-job — it's project-level.

At job start, the runner pulls the **per-user GitHub token** from the API:

```
GET /api/me/integrations/git/github/token
Authorization: Bearer <N2O_API_KEY>
X-On-Behalf-Of: <user_id from job record>

→ { "token": "ghp_...", "expires_at": "2026-12-01T...", "scopes": [...] }
```

**Access control**: The `/token` endpoints return decrypted tokens only when called with:
- An `N2O_API_KEY` (machine auth, not user bearer token)
- An `X-On-Behalf-Of` header specifying which user's token to retrieve
- The API key must belong to a project that the user is a member of

A user's bearer token cannot call `/token` — this prevents a compromised CLI from extracting raw tokens. Only server-side machines with API keys can retrieve decrypted credentials.

The runner then:
1. `ANTHROPIC_API_KEY` is already set (Fly Machine secret)
2. Configures git credential helper: `git config credential.helper '!echo password=<github_token>'`
3. Sets `GITHUB_TOKEN` env var for `gh` CLI

> **Note**: The Fly Machine is associated with a **robot** record (see phase 6 async spec, `robot` table). The `X-On-Behalf-Of` header in the `/token` request uses the robot's `owner_id` (to pull the human's GitHub token). Events generated on the machine are scoped to the robot, not the human user.

## Job payload (simplified)

With connected accounts, the job payload in Redis no longer contains tokens:

```json
{
  "job_id": "abc123",
  "user_id": "user-uuid",
  "project_id": "project-uuid",
  "repo": "my-org/my-app",
  "ref": "feature/auth-middleware",
  "pr": 42,
  "prompt": "Review PR #42 for security issues...",
  "timeout": 1800,
  "max_turns": 200,
  "submitted_at": "2026-03-17T12:00:00Z"
}
```

No tokens. The `user_id` is a reference — the machine uses it to pull the user's GitHub token from the API at job start. The `ANTHROPIC_API_KEY` is already a Fly Machine secret.

## Token renewal

- **Anthropic API key**: Doesn't expire. If rotated, project admin runs `n2o auth anthropic` again and the N2O API updates the Fly Machine secret.
- **GitHub token**: May expire (fine-grained PATs have configurable expiry). When a user runs `n2o auth github` again, the new token replaces the old one in the API. The next job automatically gets the fresh token — no need to update machines individually.

The CLI proactively warns about expiring GitHub tokens (from the cached integration status). The user renews at their convenience.

## Future: additional integrations

The `integrations/ai/` and `integrations/git/` categories are extensible:

| Category | Provider | When |
|----------|----------|------|
| `ai/anthropic` | Anthropic API key (pay-per-token) | Now |
| `git/github` | GitHub (fine-grained PAT) | Now |
| `git/gitlab` | GitLab (personal access token) | When GitLab support is added |
| `ai/other` | Other AI providers | If Agent SDK supports them |

The API, CLI, and runner all use the same `integrations/{category}/{provider}` pattern. Adding a new provider means adding a new auth flow in the CLI and a new credential type in the API — no runner changes needed.

## API endpoints

```
GET    /api/me/integrations                              — List all connected accounts with status
POST   /api/projects/:id/integrations/ai/anthropic       — Store Anthropic API key (project-level, admin only)
POST   /api/me/integrations/git/github                   — Connect GitHub (store PAT, per-user)
DELETE /api/projects/:id/integrations/ai/anthropic       — Remove Anthropic API key (project-level, admin only)
DELETE /api/me/integrations/git/github                   — Disconnect GitHub (per-user)

GET    /api/me/integrations/git/github/token             — Return decrypted GitHub token (machine auth only)
```

All endpoints require authentication:
- `GET/POST/DELETE /api/me/integrations/*` — user bearer token (from phase 4 login)
- `POST/DELETE /api/projects/:id/integrations/*` — user bearer token with project admin role
- `GET /api/me/integrations/*/token` — `N2O_API_KEY` + `X-On-Behalf-Of` header (machine auth only)

## Interaction with phase 6 spec

This doc replaces the following sections in `n2o-cleanup-phase6-async.md`:
- **Token storage** section (no more local `~/.config/n2o/credentials/`)
- **Claude Code auth** section (now `ANTHROPIC_API_KEY` as Fly Machine secret, not OAuth)
- **GitHub: fine-grained token** section (simplified — stored via API)

The auth warnings, `n2o auth` commands, and blocking behavior on `n2o async run` all work the same way — the only change is that the CLI checks integration status via the API instead of reading local files.

## Steps

1. Design Postgres schema for integration records (encrypted token storage, project-level + per-user)
2. Implement `POST /api/projects/:id/integrations/ai/anthropic` — validate API key (call Anthropic API), encrypt, store as project-level secret. Update Fly Machine secrets.
3. Implement `POST /api/me/integrations/git/github` — validate scopes, encrypt, store per-user
4. Implement `GET /api/me/integrations` — list connected accounts with status/expiry (no raw tokens)
5. Implement `DELETE` endpoints — revoke/remove integrations
6. Implement `GET /api/me/integrations/git/github/token` — machine-auth-only, returns decrypted token
7. Implement `n2o auth anthropic` — prompt for API key, POST to API
8. Implement `n2o auth github` — extract or provision GitHub token, POST to API
9. Implement `n2o auth status` — fetch from API, display styled dashboard
10. Implement integration status caching in CLI (5-minute TTL, local file)
11. Update runner to pull GitHub token from API at job start (`ANTHROPIC_API_KEY` is already a Fly Machine secret)

## Verification

- `n2o auth anthropic` sends API key to N2O API, API validates + encrypts + stores, updates Fly Machine secrets, CLI shows "configured"
- `n2o auth github` sends token to API, API stores encrypted, CLI shows "connected"
- `n2o auth status` shows all connected accounts fetched from API
- `n2o auth disconnect anthropic` removes the API key, warning reappears on next command
- GitHub token expiry warnings work via cached API status (cache refreshes every 5 minutes)
- `ANTHROPIC_API_KEY` is a Fly Machine secret (set when machine is created/updated)
- Fly Machine pulls GitHub token from API at job start — git credential helper works for private repos
- User bearer token cannot access `/token` endpoints (403)
- Machine `N2O_API_KEY` can access `/token` endpoints with `X-On-Behalf-Of`
- API key rotation: admin runs `n2o auth anthropic` again → Fly Machine secret updated
- No tokens in Redis job payloads — only user_id and project_id references
