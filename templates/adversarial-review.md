# Adversarial Review — Agent Prompts

> Referenced by Phase 2.75 in `skills/plan/SKILL.md`.

## Agent 1: Question Generator

Spawn a subagent with this prompt:

```
You are a senior engineer reviewing a design spec before implementation begins.
Your job is to BREAK this design — find every edge case, race condition, ambiguous
state, missing decision, and unstated assumption.

Read these files:
- The spec: {spec_path}
- The scope doc (if exists): .pm/todo/SCOPE.md
- CLAUDE.md for project context

Generate 8-15 adversarial questions, weighted toward categories that are
actually relevant to this spec. Skip categories that don't apply.

For each question:

1. State the scenario concretely (not abstractly — "User does X, then Y happens")
2. Explain why this is a problem or an unresolved decision
3. Generate 2-4 options labeled A, B, C, D
4. Mark exactly one option as "(Recommended)" with a brief rationale
5. Note any schema/spec changes the recommended option would require

Categories to draw from (use the ones relevant to this spec):
- **State transitions**: Can the entity get stuck? Are there missing statuses?
- **Race conditions**: What if two things happen at the same time?
- **Edge cases**: Empty states, first-use, last-use, zero values, max values
- **Failure modes**: What happens when external services fail?
- **Data integrity**: Can the schema represent invalid states? Are constraints tight enough?
- **Time**: Timezones, deadlines, scheduling edge cases
- **UX decisions**: What does the user see/experience in ambiguous states?
- **Security**: Can users manipulate state? Access other users' data?
- **Extensibility**: Will this design accommodate the "Later" features listed in the spec?
- **Missing flows**: What user journey isn't described but will definitely happen?
- **Identity/auth**: Account creation, merging, permissions (if applicable)
- **Money**: Rounding, partial amounts, refunds, double-charges (if applicable)

Output format — use EXACTLY this structure for each question:

### Q{N}. {Short title}

{Concrete scenario description}

| Option | Description |
|--------|-------------|
| **A. {Name} (Recommended)** | {Description + why recommended} |
| B. {Name} | {Description} |
| C. {Name} | {Description} |

**Schema/spec impact if recommended option chosen**: {what changes, or "None"}
```

## Agent 2: Review, Enrich & Present

Spawn a second subagent with Agent 1's output:

```
You are preparing an adversarial design review for a human decision-maker.

Read the spec at {spec_path} and the adversarial questions generated below.

Your job has two parts:

### Part 1: Review & Enrich

For each question:
1. Is the recommended option actually the best choice? If not, change the
   recommendation with a note: "Changed from {old} — reason: {why}"
2. For each option, add a one-line "Impl note:" describing the code/schema change
3. Flag any question that is low-value or redundant with "SKIP — reason: {why}"
4. If you identify 1-2 major gaps the first reviewer missed, add them at the end

### Part 2: Order & Present

Reorder the surviving questions for maximum clarity:
1. Group related questions together (don't interleave unrelated topics)
2. Put foundational decisions first (things that affect multiple other questions)
3. Put isolated/leaf decisions last
4. Remove any questions flagged as "SKIP"
5. Renumber sequentially: Q1, Q2, Q3... (options stay A, B, C, D)
6. Add a brief intro sentence before each group explaining the theme

Final output format:

---
## Adversarial Review: {spec name}

**Instructions**: For each question, reply with the question number and your chosen
option letter (e.g., "1A, 2B, 3C"). The recommended option is marked for each.
If you want to discuss a question further, just say so.

### {Theme: e.g., "Data Model Integrity"}

{Q1}
{Q2}

### {Theme: e.g., "Edge Cases & Failure Modes"}

{Q3}
{Q4}

...
---

{Agent 1 output here}
```

## Example Output

```markdown
## Adversarial Review: Analytics Pipeline

**Instructions**: Reply with number + letter (e.g., "1A, 2B, 3C").
Recommended options are marked.

### Data Model Integrity

**Q1. View references a table that gets dropped during migration**

Migration step 3 drops `raw_events`, but `session_summary` view
references it. Any query against the view fails after migration.

| Option | Description |
|--------|-------------|
| **A. Cascade migration order (Recommended)** | Drop dependent views first, recreate after new table. Impl note: update migration script ordering. |
| B. Keep old table as alias | Create `raw_events` as a view on the new table. Impl note: add CREATE VIEW in migration step 4. |
| C. Accept downtime | Document that views break during migration. Impl note: none, but add runbook. |

**Schema/spec impact**: Migration script reordering only. No schema change.
```
