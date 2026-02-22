# Project: {{project_name}}

<!-- AGENT INSTRUCTION: If any sections below contain "UNFILLED" markers,
     you MUST offer to scan the codebase and fill them in before doing anything else.
     Say: "I notice some project context hasn't been set up yet. Want me to scan the
     codebase and fill it in?" If the user agrees, follow the instructions in
     .claude/skills/detect-project/SKILL.md to explore and populate each section.
     Once a section is filled, replace its UNFILLED comment with FILLED.
     If nothing is found for a section, write "N/A — not yet added" so this
     doesn't re-trigger. -->

<!-- AGENT INSTRUCTION: Skill auto-invocation
     This project uses skills in .claude/skills/. When auto_invoke_skills is true
     in .pm/config.json (default), you should:

     1. INVOKE skills automatically based on user intent — don't wait for slash commands.
        Match the user's message against each skill's YAML description field.
     2. PATTERN SKILLS (react-best-practices, web-design-guidelines) are ambient:
        automatically consult them as reference when writing or reviewing relevant code.
        They provide passive guidance — no need for the user to invoke them explicitly.
     3. MULTIPLE SKILLS can apply at once. Prefer false positives over false negatives —
        it's better to consult a skill that wasn't needed than to miss one that was.
     4. Check .pm/config.json: if auto_invoke_skills is false, only invoke skills
        via explicit /slash-commands. If a skill name appears in the disabled_skills
        array, skip it even when it would otherwise match.
     5. Agent skills (pm-agent, tdd-agent, bug-workflow) take over the conversation
        with a full workflow. Pattern skills add context without disrupting flow. -->

## Framework

This project uses the N2O workflow system. Skills in `.claude/skills/` are auto-invoked based on context:

**Agent skills** (invoked on matching intent):
- `/pm-agent` — sprint planning, scoping, task breakdown
- `/tdd-agent` — TDD implementation of sprint tasks
- `/bug-workflow` — bug investigation and root cause analysis

**Pattern skills** (ambient — consulted automatically during relevant work):
- `/react-best-practices` — React/Next.js performance patterns
- `/web-design-guidelines` — UI accessibility and design patterns

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
