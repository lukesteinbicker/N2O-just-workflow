# Adding Tasks to tasks.db

Quick reference for adding tasks and dependencies during implementation.

## Create a Task

```bash
sqlite3 .pm/tasks.db "INSERT INTO tasks (spec_path, sprint, title, description, done_when) VALUES (
  '.pm/todo/agent/01-attachments.md',
  'agent-foundation',
  'Add attachment metadata to chat history',
  'Show attachment icon/badge in message list for messages that had attachments.',
  'Icon visible for messages with attachments, hidden for messages without'
);"
```

**Required fields**:
- `spec_path` - Link to the spec file
- `sprint` - Sprint name (e.g., 'agent-foundation')
- `title` - What to do (concise)
- `done_when` - Acceptance criteria

**Optional fields**:
- `description` - Additional context

## Get the Task ID

After INSERT, get the new task ID:

```bash
sqlite3 .pm/tasks.db "SELECT last_insert_rowid();"
```

Or find by title:

```bash
sqlite3 .pm/tasks.db "SELECT id FROM tasks WHERE title LIKE '%attachment metadata%';"
```

## Add Dependencies

Task B depends on Task A (B can't start until A is green):

```bash
sqlite3 .pm/tasks.db "INSERT INTO task_dependencies (task_id, depends_on) VALUES (
  69,  -- task that depends (B)
  68   -- task it depends on (A)
);"
```

## Common Patterns

### New task depends on current task

```bash
# After completing task 3, add task 69 that depends on it
sqlite3 .pm/tasks.db "INSERT INTO tasks (spec_path, sprint, title, done_when) VALUES (
  '.pm/todo/agent/01-attachments.md',
  'agent-foundation',
  'Add attachment preview UI',
  'Preview shows before send'
);"

# Get new ID
NEW_ID=$(sqlite3 .pm/tasks.db "SELECT last_insert_rowid();")

# Add dependency on task 3
sqlite3 .pm/tasks.db "INSERT INTO task_dependencies VALUES ($NEW_ID, 3);"
```

### Multiple dependencies

```bash
# Task 70 depends on both 68 and 69
sqlite3 .pm/tasks.db "INSERT INTO task_dependencies VALUES (70, 68), (70, 69);"
```

## Verify

```bash
# Check task was added
sqlite3 -header -column .pm/tasks.db "SELECT id, title, status FROM tasks WHERE id = 69;"

# Check dependencies
sqlite3 -header -column .pm/tasks.db "SELECT * FROM task_dependencies WHERE task_id = 69;"

# Check if available (no pending dependencies)
sqlite3 -header -column .pm/tasks.db "SELECT id, title FROM available_tasks WHERE id = 69;"
```

## Task Granularity

### Antipattern: Over-Splitting Coupled Tasks

**BAD**: Separate tasks for tightly coupled components
```
Task 6: Create parseCSV tool
Task 7: Create matchInvestors tool
Task 8: Create createInvestors tool
```
→ 9 TDD phases × 3 = 27 phase transitions, 3 audits, 3 completion reports

**GOOD**: Single task for cohesive unit
```
Task 6: Create Import Agent tools (parseCSV, matchInvestors, createInvestors)
```
→ 9 TDD phases, 1 audit, 1 completion report

### When to Split vs Combine

**Combine into one task when**:
- Components are wired together (same export, same agent)
- Can't meaningfully test one without the others
- Same spec, same sprint, same reviewer

**Split into separate tasks when**:
- Different people could work in parallel
- Independent testing/deployment
- Different areas of codebase

**Rule of thumb**: If you'd implement them in one sitting anyway, make it one task.

---

## Update Spec

After adding task to database, update the spec file:

```markdown
## Suggested Tasks

| # | Task | Done When |
|---|------|-----------|
| 1 | Create parseCSVPreview utility | Unit tests pass |
| 2 | Wire context injection | Attachments add context |
| 3 | Test with CSV files | E2E passes |
| **4** | **Add attachment metadata display** | **Icon shows for attachments** | <-- NEW
```
