### Codification Antipatterns (What NOT to Do)

**CRITICAL**: Most patterns should be 10-30 lines. If you're writing >100 lines, you're over-documenting.

#### Antipattern 1: Tutorial-Style Documentation

**BAD** (613 lines for agent events):
```markdown
# Agent Events

## When to Use
[100 lines explaining when/when not to use]

## Architecture
[Full architecture diagrams, event flow, type system explanations]

## Implementation

### 1. Event Type Definitions
[Full TypeScript interfaces with JSDoc]

### 2. Server-Side: Emitting Events
[Complete implementation examples with 3 different approaches]

### 3. Client-Side: Consuming Events
[Pattern 1, Pattern 2, full implementations]

### 4. UI Components
[Full component implementations]

## Type Guards
[Detailed explanations]

## Extending the System
[How to add new event types]

## Integration with AI SDK
[Comparison tables]

## Testing
[Unit tests, E2E tests, full examples]

## Common Patterns
[Pattern 1, 2, 3 with diagrams]

## Gotchas
[Multiple warnings]

## Reference Implementation
[Links to files]
```

**GOOD** (30 lines for agent events):
```markdown
### Agent Events (Task #16)

**Problem**: Need to track which sub-agent is executing and show progress during long operations.

**Type Definitions**: `packages/ai/types/agent-events.ts` (or appropriate package)

**Events**:
- `agent:start` - Sub-agent begins execution
- `agent:complete` - Sub-agent finishes (success or error)
- `progress:update` - Long operation progress (>5s operations only)
- `progress:complete` - Long operation finishes

**Usage**:
```typescript
// Emit from Mastra agent
emitAgentEvent({ type: 'agent:start', threadId, agent: {...} });

// Consume in React
const { currentAgent, progress } = useAgentEvents(threadId);
```

**Key insight**: Use for agent delegation, NOT for individual tool calls (AI SDK handles that).

**See**: `packages/ai/types/agent-events.ts` (or appropriate package) for full type definitions
```

**Why bad example is wrong**:
- Duplicates TypeScript interface documentation (already in code)
- Teaches library concepts (AI SDK integration already documented)
- Multiple examples when one suffices
- Architecture diagrams for simple concept
- Testing examples (belongs in testing skill, not here)
- "Gotchas" section repeating the same point

**Fix**: Cut 95% of content. Keep only the non-obvious insight and where to find the code.

---

#### Antipattern 2: Duplicating Library Documentation

**BAD**:
```markdown
### Using PapaParse for CSV Streaming

PapaParse is a powerful CSV parsing library that supports streaming mode.

**Installation**:
```bash
npm install papaparse
```

**Basic usage**:
```typescript
Papa.parse(file, {
  complete: (results) => console.log(results)
});
```

**Streaming mode**:
```typescript
Papa.parse(file, {
  worker: true,
  chunk: (results, parser) => {
    processChunk(results.data);
  },
  complete: () => {
    finalize();
  }
});
```

**Configuration options**:
- `worker`: Use web worker
- `chunk`: Callback for each chunk
- `complete`: Callback when done
- `header`: Parse first row as headers
- `skipEmptyLines`: Skip empty lines

**Error handling**:
```typescript
Papa.parse(file, {
  error: (err) => console.error(err)
});
```

**When to use**: Files >10MB
```

**GOOD**:
```markdown
### CSV Streaming Pattern (Task #1)

**Problem**: Large CSV files (>100MB) cause memory issues with full parse.

**Solution**: PapaParse streaming mode (see [PapaParse docs](https://www.papaparse.com/docs#config))

**When to use**: CSV files >10MB or unknown size
```

**Why bad example is wrong**:
- Copies library documentation verbatim
- Teaches API already in official docs
- Installation instructions (irrelevant to pattern)
- Configuration options (belongs in library docs)

**Fix**: Link to library docs, document only our decision (when to stream).

---

#### Antipattern 3: Over-Explaining Simple Concepts

**BAD**:
```markdown
### TypeScript Discriminated Unions

Discriminated unions are a TypeScript pattern that uses a common property (discriminant) to narrow types safely.

**How it works**:
TypeScript's type system can analyze control flow to determine which type is active based on the discriminant field.

**Structure**:
```typescript
interface TypeA {
  type: 'a';
  fieldA: string;
}

interface TypeB {
  type: 'b';
  fieldB: number;
}

type Union = TypeA | TypeB;
```

**Type narrowing**:
```typescript
function handle(value: Union) {
  if (value.type === 'a') {
    // TypeScript knows value is TypeA
    console.log(value.fieldA);
  } else {
    // TypeScript knows value is TypeB
    console.log(value.fieldB);
  }
}
```

**Benefits**:
1. Type safety
2. Autocomplete
3. Exhaustiveness checking
4. Self-documenting

**Common mistakes**:
- Forgetting discriminant field
- Using non-literal types as discriminant
- Not handling all cases
```

**GOOD**:
```markdown
### Event Type Narrowing (Task #16)

**Pattern**: Use discriminated union on `type` field for event handling.

```typescript
if (event.type === 'agent:start') {
  // TypeScript knows event is AgentStartEvent
  showIndicator(event.agent.label);
}
```

**Why**: Type-safe event handling with autocomplete.
```

