# Frontend Review: Quickstart

> Get the multi-agent UI review system running on your project in 5 minutes.

## What It Does

Three sub-agents assess your page independently, then a merge step combines findings:

| Agent | Method | Catches |
|-------|--------|---------|
| **Programmatic** | axe-core, computed styles, DOM | WCAG violations, contrast, overflow, keyboard nav |
| **Vision** | LLM screenshot analysis | Bad grouping, buried CTAs, spacing, empty states |
| **Interaction** | Playwright clicks/types/scrolls | Broken forms, missing validation, modal issues |

On first run: **report-only** (no auto-fixes). On subsequent runs: auto-fixes critical + warning issues.

## Prerequisites

Install these in your project:

```bash
npm install -D @playwright/test @axe-core/playwright
npx playwright install chromium
```

Your dev server must be running before invoking the review.

## First Run

```
/frontend-review /tasks
```

This produces a report at `.claude/review-reports/tasks.md`. Review it, then:
- Add intentional design choices to `.claude/review-suppressions.md`
- Re-run `/frontend-review /tasks` to auto-fix remaining issues

## Configuration

Copy the example config to your project:

```bash
cp <framework-path>/skills/review/review-config.json.example .claude/review-config.json
```

Edit values for your project (auth strategy, dev server command, Storybook port, etc.). All fields have sensible defaults — you only need to change what differs.

## How It's Triggered Automatically

You don't need to run `/frontend-review` manually in most cases:

| Trigger | When |
|---------|------|
| **tdd-agent** | After a `type: frontend` task reaches GREEN, the agent auto-invokes frontend-review |
| **pm-agent** | During sprint completion (Phase 6), frontend review runs on all UI-heavy pages |
| **Manual** | Run `/frontend-review <page>` anytime |

## Storybook Integration (Optional)

If your project uses Storybook, the review agent takes component-level screenshot baselines automatically. See `skills/review/storybook-setup/` for setup instructions, or run `/detect-project` to auto-generate stories.

Without Storybook, the agent still runs — it just skips component baselines and uses structural DOM assertions instead.

## Auth Setup

If your app requires login, set `auth.strategy` in `.claude/review-config.json`:

| Strategy | When to use |
|----------|-------------|
| `none` | Public pages, no login needed |
| `dev_bypass` | App has a dev-mode auth bypass env var |
| `storage_state` | Replay a saved Playwright session |
| `script` | Run a custom script that outputs fresh auth state |

## Project-Specific Heuristics

Run `/detect-project` to auto-detect your theme tokens, spacing, and density conventions. This creates `.claude/ui-heuristics.md` which the vision agent uses for pixel-accurate assessment.

## Related Skills

- `/ux-heuristics` — 29 principle-based rules the vision agent applies
- `/web-design-guidelines` — Accessibility and design patterns
- `/detect-project` — Scans your codebase for UI conventions + generates Storybook stories
