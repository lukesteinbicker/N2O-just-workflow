# Regression Prevention

After fixing a bug, run the full test suite to ensure you haven't broken anything else.

## The Principle

A fix that introduces a new bug is not a fix. Always verify:

1. Your new test passes
2. All existing tests still pass
3. Lint and typecheck pass

## Full Verification Checklist

### 1. Database Changes

```bash
# Run migrations to verify schema changes
cd packages/database && pnpm migrate:dev:status

# Note: Database tests (pgTap) not yet set up
# Add tests in packages/database/__tests__/ when needed
```

### 2. Frontend Changes

```bash
# Run unit tests (Vitest)
pnpm test

# Run tests for specific package
pnpm --filter @repo/<package-name> test
```

### 3. Quality Checks

```bash
# Typecheck (required before commit)
pnpm typecheck

# Lint (required before commit)
pnpm check
```

## Quick Verification by Change Type

| Change Type | Minimum Verification |
|-------------|---------------------|
| Database migration | `cd packages/database && pnpm migrate:dev:status` |
| Database schema | Verify migration runs: `cd packages/database && pnpm migrate:dev:up` |
| Server action | `pnpm test` (add tests in package `__tests__/` directory) |
| React component | `pnpm test` (add tests in package `__tests__/` directory) |
| Any code | `pnpm typecheck && pnpm check` |

## Full Suite (Before PR)

Before creating a PR, run the full suite:

```bash
# All quality checks
pnpm typecheck
pnpm check

# All tests
pnpm test

# Build (verify no build errors)
pnpm build
```

## CI Will Catch It (But Don't Rely On It)

CI runs all tests, but:

1. CI feedback is slower than local
2. Broken commits pollute history
3. Other developers may pull broken code

Run tests locally before pushing.

## When Tests Fail

| Failure Type | Action |
|--------------|--------|
| Your new test fails | Debug, fix, re-run |
| Existing test fails | Your change broke something - investigate |
| Unrelated test flaky | Run again, note in PR if persistent |
| Lint/typecheck fails | Fix before committing |

## Git Safety

**NEVER use `--no-verify` to skip pre-push hooks** unless:
- You're certain the failure is CI infrastructure, not your code
- You've documented the reason in your commit message

The pre-push hook exists to catch issues before they reach CI.
