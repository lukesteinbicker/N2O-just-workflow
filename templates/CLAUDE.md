# Project: {{project_name}}

<!-- AGENT INSTRUCTION: If any sections below contain "UNFILLED" markers,
     you MUST offer to scan the codebase and fill them in before doing anything else.
     Say: "I notice some project context hasn't been set up yet. Want me to scan the
     codebase and fill it in?" If the user agrees, follow the instructions in
     .claude/skills/detect/SKILL.md to explore and populate each section.
     Once a section is filled, replace its UNFILLED comment with FILLED.
     If nothing is found for a section, write "N/A — not yet added" so this
     doesn't re-trigger. -->

<!-- AGENT INSTRUCTION: Workflow auto-invocation
     This project uses the N2O workflow system. The unified workflow skill in
     .claude/skills/workflow/ handles all work-related intent automatically.

     1. INVOKE the workflow skill when the user wants to plan, implement, fix,
        build, create, or ship anything. It auto-routes to the right phase.
     2. PATTERN SKILLS (react, ux, design) are ambient:
        automatically consult them as reference when writing or reviewing relevant code.
     3. Check .pm/config.json: if auto_invoke_skills is false, only invoke skills
        via explicit /slash-commands.
     4. Outside the workflow, Claude Code works normally — ask questions, make edits,
        explore. The workflow only activates on work-related intent. -->

## Workflow

This project uses the N2O workflow system. Enter the structured loop with `/workflow` or describe what you want to build — the workflow activates automatically.

Outside of `/workflow`, Claude Code works normally — ask questions, make edits, explore.

Inside the workflow, the system auto-routes between phases (plan → break down → implement → PR) based on context. No further commands needed. One PR is opened at the end.

**Pattern skills** (ambient — consulted automatically during relevant work):
- React/Next.js patterns, UX heuristics, design micro-skills

Auto-invocation can be toggled in `.pm/config.json` (`auto_invoke_skills`, `disabled_skills`).

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
