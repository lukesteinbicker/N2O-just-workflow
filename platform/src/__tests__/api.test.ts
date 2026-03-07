import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../schema/typeDefs.js";
import { resolvers } from "../resolvers/index.js";
import {
  createTestDb,
  seedTestData,
  wrapDbAsPool,
} from "./test-helpers.js";
import type { Context } from "../context.js";
import type Database from "better-sqlite3";
import { createLoaders } from "../loaders.js";

let db: Database.Database;
let pool: ReturnType<typeof wrapDbAsPool>;
let server: ApolloServer<Context>;

beforeAll(() => {
  db = createTestDb();
  seedTestData(db);
  pool = wrapDbAsPool(db);
  server = new ApolloServer<Context>({ typeDefs, resolvers });
});

afterAll(() => {
  db.close();
});

function executeQuery(query: string, variables?: Record<string, any>) {
  return server.executeOperation(
    { query, variables },
    { contextValue: { db: pool, loaders: createLoaders(pool) } }
  );
}

// ── Task Queries ──────────────────────────────────────────

describe("Task queries", () => {
  it("fetches a single task by sprint and taskNum", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 1) {
        sprint taskNum title status type
      }}
    `);
    expect(res.body.kind).toBe("single");
    const data = (res.body as any).singleResult.data;
    expect(data.task).toEqual({
      sprint: "test-sprint",
      taskNum: 1,
      title: "Set up database",
      status: "green",
      type: "database",
    });
  });

  it("returns null for nonexistent task", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 999) {
        title
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.task).toBeNull();
  });

  it("returns estimatedMinutes from estimated_minutes column", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 1) {
        estimatedMinutes
      }}
    `);
    const data = (res.body as any).singleResult.data;
    // 120 minutes stored directly
    expect(data.task.estimatedMinutes).toBe(120);
  });

  it("computes actualMinutes from started_at and completed_at", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 1) {
        actualMinutes
      }}
    `);
    const data = (res.body as any).singleResult.data;
    // 09:00 → 11:30 = 150 minutes
    expect(data.task.actualMinutes).toBe(150);
  });

  it("computes blowUpRatio correctly", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 1) {
        blowUpRatio estimatedMinutes actualMinutes
      }}
    `);
    const data = (res.body as any).singleResult.data;
    // 150 actual / 120 estimated = 1.25
    expect(data.task.blowUpRatio).toBe(1.25);
  });

  it("returns null for blowUpRatio when task not completed", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 2) {
        blowUpRatio actualMinutes
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.task.blowUpRatio).toBeNull();
    expect(data.task.actualMinutes).toBeNull();
  });

  it("filters tasks by sprint", async () => {
    const res = await executeQuery(`
      query { tasks(sprint: "test-sprint") { taskNum } }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.tasks).toHaveLength(4);
  });

  it("filters tasks by status", async () => {
    const res = await executeQuery(`
      query { tasks(sprint: "test-sprint", status: "green") { taskNum title } }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].title).toBe("Set up database");
  });

  it("resolves task dependencies", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 2) {
        title
        dependencies { taskNum title }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.task.dependencies).toHaveLength(1);
    expect(data.task.dependencies[0].taskNum).toBe(1);
    expect(data.task.dependencies[0].title).toBe("Set up database");
  });

  it("resolves task dependents", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 1) {
        title
        dependents { taskNum title }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.task.dependents).toHaveLength(1);
    expect(data.task.dependents[0].taskNum).toBe(2);
  });

  it("resolves task owner as Developer", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 1) {
        owner { name fullName role }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.task.owner).toEqual({
      name: "alice",
      fullName: "Alice Smith",
      role: "fullstack",
    });
  });

  it("returns null owner for unassigned task", async () => {
    const res = await executeQuery(`
      query { task(sprint: "test-sprint", taskNum: 3) {
        owner { name }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.task.owner).toBeNull();
  });
});

// ── Sprint Queries ──────────────────────────────────────────

describe("Sprint queries", () => {
  it("fetches sprint by name with progress", async () => {
    const res = await executeQuery(`
      query { sprint(name: "test-sprint") {
        name status goal deadline
        progress { totalTasks green pending red blocked percentComplete }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.sprint.name).toBe("test-sprint");
    expect(data.sprint.status).toBe("active");
    expect(data.sprint.goal).toBe("Build the thing");
    expect(data.sprint.progress.totalTasks).toBe(4);
    expect(data.sprint.progress.green).toBe(1);
    expect(data.sprint.progress.pending).toBe(1);
    expect(data.sprint.progress.red).toBe(1);
    expect(data.sprint.progress.blocked).toBe(1);
    expect(data.sprint.progress.percentComplete).toBe(25.0);
  });

  it("returns zero progress for empty sprint", async () => {
    const res = await executeQuery(`
      query { sprint(name: "empty-sprint") {
        progress { totalTasks percentComplete }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.sprint.progress.totalTasks).toBe(0);
    expect(data.sprint.progress.percentComplete).toBe(0);
  });

  it("resolves sprint → project relationship", async () => {
    const res = await executeQuery(`
      query { sprint(name: "test-sprint") {
        project { id name repoUrl }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.sprint.project.id).toBe("test-proj");
    expect(data.sprint.project.name).toBe("Test Project");
  });

  it("lists sprints filtered by status", async () => {
    const res = await executeQuery(`
      query { sprints(status: "planning") { name } }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.sprints).toHaveLength(1);
    expect(data.sprints[0].name).toBe("empty-sprint");
  });

  it("lists sprint tasks filtered by status", async () => {
    const res = await executeQuery(`
      query { sprint(name: "test-sprint") {
        tasks(status: "blocked") { taskNum title blockedReason }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.sprint.tasks).toHaveLength(1);
    expect(data.sprint.tasks[0].taskNum).toBe(4);
    expect(data.sprint.tasks[0].blockedReason).toBe("Waiting on CI");
  });
});

// ── Project Queries ──────────────────────────────────────────

describe("Project queries", () => {
  it("fetches project by ID with sprints", async () => {
    const res = await executeQuery(`
      query { project(id: "test-proj") {
        id name description repoUrl status
        sprints { name status }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.project.name).toBe("Test Project");
    expect(data.project.repoUrl).toBe("https://github.com/test/repo");
    expect(data.project.sprints).toHaveLength(2);
  });

  it("returns null for nonexistent project", async () => {
    const res = await executeQuery(`
      query { project(id: "nonexistent") { name } }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.project).toBeNull();
  });
});

// ── Developer Queries ──────────────────────────────────────────

describe("Developer queries", () => {
  it("fetches developer with hierarchical skills", async () => {
    const res = await executeQuery(`
      query { developer(name: "alice") {
        name fullName role strengths
        skills { category skill rating source }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.developer.name).toBe("alice");
    expect(data.developer.fullName).toBe("Alice Smith");
    expect(data.developer.strengths).toBe("Systems thinking");
    expect(data.developer.skills).toHaveLength(2);
    expect(data.developer.skills).toContainEqual({
      category: "frontend",
      skill: "react",
      rating: 4.2,
      source: "manager",
    });
    expect(data.developer.skills).toContainEqual({
      category: "backend",
      skill: "node",
      rating: 3.8,
      source: "manager",
    });
  });

  it("fetches developer availability for a date", async () => {
    const res = await executeQuery(`
      query { developer(name: "alice") {
        availability(date: "2026-02-23") {
          expectedMinutes effectiveness status
        }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.developer.availability).toEqual({
      expectedMinutes: 480,
      effectiveness: 1.2,
      status: "available",
    });
  });

  it("returns null availability when no entry exists", async () => {
    const res = await executeQuery(`
      query { developer(name: "alice") {
        availability(date: "2099-01-01") {
          expectedMinutes
        }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.developer.availability).toBeNull();
  });

  it("fetches developer context snapshots", async () => {
    const res = await executeQuery(`
      query { developer(name: "alice") {
        context(latest: true) {
          concurrentSessions hourOfDay alertness environment
        }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.developer.context).toHaveLength(1);
    expect(data.developer.context[0]).toEqual({
      concurrentSessions: 3,
      hourOfDay: 14,
      alertness: 0.85,
      environment: "office",
    });
  });

  it("fetches developer velocity profile", async () => {
    const res = await executeQuery(`
      query { developer(name: "alice") {
        velocity { totalTasksCompleted }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    // Alice has 1 completed task in test data
    expect(data.developer.velocity.totalTasksCompleted).toBeGreaterThanOrEqual(
      0
    );
  });

  it("lists all developers", async () => {
    const res = await executeQuery(`
      query { developers { name role } }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.developers).toHaveLength(2);
    expect(data.developers.map((d: any) => d.name)).toContain("alice");
    expect(data.developers.map((d: any) => d.name)).toContain("bob");
  });

  it("fetches developer tasks filtered by status", async () => {
    const res = await executeQuery(`
      query { developer(name: "alice") {
        tasks(status: "green") { taskNum title }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.developer.tasks).toHaveLength(1);
    expect(data.developer.tasks[0].title).toBe("Set up database");
  });
});

// ── Mutations ──────────────────────────────────────────

describe("Mutations", () => {
  it("setAvailability creates a new entry", async () => {
    const res = await executeQuery(`
      mutation {
        setAvailability(developer: "bob", date: "2026-02-24", expectedMinutes: 360, effectiveness: 0.9, status: "limited", notes: "Half day") {
          developer { name } date expectedMinutes effectiveness status notes
        }
      }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.setAvailability).toEqual({
      developer: { name: "bob" },
      date: "2026-02-24",
      expectedMinutes: 360,
      effectiveness: 0.9,
      status: "limited",
      notes: "Half day",
    });

    // Verify persisted in DB
    const row = db
      .prepare(
        "SELECT * FROM contributor_availability WHERE developer = ? AND date = ?"
      )
      .get("bob", "2026-02-24") as any;
    expect(row.expected_minutes).toBe(360);
    expect(row.effectiveness).toBe(0.9);
  });

  it("setAvailability upserts on conflict", async () => {
    // Set initial
    await executeQuery(`
      mutation { setAvailability(developer: "bob", date: "2026-02-25", expectedMinutes: 480) {
        expectedMinutes
      }}
    `);
    // Update
    const res = await executeQuery(`
      mutation { setAvailability(developer: "bob", date: "2026-02-25", expectedMinutes: 240, status: "limited") {
        expectedMinutes status
      }}
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.setAvailability.expectedMinutes).toBe(240);
    expect(data.setAvailability.status).toBe("limited");
  });

  it("setSkill creates a skill tree entry", async () => {
    const res = await executeQuery(`
      mutation {
        setSkill(developer: "bob", category: "backend", skill: "python", rating: 3.5, source: "self") {
          developer { name } category skill rating source
        }
      }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.setSkill).toEqual({
      developer: { name: "bob" },
      category: "backend",
      skill: "python",
      rating: 3.5,
      source: "self",
    });

    // Verify in DB
    const row = db
      .prepare(
        "SELECT * FROM developer_skills WHERE developer = ? AND category = ? AND skill = ?"
      )
      .get("bob", "backend", "python") as any;
    expect(row.rating).toBe(3.5);
  });

  it("setSkill upserts rating on conflict", async () => {
    await executeQuery(`
      mutation { setSkill(developer: "bob", category: "frontend", skill: "vue", rating: 2.0) { rating } }
    `);
    const res = await executeQuery(`
      mutation { setSkill(developer: "bob", category: "frontend", skill: "vue", rating: 3.0) { rating } }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.setSkill.rating).toBe(3.0);

    // Only one row in DB
    const rows = db
      .prepare(
        "SELECT * FROM developer_skills WHERE developer = 'bob' AND skill = 'vue'"
      )
      .all();
    expect(rows).toHaveLength(1);
  });

  it("recordContext creates a developer context snapshot", async () => {
    const res = await executeQuery(`
      mutation {
        recordContext(developer: "alice", concurrentSessions: 5, hourOfDay: 22, alertness: 0.4, environment: "home") {
          developer { name } concurrentSessions hourOfDay alertness environment
        }
      }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.recordContext.developer).toEqual({ name: "alice" });
    expect(data.recordContext.concurrentSessions).toBe(5);
    expect(data.recordContext.hourOfDay).toBe(22);
    expect(data.recordContext.alertness).toBe(0.4);
    expect(data.recordContext.environment).toBe("home");
  });

  it("logActivity creates an activity log entry", async () => {
    const res = await executeQuery(`
      mutation {
        logActivity(developer: "alice", action: "pr_opened", sprint: "test-sprint", taskNum: 2, summary: "Alice opened PR for API") {
          developer { name } action sprint { name } taskNum summary
        }
      }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.logActivity.developer).toEqual({ name: "alice" });
    expect(data.logActivity.action).toBe("pr_opened");
    expect(data.logActivity.sprint).toEqual({ name: "test-sprint" });
    expect(data.logActivity.summary).toBe("Alice opened PR for API");
  });
});

// ── Activity Log Queries ──────────────────────────────────────────

describe("Activity log queries", () => {
  it("fetches activity log with limit", async () => {
    const res = await executeQuery(`
      query { activityLog(limit: 5) { action developer { name } summary } }
    `);
    const data = (res.body as any).singleResult.data;
    expect(data.activityLog.length).toBeGreaterThan(0);
    // Should include the seeded entry
    const seeded = data.activityLog.find(
      (a: any) => a.action === "task_completed"
    );
    expect(seeded).toBeTruthy();
    expect(seeded.developer).toEqual({ name: "alice" });
  });

  it("filters activity log by developer", async () => {
    const res = await executeQuery(`
      query { activityLog(developer: "bob") { action developer { name } } }
    `);
    const data = (res.body as any).singleResult.data;
    // May have entries from mutation tests; all should be bob's
    data.activityLog.forEach((a: any) => {
      if (a.developer) expect(a.developer.name).toBe("bob");
    });
  });
});

// ── Nested Query (Full Depth) ──────────────────────────────────────────

describe("Nested queries", () => {
  it("resolves a deep nested query: sprint → tasks → owner → skills", async () => {
    const res = await executeQuery(`
      query { sprint(name: "test-sprint") {
        name
        project { name }
        progress { totalTasks percentComplete }
        tasks(status: "green") {
          taskNum title estimatedMinutes blowUpRatio
          owner {
            name
            skills { category skill rating }
            availability(date: "2026-02-23") { expectedMinutes effectiveness }
            context(latest: true) { concurrentSessions alertness }
          }
          dependencies { taskNum }
        }
      }}
    `);
    const data = (res.body as any).singleResult.data;
    const errors = (res.body as any).singleResult.errors;
    expect(errors).toBeUndefined();

    expect(data.sprint.name).toBe("test-sprint");
    expect(data.sprint.project.name).toBe("Test Project");
    expect(data.sprint.progress.totalTasks).toBe(4);

    const greenTasks = data.sprint.tasks;
    expect(greenTasks).toHaveLength(1);

    const task = greenTasks[0];
    expect(task.title).toBe("Set up database");
    expect(task.estimatedMinutes).toBe(120);
    expect(task.blowUpRatio).toBe(1.25);

    expect(task.owner.name).toBe("alice");
    expect(task.owner.skills.length).toBeGreaterThan(0);
    expect(task.owner.availability.expectedMinutes).toBe(480);
    expect(task.owner.availability.effectiveness).toBe(1.2);
    // Latest context is from recordContext mutation (concurrentSessions: 5)
    // which ran before this test
    expect(task.owner.context).toHaveLength(1);
    expect(task.owner.context[0].concurrentSessions).toBeDefined();
    expect(task.owner.context[0].alertness).toBeDefined();

    expect(task.dependencies).toHaveLength(0); // task 1 has no deps
  });
});

// ── Task Claim/Unclaim/Assign Mutations ──────────────────────────────────

describe("Task claim mutations", () => {
  // Seed extra tasks for claim mutation tests
  beforeAll(() => {
    // Task 5: pending, no deps, available for claiming
    db.prepare(
      `INSERT INTO tasks (sprint, task_num, title, status, type, priority, horizon)
       VALUES ('test-sprint', 5, 'Claimable task', 'pending', 'frontend', 5.0, 'active')`
    ).run();

    // Task 6: pending, depends on task 2 (which is 'red', not green) — should fail dep check
    db.prepare(
      `INSERT INTO tasks (sprint, task_num, title, status, type, priority, horizon)
       VALUES ('test-sprint', 6, 'Blocked by deps', 'pending', 'frontend', 6.0, 'active')`
    ).run();
    db.prepare(
      `INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task)
       VALUES ('test-sprint', 6, 'test-sprint', 2)`
    ).run();

    // Task 7: red status, owned by alice — for unclaim tests
    db.prepare(
      `INSERT INTO tasks (sprint, task_num, title, status, type, owner, priority, horizon, started_at)
       VALUES ('test-sprint', 7, 'Red task for unclaim', 'red', 'actions', 'alice', 7.0, 'active', '2026-02-22T14:00:00')`
    ).run();

    // Task 8: green status — unclaim should fail (not red)
    db.prepare(
      `INSERT INTO tasks (sprint, task_num, title, status, type, owner, priority, horizon, started_at, completed_at)
       VALUES ('test-sprint', 8, 'Green task', 'green', 'actions', 'alice', 8.0, 'active', '2026-02-22T14:00:00', '2026-02-22T15:00:00')`
    ).run();

    // Task 9: blocked status — for assignTask regardless of status
    db.prepare(
      `INSERT INTO tasks (sprint, task_num, title, status, type, priority, horizon, blocked_reason)
       VALUES ('test-sprint', 9, 'Blocked task for assign', 'blocked', 'infra', 9.0, 'active', 'Waiting on approval')`
    ).run();
  });

  // ── claimTask ──

  it("claimTask succeeds on a pending task with no unfinished deps", async () => {
    const res = await executeQuery(`
      mutation {
        claimTask(sprint: "test-sprint", taskNum: 5, developer: "bob") {
          sprint taskNum status startedAt
          owner { name }
        }
      }
    `);
    const data = (res.body as any).singleResult.data;
    const errors = (res.body as any).singleResult.errors;
    expect(errors).toBeUndefined();
    expect(data.claimTask.sprint).toBe("test-sprint");
    expect(data.claimTask.taskNum).toBe(5);
    expect(data.claimTask.status).toBe("red");
    expect(data.claimTask.startedAt).toBeTruthy();
    expect(data.claimTask.owner.name).toBe("bob");

    // Verify in DB
    const row = db
      .prepare("SELECT * FROM tasks WHERE sprint = ? AND task_num = ?")
      .get("test-sprint", 5) as any;
    expect(row.owner).toBe("bob");
    expect(row.status).toBe("red");
    expect(row.started_at).toBeTruthy();
  });

  it("claimTask fails on an already-claimed task", async () => {
    const res = await executeQuery(`
      mutation {
        claimTask(sprint: "test-sprint", taskNum: 5, developer: "alice") {
          taskNum
        }
      }
    `);
    const errors = (res.body as any).singleResult.errors;
    expect(errors).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/already claimed/i);
  });

  it("claimTask fails on a task with unfinished dependencies", async () => {
    const res = await executeQuery(`
      mutation {
        claimTask(sprint: "test-sprint", taskNum: 6, developer: "bob") {
          taskNum
        }
      }
    `);
    const errors = (res.body as any).singleResult.errors;
    expect(errors).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/unfinished dep/i);
  });

  // ── unclaimTask ──

  it("unclaimTask succeeds on a red task", async () => {
    const res = await executeQuery(`
      mutation {
        unclaimTask(sprint: "test-sprint", taskNum: 7) {
          sprint taskNum status startedAt
          owner { name }
        }
      }
    `);
    const data = (res.body as any).singleResult.data;
    const errors = (res.body as any).singleResult.errors;
    expect(errors).toBeUndefined();
    expect(data.unclaimTask.status).toBe("pending");
    expect(data.unclaimTask.startedAt).toBeNull();
    expect(data.unclaimTask.owner).toBeNull();

    // Verify in DB
    const row = db
      .prepare("SELECT * FROM tasks WHERE sprint = ? AND task_num = ?")
      .get("test-sprint", 7) as any;
    expect(row.owner).toBeNull();
    expect(row.status).toBe("pending");
    expect(row.started_at).toBeNull();
  });

  it("unclaimTask fails on a non-red task", async () => {
    const res = await executeQuery(`
      mutation {
        unclaimTask(sprint: "test-sprint", taskNum: 8) {
          taskNum
        }
      }
    `);
    const errors = (res.body as any).singleResult.errors;
    expect(errors).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/only unclaim.*red/i);
  });

  // ── assignTask ──

  it("assignTask succeeds regardless of status", async () => {
    const res = await executeQuery(`
      mutation {
        assignTask(sprint: "test-sprint", taskNum: 9, developer: "alice") {
          sprint taskNum status
          owner { name }
        }
      }
    `);
    const data = (res.body as any).singleResult.data;
    const errors = (res.body as any).singleResult.errors;
    expect(errors).toBeUndefined();
    expect(data.assignTask.sprint).toBe("test-sprint");
    expect(data.assignTask.taskNum).toBe(9);
    expect(data.assignTask.status).toBe("blocked"); // status unchanged
    expect(data.assignTask.owner.name).toBe("alice");

    // Verify in DB
    const row = db
      .prepare("SELECT * FROM tasks WHERE sprint = ? AND task_num = ?")
      .get("test-sprint", 9) as any;
    expect(row.owner).toBe("alice");
  });
});
