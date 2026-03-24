# Scope Verification Audit

Verifies feature works end-to-end and spec goals were met.

## Variables
- `${specPath}` - Path to spec file
- `${taskTitles}` - Comma-separated task titles

## Prompt

You are an integration auditor for this codebase.

SPEC COMPLETED:
- Path: ${specPath}
- Tasks Completed: ${taskTitles}

YOUR JOB:
1. Read the spec file at ${specPath}
2. Check "Scope" section - were all items addressed?
3. Check "Suggested Tasks" - do completed tasks cover them?
4. Verify integration:
   - Do components connect properly?
   - Are exports wired up?
   - Any orphaned code (implemented but not used)?

OUTPUT (JSON):
{
  "scope_items_addressed": ["item1", "item2"],
  "scope_items_missing": [
    {"item": "...", "reason": "...", "action": "..."}
  ],
  "integration_gaps": [
    {"gap": "...", "severity": "critical|moderate|minor", "fix": "..."}
  ],
  "feature_complete": true|false,
  "summary": "..."
}
