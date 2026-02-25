# Workflow Dashboard

**Status**: Not Started
**Priority**: High
**Estimated Effort**: 2-3 sprints
**Author**: N2O Engineering

---

## Goals

This project supports three core goals of the N2O workflow repository:

### 1. Demonstrate Engineering Depth

> "The idea behind this repository is to impress the people with whom we engage on how thoughtful our process is."

The dashboard makes our invisible process visible. When a client or partner sees:
- Real-time task dependencies flowing through TDD phases
- AI contribution metrics with maintained quality
- Velocity data across projects

...they understand we're not another body shop. We have institutional knowledge about 4-5x developer output, and we can prove it.

### 2. Enable Multi-Engineer Collaboration

As we scale beyond single-engineer projects, we need:
- Visibility into who's working on what
- Prevention of duplicate work (task claiming)
- Shared understanding of project status

This dashboard solves the coordination problem without adding process overhead.

### 3. Compound Our Workflow Investment

We're investing tens of thousands of hours into these workflows. The dashboard:
- Provides data to improve the workflow (what's slow? what breaks?)
- Makes onboarding faster (new engineers see the system working)
- Creates an extensible foundation (adapters for any client's tools)

---

## Working With This Spec

### Your Judgment First

**Default to your own judgment.** You were hired because you're capable. Most decisions don't need approval:

- Implementation details (which library, how to structure code)
- UI/UX refinements within the spirit of the mockups
- Bug fixes and edge case handling
- Performance optimizations
- Adding helpful features that don't change scope

**Don't ask permission. Make good decisions and ship.**

### Review Checkpoints

There are only **two points** where we should review together:

| Checkpoint | When | What We Review |
|------------|------|----------------|
| **Data Model** | Before writing code | Schema design, adapter interface, any changes to the canonical structure |
| **Final Polish** | Before shipping | Overall UX, edge cases, anything that feels off |

Everything between these checkpoints is yours to execute.

### When to Escalate

Escalate only when:

1. **Scope change** — You discover we need something fundamentally different than spec'd
2. **Blocked** — External dependency or access issue you can't resolve
3. **Uncertainty with high stakes** — A decision that's hard to reverse and you're genuinely unsure

**Do not escalate:**
- "Is this the right approach?" — Try it, see if it works
- "Should I use X or Y library?" — Pick one, we can change later
- "This mockup doesn't cover edge case Z" — Handle it sensibly
- "I found a better way to do this" — Great, do it

### How to Escalate

When you do need input, follow this order:

**1. Ask Claude first.**

Before interrupting a human, ask Claude. Describe the problem, the options you see, and what you're leaning toward. Claude can often help you think through it or point out something you missed. This is free and instant.

**2. Value your peers' time at 3x yours.**

(We tell them the same thing about your time — it's not a hierarchy thing, it's a communication friction thing. Context-switching is expensive for everyone.)

Before pinging a peer, ask: "Is this worth 15 minutes of their time?" If yes, proceed. If not, make a decision and move on.

**3. Provide a written deliverable.**

Never escalate with just "Hey, got a minute?" or "What should I do about X?"

Instead, send a brief written summary:

```
## Question: [One-line summary]

### Context
[2-3 sentences on what you're trying to do]

### Options
A. [First option] — [Tradeoff]
B. [Second option] — [Tradeoff]
C. [Third option] — [Tradeoff]

### Recommendation
I recommend **Option B** because [reasoning].

### What I need from you
[Specific ask: "Confirm this is right" / "Poke holes" / "Tell me what I'm missing"]
```

This format:
- Forces you to think through the problem (often you'll solve it yourself)
- Respects their time (they can respond async in 2 minutes)
- Gets you a faster, better answer

### Questions Are Fine

Asking questions is different from escalating. If you're curious about context or want to understand the "why" behind something, ask anytime. The goal is to avoid blocking yourself waiting for approval on things you can decide.

---

## Vision

Build an extensible workflow dashboard that visualizes our AI-powered development process. The dashboard serves two purposes:

1. **Internal**: Give our team real-time visibility into task progress, dependencies, and velocity across multiple projects
2. **External**: Demonstrate to clients and partners the sophistication of our engineering process

The dashboard connects to any task management system (Linear, Jira, Plane, or our own SQLite) through a pluggable adapter layer, enabling us to meet clients where they are while maintaining our workflow advantages.

---

## Why This Matters

Our TDD workflow with 3-subagent auditing is unique. No off-the-shelf tool tracks:
- TDD phases (RED → GREEN → REFACTOR → AUDIT → COMMIT)
- Testing posture grades (A-F quality gates)
- Pattern codification as institutional knowledge
- AI vs. human code contribution metrics

By building a thin visualization layer on top of our existing workflow, we:
- Make our process legible to non-technical stakeholders
- Enable multi-engineer collaboration without stepping on each other
- Track metrics that matter for AI-assisted development
- Create a differentiator that demonstrates our engineering depth

---

## Architecture

### Principles

1. **Adapters, not integrations** — Task management systems are pluggable. Linear today, Jira tomorrow, custom next year.
2. **SQLite as canonical store** — Our agents work against SQLite. External systems sync to/from it.
3. **Real-time optional** — Works offline, syncs when connected.
4. **Zero agent overhead** — Dashboard reads from database. Agents don't know it exists.

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SYSTEMS                               │
│                                                                          │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │  Linear  │    │   Jira   │    │  Plane   │    │  GitHub  │         │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘         │
│        │               │               │               │                │
└────────┼───────────────┼───────────────┼───────────────┼────────────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           ADAPTER LAYER                                  │
│                                                                          │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│   │LinearAdapter │ │ JiraAdapter  │ │ PlaneAdapter │ │GitHubAdapter │  │
│   └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                          │
│   All adapters implement: TaskSystemAdapter interface                    │
│   - fetchTasks(project, since) → Task[]                                  │
│   - pushUpdates(tasks) → void                                            │
│   - fetchDependencies(project) → Dependency[]                            │
│   - mapStatus(internalStatus) → externalStatus                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SYNC ENGINE                                      │
│                                                                          │
│   - Bidirectional sync with conflict resolution                          │
│   - Runs on schedule (30s) or on-demand                                  │
│   - Tracks sync state per adapter                                        │
│   - Handles offline/reconnection gracefully                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      CANONICAL DATA STORE                                │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    PostgreSQL (Supabase)                         │   │
│   │                                                                  │   │
│   │  Tables:                                                         │   │
│   │  - projects          (multi-project support)                     │   │
│   │  - tasks             (enhanced with workflow fields)             │   │
│   │  - task_dependencies (graph structure)                           │   │
│   │  - activity_log      (audit trail)                               │   │
│   │  - user_presence     (who's working on what)                     │   │
│   │  - sync_state        (per-adapter sync tracking)                 │   │
│   │                                                                  │   │
│   │  Views:                                                          │   │
│   │  - available_tasks, sprint_progress, velocity_report, etc.       │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DASHBOARD                                       │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      Next.js Application                         │   │
│   │                                                                  │   │
│   │  Views:                                                          │   │
│   │  - Board View      (Kanban with TDD phases)                      │   │
│   │  - Graph View      (Dependency visualization)                    │   │
│   │  - Activity Feed   (Real-time updates)                           │   │
│   │  - Velocity        (Team and individual metrics)                 │   │
│   │  - AI Metrics      (Contribution tracking)                       │   │
│   │  - Project Rollup  (Cross-project visibility)                    │   │
│   │                                                                  │   │
│   │  Features:                                                       │   │
│   │  - Real-time via Supabase subscriptions                          │   │
│   │  - Task claiming (prevent double work)                           │   │
│   │  - Presence indicators (who's online)                            │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Adapter Interface

All task management system adapters implement this interface:

```typescript
interface TaskSystemAdapter {
  name: string;  // 'linear', 'jira', 'plane', 'github'

  // Authentication
  connect(credentials: AdapterCredentials): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Read operations
  fetchProjects(): Promise<ExternalProject[]>;
  fetchTasks(projectId: string, since?: Date): Promise<ExternalTask[]>;
  fetchDependencies(projectId: string): Promise<ExternalDependency[]>;

  // Write operations
  pushTaskUpdate(task: TaskUpdate): Promise<void>;
  pushBulkUpdates(tasks: TaskUpdate[]): Promise<void>;

  // Mapping
  mapStatusToExternal(status: InternalStatus): string;
  mapStatusFromExternal(status: string): InternalStatus;
  mapPriorityToExternal(priority: InternalPriority): string;
  mapPriorityFromExternal(priority: string): InternalPriority;

  // Custom fields (for workflow-specific data)
  supportsCustomFields(): boolean;
  getCustomFieldMapping(): CustomFieldMapping;
}

// Internal status includes TDD phases
type InternalStatus =
  | 'pending'
  | 'red'       // Writing failing tests
  | 'green'     // Implementation complete
  | 'refactor'  // Cleaning up
  | 'audit'     // 3-subagent review
  | 'blocked'
  | 'done';

interface TaskUpdate {
  externalId: string;
  status?: InternalStatus;
  testingPosture?: 'A' | 'B' | 'C' | 'D' | 'F';
  aiContributionPct?: number;
  commitHash?: string;
  hoursSpent?: number;
  claimedBy?: string;
}
```

### Adapter Implementations

#### Linear Adapter (First Implementation)

```typescript
class LinearAdapter implements TaskSystemAdapter {
  name = 'linear';

  mapStatusToExternal(status: InternalStatus): string {
    // Linear uses: backlog, todo, in_progress, done, canceled
    const mapping = {
      'pending': 'todo',
      'red': 'in_progress',
      'green': 'in_progress',
      'refactor': 'in_progress',
      'audit': 'in_progress',
      'blocked': 'todo',  // With blocked label
      'done': 'done'
    };
    return mapping[status];
  }

  // Custom fields for workflow data
  getCustomFieldMapping(): CustomFieldMapping {
    return {
      testingPosture: 'Testing Posture',  // Single-select A/B/C/D/F
      aiContributionPct: 'AI Contribution',  // Number 0-100
      commitHash: 'Commit Hash',  // Text
      hoursSpent: 'Hours Spent',  // Number
      tddPhase: 'TDD Phase'  // Single-select RED/GREEN/REFACTOR/AUDIT
    };
  }
}
```

#### Future Adapters

| Adapter | Priority | Notes |
|---------|----------|-------|
| Linear | P0 | First implementation, already in use |
| Jira | P1 | Many enterprise clients use it |
| Plane | P2 | Open source alternative |
| GitHub Issues | P2 | Simple projects, OSS |
| Standalone | P0 | No external system, just our DB |

---

## Database Schema

### Projects Table (New)

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    external_system TEXT,           -- 'linear', 'jira', 'plane', 'standalone'
    external_id TEXT,               -- ID in external system
    external_url TEXT,              -- Link to project in external system
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Enhanced Tasks Table

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Project association
    project_id TEXT REFERENCES projects(id),

    -- External system link
    external_system TEXT,           -- Which adapter created this
    external_id TEXT,               -- ID in external system
    external_url TEXT,              -- Direct link

    -- Core fields (existing)
    sprint TEXT NOT NULL,
    task_num INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    done_when TEXT,
    status TEXT DEFAULT 'pending',
    blocked_reason TEXT,
    type TEXT,
    skills TEXT,

    -- Assignment & claiming
    owner TEXT,                     -- Assigned to
    claimed_by TEXT,                -- Currently working on
    claimed_at TIMESTAMP,

    -- TDD workflow tracking
    tdd_phase TEXT,                 -- 'red', 'green', 'refactor', 'audit'

    -- Audit tracking
    pattern_audited BOOLEAN DEFAULT FALSE,
    pattern_audit_notes TEXT,
    skills_updated BOOLEAN DEFAULT FALSE,
    skills_update_notes TEXT,
    tests_pass BOOLEAN DEFAULT FALSE,
    testing_posture TEXT,

    -- AI contribution tracking
    ai_assisted BOOLEAN DEFAULT TRUE,
    ai_contribution_pct INTEGER DEFAULT 80,

    -- Git tracking
    commit_hash TEXT,

    -- Velocity tracking (auto-populated by triggers)
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Sync tracking
    last_synced_at TIMESTAMP,
    sync_conflict BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(project_id, sprint, task_num),

    CHECK (status IN ('pending', 'red', 'green', 'refactor', 'audit', 'blocked', 'done')),
    CHECK (tdd_phase IS NULL OR tdd_phase IN ('red', 'green', 'refactor', 'audit')),
    CHECK (testing_posture IS NULL OR testing_posture IN ('A', 'B', 'C', 'D', 'F')),
    CHECK (ai_contribution_pct IS NULL OR (ai_contribution_pct >= 0 AND ai_contribution_pct <= 100))
);
```

### Activity Log

```sql
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who and what
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,           -- 'claimed', 'released', 'status_changed',
                                    -- 'completed', 'blocked', 'commented', 'synced'

    -- Context
    project_id TEXT REFERENCES projects(id),
    task_id UUID REFERENCES tasks(id),
    sprint TEXT,
    task_num INTEGER,

    -- Details
    old_value TEXT,                 -- Previous state
    new_value TEXT,                 -- New state
    metadata JSONB,                 -- Additional context

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_project ON activity_log(project_id, created_at DESC);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
```

### User Presence

```sql
CREATE TABLE user_presence (
    user_id TEXT PRIMARY KEY,
    display_name TEXT,
    avatar_url TEXT,

    -- Current activity
    current_project_id TEXT REFERENCES projects(id),
    current_task_id UUID REFERENCES tasks(id),
    status TEXT DEFAULT 'online',   -- 'online', 'idle', 'offline'

    -- Timestamps
    last_seen TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW()
);
```

### Sync State

```sql
CREATE TABLE sync_state (
    adapter_name TEXT NOT NULL,
    project_id TEXT REFERENCES projects(id),

    last_sync_at TIMESTAMP,
    last_sync_status TEXT,          -- 'success', 'partial', 'failed'
    last_sync_error TEXT,

    -- Cursor for incremental sync
    sync_cursor TEXT,

    PRIMARY KEY (adapter_name, project_id)
);
```

---

## Dashboard Views

### 1. Board View (Kanban)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Project: Client Alpha    Sprint: auth-sprint         Progress: 60%    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PENDING        RED           GREEN         AUDIT          DONE        │
│  ─────────      ───           ─────         ─────          ────        │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐  │
│  │ #6      │   │ #3      │   │ #2      │   │ #4      │   │ #1      │  │
│  │ Password│   │ Login   │   │ Login   │   │ Wire    │   │ Users   │  │
│  │ reset   │   │ Form    │   │ action  │   │ page    │   │ table   │  │
│  │         │   │         │   │         │   │         │   │         │  │
│  │ ○ adam  │   │ ● luke  │   │ ● adam  │   │ 🔍 audit│   │ ✓ 1.2h  │  │
│  │         │   │ 0.5h    │   │ 1.1h    │   │ Grade:B │   │ 🤖 85%  │  │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘  │
│                                                                         │
│  Legend: ● claimed  ○ available  🔍 in audit  🤖 AI%  ✓ complete       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2. Graph View (Dependencies)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Dependency Graph: auth-sprint                          [Zoom] [Reset] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                    ┌──────────────┐                                    │
│                    │ #1 Users     │                                    │
│                    │ table ✓      │                                    │
│                    └──────┬───────┘                                    │
│                           │                                            │
│              ┌────────────┴────────────┐                               │
│              ▼                         ▼                               │
│    ┌──────────────┐          ┌──────────────┐                         │
│    │ #2 Login     │          │ #3 LoginForm │                         │
│    │ action 🟢    │          │ 🔴           │                         │
│    └──────┬───────┘          └──────┬───────┘                         │
│           │                         │                                  │
│           └────────────┬────────────┘                                  │
│                        ▼                                               │
│              ┌──────────────┐                                          │
│              │ #4 Wire page │                                          │
│              │ 🔍 audit     │                                          │
│              └──────┬───────┘                                          │
│                     │                                                  │
│                     ▼                                                  │
│              ┌──────────────┐                                          │
│              │ #5 E2E tests │                                          │
│              │ ○ pending    │                                          │
│              └──────────────┘                                          │
│                                                                         │
│  ✓ done  🟢 green  🔴 red  🔍 audit  ○ pending  ⊘ blocked              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3. Activity Feed

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Activity                                              [All Projects ▼] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ● Live                                                    just now    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 🟢 adam completed #2 Login action                        2 min    │ │
│  │    Testing Posture: A  •  AI Contribution: 85%  •  1.1 hrs        │ │
│  │    Commit: a3f2b1c                                                │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ 🔍 adam started audit on #4 Wire page                    5 min    │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ 🔴 luke claimed #3 LoginForm                            15 min    │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ 📝 Pattern codified: "Zustand store for multi-step forms"        │ │
│  │    Added to: state-management skill                      18 min   │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ ✓ sarah completed #1 Users table                         1 hr    │ │
│  │    Testing Posture: A  •  AI Contribution: 90%  •  1.2 hrs        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4. Velocity Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Velocity                                    [This Week ▼] [Export CSV] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │ TEAM TOTALS                     │  │ BY ENGINEER                 │  │
│  │                                 │  │                             │  │
│  │ Tasks Completed     32          │  │ adam     14 tasks   18.2h   │  │
│  │ Total Hours         48.5        │  │ luke     12 tasks   16.8h   │  │
│  │ Avg per Task        1.5h        │  │ sarah     6 tasks   13.5h   │  │
│  │ AI Contribution     82%         │  │                             │  │
│  │                                 │  │                             │  │
│  └─────────────────────────────────┘  └─────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ TESTING POSTURE DISTRIBUTION                                    │   │
│  │                                                                  │   │
│  │ A ████████████████████████████████████████  78%  (25 tasks)     │   │
│  │ B ████████████  19%  (6 tasks)                                  │   │
│  │ C ██  3%  (1 task)                                              │   │
│  │ D/F  0%                                                         │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ COMPLETION TREND (last 4 weeks)                                 │   │
│  │                                                                  │   │
│  │ Tasks │       ╭──╮                                              │   │
│  │   40  │      ╭╯  ╰─╮  ╭──╮                                      │   │
│  │   30  │  ╭──╯      ╰──╯  ╰──╮                                   │   │
│  │   20  │ ╭╯                  ╰──                                 │   │
│  │   10  ├─╯                                                       │   │
│  │       └────────────────────────                                 │   │
│  │         W1    W2    W3    W4                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5. AI Metrics

```
┌─────────────────────────────────────────────────────────────────────────┐
│  AI Contribution Metrics                               [All Time ▼]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ OVERALL                                                         │   │
│  │                                                                  │   │
│  │     ┌─────────────────────────────────────────┐                 │   │
│  │     │██████████████████████████████████░░░░░░│  82% AI          │   │
│  │     └─────────────────────────────────────────┘                 │   │
│  │                                                                  │   │
│  │ Total tasks completed: 847                                      │   │
│  │ Estimated hours saved: 1,200+                                   │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │ BY TASK TYPE                    │  │ BY PROJECT                  │  │
│  │                                 │  │                             │  │
│  │ database    ███████████  92%    │  │ Client Alpha   ████████ 85% │  │
│  │ frontend    █████████   78%     │  │ Client Beta    ███████  80% │  │
│  │ actions     ████████    75%     │  │ Internal       █████    72% │  │
│  │ e2e         ████████    74%     │  │                             │  │
│  │ infra       ███████     68%     │  │                             │  │
│  │ docs        █████       55%     │  │                             │  │
│  │                                 │  │                             │  │
│  └─────────────────────────────────┘  └─────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ QUALITY CORRELATION                                             │   │
│  │                                                                  │   │
│  │ "Higher AI contribution does not correlate with lower quality"  │   │
│  │                                                                  │   │
│  │ AI > 90%:  Testing Posture A: 76%  B: 20%  C: 4%               │   │
│  │ AI 50-90%: Testing Posture A: 79%  B: 18%  C: 3%               │   │
│  │ AI < 50%:  Testing Posture A: 74%  B: 21%  C: 5%               │   │
│  │                                                                  │   │
│  │ Conclusion: Quality is maintained by our audit process,         │   │
│  │ regardless of AI contribution level.                            │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6. Project Rollup

```
┌─────────────────────────────────────────────────────────────────────────┐
│  All Projects                                              [+ New]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Client Alpha                                      Linear ↗      │   │
│  │ ════════════════════════════════════════════════════════════    │   │
│  │                                                                  │   │
│  │ Current Sprint: auth-sprint           Progress: ████████░░ 80% │   │
│  │ Tasks: 12 total, 10 done, 2 in progress                         │   │
│  │ Team: adam, luke        Velocity: 1.3 hrs/task                   │   │
│  │ AI Contribution: 85%    Testing Posture: 92% A-grade            │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Client Beta                                       Jira ↗        │   │
│  │ ════════════════════════════════════════════════════════════    │   │
│  │                                                                  │   │
│  │ Current Sprint: data-import           Progress: ██████░░░░ 60% │   │
│  │ Tasks: 8 total, 5 done, 1 in progress, 2 pending                │   │
│  │ Team: sarah             Velocity: 1.8 hrs/task                   │   │
│  │ AI Contribution: 78%    Testing Posture: 88% A-grade            │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Internal: Workflow Dashboard                      Standalone    │   │
│  │ ════════════════════════════════════════════════════════════    │   │
│  │                                                                  │   │
│  │ Current Sprint: mvp                   Progress: ████░░░░░░ 40% │   │
│  │ Tasks: 15 total, 6 done, 3 in progress, 6 pending               │   │
│  │ Team: new-engineer      Velocity: 2.1 hrs/task                   │   │
│  │ AI Contribution: 90%    Testing Posture: 100% A-grade           │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Foundation (Sprint 1)

**Goal**: Basic dashboard with standalone mode (no external sync)

| Task | Description | Done When |
|------|-------------|-----------|
| Set up Supabase project | Create project, configure auth | Can connect to database |
| Implement schema | All tables, views, triggers | Schema deployed, migrations work |
| Set up Next.js dashboard | Basic app structure, Supabase client | App deploys to Vercel |
| Board view (basic) | Kanban with task cards | Can view tasks by status |
| Task claiming | Claim/release tasks | Two users can't claim same task |
| Real-time updates | Supabase subscriptions | Changes appear without refresh |

### Phase 2: Visualization (Sprint 2)

**Goal**: Dependency graph and activity feed

| Task | Description | Done When |
|------|-------------|-----------|
| Dependency graph | D3 or similar visualization | Can see task dependencies visually |
| Activity feed | Real-time log of actions | Can see who did what, when |
| Presence indicators | Who's online, what they're working on | Can see team status at a glance |
| Velocity metrics | Basic charts and numbers | Can see hours/task, completion rate |

### Phase 3: Adapters (Sprint 3)

**Goal**: Linear integration as first adapter

| Task | Description | Done When |
|------|-------------|-----------|
| Adapter interface | Define TypeScript interface | Interface documented and typed |
| Linear adapter | Implement full adapter | Can sync to/from Linear |
| Sync engine | Bidirectional with conflict handling | Changes flow both directions |
| Project settings | Configure which adapter per project | Can add project with Linear connection |

### Phase 4: Polish & Metrics (Sprint 4)

**Goal**: AI metrics, project rollup, production-ready

| Task | Description | Done When |
|------|-------------|-----------|
| AI metrics view | Contribution tracking dashboard | Can see AI vs human breakdown |
| Project rollup | Cross-project summary view | Can see all projects at once |
| Export/reporting | CSV export, printable reports | Can share metrics externally |
| Onboarding | Setup wizard, documentation | New user can set up in < 10 min |

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Database | Supabase (Postgres) | Free tier, real-time, auth built-in |
| Hosting | Vercel | Free tier, instant deploys, edge functions |
| Framework | Next.js 14+ | App router, server components, good DX |
| Styling | Tailwind + shadcn/ui | Fast iteration, consistent design |
| Charts | Recharts or Tremor | Simple, good defaults |
| Graph viz | @xyflow/react (React Flow) | Best for interactive dependency graphs |
| State | Zustand | Simple, works with real-time updates |

---

## Success Criteria

1. **Functional**: Dashboard shows real-time task status across projects
2. **Extensible**: Can add new adapter in < 1 day of work
3. **Impressive**: Non-technical stakeholders understand the workflow at a glance
4. **Fast**: Page loads in < 1s, updates appear in < 500ms
5. **Reliable**: Works offline, syncs when reconnected

---

## Open Questions

1. **Auth**: Use Supabase Auth, or just simple shared password for now?
2. **Mobile**: Need mobile view, or desktop-only for v1? See also Goal 8 (Ubiquitous Access) in `specs/n2o-roadmap.md` — the dashboard is the natural foundation for mobile contribution surfaces.
3. **Notifications**: Slack integration for task updates?
4. **Permissions**: Role-based access, or everyone sees everything?

---

## References

- [Linear API Documentation](https://developers.linear.app/docs)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [React Flow](https://reactflow.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
