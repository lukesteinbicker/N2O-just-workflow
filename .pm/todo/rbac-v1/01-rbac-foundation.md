# RBAC Foundation

> Add role-based access control to the dashboard and API so engineers see only their own data while admins retain full access.

| Field | Value |
|-------|-------|
| Status | Active |
| Owner | whsimonds |
| Last Updated | 2026-03-10 |
| Depends On | None |
| Enables | Student Portal, Manager views, scoped Ask/AI |

---

## Recent Changes

| Date | What changed | Section |
|------|-------------|---------|
| 2026-03-10 | Adversarial review complete (14 decisions resolved). Rewrote schema to Postgres, switched audit to Apollo plugin, added resolver scoping matrix, dev mode bypass, pre-auth validation. | Design, Schema, Open Questions |
| 2026-03-10 | Added audit logging (Apollo plugin + Supabase auth logs), resolved all open questions | Design, Schema, Open Questions |
| 2026-03-10 | Switched to magic links, confirmed engineer nav items | Design, Open Questions |
| 2026-03-10 | Initial spec | All |

---

## Goal

Engineers need access to the N2O dashboard to see their own tasks, time tracking, and activity streams. Today the dashboard is wide open -- every page shows everything to everyone, with identity hard-coded via an env var. We need a minimal auth gate that separates "admin sees everything" from "engineer sees their own stuff," built on plumbing that supports future roles (manager, lead) without rework.

---

## Success Criteria

