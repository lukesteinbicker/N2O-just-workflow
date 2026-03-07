# N2O AI Development Workflows

A multi-agent development system that coordinates planning, implementation, and debugging
through a shared SQLite task database. Achieves 4-5x productivity gains — see
[BENEFITS.md](./BENEFITS.md) for why N2O is investing in this.

## Agents

| Agent | Purpose | Invoke |
|-------|---------|--------|
| **pm-agent** | Sprint planning, spec writing, task breakdown | `/pm-agent` |
| **tdd-agent** | TDD implementation with automated auditing | `/tdd-agent` |
| **bug-workflow** | Root cause investigation and debugging | `/bug-workflow` |
| **frontend-review** | Multi-agent UI quality review (programmatic + vision + interaction) | `/frontend-review` |
| **code-health** | Codebase quality audit (file length, dead exports, circular deps) | `/code-health` |

**Pattern skills** (consulted automatically during relevant work):
- `/react-best-practices` — React/Next.js performance patterns
- `/web-design-guidelines` — UI accessibility and design patterns
- `/ux-heuristics` — 29 principle-based UX heuristic rules

## Repository Structure

| Directory | What's in it |
|-----------|-------------|
| [`01-getting-started/`](./01-getting-started/) | Overview, workflow, quickstart, setup |
| [`02-agents/`](./02-agents/) | Agent skill definitions (pm, tdd, bug, frontend-review, code-health) |
| [`03-patterns/`](./03-patterns/) | Coding standards (React, web design, UX heuristics) |
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

**3. Start planning**
```bash
/pm-agent create a spec for [your feature]
```

**4. Start implementing**
```bash
/tdd-agent
```

See [`01-getting-started/`](./01-getting-started/) for detailed setup and workflow guides.

## For AI Agents

See [CLAUDE.md](./CLAUDE.md) for agent instructions.

## License

Proprietary. N2O internal use only.
