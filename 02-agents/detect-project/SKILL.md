---
name: detect-project
version: "1.0.0"
description: "Use when the user wants to scan the codebase and fill in CLAUDE.md project context. Triggers: detect project, scan project, fill in CLAUDE, update project context, populate CLAUDE.md, scan codebase, what's in this project, set up project context. Run this after n2o init or whenever the project structure changes."
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

### 8. Detect UI Conventions (Optional)

After filling in the core project context, optionally scan for UI-specific conventions that help design-aware agents (e.g., `/react-best-practices`, `/web-design-guidelines`) make pixel-accurate decisions.

**Scan for:**

| Source | What to Extract |
|--------|----------------|
| CSS custom properties (`globals.css`, `:root`) | Theme tokens: background, surface, accent, border-radius, font sizes |
| Tailwind config (`tailwind.config.*`) | Extended colors, spacing, font families, border-radius overrides |
| Component library config (`components.json` for shadcn, `theme.ts` for MUI) | Style variant, icon library, base color |
| Global stylesheet | Base font size, body background, default text color |
| Layout components | Card padding, gap values, table row heights, sidebar widths |

**Process:**

1. Scan the sources listed above using Grep and Read tools.
2. Extract concrete values (hex colors, pixel sizes, font names).
3. Present findings to the user:

```
Detected UI conventions:

Theme Tokens:
  - Background: #1C2127 (from --background)
  - Surface: #252A31 (from --card)
  - Accent: #2D72D2 (from --primary)
  - Border radius: 2px (from --radius)
  - Base font: 14px Geist Sans

Component Library: shadcn/ui (new-york style)
Icon Library: lucide-react

Spacing:
  - Card padding: 12px
  - Card gap: 8px
  - Table row height: 32px

Density: Data-dense analytics dashboard

Codify as project heuristics? (Yes / No / Customize)
```

4. On **Yes**: write `.claude/ui-heuristics.md` with the detected values.
5. On **Customize**: let the user edit values before writing.
6. On **No**: skip. The user can run this step later with "detect UI conventions".

**Output file** (`.claude/ui-heuristics.md`):

```markdown
# Project UI Heuristics (generated by /detect-project)
# Edit freely — these supplement general heuristics with project-specific values.

## Theme Tokens
- Background: #1C2127 (from --background)
- Surface: #252A31 (from --card)
- Accent: #2D72D2 (from --primary)
- Border radius: 2px (from --radius)
- Base font: 14px Geist Sans

## Component Library
- Framework: shadcn/ui (new-york style)
- Icon library: lucide-react

## Spacing Conventions
- Card padding: 12px
- Card gap: 8px
- Table row height: 32px

## Density Target
- Data-dense analytics dashboard. Prefer compact layouts.
```

### 9. Generate Storybook Stories (Optional, React/TypeScript v1)

After detecting project structure, optionally generate Storybook stories for UI components. This uses the `StoryGenerator` interface defined in `templates/storybook-setup/StoryGenerator.ts` and the story templates in `templates/storybook-setup/story-templates/`.

**Prerequisites:**
- Storybook is installed — if not, **actively suggest it**:
  ```
  Storybook is not installed. It enables:
    - Component-level screenshot baselines during /frontend-review
    - Isolated component development and testing
    - Auto-generated stories from your component props

  Set up now? See templates/storybook-setup/CHECKLIST.md for the full checklist,
  or run: npx storybook@latest init
  ```
  If user declines, skip this section. Frontend review still works without Storybook.
- Project uses React + TypeScript (v1 scope)

**Process:**

1. **Find component files** in directories listed in CLAUDE.md Project Structure (UI Components row). Use Glob to find `.tsx` files that export React components. Skip: hooks (`use*.ts`), test files, existing story files, type-only files, page/layout files.

2. **Scope the work.** If this is the first run and many components exist, offer to scope:
   ```
   Found 47 components. Generate stories for:
   (a) All 47 components
   (b) Only components in src/components/ui/ (9 components)
   (c) Only components changed since last commit (3 components)
   ```
   On subsequent runs, default to incremental mode: only components that are new or changed since the last story generation.

3. **Read props/interface types** for each component in scope. Extract component name, props interface, variant unions, callback props, and provider dependencies.

4. **Generate story files** using the appropriate template:
   - No providers needed: use `component.stories.tsx` pattern
   - Has interaction callbacks: use `interactive.stories.tsx` pattern
   - Needs Apollo/theme/auth providers: use `complex.stories.tsx` pattern

5. **Flag components needing manual setup.** Components that use:
   - Apollo `useQuery`/`useMutation` (need mock data)
   - Server-only imports (`"use server"`)
   - Complex context (auth session, feature flags)
   - Dynamic imports (`next/dynamic`)

   These get a generated story with TODO comments indicating what to fill in.

6. **Present summary:**
   ```
   Generated 12 stories:
     - 9 ready to use
     - 3 need manual setup:
       - TaskTable: needs Apollo mock for GET_TASKS query
       - UserMenu: needs auth session mock
       - FeatureGate: needs feature flag context

   Write story files? (Yes / No / Review first)
   ```

7. **Write story files** on approval. Place each story file adjacent to its component:
   ```
   src/components/ui/badge.tsx
   src/components/ui/badge.stories.tsx  ← generated
   ```

8. **Configure Storybook integration** in `.claude/review-config.json`:
   ```json
   {
     "storybook_port": 6006,
     "storybook_start_command": "npx storybook dev --port 6006 --no-open"
   }
   ```
   If `review-config.json` already exists, merge these keys. If it does not exist, create it with these defaults.

**Incremental Mode (Default after first run):**

When running on a project that already has stories, scope to changed files:

1. Use `git diff --name-only HEAD~1` (or user-specified range) to find changed `.tsx` files.
2. Filter to component files (skip hooks, tests, pages).
3. For changed components with existing stories: regenerate and show diff.
4. For new components without stories: generate fresh.
5. Present: "Updated 2 stories, generated 1 new story."

**Storybook Integration Protocol:**

After generating stories, verify they work by following the integration protocol documented in `templates/storybook-setup/README.md`:

1. Check if Storybook is running at the configured port (default 6006).
2. If not running, start via the configured command, wait up to 60s.
3. Discover stories via the story index endpoint.
4. Navigate to each new/changed story URL, take a screenshot for baseline.
5. Graceful degradation: if Storybook fails to start, skip baselines, log warning, and report which stories were generated but not verified.

---

**Status**: ACTIVE
**Output**: Updated `CLAUDE.md` with project-specific context
**Depends on**: `CLAUDE.md` existing (created by `n2o init`)
