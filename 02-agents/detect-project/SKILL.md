---
name: detect-project
description: "Scan the codebase and populate empty sections in CLAUDE.md. Run this after n2o init or whenever the project structure changes. Triggers: detect project, scan project, fill in CLAUDE, update project context, populate CLAUDE.md."
---

# Detect Project

Scan the codebase and fill in empty sections of `CLAUDE.md`. This replaces hardcoded detection — you have the full intelligence of an agent to understand project structure.

## When to Run

- After `n2o init` (CLAUDE.md will have `<!-- UNFILLED -->` markers)
- When project structure changes (new directories, new database, new auth)
- When the user asks to update project context

## How It Works

1. Read `CLAUDE.md` and find sections with `<!-- UNFILLED -->` markers
2. Explore the codebase to fill each section
3. Replace the marker with `<!-- FILLED -->` after populating
4. For anything not found, write "N/A — not yet added" so this skill doesn't re-trigger
5. Present changes to the user for approval before writing

## Step-by-Step

### 1. Check What Needs Filling

Read `CLAUDE.md`. Look for `<!-- UNFILLED:` comments. If none exist, tell the user everything is already filled in and ask if they want to re-scan any specific section.

### 2. Detect Project Structure

Explore the codebase to find where code lives. Don't guess from directory names alone — actually look at files.

**For each row in the Project Structure table:**

| Type | How to Detect |
|------|---------------|
| UI Components | Find `.tsx`/`.jsx` files that export React components. Look for directories named `components`, `ui`, or containing mostly component files. Check for component libraries in monorepo packages. |
| Hooks | Find files with `use*.ts` pattern or directories named `hooks`. |
| Server Actions | Find files with `"use server"` directive or directories named `actions`. |
| API Routes | Find `route.ts`/`route.js` files in `app/api/` or handler files in `pages/api/`. |
| Pages / Routes | Find `page.tsx`/`page.jsx` (App Router) or files in `pages/` (Pages Router). Also check for `routes/` (Remix, React Router). |
| Shared Utilities | Find `lib/`, `utils/`, `shared/`, `helpers/` directories with non-component code. |
| Types / Interfaces | Find `types/`, `@types/`, or files with mostly type exports. |

**Use Glob and Grep tools** to search efficiently. For example:
```
Glob: **/*.tsx → find all React files
Grep: "use server" → find server actions
Grep: "export (function|const) use[A-Z]" → find hooks
```

**For monorepos**: Check all packages, not just the root. Note which package each path belongs to.

**Write the actual paths you find**, not generic descriptions. Example:
```
| UI Components | `src/components/`, `packages/ui/src/` |
```

If a type doesn't exist in the project, write: `N/A — not yet added`

### 3. Detect Database

**Check for:**
- `.env` / `.env.local` — look for `DATABASE_URL` or similar vars (DO NOT output the actual connection string — just describe it)
- `prisma/schema.prisma` — read the datasource block for db type
- `drizzle.config.*` — read for connection info
- `package.json` — check for `pg`, `mysql2`, `better-sqlite3`, `@prisma/client`, `drizzle-orm`, etc.
- Migration directories (`prisma/migrations/`, `drizzle/`, `migrations/`)

**Fill in:**
- **Type**: PostgreSQL, MySQL, SQLite, etc. Include provider if detectable (Neon, Supabase, PlanetScale, etc.)
- **Connection**: Describe where the connection string lives (e.g., "See `DATABASE_URL` in `.env.local`") — never output actual credentials
- **Environment Variable**: The variable name (e.g., `DATABASE_URL`)
- **Migration Command**: Detected from ORM config or `package.json` scripts
- **Migration Status**: How to check migration status

If no database is found, write: "No database detected — add details here when one is set up"

### 4. Detect Architecture

Briefly describe:
- Is this a monorepo or single package? (check for `packages/`, `apps/`, workspaces in package.json)
- Framework: Next.js, Remix, Vite, etc. (check dependencies and config files)
- Rendering strategy: SSR, SSG, SPA, RSC (check Next.js config, `"use client"` usage)
- Any notable patterns visible in the code structure

Keep it to 3-5 bullet points. This section helps agents understand how pieces connect.

### 5. Detect Conventions

| Convention | How to Detect |
|------------|---------------|
| Styling | Check for `tailwind.config.*`, CSS Modules (`*.module.css`), styled-components, Emotion, vanilla-extract, or CSS-in-JS patterns in components |
| State Management | Check `package.json` for zustand, redux, jotai, recoil, mobx. Also check for React Context patterns. |
| Auth | Check for `next-auth`, `better-auth`, `@clerk/*`, `@supabase/auth-helpers`, `firebase/auth`, or custom auth in code |

If not found, write: "N/A — not yet added"

### 6. Detect External Services

Search for:
- API base URLs in env files or config
- SDK imports (Stripe, Resend, OpenAI, etc.)
- MCP configurations (`.mcp.json`)
- Third-party service setup files

List what you find. If nothing, write: "No external services detected — add details here as integrations are added"

### 7. Present and Write

**Before writing anything**, present a summary to the user:

```
Detected project context:

Project Structure:
  - Components: src/components/, packages/ui/src/
  - Hooks: src/hooks/
  - API Routes: src/app/api/
  - Pages: src/app/
  - Utils: src/lib/
  - Types: N/A — not yet added

Database: PostgreSQL (Neon) via Prisma
  - Env var: DATABASE_URL
  - Migrations: npx prisma migrate dev

Architecture: Next.js 15 monorepo (App Router, RSC)

Conventions:
  - Styling: Tailwind CSS
  - State: Zustand
  - Auth: BetterAuth

External Services: Stripe, Resend

Shall I update CLAUDE.md with these findings?
```

**Only write after user confirms.**

When writing, replace `<!-- UNFILLED: ... -->` with `<!-- FILLED -->` for each section you update.

## Re-running

If the user runs `/detect-project` and all sections have `<!-- FILLED -->` markers:
- Tell the user everything is already populated
- Ask if they want to re-scan a specific section (e.g., "Re-scan project structure?")
- If yes, re-explore that section and update

To force a full re-scan, the user can change `<!-- FILLED -->` back to `<!-- UNFILLED -->` in CLAUDE.md, or just ask: "re-scan everything".

---

**Status**: ACTIVE
**Output**: Updated `CLAUDE.md` with project-specific context
**Depends on**: `CLAUDE.md` existing (created by `n2o init`)
