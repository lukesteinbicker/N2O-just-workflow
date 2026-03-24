# Spec Completion

**Trigger**: All tasks for a spec are green

---

## 1. Run 3-Subagent Spec Audit

Before writing the conclusion, run 3 parallel Sonnet subagents.

**Prompts** (read, substitute variables, invoke):
- `subagent-prompts/spec/tasks-db-audit.md` - Verify tasks.db standards
- `subagent-prompts/spec/scope-verification.md` - Check spec scope met
- `subagent-prompts/spec/pattern-consolidation.md` - Find cross-task patterns

---

## 2. Handle Issues

| Severity | Action |
|----------|--------|
| Critical | Fix before marking spec done |
| Moderate | Document in conclusion, create follow-up tasks if needed |
| Minor | Note in conclusion for future reference |

---

## 3. Update Database

```bash
# Record spec audit was performed
sqlite3 .pm/tasks.db "UPDATE tasks SET
  pattern_audit_notes = pattern_audit_notes || ' | SPEC AUDIT: [summary]'
WHERE id = ${lastTaskId};"
```

---

## 4. Write Conclusion

Update the spec file:

1. **Update header**: `Status: Done`

2. **Add conclusion block** (after status):

```markdown
## Conclusion

[2-3 sentences: What was built, notable decisions, patterns discovered]

**Spec Audit Summary**:
- Tasks: [X] tasks, all green and audited
- Integration: [Complete | Gaps noted below]
- Patterns: [X] cross-task patterns consolidated

**Future extensions** (if any):
- [Enhancement idea → backlog or next sprint]

**Known issues** (if any):
- [Minor issue deferred to future sprint]
```

3. **Leave file in place** until sprint ends (PM handles cleanup)

---

## Quick Reference

```bash
# Find all tasks for a spec
sqlite3 .pm/tasks.db "SELECT id, title, status, pattern_audited FROM tasks WHERE spec_path = 'PATH';"

# Check if all tasks are complete
sqlite3 .pm/tasks.db "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'green' AND pattern_audited = 1 THEN 1 ELSE 0 END) as complete FROM tasks WHERE spec_path = 'PATH';"
```
