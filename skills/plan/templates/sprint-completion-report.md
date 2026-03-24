# Sprint Completion Report

**Trigger**: All specs marked Done

---

## 1. Pre-Cleanup Verification

```bash
# Verify all tasks green and audited
sqlite3 .pm/tasks.db "
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'green' THEN 1 ELSE 0 END) as green,
    SUM(CASE WHEN pattern_audited = 1 THEN 1 ELSE 0 END) as audited,
    SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified
  FROM tasks WHERE sprint = 'SPRINT_NAME';
"

# Check for incomplete specs
ls .pm/todo/SPRINT_NAME/*.md
# Each should have "Status: Done" and a Conclusion section
```

**Prerequisites** (all must be true):
- [ ] All specs in `.pm/todo/<sprint>/` marked Done with conclusions
- [ ] All tasks green and pattern_audited in tasks.db
- [ ] E2E verification spec complete (99-e2e-verification.md)

---

## 2. Manual Verification Checklist

**Goal**: Focus on 3-5 key user flows (not exhaustive).

**Generate checklist by**:
1. Read spec files for the sprint
2. Identify main user journeys (e.g., "upload CSV → preview → import")
3. Create concise checkboxes for each flow

**Example output**:
```markdown
### Manual Verification for sprint `agent-foundation`

- [ ] Flow 1: Navigate to /agent-chat, send message, verify streaming response
- [ ] Flow 2: Upload CSV, see preview, complete import, verify investors created
- [ ] Flow 3: Add attachment to message, verify context injection in agent response
- [ ] Flow 4: Check sidebar navigation between features
```

**After verification**: PM reports any issues found.

---

## 3. Handle Issues Found

If issues found during manual verification:

### 3.1 Document in .wm

Create `.wm/sprint-<name>-issues.md`:

```markdown
# Sprint Issues: <sprint-name>

## Issue 1: [Brief description]

**Steps to reproduce**:
1. ...
2. ...

**Expected**: ...
**Actual**: ...

**Severity**: Critical | High | Medium | Low
```

### 3.2 Investigate with bug-workflow

Invoke `/debug` with the bug description.

**bug-workflow will:**
- Investigate root cause (database queries, Neon logs, code search)
- Identify affected files and test strategy
- Create task in tasks.db (sprint: `hotfix`)

### 3.3 Fix with tdd-agent

Invoke `/test` to pick up the hotfix task.

**tdd-agent will:**
- RED: Write/strengthen test that fails (proves bug)
- GREEN: Fix code, test passes
- REFACTOR + COMMIT: `fix(scope): brief description (Task #NNN)`
- Reports commit hash when done

### 3.4 PM Verifies Fix

Re-run affected manual check. If passing, continue sprint completion.

---

## 4. .wm/ Cleanup (Haiku Subagent)

Spawn Haiku subagent to review .wm/ files:

**Prompt**:
```
Review .wm/ files for sprint cleanup.

Sprint name: SPRINT_NAME

For each file in .wm/, categorize as:
- DELETE: Sprint-specific notes (task-N-*.md, *-plan.md, *-summary.md for this sprint)
- KEEP: Persistent context, patterns worth keeping, unrelated to this sprint
- DISTILL: Valuable patterns that should be extracted to skills before deleting

Files: [list .wm/ contents]

Output JSON:
{
  "delete": ["file1.md", "file2.md"],
  "keep": ["file3.md"],
  "distill": [{"file": "file4.md", "extract_to": "skill-name", "pattern": "description"}]
}
```

**After subagent returns**:
1. Execute deletions: `rm .wm/<file>` for each in delete list
2. For distill items: PM reviews and approves extraction to skills
3. Keep items remain untouched

---

## 5. Tasks.db Cleanup

Delete all verified tasks for the sprint:

```bash
sqlite3 .pm/tasks.db "DELETE FROM tasks WHERE sprint = 'SPRINT_NAME' AND verified = TRUE;"

# Verify deletion
sqlite3 .pm/tasks.db "SELECT COUNT(*) FROM tasks WHERE sprint = 'SPRINT_NAME';"
# Should return 0
```

**Rationale**: Git history preserves task records. tasks.db stays lean for next sprint.

---

## 6. Specs Cleanup

Delete spec files (git preserves history):

```bash
rm .pm/todo/SPRINT_NAME/*
rmdir .pm/todo/SPRINT_NAME
```

---

## 7. Sprint Retrospective

Document briefly (verbally or in .wm/retro-SPRINT_NAME.md):

- **Patterns emerged**: What new patterns were discovered and codified?
- **Skills updated**: Which skills were updated with new knowledge?
- **What worked well**: Process, tooling, workflow improvements
- **What didn't work**: Friction points, bottlenecks
- **Next sprint considerations**: Anything to carry forward

---

## Quick Reference

```bash
# Full sprint completion sequence
SPRINT="agent-foundation"

# 1. Verify all green
sqlite3 .pm/tasks.db "SELECT * FROM sprint_progress WHERE sprint = '$SPRINT';"

# 2. Generate manual checklist (read specs, create flows)

# 3. Handle any issues with /debug → /test

# 4. Clean up .wm/ (via Haiku subagent)

# 5. Delete tasks
sqlite3 .pm/tasks.db "DELETE FROM tasks WHERE sprint = '$SPRINT' AND verified = TRUE;"

# 6. Delete specs
rm .pm/todo/$SPRINT/*
rmdir .pm/todo/$SPRINT

# 7. Brief retrospective
```