- An engineer can log in and see only their own tasks, time entries, and stream
- An admin can log in and see the full dashboard as it exists today
- Nav items are filtered by role (engineers don't see Capacity, Ontology, etc.)
- API resolvers enforce scope -- an engineer can't fetch another engineer's data by crafting a query
- Adding a new role later requires only a schema change and resolver updates, not architectural changes

---

## Prior Art

- **Linear**: Workspace roles (Admin, Member, Guest) with per-team permissions. Members see their assigned issues by default, admins see everything. Clean, minimal.
- **GitHub**: Org roles (Owner, Member, Outside collaborator) with repo-level permissions layered on top. Good separation of org-level vs resource-level access.
- **Retool**: App-level permissions with role groups. Overkill for our scale but the "role -> visible apps" pattern is relevant.

We're closest to **Linear's model**: small team, role gates nav visibility, data scoped by identity.

---

## Current State

- **No authentication**: All dashboard pages publicly accessible, no login flow
- **Hard-coded identity**: `NEXT_PUBLIC_N2O_DEVELOPER=whsimonds` env var is the only identity signal
- **No API auth**: Apollo resolvers have no user context, no permission checks
- **Supabase client exists** but is unused (`dashboard/src/lib/supabase.ts`)
- **`developers` table** has a `role` column but it stores engineering specialty (frontend/backend), not access level
- **11 dashboard pages**, all visible in nav, all unrestricted
- **Student portal spec** in backlog defines a fuller permission model (Student/Lead/Admin) that this foundation enables

---

## Ideal State

Every user authenticates with a magic link or OAuth. Their session carries their identity and role. The API resolves queries relative to their scope -- an engineer's queries automatically filter to their own data. The dashboard nav adapts: engineers see a focused portal (tasks, time, stream), admins see the full suite. Adding a new role (manager, lead) means defining its nav items and scope rules, not rebuilding auth.

---

## Design

**We're building the minimum auth plumbing for two roles: admin and engineer.**

**Trade-offs from ideal**:
- No OAuth/SSO -- using Supabase magic link auth. Can add OAuth later.
- No manager role yet -- will be a future increment.
- No granular per-resource permissions -- role is the only gate.
- No cross-team aggregate views -- engineer sees only self, admin sees all.

### Auth Mechanism

**Supabase Auth with magic links.** The Supabase client already exists in the dashboard. We'll add Supabase Auth to handle sessions. A login page gates the app. User enters email, receives a magic link, clicks it, and gets a session. Supabase handles session tokens, refresh, and storage.

Supabase provides built-in email delivery for magic links (no external email infra needed). This is the simplest path for an internal team -- no passwords to manage or reset.

### API Auth Validation

The Apollo Server validates JWTs locally using `jsonwebtoken` + `SUPABASE_JWT_SECRET`. No network roundtrip per request. The context function in `startStandaloneServer`:

1. Reads `Authorization: Bearer <token>` from request headers
2. Calls `jwt.verify(token, SUPABASE_JWT_SECRET)` to validate and decode
3. Extracts `email` from JWT claims
4. Looks up `developers` row by email
5. Populates `Context.currentUser` with `name`, `accessRole`, `email`

If no auth header or invalid token -> `currentUser = null`.

### Dashboard Auth Plumbing

The Apollo Client needs an `authLink` to attach the Supabase session token to every GraphQL request. Using `setContext` from `@apollo/client/link/context`:

- The `setContext` callback calls `supabase.auth.getSession()` **on every request** (not cached at initialization) to ensure token freshness
- Supabase SDK handles auto-refresh transparently
- If `getSession()` returns null, redirect to `/login`
- Link chain: `authLink.concat(httpLink)`

### Pre-Auth Email Validation

Before calling `supabase.auth.signInWithOtp()`, the login page validates that the email exists in the `developers` table. This prevents:
- Orphan Supabase Auth users for unrecognized emails
- Confusing UX where someone receives a magic link but can't access anything

If the email is not in `developers`, show "Email not authorized" immediately.

### Role Model

Two roles for v1, stored as an `access_role` column on the `developers` table:

| Role | Nav items | Data scope |
|------|-----------|------------|
| `admin` | All pages | All data (unchanged from today) |
| `engineer` | Dashboard, Tasks, Time Tracking, Streams, Ask | Own data only |

The `access_role` column is separate from the existing `role` column (which stores engineering specialty like "frontend"). Naming it `access_role` avoids confusion.

### Identity Linking

Engineers authenticate via Supabase Auth (magic link). We link Supabase Auth users to the `developers` table by adding an `email` column to `developers` and matching on it. The flow:

1. User logs in via Supabase Auth -> gets a session with `user.email`
2. Dashboard looks up `developers` row where `email` matches
3. Developer's `access_role` determines nav visibility and API scope
4. If no matching developer row -> access denied (only pre-registered developers can log in)

### API Scope Enforcement

The Apollo Server context gets a `currentUser` object derived from the auth token:

```typescript
interface Context {
  db: Database;
  loaders: Loaders;
  currentUser: {
    name: string;        // developer.name
    accessRole: string;  // 'admin' | 'engineer'
    email: string;
  } | null;
}
```

Resolvers check `currentUser.accessRole`:
- `admin` -> no filtering, same as today
- `engineer` -> filter queries per the resolver scoping matrix below

### Resolver Scoping Matrix

| Resolver / Query | Engineer access | Scoping mechanism | Admin |
|-----------------|----------------|-------------------|-------|
| `tasks` | Own tasks only | Force `owner = currentUser.name`, ignore `owner` arg | All |
| `task` | Own tasks only | Check result `owner === currentUser.name` | All |
| `claimTask` | Own claims only | Verify `args.developer === currentUser.name` | All |
| `assignTask` | Blocked | Admin-only mutation | All |
| `developers` | Own profile only | Filter to `name = currentUser.name` | All |
| `timeTrackingEntries` | Own entries only | Filter by `userId = currentUser.timeTrackingUserId` | All |
| `timeTrackingMembers` | Own entry only | Return only self | All |
| `activityLog` / streams | Own activity only | Force `developer = currentUser.name` | All |
| `conversation` / transcripts | Own sessions only | Filter by task ownership | All |
| Sprint-level aggregates | Blocked | Admin-only (contains all-developer data) | All |
| Velocity/quality analytics | Own metrics only | Force `owner = currentUser.name` | All |
| `sprints`, `projects` (structural) | Allowed | No scoping (structural data, not personal) | All |
| Health metrics | Blocked | Admin-only | All |
| Ask/AI | Scoped context | AI context filtered to engineer's own data | Full context |

### Page and Data Scoping

Nav hiding is a UX convenience, not a security boundary. Each engineer-visible page also has data-level scoping:

- **Dashboard**: Shows only the engineer's own summary (own task counts, recent time entries)
- **Tasks**: `owner` filter forced to self. Cannot see or interact with others' tasks
- **Time Tracking**: Filtered to own `userId`. Member picker hidden for engineers
- **Streams**: Filtered to own activity only
- **Ask**: AI context scoped to engineer's own tasks/streams/time data

### Nav Scoping

The sidebar reads the current user's role and conditionally renders nav items:

```
admin:    Dashboard, Tasks, Streams, Ontology, Capacity, Time Tracking, Team, Velocity, Health, Skills, Activity, Ask
engineer: Dashboard, Tasks, Time Tracking, Streams, Ask
```

"Dashboard" is a landing/home page showing a summary relevant to the user's role. For engineers this is their personal overview (own tasks status, recent time entries, etc.).

### Login Page

A simple `/login` page with email input. The flow:

1. User enters email
2. Page validates email exists in `developers` table (pre-auth check)
3. If not found -> "Email not authorized" error
4. If found -> call `supabase.auth.signInWithOtp({ email })`
5. User receives magic link, clicks it
6. Redirect to `/` (dashboard landing for all roles)

Next.js middleware redirects unauthenticated users to `/login`. Unauthorized routes (engineer visiting `/capacity`) redirect to `/`.

### Development Mode

When Supabase env vars are missing (local development):

- **Middleware**: If Supabase client is `null`, skip auth checks entirely (pass through)
- **Apollo Server**: If no auth header and `N2O_DEV_MODE=true`, default to `currentUser: { name: 'whsimonds', accessRole: 'admin', email: 'dev@local' }`
- This preserves the existing fully-open development workflow

### Audit Logging

Two layers, using existing infrastructure (no third-party tools):

1. **Auth events**: Supabase's built-in `auth.audit_log_entries` table captures login, logout, token refresh automatically. Zero setup.
2. **GraphQL mutations**: An Apollo Server plugin logs mutation names, variables, and `currentUser` identity to the `audit_logs` table. The plugin has full access to `currentUser` context, so `performed_by` is always attributed correctly.

Note: Postgres trigger-based audit was rejected because the `SupabasePool` uses stateless HTTP requests (Management API), which do not support `SET LOCAL` session variables needed for trigger-based user attribution. The Apollo plugin approach is simpler and works with the current architecture.

At ~10 users and ~100 mutations/day, this produces <4MB/month in Postgres. No retention policy needed for v1.

### Known Limitations

- **No RLS**: The `SupabasePool` uses the Management API (admin-level key). All SQL runs with admin privileges regardless of user. Row-Level Security cannot be used as a second enforcement layer. Scope enforcement is application-level only (in resolvers). Any resolver that forgets to check `currentUser.accessRole` is a data leak.
- **Direct SQL unaudited**: Admin direct SQL access via Supabase dashboard is not captured by the Apollo audit plugin. Acceptable at this scale.
- **Zero-admin risk**: If all admins demote themselves via direct SQL, recovery requires direct DB access (`UPDATE developers SET access_role = 'admin' WHERE name = '...'`). Application-level guard will be added when admin UI is built.

**This spec covers**:
- Auth flow (Supabase Auth setup, login page, pre-auth validation)
- Schema change (email + access_role on developers, audit_logs table)
- API auth validation (JWT verification in Apollo Server)
- Dashboard auth plumbing (Apollo authLink)
- Resolver scope enforcement with scoping matrix
- Page-level data scoping
- Conditional nav rendering
- Next.js middleware for route protection
- Development mode bypass
- Audit logging (auth events + GraphQL mutation plugin)

**Out of scope**:
- Manager role -> future spec
- Cross-team aggregate views -> future spec
- Student portal modules (weekly plans, scoring, etc.) -> `student-portal-spec.md`
- Ask/AI scoping -> future spec (will use same `currentUser.accessRole` context)
- User management UI (adding/removing developers) -> admin does this in DB for now
- Admin UI for querying audit logs -> future (SQL queries suffice for now)
- RLS enforcement -> future (requires migrating from Management API to direct Postgres pool)

---

## Schema

All schema changes target **Supabase Postgres** (not local SQLite).

```sql
-- =============================================================================
-- Migration: RBAC Foundation
-- Target: Supabase Postgres
-- =============================================================================

-- 1. Add email column to developers
ALTER TABLE developers ADD COLUMN email TEXT;

-- 2. Seed all developer emails (update with actual emails)
UPDATE developers SET email = 'wiley@example.com' WHERE name = 'whsimonds';
-- UPDATE developers SET email = '...' WHERE name = '...';
-- (repeat for all ~10 developers)

-- 3. Make email NOT NULL + UNIQUE after seeding
ALTER TABLE developers ALTER COLUMN email SET NOT NULL;
ALTER TABLE developers ADD CONSTRAINT developers_email_unique UNIQUE (email);

-- 4. Add access_role column
ALTER TABLE developers ADD COLUMN access_role TEXT DEFAULT 'engineer';
ALTER TABLE developers ADD CONSTRAINT chk_access_role CHECK (access_role IN ('admin', 'engineer'));

-- 5. Seed admin
UPDATE developers SET access_role = 'admin' WHERE name = 'whsimonds';

-- 6. Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,              -- mutation name (e.g., 'claimTask', 'assignTask')
  old_data JSONB,
  new_data JSONB,
  performed_by TEXT,                 -- developer.name (from Apollo context)
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX idx_audit_logs_performed_at ON audit_logs(performed_at);
```

### Data Migration Prerequisite

Before enabling resolver scoping, audit existing `tasks.owner` values:

```sql
-- Find owner values that don't match any developer name
SELECT DISTINCT owner FROM tasks
WHERE owner NOT IN (SELECT name FROM developers)
  AND owner IS NOT NULL;
```

Normalize any mismatches so that `tasks.owner` always matches `developers.name`.

Auth events are handled automatically by Supabase's `auth.audit_log_entries` table (no schema work needed).

---

## Implementation Plan

| # | Task | Done When |
|---|------|-----------|
| 1 | Add email + access_role columns to developers table, seed emails + admin role, create audit_logs table | Migration runs against Supabase Postgres. `SELECT email, access_role FROM developers` returns data for all developers. Admin seeded. audit_logs table exists. |
| 2 | Set up Supabase Auth (magic links) + login page with pre-auth email validation + Next.js middleware + dev mode bypass | Unauthenticated users redirected to /login. Unrecognized emails show "Email not authorized." Magic link login creates session. Dev mode bypasses auth when env vars missing. |
| 3 | Wire auth context into Apollo Server (JWT verification) + Apollo authLink in dashboard + scope-aware resolvers + audit logging plugin | JWT verified via `SUPABASE_JWT_SECRET`. `currentUser` populated in context. Engineer queries return only own data per scoping matrix. `claimTask` restricted to self, `assignTask` admin-only. Mutations logged to audit_logs with performer attribution. |
| 4 | Add role-based nav filtering + page data scoping | Engineer sees 5 nav items (Dashboard, Tasks, Time, Streams, Ask). Admin sees all. Unauthorized routes redirect to `/`. Time tracking hides member picker for engineers. |

---

## Open Questions

1. ~~Password auth vs magic links?~~ **Resolved**: Magic links via Supabase Auth. No passwords to manage.
2. ~~What happens when an engineer navigates directly to `/capacity` (an admin-only page)?~~ **Resolved**: Redirect to `/` (home dashboard).
3. ~~Should the Ask/AI feature be available to engineers in v1?~~ **Resolved**: Yes, Ask is available to engineers (scoped to their own data context).
4. ~~Do we need audit logging of login events for v1?~~ **Resolved**: Yes. Supabase's built-in `auth.audit_log_entries` for auth events + Apollo Server plugin for mutation logging.
5. ~~How does Apollo Server validate the Supabase JWT?~~ **Resolved**: Local JWT verification with `jsonwebtoken` + `SUPABASE_JWT_SECRET`. No network roundtrip.
6. ~~How does the dashboard attach the auth token to GraphQL requests?~~ **Resolved**: Apollo `authLink` via `setContext` calling `supabase.auth.getSession()` per request. Handles token refresh automatically.
7. ~~What if someone enters an unrecognized email on login?~~ **Resolved**: Pre-auth validation checks email against `developers` table before calling `signInWithOtp()`. Shows "Email not authorized."
8. ~~Audit trigger vs Apollo plugin?~~ **Resolved**: Apollo plugin only. Postgres `SET LOCAL` session variables are incompatible with the stateless `SupabasePool` (Management API). Plugin has `currentUser` context for attribution.
9. ~~Zero-admin risk?~~ **Resolved**: Document as known risk. Application-level guard added when admin UI is built.
10. ~~Local dev without Supabase credentials?~~ **Resolved**: Dev mode bypass. Middleware skips auth when Supabase client is null. Apollo defaults to admin user when `N2O_DEV_MODE=true`.

---

## References

- Student portal spec: `.pm/backlog/student-portal/student-portal-spec.md`
- Current sidebar: `dashboard/src/components/layout/sidebar.tsx`
- Supabase client: `dashboard/src/lib/supabase.ts`
- Apollo Server setup: `platform/src/index.ts`
- Apollo context: `platform/src/context.ts`
- Developer table: `.pm/schema.sql` (line 76)
