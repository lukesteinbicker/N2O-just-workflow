# N2O Workflow Framework (Development)

## Framework

This is the N2O workflow framework source repo. Skills live in `skills/`:
- `/workflow` — `skills/workflow/SKILL.md` (unified entry point)
- `skills/plan/SKILL.md` (planning, internal to workflow)
- `skills/test/SKILL.md` (TDD implementation, internal to workflow)
- `skills/debug/SKILL.md` (bug investigation, internal to workflow)
- `/health` — `skills/health/SKILL.md` (optional standalone)
- `/review` — `skills/review/SKILL.md`
- `/detect` — `skills/detect/SKILL.md`
- `/react` — `skills/react/SKILL.md` (ambient pattern)
- `/ux` — `skills/ux/SKILL.md` (ambient pattern)
- `skills/design/` (micro-skills)

Task database schema: `.pm/schema.sql`
CLI: `n2o` (Go binary — `go install ./cmd/n2o/` or `make build`)
CLI source: `cmd/n2o/`, `internal/`
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

Specs follow the pyramid principle template defined in `skills/plan/SKILL.md` (see "Spec Template" section). Key rules:
- One-line summary under the title
- Recent Changes table near the top
- Current State before Vision (ground the reader first)
- Open questions struck through with answers when resolved
