# Onboarding: Zero to First Task

> End-to-end walkthrough from installing prerequisites to completing your first task with N2O.

Target audience: Engineers comfortable with CLI who have never seen N2O before.

---

## 1. Prerequisites

bash 3.2+, git, sqlite3, jq (`brew install jq`), and [Claude Code](https://docs.anthropic.com/claude-code) with a Claude Max subscription.

## 2. Clone the Framework

```bash
git clone <framework-repo-url> ~/n2o
```

## 3. First-Time Developer Setup (Once Per Machine)

```bash
~/n2o/n2o setup
```

Asks your name, framework path, enables auto-sync. Saves to `~/.n2o/config.json`.

## 4. Initialize Your Project

```bash
~/n2o/n2o init ~/my-project --interactive --register
```

Creates `.pm/` with `tasks.db`, installs skills to `.claude/skills/`, scaffolds `CLAUDE.md`, installs session hooks, sets up `.gitignore`.

## 5. Verify

```bash
~/n2o/n2o check ~/my-project
```

All green = ready. If anything is red, re-run `n2o init` or `n2o sync`.

---

## 6. Your First Session

```bash
cd ~/my-project
claude
```

When Claude Code starts, the session hook fires automatically. It:
1. Identifies you as the developer
2. Checks for framework updates (background, non-blocking)
3. Claims the next available task from `tasks.db`
4. Tells you which skill to invoke (`/tdd-agent`, `/bug-workflow`, etc.)

You'll see output like:
```
Developer: Ella | Concurrent sessions: 1

--- TASK AUTO-CLAIMED ---
Task: my-sprint#3 — Add validation to signup form
Type: frontend
Done when: Form rejects invalid email, shows inline errors. Unit test passes.

IMPORTANT: You MUST invoke /tdd-agent now to implement this task.
--- END TASK ---
```

---

## 7. Working on Tasks

Follow the skill's workflow. For implementation tasks with `/tdd-agent`:

1. **RED** — Write a failing test first
2. **GREEN** — Write the minimum code to pass
3. **REFACTOR** — Clean up without changing behavior
4. **AUDIT** — Check patterns and quality
5. **COMMIT** — Commit with a clear message

The agent guides you through each phase. When done, it marks the task complete and you can pick up the next one.

---

## 8. Frontend Review (for UI work)

If your task has `type: frontend`, the tdd-agent automatically runs `/frontend-review` after your code reaches GREEN. This requires:

- **Playwright**: `npm install -D @playwright/test @axe-core/playwright && npx playwright install chromium`
- **Dev server running**: The review agent navigates to your page in a real browser
- **Config** (optional): Copy `<framework-path>/templates/review-config.json.example` to `.claude/review-config.json` and customize

First review of any page runs in **report-only mode** — it assesses but doesn't auto-fix, so you can review findings and add suppressions for intentional design choices.

See `templates/frontend-review-quickstart.md` for the full setup guide.

### Storybook (optional, recommended)

Storybook enables component-level screenshot baselines during frontend review. To set up:

1. Run `npx storybook@latest init`
2. Run `/detect-project` to auto-generate stories for your components
3. See `templates/storybook-setup/CHECKLIST.md` for the full checklist

Without Storybook, frontend review still works — it skips component baselines and uses DOM assertions instead.

---

## 9. Check Your Stats

After completing at least one task:

```bash
~/n2o/n2o stats
```

Shows: session summary, tool usage, sprint progress, available tasks, and skill quality metrics.

For JSON output (used by the dashboard):
```bash
~/n2o/n2o stats --json
```

---

## 10. Multi-Machine Setup (Optional)

For multi-machine or team-wide task sync, set `SUPABASE_URL` and `SUPABASE_KEY` environment variables. Then `n2o sync` pushes/pulls task state automatically.

---

## Common Questions

**"I opened Claude just to ask a question, not work on a task."**
Set `"claim_tasks": false` in your project's `.pm/config.json`. The session hook will show sprint progress but won't auto-claim. Set it back to `true` when you're ready to work on tasks.

**"`n2o check` says something is missing."**
Re-run `n2o init <project-path>` — it's idempotent and only adds what's missing. Or run `n2o sync <project-path>` to update from the latest framework.

**"My session hook didn't fire."**
Check `.claude/settings.json` — it should have `SessionStart` and `SessionEnd` hook entries pointing to `scripts/n2o-session-hook.sh`. Re-run `n2o init` to reinstall them.

**"`n2o stats` shows no data."**
Stats require at least one completed task in `tasks.db`. Load a sprint's tasks (`sqlite3 .pm/tasks.db < .pm/todo/{sprint}/tasks.sql`), claim one, complete it, then check stats.

**"I want to update to the latest framework."**
Run `n2o sync <project-path>`. Or if you ran `n2o setup`, auto-sync does this automatically on every Claude session start.

**"I see 'Claimed task' but I want a different one."**
The session hook claims the highest-priority available task. To work on a specific task, use the PM agent: `/pm-agent assign task #N to me`.
