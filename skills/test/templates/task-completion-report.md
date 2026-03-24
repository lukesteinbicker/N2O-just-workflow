## TASK COMPLETE: [Task Title] (#[ID])

### Summary
- **Tests**: [X] tests written, all passing
- **Quality**: typecheck PASS | lint PASS | build PASS (or N/A)
- **Files Changed**: [file1.ts, file2.test.ts, ...]

### Audit Results

#### Pattern Compliance
- **Violations**: [X] found
  - [If violations]: Listed and FIXED
  - [If none]: No violations, follows existing patterns
- **New Patterns Discovered**: [X]
  - [List each pattern below]

#### Gap Analysis
- **"Done When" Criteria**: [X/Y] met
  - [If gaps]: [List gaps and actions taken]
  - [If complete]: All criteria satisfied
- **Deferred Work**: [X] items
  - [List deferred items with reason]

#### Testing Posture
- **Quality Grade**: [A+/A/A-/B/C]
- **Coverage**: [XX]% ([X/Y] lines tested)
- **Issues Found**: [X] fake tests, [X] untested branches
  - [If issues]: All FIXED
  - [If clean]: No issues

### PATTERNS CODIFIED

[If skills_updated = TRUE, list each pattern with details]

ADDED: **[Pattern Name]** → `.claude/skills/[skill-name]/SKILL.md`
   - **Why**: [Reusable/Non-obvious/Framework-specific/Error-prone]
   - **Future Impact**: [Will help with X, Y, Z tasks]
   - **Example**: `[brief code snippet or concept]`

[Repeat for each codified pattern]

[If skills_updated = FALSE]

NO PATTERNS CODIFIED
   - [X] patterns suggested by audit
   - All skipped because: [Library docs / Too specific / Already documented / One-off use]
   - Examples:
     - SKIP "[Pattern name]": [Reason for skipping]
     - SKIP "[Pattern name]": [Reason for skipping]

### Action Items Completed
- [Action item 1] - DONE
- [Action item 2] - DONE
- [If deferred]: [Action item] - DEFERRED to .wm/[file]

### Database State
```
status = green
pattern_audited = TRUE
skills_updated = [TRUE/FALSE]
skills_update_notes = "[what was done]"
```

### Next: Ready for next available task
```

#### Example Completion Report (Skills Updated)

```markdown
## TASK COMPLETE: Create parseCSVPreview utility (#1)

### Summary
- **Tests**: 21 tests written, all passing
- **Quality**: typecheck PASS | lint PASS | build N/A
- **Files Changed**: parseCSVPreview.ts, parseCSVPreview.test.ts, index.ts

### Audit Results

#### Pattern Compliance
- **Violations**: 0 found
- **New Patterns Discovered**: 6 suggested by subagent
  - 2 patterns codified
  - 4 patterns skipped (see below)

#### Gap Analysis
- **"Done When" Criteria**: 5/5 met
  - Parses CSV headers
  - Returns first N rows
  - Handles large files (>100MB)
  - Error handling for malformed CSV
  - TypeScript types exported
- **Deferred Work**: 0 items

#### Testing Posture
- **Quality Grade**: A
- **Coverage**: 92% (147/160 lines tested)
- **Issues Found**: 3 fake tests
  - All FIXED (replaced with real behavior tests)

### PATTERNS CODIFIED

ADDED: **Testing Large File Operations** → testing-unit
   - **Why**: Reusable pattern for all file upload/processing tests
   - **Future Impact**: batch import, email attachments, CSV import tasks
   - **What**: Use streaming with small sample files instead of loading full file

ADDED: **Mock File Creation Utilities** → testing-unit
   - **Why**: Every file upload test needs this, eliminates boilerplate
   - **Future Impact**: Standardizes test file creation across all features
   - **What**: createTestFile(type, content) helper for CSV/PDF/image mocks

PATTERNS SKIPPED (4 total)

Subagent suggested these, but exercised judgment to skip:
- SKIP "CSV Parsing with Streaming": Library docs (PapaParse already documents this)
- SKIP "Handling CSV Headers with Special Characters": Too specific to this feature
- SKIP "Error Handling for Malformed CSV": Implementation detail, not reusable
- SKIP "Progress Tracking for Long Parses": Too specific, unlikely to reuse

### Action Items Completed
- Fixed 3 fake tests (converted to real behavior tests) - DONE
- Added missing edge case tests for empty files - DONE
- Improved error messages for better DX - DONE

### Database State
```
status = green
pattern_audited = TRUE
skills_updated = TRUE
skills_update_notes = "Added 2 patterns to testing-unit (large file testing, mock file helpers). Skipped 4 library/specific patterns."
```

### Next: Ready for next available task
```

#### Example Completion Report (No Patterns)

```markdown
## TASK COMPLETE: Wire context injection into Thread send flow (#3)

### Summary
- **Tests**: 8 tests written, all passing
- **Quality**: typecheck PASS | lint PASS | build PASS
- **Files Changed**: Thread.tsx, use-agent-chat.ts, use-agent-chat.test.tsx

### Audit Results

#### Pattern Compliance
- **Violations**: 0 found
- **New Patterns Discovered**: 0 (follows existing assistant-ui integration patterns)

#### Gap Analysis
- **"Done When" Criteria**: 3/3 met
  - Attachments add context to message before send
  - Integration with Thread component works
  - Tests verify context injection
- **Deferred Work**: 0 items

#### Testing Posture
- **Quality Grade**: A+
- **Coverage**: 100% (28/28 lines tested)
- **Issues Found**: 0

### PATTERNS CODIFIED

NO PATTERNS CODIFIED
   - 0 patterns suggested by audit
   - Implementation follows existing patterns in `react-components` skill
   - No new reusable patterns discovered

### Action Items Completed
- Wired prepareAttachmentContext into send flow - DONE
- Verified integration with manual testing - DONE
- All tests pass - DONE

### Database State
```
status = green
pattern_audited = TRUE
skills_updated = FALSE
skills_update_notes = "No new patterns. Follows existing assistant-ui integration patterns."
```

### Next: Ready for next available task
```

#### Why This Format?

**Benefits**:
- **Patterns are OBVIOUS** - Front and center, not buried
- **Scannable** - PM can quickly see what matters
- **Transparent** - Shows decisions (why patterns were skipped)
- **Trackable** - Clear metrics (violations, coverage, patterns)
- **Educational** - Explains reasoning for codification decisions

**No more fishing** - Everything important is in the completion report.

### Move to Next Task

```bash
# Task is complete, find next available task
sqlite3 .pm/tasks.db "SELECT id, title, done_when FROM available_tasks WHERE sprint = 'SPRINT_NAME' LIMIT 10;"

# Pick next task and repeat workflow (Phase 1 → Phase 10)
```
