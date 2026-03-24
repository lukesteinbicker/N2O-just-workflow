# N2O AI Development Workflows

A unified workflow system that coordinates planning, implementation, and debugging
through a shared SQLite task database. Achieves 4-5x productivity gains — see
[BENEFITS.md](./BENEFITS.md) for why N2O is investing in this.

## Workflow

One entry point: `/workflow`. Auto-routes between phases based on context. Auto-chains. Output is always a PR.

```
PLAN → BREAK DOWN → IMPLEMENT (loop per task) → PR
                        ↑              ↓
                   DEBUG ←──── can't write failing test?
```

**Optional standalone skills**:
- `/health` — Codebase quality audit (file length, dead exports, circular deps)
- `/review` — Multi-agent UI quality review (programmatic + vision + interaction)

**Pattern skills** (consulted automatically during relevant work):
- `/react` — React/Next.js performance patterns
- `/ux` — 29 principle-based UX heuristic rules

## Repository Structure

| Directory | What's in it |
|-----------|-------------|
| [`skills/`](./skills/) | All skill definitions (workflow, plan, test, debug, health, etc.) |
| [`docs/`](./docs/) | Setup, overview, and workflow guides |
| [`templates/`](./templates/) | Project templates, config examples, Storybook setup |
| [`scripts/`](./scripts/) | Git commit automation |
| [`.pm/`](./.pm/) | SQLite schema, sprint specs, task seeds |
| [`specs/`](./specs/) | Product specifications |

## Quick Start

**1. Create directories**
```bash
mkdir -p .pm/todo .wm
```

**2. Initialize task database**
```bash
sqlite3 .pm/tasks.db < .pm/schema.sql
```

**3. Start working**
```bash
# Just describe what you want — the workflow auto-routes
plan a user authentication feature
```

See [`docs/`](./docs/) for detailed setup and workflow guides.

## For AI Agents

See [CLAUDE.md](./CLAUDE.md) for agent instructions.

## License

Proprietary. N2O internal use only.
