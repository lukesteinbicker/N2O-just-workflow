# Verification Patterns

How to convert debugging findings into automated tests.

## The Principle

Once you understand an issue through database queries and manual investigation, **systematize your findings into automated tests**. This:

1. Documents the expected behavior
2. Reproduces the bug reliably
3. Prevents regression after the fix
4. Serves as living documentation

## Workflow

```
1. DEBUG: Use database queries to understand issue
2. DOCUMENT: Write down what you found
3. TEST: Convert findings to automated test
4. VERIFY: Test fails for expected reason
5. FIX: Implement solution
6. CONFIRM: Test passes
7. SUITE: Run full test suite
```

## Test Type by Issue

| Issue Type | Test Framework | Location |
|------------|----------------|----------|
| Database schema/constraints | Vitest | `packages/database/__tests__/` |
| Server action | Vitest | `packages/*/__tests__/` or `apps/*/__tests__/` |
| React component | RTL/Vitest | `packages/*/__tests__/` or `apps/*/__tests__/` |

> **Note:** 
> - Update this table as you add database functions, triggers, or other test types to your schema.
> - Tests go in `__tests__/` directories within each package/app.
> - Use `@repo/vitest` for shared test utilities.

## Converting Findings to Tests

### Example: Database Constraint Bug

**Finding from debugging:**
```bash
# Duplicate email allowed when it shouldn't be
psql $DATABASE_URL_DEV -c "
SELECT email, COUNT(*) 
FROM user 
GROUP BY email 
HAVING COUNT(*) > 1;
-- Returns rows (BUG - should be unique!)
"
```

**Convert to Vitest test:**
```typescript
// packages/database/__tests__/user-unique-email.test.ts
import { describe, it, expect } from "vitest";
import { database } from "../index";

describe("user unique email constraint", () => {
  it("should reject duplicate email", async () => {
    // Setup: Insert first user
    await database
      .insertInto("user")
      .values({
        id: "11111111-1111-1111-1111-111111111111",
        email: "test@example.com",
        name: "User 1",
      })
      .execute();

    // Test: Duplicate email should fail
    await expect(
      database
        .insertInto("user")
        .values({
          id: "22222222-2222-2222-2222-222222222222",
          email: "test@example.com",
          name: "User 2",
        })
        .execute()
    ).rejects.toThrow("duplicate key value violates unique constraint");
  });
});
```

> **Note:** Update examples as you add more tables, constraints, and database functions to your schema.

### Example: React Component Bug

**Finding from debugging:**
```
Console error: Maximum update depth exceeded
Traced to: useEffect with object dependency
```

**Convert to unit test:**
```typescript
// packages/features/campaigns/src/components/__tests__/campaign-page.test.tsx
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCampaignContext } from '../hooks/use-campaign-context';

describe('useCampaignContext', () => {
  it('should not cause infinite re-renders', () => {
    let renderCount = 0;

    const { result, rerender } = renderHook(() => {
      renderCount++;
      return useCampaignContext();
    });

    // Rerender several times
    rerender();
    rerender();
    rerender();

    // Should not exceed reasonable render count
    expect(renderCount).toBeLessThan(10);
  });
});
```

## Test Naming Convention

Name tests to document the bug:

```
# Good - describes the fix
"Duplicate email is rejected"
"User with missing email shows validation error"
"Campaign context hook returns stable reference"

# Bad - describes implementation
"Unique constraint works"
"Validation works"
"Hook works"
```

## Running Tests

```bash
# All tests
pnpm test

# Tests for specific package
pnpm --filter @repo/<package-name> test

# Tests in watch mode
pnpm --filter @repo/<package-name> test:watch
```
