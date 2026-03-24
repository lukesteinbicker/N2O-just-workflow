# E2E Spec Template

Use this template for the sprint's E2E verification spec.

## Template

```markdown
# E2E Verification

**Status**: Blocked
**Depends On**: All implementation specs complete

---

## Scope

E2E happy path verification for [sprint-name] features.

**This spec covers**:
- Baseline: Ensure existing E2E suite passes
- Happy path E2E tests for all implementation specs
- Cross-feature integration verification

**Out of scope**:
- Edge cases (use component tests)
- Error handling (use component tests)
- Unit tests (already in implementation specs)

---

## Tasks (Populate After Implementation)

| # | Task | Covers Specs | Done When |
|---|------|--------------|-----------|
| 0 | E2E: Baseline passes | Existing suite | E2E tests pass (add tests to `apps/*/__tests__/` or create E2E test package) |
| 1 | E2E: [Feature Area A] | 01-xx, 02-xx | Tests pass, no flaky failures |
| 2 | E2E: [Feature Area B] | 03-xx, 04-xx | Tests pass, no flaky failures |

---

## References

- E2E skill: `.claude/skills/testing-e2e/`
- Implementation specs: [list related specs]
```

## Naming Convention

- File: `99-e2e-verification.md` (99 ensures it sorts last)
- Tasks: Prefix with `E2E:` for easy identification
- One task per logical feature area (not per individual test)

## Task Granularity

**Good** (grouped by feature):
```
| 1 | E2E: Attachments flow | 01-attachments, 02-context | ... |
| 2 | E2E: Import Agent | 03-import, 04-progress | ... |
```

**Bad** (too granular):
```
| 1 | Test file drop | ... |
| 2 | Test file upload | ... |
| 3 | Test CSV preview | ... |
```

## When to Populate

1. **Sprint planning**: Create spec with placeholder tasks
2. **After impl specs done**: PM reviews what needs E2E coverage
3. **Populate real tasks**: One per feature area
4. **Add dependencies**: E2E tasks depend on ALL impl tasks

## Dependencies

All E2E tasks must depend on all implementation tasks:

```bash
sqlite3 .pm/tasks.db "
  INSERT INTO task_dependencies (task_id, depends_on)
  SELECT e2e.id, impl.id
  FROM tasks e2e, tasks impl
  WHERE e2e.spec_path LIKE '%e2e%'
  AND impl.spec_path NOT LIKE '%e2e%'
  AND e2e.sprint = impl.sprint;"
```
