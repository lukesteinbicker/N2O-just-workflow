-- Skill Auto-Invocation sprint tasks
-- Load with: sqlite3 .pm/tasks.db < .pm/todo/skill-auto-invocation/tasks.sql

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('skill-auto-invocation', '01-skill-auto-invocation.md', 1,
 'Rewrite YAML frontmatter trigger descriptions for all 6 skills',
 'docs', 'pm-agent',
 120, 'medium', 'Requires understanding Claude Code skill matching behavior — trigger wording matters',
 'All 6 SKILL.md files have improved description fields with clear trigger phrases, contextual signals, and negative signals where appropriate; scripts/lint-skills.sh still passes; pattern skills have ambient/passive trigger language',
 'Rewrite the YAML frontmatter `description` field in all 6 skills to improve Claude Code auto-invocation matching:

Skills to update:
- 02-agents/pm-agent/SKILL.md
- 02-agents/tdd-agent/SKILL.md
- 02-agents/bug-workflow/SKILL.md
- 02-agents/detect-project/SKILL.md
- 03-patterns/react-best-practices/SKILL.md
- 03-patterns/web-design-guidelines/SKILL.md

Principles for good trigger descriptions:
1. Lead with WHEN to use, not WHAT it does
2. Include natural-language triggers users would actually say
3. Include contextual triggers (what the user is doing, not just what they say)
4. Add negative signals for commonly confused skills (e.g., tdd-agent is NOT for planning)
5. Pattern skills should signal ambient/passive use ("consult when writing React code")
6. Keep descriptions concise — Claude Code has limited matching context

After updating, run scripts/lint-skills.sh to verify existing markers still pass.');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('skill-auto-invocation', '01-skill-auto-invocation.md', 2,
 'Add auto-invocation instructions to CLAUDE.md template and config option',
 'infra', 'pm-agent',
 150, 'medium', 'Must integrate with existing CLAUDE.md template without breaking detect-project auto-trigger; config changes must work with n2o init and sync',
 'templates/CLAUDE.md has an agent instruction block that guides skill auto-invocation behavior; templates/config.json has auto_invoke_skills and disabled_skills fields; n2o init scaffolds the new config fields; pattern skills are described as ambient/passive in CLAUDE.md',
 'Two changes:

1. Update templates/CLAUDE.md:
   - Add agent instruction block (similar to existing detect-project instruction) that tells Claude:
     a. Skills should be invoked automatically based on user intent (not just slash commands)
     b. Pattern skills (react-best-practices, web-design-guidelines) should be consulted passively when writing/reviewing relevant code — no need for explicit invocation
     c. Multiple skills can fire simultaneously (prefer false positives over false negatives)
     d. Read .pm/config.json for auto_invoke_skills toggle and disabled_skills list
     e. If auto_invoke_skills is false, only invoke skills via explicit slash commands
   - Keep the existing detect-project UNFILLED instruction intact
   - Update the Framework section to explain auto-invocation behavior to users

2. Update templates/config.json:
   - Add "auto_invoke_skills": true (default on)
   - Add "disabled_skills": [] (empty array — no skills disabled by default)

3. Update n2o init/sync:
   - Ensure new config fields are scaffolded during init
   - Ensure sync does not overwrite these project-level config choices (config.json is already in project_files, so this should work automatically)');

INSERT OR IGNORE INTO tasks (sprint, spec, task_num, title, type, skills, estimated_minutes, complexity, complexity_notes, done_when, description) VALUES
('skill-auto-invocation', '01-skill-auto-invocation.md', 3,
 'Test harness for trigger matching and E2E validation',
 'e2e', 'testing-e2e',
 120, 'low', NULL,
 'tests/test-n2o-skills.sh passes with tests covering: all 6 skills have description field in YAML frontmatter, descriptions contain trigger phrases, config.json has auto_invoke_skills field, n2o init scaffolds new config fields, disabled_skills suppression is documented in CLAUDE.md',
 'Write tests/test-n2o-skills.sh following the existing test harness pattern (tests/test-n2o-init.sh, tests/test-n2o-migrate.sh):

Test cases:
1. All 6 SKILL.md files have YAML frontmatter with name and description fields
2. All descriptions contain at least one trigger phrase (grep for "Triggers:" or contextual trigger language)
3. Pattern skills have ambient/passive language in their descriptions
4. templates/config.json has auto_invoke_skills and disabled_skills fields
5. n2o init creates config.json with auto_invoke_skills field
6. templates/CLAUDE.md contains auto-invocation agent instruction
7. CLAUDE.md template references config for auto-invocation control
8. n2o init scaffolds CLAUDE.md with auto-invocation instructions');

-- Dependencies: task 2 depends on task 1 (CLAUDE.md references the improved descriptions)
-- Task 3 depends on tasks 1 and 2 (tests validate both)
INSERT OR IGNORE INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task) VALUES
('skill-auto-invocation', 2, 'skill-auto-invocation', 1),
('skill-auto-invocation', 3, 'skill-auto-invocation', 1),
('skill-auto-invocation', 3, 'skill-auto-invocation', 2);
