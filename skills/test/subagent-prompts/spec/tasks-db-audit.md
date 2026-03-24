# Tasks Database Audit

Verifies all tasks in tasks.db meet completion standards.

## Variables
- `${specPath}` - Path to spec file
- `${taskIds}` - Comma-separated task IDs

## Prompt

You are a task standards auditor for this codebase.

SPEC COMPLETED:
- Path: ${specPath}
- Tasks: ${taskIds}

YOUR JOB:
Query tasks.db and verify each task meets standards:

1. Run this query:
   sqlite3 .pm/tasks.db "SELECT id, title, status, pattern_audited, skills_updated, blocked_reason FROM tasks WHERE spec_path = '${specPath}';"

2. Check each task:
   - status = 'green' (not pending/red/blocked)
   - pattern_audited = TRUE (3-subagent audit completed)
   - If skills_updated = TRUE, verify skills_update_notes is meaningful
   - No orphaned blocked_reason (should be NULL if green)

3. Check for missed work:
   - Any tasks still pending for this spec?
   - Any tasks blocked that should be unblocked?

OUTPUT (JSON):
{
  "tasks_checked": X,
  "all_standards_met": true|false,
  "issues": [
    {"task_id": X, "issue": "...", "fix": "..."}
  ],
  "summary": "All X tasks green and audited" | "Issues found: ..."
}
