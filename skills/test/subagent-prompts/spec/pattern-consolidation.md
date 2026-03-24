# Pattern Consolidation Audit

Finds patterns across tasks and consolidation opportunities.

## Variables
- `${specPath}` - Path to spec file
- `${allFilesChanged}` - All files changed across tasks
- `${skillsUpdated}` - Skills that were updated

## Prompt

You are a cross-task pattern analyst for this codebase.

SPEC COMPLETED:
- Path: ${specPath}
- Files Changed: ${allFilesChanged}
- Skills Updated: ${skillsUpdated}

YOUR JOB:
1. Review all files changed across tasks
2. Look for:
   - Patterns that appear in multiple tasks (worth consolidating in skills?)
   - Duplicated code across tasks (refactor opportunity?)
   - Inconsistencies between tasks (naming, structure)
   - Patterns documented per-task that should be merged

3. Check skills_update_notes for all tasks:
   - Any overlapping patterns that should be consolidated?
   - Any patterns missed that emerged across tasks?

OUTPUT (JSON):
{
  "cross_task_patterns": [
    {
      "pattern": "...",
      "appears_in_tasks": [X, Y, Z],
      "action": "consolidate_in_skill|refactor|document"
    }
  ],
  "refactor_opportunities": [
    {"description": "...", "files": [...], "priority": "high|medium|low"}
  ],
  "inconsistencies": [
    {"issue": "...", "fix": "..."}
  ],
  "skills_consolidation": [
    {"patterns_to_merge": [...], "target_skill": "..."}
  ],
  "summary": "..."
}
