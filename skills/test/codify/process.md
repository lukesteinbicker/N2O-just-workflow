### Codification Process

1. **Review audit findings** from Pattern Compliance subagent:
   ```json
   {
     "new_patterns": [
       {
         "pattern": "CSV parsing with PapaParse",
         "description": "Stream large CSV files in chunks to avoid memory issues",
         "skill_to_update": "testing-unit"
       }
     ]
   }
   ```

2. **Identify target skill** (subagent suggests which skill to update)

3. **Read the skill file** to understand existing structure:
   ```bash
   # Read the skill to find right section
   cat .claude/skills/testing-unit/SKILL.md
   ```

4. **Add new pattern** to appropriate section:
   - Create new section if needed
   - Follow existing format/style
   - Include code examples
   - Reference task ID for traceability

5. **Update skill file**:
   ```markdown
   ### CSV Parsing with Streaming (Task #123)

   **Problem**: Large CSV files (>100MB) cause memory issues with full parse.

   **Solution**: Use PapaParse streaming mode with chunk callback.

   **Pattern**:
   \`\`\`typescript
   Papa.parse(file, {
     worker: true,
     chunk: (results, parser) => {
       processChunk(results.data);
     },
     complete: () => {
       finalize();
     }
   });
   \`\`\`

   **When to use**: CSV files >10MB or unknown size.
   ```

6. **Verify skill update**:
   ```bash
   # Quick check the update is there
   grep -A 10 "CSV Parsing" .claude/skills/testing-unit/SKILL.md
   ```

7. **Update database tracking**:
   ```bash
   # Already done in Phase 7, but verify:
   sqlite3 .pm/tasks.db "SELECT skills_updated, skills_update_notes FROM tasks WHERE id = ${taskId};"
   # Should show: skills_updated=TRUE, skills_update_notes='Added CSV streaming pattern to testing-unit'
   ```

### Codification Template

Use this template when adding patterns to skills:

```markdown
### [Pattern Name] (Task #[ID])

**Problem**: [What problem does this solve?]

**Solution**: [Brief explanation of approach]

**Pattern**:
\`\`\`typescript
// Code example showing the pattern
\`\`\`

**When to use**: [Conditions/scenarios]

**Alternatives**: [Other approaches considered]
```

### Which Skill to Update?

| Pattern Type | Target Skill |
|--------------|--------------|
| Test patterns (mocking, fixtures) | `testing-unit` |
| Component testing | `react-components` |
| E2E patterns | `testing-e2e` |
| Server action patterns | `server-actions` |
| Database patterns (RLS, migrations) | `database` |
| State management patterns | `state-management` |
| Build/infra patterns | `aws`, `lambda`, `app-structure` |

### Example: Full Codification

```bash
# 1. Audit found: "CSV parsing with streaming" pattern
# 2. Target skill: testing-unit
# 3. Read skill to find location
cat .claude/skills/testing-unit/SKILL.md | grep -A 5 "CSV"

# 4. Add new section (using Edit tool)
# Added "CSV Parsing with Streaming (Task #123)" section

# 5. Verify update
grep -A 10 "CSV Parsing with Streaming" .claude/skills/testing-unit/SKILL.md

# 6. Database already updated in Phase 7 with:
#    skills_updated=TRUE
#    skills_update_notes='Added CSV streaming pattern to testing-unit'
```

### Why Codify?

**Benefits**:
- 🎓 **Knowledge retention**: Patterns don't get lost
- 🔄 **Consistency**: Future tasks use same proven approaches
- 📈 **Velocity**: Next dev agent finds pattern instead of reinventing
- 🧩 **Composability**: Documented patterns can be combined

**Without codification**: Every dev agent solves the same problem differently, leading to inconsistency and wasted effort.

