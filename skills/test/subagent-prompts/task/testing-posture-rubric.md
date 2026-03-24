# Testing Posture Rubric

Defines grading criteria for the Testing Posture audit. **A grade is REQUIRED before commit.**

## Grade Definitions

| Grade | Meaning | Commit? |
|-------|---------|---------|
| **A** | Excellent - All tests verify behavior, proper call counting | ✅ Yes |
| **B** | Good - Minor issues (missing edge cases) | ❌ Fix first |
| **C** | Acceptable - Some weak assertions | ❌ Fix first |
| **D** | Poor - Multiple fake tests | ❌ Fix first |
| **F** | Failing - Critical issues, tests don't run | ❌ Fix first |

## A Grade Requirements

All criteria must be met:

### 0. Visual Debugging Compliance (For Component Bugs)

**Visual/layout bugs MUST use Storybook isolation first.**

| Bug Type | Required Evidence |
|----------|-------------------|
| Scroll issues | `BugRepro_*.stories.tsx` or screenshot |
| Overflow | `BugRepro_*.stories.tsx` or screenshot |
| Z-index/layering | `BugRepro_*.stories.tsx` or screenshot |
| Layout/spacing | `BugRepro_*.stories.tsx` or screenshot |
| Hover/focus states | `BugRepro_*.stories.tsx` or screenshot |

**Process violation (automatic penalty)**:
- Visual bug fixed without Storybook isolation evidence
- No `BugRepro_` story OR no screenshot in workflow status

**Skip if**:
- Bug is pure logic (calculation, validation)
- Bug is data transformation (Zustand, hooks)
- Bug is already reproduced in unit test

**Reference**: `react-components/testing/visual-debugging.md`

### 1. No Fake Tests (Critical)

**The Litmus Test**: "If I break the actual functionality, will this test fail?"

| Pattern | Fake (Fails Litmus) | Real (Passes Litmus) |
|---------|---------------------|----------------------|
| Existence | `expect(typeof fn).toBe('function')` | `expect(fn(input)).toBe(expected)` |
| Truthy | `expect(result).toBeDefined()` | `expect(result.field).toBe(value)` |
| Property | `expect(obj).toHaveProperty('x')` | `expect(obj.x).toEqual(expected)` |
| Count only | `expect(arr.length).toBe(2)` | `expect(arr[0].id).toBe(FIRST_ID)` |

### 2. Query Counting (Required for Core Actions)

**All core action tests MUST assert query count to catch N+1 bugs.**

```typescript
// ❌ MISSING query count - grade penalty
it('returns deals', async () => {
  const result = await findDeals(sql, investorId);
  expect(result).toHaveLength(2);
});

// ✅ INCLUDES query count - no penalty
it('returns deals in single query', async () => {
  const result = await findDeals(sql, investorId);
  expect(result).toHaveLength(2);
  expect(getQueryCount()).toBe(1);  // REQUIRED
});
```

**Checklist**:
- [ ] `resetQueryCount()` called in `beforeEach`
- [ ] Every test asserts `getQueryCount()` or `getQueries()`
- [ ] Bulk operations verify batching (not N individual queries)

### 3. External API Call Counting (Required for Integration Tests)

**Tests calling external services MUST assert call count.**

```typescript
// ❌ MISSING call count - grade penalty
it('sends email', async () => {
  await sendEmail(grantId, recipient);
  await expectEmailSent({ to: recipient });
});

// ✅ INCLUDES call count - no penalty
it('sends email with single API call', async () => {
  await sendEmail(grantId, recipient);
  await expectEmailSent({ to: recipient });
  expect(await getNylasCallCount(grantId)).toBe(1);  // REQUIRED
});
```

**Checklist**:
- [ ] `resetNylasMock()` / `resetOpenAIMock()` / `resetEnrichmentMock()` in `beforeEach`
- [ ] Every test asserts API call count
- [ ] Batch operations verify efficient batching

### 4. Coverage Thresholds

| Coverage | Grade Impact |
|----------|--------------|
| >85% | No penalty |
| 70-85% | Minor penalty |
| <70% | Major penalty |

**Must cover**:
- [ ] Happy path
- [ ] Error cases (throws, rejects)
- [ ] Edge cases (empty input, null, boundary values)
- [ ] Validation failures

### 5. Test Isolation

- [ ] Each test can run independently
- [ ] No shared mutable state between tests
- [ ] `beforeEach` cleans up properly
- [ ] `afterAll` closes connections

## Grading Rubric

### A (Excellent) - REQUIRED FOR COMMIT

- 0 fake tests
- All behavior assertions verify content, not existence
- Query count asserted in all core action tests
- API call count asserted in all integration tests
- Coverage >85% on changed code
- All edge cases covered
- Visual debugging compliance (if applicable): Storybook isolation evidence present

### B (Good) - FIX BEFORE COMMIT

- 0 fake tests
- 1-2 missing edge case tests
- Query/API counting present but incomplete
- Coverage 70-85%

### C (Acceptable) - FIX BEFORE COMMIT

- 1-2 weak assertions (truthy checks)
- Missing error case coverage
- Query/API counting mostly missing
- Coverage <70%

### D (Poor) - FIX BEFORE COMMIT

- 3+ fake tests
- Multiple truthy/existence checks
- No query/API counting
- Major coverage gaps

### F (Failing) - FIX BEFORE COMMIT

- Tests don't run (import errors, syntax errors)
- Critical fake tests (would pass with broken code)
- No meaningful assertions
- Tests verify config/setup, not behavior

## Quick Reference: Call Counting

| Test Type | Reset Function | Count Function | Required? |
|-----------|----------------|----------------|-----------|
| Core Action (PGlite) | `resetQueryCount()` | `getQueryCount()` | ✅ Yes |
| Nylas (Email) | `resetNylasMock()` | `getNylasCallCount()` | ✅ Yes |
| OpenAI (AI) | `resetOpenAIMock()` | `getOpenAICallCount()` | ✅ Yes |
| Enrichment | `resetEnrichmentMock()` | `getEnrichmentCallCount()` | ✅ Yes |

## Example: Complete Test Structure

```typescript
describe('findDealsForInvestor', () => {
  let db: PGlite;
  let sql: CoreClient;
  let getQueryCount: () => number;
  let resetQueryCount: () => void;

  beforeAll(async () => {
    db = await createTestDb();
    const client = createPGliteClient(db);
    sql = client.sql as unknown as CoreClient;
    getQueryCount = client.getQueryCount;
    resetQueryCount = client.resetQueryCount;
    // Seed parent records
  });

  beforeEach(async () => {
    await db.exec('DELETE FROM public.deals');
    resetQueryCount();  // REQUIRED
  });

  afterAll(async () => {
    await db.close();
  });

  it('returns deals filtered by investor', async () => {
    // Arrange
    await db.exec(`INSERT INTO deals ...`);

    // Act
    const result = await findDealsForInvestor(sql, INVESTOR_ID);

    // Assert behavior
    expect(result).toHaveLength(1);
    expect(result[0]!.investor_id).toBe(INVESTOR_ID);  // Content, not existence

    // Assert efficiency
    expect(getQueryCount()).toBe(1);  // REQUIRED
  });
});
```

## Related

- [core-action-testing.md](../../../server-actions/testing/core-action-testing.md) - PGlite + query counting
- [external-service-testing.md](../../../server-actions/testing/external-service-testing.md) - Mock servers + API counting
- [fake-tests-antipattern.md](../../../server-actions/testing/fake-tests-antipattern.md) - Why fake tests fail
