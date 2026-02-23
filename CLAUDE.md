# N2O Workflow Framework (Development)

## Framework

This is the N2O workflow framework source repo. Skills live at their source paths:
- `/pm-agent` — `02-agents/pm-agent/SKILL.md`
- `/tdd-agent` — `02-agents/tdd-agent/SKILL.md`
- `/bug-workflow` — `02-agents/bug-workflow/SKILL.md`
- `/react-best-practices` — `03-patterns/react-best-practices/SKILL.md`
- `/web-design-guidelines` — `03-patterns/web-design-guidelines/SKILL.md`

Task database schema: `.pm/schema.sql`
Sync CLI: `./n2o`
Templates: `templates/`

## Writing Plans

Plans follow the pyramid principle. Keep them **under 100 lines**. If longer, the scope is too big — split it.

```
# [Action verb] + [what]
> One sentence: what this plan does.

## Recent Changes        ← what changed since last iteration (skip on v1)
## What changes          ← numbered deliverables, 1-3 sentences each
## Steps                 ← how we'll do it
## Files                 ← what gets touched
## Verification          ← how to confirm it worked
```

- **Recent Changes**: reverse-chronological table so the reviewer only reads what's new
- **Summary line under the title**: the reviewer decides in one sentence whether to keep reading
- On first draft, skip Recent Changes. Add it starting from v2.

## Writing Specs

Specs follow the pyramid principle template defined in `02-agents/pm-agent/SKILL.md` (see "Spec Template" section). Key rules:
- One-line summary under the title
- Recent Changes table near the top
- Current State before Vision (ground the reader first)
- Open questions struck through with answers when resolved