**Why bad example is wrong**:
- Teaches TypeScript fundamentals (well-known concept)
- Multiple examples for simple pattern
- Benefits/mistakes lists (TypeScript handbook material)

**Fix**: Show only our application of the pattern.

---

#### Antipattern 4: Multiple Examples When One Suffices

**BAD**:
```markdown
### Creating Test Files

**Example 1: CSV file**
```typescript
const csvFile = createTestFile('csv', 'Name,Email\nJohn,john@example.com');
```

**Example 2: PDF file**
```typescript
const pdfFile = createTestFile('pdf', mockPdfBuffer);
```

**Example 3: Image file**
```typescript
const imageFile = createTestFile('image/png', mockImageBuffer);
```

**Example 4: JSON file**
```typescript
const jsonFile = createTestFile('json', JSON.stringify({ foo: 'bar' }));
```

**Example 5: Text file**
```typescript
const textFile = createTestFile('text', 'Hello world');
```
```

**GOOD**:
```markdown
### Mock File Creation (Task #1)

**Pattern**: `createTestFile(type, content)` helper

```typescript
const csvFile = createTestFile('csv', 'Name,Email\nJohn,john@example.com');
```

**When**: All file upload tests
```

**Why bad example is wrong**:
- 5 examples showing the exact same pattern
- Pattern is obvious after one example

**Fix**: One example is sufficient.

---

#### Antipattern 5: Implementation Details as Patterns

**BAD**:
```markdown
### Validating Investor Email Format

**Problem**: Need to validate email addresses for imported investors

**Pattern**:
```typescript
function validateInvestorEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email) return false;
  if (!emailRegex.test(email)) return false;
  if (email.length > 254) return false;

  const [local, domain] = email.split('@');
  if (local.length > 64) return false;

  return true;
}
```

**When to use**: All investor import validation
**Edge cases**: Empty strings, malformed emails, too long
```

**GOOD**:
Skip entirely - this is implementation detail, not a pattern.

**Why**: Email validation is business logic specific to one feature. Not reusable across tasks.

---

### Length Guidelines

**Target lengths**:
- **Simple pattern**: 10-30 lines
- **Complex pattern**: 50-100 lines
- **Deep dive**: 100-200 lines (rare, needs justification)

**Red flags** (too long):
- >200 lines for a single pattern
- Multiple full code examples (>20 lines each)
- Explaining TypeScript/React/library fundamentals
- Tutorial-style "How it works" sections
- Lists of benefits/gotchas/mistakes

**How to know when to stop**:
1. **One concept**: Document one pattern, not a whole system
2. **One example**: Show the pattern once, clearly
3. **Link out**: Reference library docs instead of copying
4. **Trust the reader**: Don't over-explain. Dev agents know TypeScript.

**Questions to ask yourself**:
- Would this be in official library/framework docs? → Don't duplicate
- Is this TypeScript/React fundamentals? → Skip it
- Could I explain this in <50 lines? → If no, you're over-explaining
- Will 3+ future tasks need this exact pattern? → If no, skip codification

---

### Real Example: agent-events.md (613 lines)

**What actually needed documenting** (30 lines):
- What agent events are for (delegation tracking, not tool calls)
- Event types available
- Where types are defined
- One usage example
- Key insight: Don't use for every tool call

**What should have been skipped** (583 lines):
- TypeScript interface definitions (already in code with JSDoc)
- How discriminated unions work (TypeScript fundamentals)
- Multiple implementation approaches (library docs)
- Full component implementations (implementation detail)
- Type guard explanations (TypeScript handbook)
- Testing examples (belongs in testing skill)
- Architecture diagrams (over-explaining)
- Integration tables (obvious from types)
- "Common patterns" section (too granular)
- "Gotchas" repeating the same point

**Result**: 95% of file is noise, 5% is signal.

---

### Where to Add Patterns

**PREFER separate files over SKILL.md**. SKILL.md should stay concise (~200-400 lines).

| Pattern Size | Where to Add |
|--------------|--------------|
| 1-2 lines (reference) | SKILL.md quick reference table |
| 10-50 lines (pattern) | Existing file in `building/` or `testing/` |
| 50+ lines (deep dive) | New file in appropriate subdirectory |

**SKILL.md is for**:
- Overview and quick reference
- Links to detailed pattern files
- Decision trees ("when to use X vs Y")

**Separate files are for**:
- Actual pattern implementations
- Code examples
- Edge cases and gotchas

**Example structure**:
```
.claude/skills/react-components/
├── SKILL.md              # Overview, quick ref, links (~300 lines)
├── building/
│   ├── forms.md          # Form patterns (detailed)
│   ├── datatable.md      # DataTable patterns (detailed)
│   └── hook-patterns.md  # Hook extraction patterns (detailed)
└── testing/
    └── component-tests.md
```

**Antipattern**: Adding 30+ line patterns directly to SKILL.md. This bloats the overview file.

---

### Codification Process
