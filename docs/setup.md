# Setup

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Claude Code** | [Install instructions](https://docs.anthropic.com/claude-code) |
| **Claude Max subscription** | $200/month recommended for parallel work |
| **Terminal with tabs** | iTerm2 (Mac), Windows Terminal (Windows) |
| **bash 3.2+** | Pre-installed on Mac/Linux |
| **sqlite3** | Pre-installed on Mac/Linux. [Windows download](https://www.sqlite.org/download.html) |
| **jq** | `brew install jq` (Mac) or `apt install jq` (Linux) |
| **git** | Pre-installed on most systems |

### Install Claude Code

**Windows:**
```powershell
irm https://claude.ai/install.ps1 | iex
```

**Mac/Linux:**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

## First-Time Setup (Once Per Machine)

```bash
/path/to/n2o setup
```

Asks your name, framework path, enables auto-sync. Saves to `~/.n2o/config.json`.

## Project Setup

```bash
# Initialize your project
/path/to/n2o init <your-project-path> --interactive --register

# Verify everything is set up
/path/to/n2o check <your-project-path>

# Open Claude Code in your project
cd <your-project-path> && claude
```

`n2o init` handles everything: creates `.pm/` directories, initializes `tasks.db` from the schema, installs skills and session hooks, scaffolds `CLAUDE.md`, and registers your developer name.

`n2o check` verifies: skills installed, session hooks configured, database tables exist, and `.gitignore` is correct.

## What Goes Where

| Item | Location | In Git? |
|------|----------|---------|
| Task database | `.pm/tasks.db` | No |
| Database schema | `.pm/schema.sql` | Yes |
| Sprint specs | `.pm/todo/{sprint}/` | Yes |
| Task seeds | `.pm/todo/{sprint}/tasks.sql` | Yes |
| Skills | `.claude/skills/` | Yes |
| Config | `.pm/config.json` | Yes |
| Secrets | `.env.local` | No |

## Multiple Engineers

Each engineer:
- Has their own `.pm/tasks.db` (gitignored, no conflicts)
- Shares specs via `.pm/todo/{sprint}/` (in git)
- Shares task seeds via `tasks.sql` (in git)

To sync after pulling:
```bash
n2o sync <your-project-path>
```

## Frontend Review (for UI work)

If your task has `type: frontend`, the workflow automatically runs `/review` after your code reaches GREEN. This requires:

- **Playwright**: `npm install -D @playwright/test @axe-core/playwright && npx playwright install chromium`
- **Dev server running**: The review agent navigates to your page in a real browser
- **Config** (optional): Copy `<framework-path>/skills/review/review-config.json.example` to `.claude/review-config.json` and customize

### Storybook (optional, recommended)

Storybook enables component-level screenshot baselines during frontend review. To set up:

1. Run `npx storybook@latest init`
2. Run `/detect` to auto-generate stories for your components
3. See `skills/review/storybook-setup/CHECKLIST.md` for the full checklist

## Cleanup / Reset

```bash
# Reset the task database
rm .pm/tasks.db
sqlite3 .pm/tasks.db < .pm/schema.sql

# Reload a sprint's tasks
sqlite3 .pm/tasks.db < .pm/todo/{sprint}/tasks.sql
```

## Stats

```bash
n2o stats        # Human-readable
n2o stats --json # JSON output
```

## Updating

```bash
n2o sync <your-project-path>
```

Config, CLAUDE.md, schema extensions, and task data are never overwritten.

## Common Questions

**"I opened Claude just to ask a question, not work on a task."**
Set `"claim_tasks": false` in your project's `.pm/config.json`.

**"`n2o check` says something is missing."**
Re-run `n2o init <project-path>` — it's idempotent and only adds what's missing.

**"My session hook didn't fire."**
Check `.claude/settings.json` for hook entries. Re-run `n2o init` to reinstall them.

**"I want to update to the latest framework."**
Run `n2o sync <project-path>`. Or if you ran `n2o setup`, auto-sync does this automatically.
