# Project: {{project_name}}

<!-- AGENT INSTRUCTION: If any sections below contain "UNFILLED" markers,
     you MUST offer to scan the codebase and fill them in before doing anything else.
     Say: "I notice some project context hasn't been set up yet. Want me to scan the
     codebase and fill it in?" If the user agrees, follow the instructions in
     .claude/skills/detect-project/SKILL.md to explore and populate each section.
     Once a section is filled, replace its UNFILLED comment with FILLED.
     If nothing is found for a section, write "N/A — not yet added" so this
     doesn't re-trigger. -->

## Framework

This project uses the N2O workflow system. See skills in `.claude/skills/` for:
- `/pm-agent` — sprint planning
- `/tdd-agent` — TDD implementation
- `/bug-workflow` — debugging

Task database: `.pm/tasks.db`
Config: `.pm/config.json`

## Commands

Commands are configured in `.pm/config.json` and used by agents:
- Test: `{{test_command}}`
- Typecheck: `{{typecheck_command}}`
- Lint: `{{lint_command}}`
- Build: `{{build_command}}`

## Project Structure

<!-- UNFILLED -->

| Type | Path |
|------|------|
| UI Components | |
| Hooks | |
| Server Actions | |
| API Routes | |
| Pages / Routes | |
| Shared Utilities | |
| Types / Interfaces | |

## Database

<!-- UNFILLED -->

- **Type**:
- **Connection**:
- **Environment Variable**:
- **Migration Command**:
- **Migration Status**:

## Architecture

<!-- UNFILLED -->

## Conventions

<!-- UNFILLED -->

- **Styling**:
- **State Management**:
- **Auth**:

## Key APIs / External Services

<!-- UNFILLED -->

## Notes

<!-- Add any additional project context here -->
