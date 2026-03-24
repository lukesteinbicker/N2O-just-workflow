# Subagent Prompts

Reusable prompt templates for audit subagents. Read the file, substitute variables, invoke Task tool.

## Structure

```
subagent-prompts/
├── task/                    # Per-task audits (after each task completes)
│   ├── pattern-compliance.md
│   ├── gap-analysis.md
│   └── testing-posture.md
└── spec/                    # Per-spec audits (when all spec tasks complete)
    ├── tasks-db-audit.md
    ├── scope-verification.md
    └── pattern-consolidation.md
```

## Usage

1. Read the prompt file
2. Substitute variables (marked with `${variableName}`)
3. Invoke Task tool with the populated prompt

```typescript
// Example: Pattern Compliance audit
const prompt = readFile('subagent-prompts/task/pattern-compliance.md');
const populated = prompt
  .replace('${taskId}', '42')
  .replace('${taskTitle}', 'Create parseCSV utility')
  .replace('${filesChanged}', 'parseCSV.ts, parseCSV.test.ts');

Task({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  description: 'Audit pattern compliance',
  prompt: populated
});
```

## Variables

### Task Audits
- `${taskId}` - Task ID from tasks.db
- `${taskTitle}` - Task title
- `${filesChanged}` - Comma-separated list of changed files
- `${doneWhen}` - Done When criteria from task
- `${testFiles}` - Test file paths
- `${implFiles}` - Implementation file paths

### Spec Audits
- `${specPath}` - Path to spec file
- `${taskIds}` - Comma-separated task IDs
- `${taskTitles}` - Comma-separated task titles
- `${allFilesChanged}` - All files changed across tasks
- `${skillsUpdated}` - Skills that were updated

## When to Use

| Audit Type | Trigger | Subagents |
|------------|---------|-----------|
| Task | After each task is green | 3 parallel (pattern, gap, testing) |
| Spec | After all spec tasks are green | 3 parallel (db, scope, patterns) |
