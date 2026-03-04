import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { taskResolvers } from "../resolvers/task.js";
import { sprintResolvers } from "../resolvers/sprint.js";
import { developerResolvers } from "../resolvers/developer.js";
import { mutationResolvers } from "../resolvers/mutations.js";
import { createTestDb, wrapDbAsPool, seedTestData } from "./test-helpers.js";
import { createLoaders } from "../loaders.js";

let db: Database.Database;
let pool: any;
let ctx: any;

beforeAll(() => {
  db = createTestDb();
  seedTestData(db);
  pool = wrapDbAsPool(db);
  ctx = { db: pool, loaders: createLoaders(pool) };
});

// ── Task Query Resolvers ──────────────────────────────────

describe("Task query resolvers", () => {
  it("fetches a single task by sprint and taskNum", async () => {
    const result = await taskResolvers.Query.task(null, { sprint: "test-sprint", taskNum: 1 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Set up database");
    expect(result!.status).toBe("green");
    expect(result!._owner).toBe("alice");
  });

  it("returns null for nonexistent task", async () => {
    const result = await taskResolvers.Query.task(null, { sprint: "test-sprint", taskNum: 999 }, ctx);
    expect(result).toBeNull();
  });

  it("lists all tasks without filters", async () => {
    const result = await taskResolvers.Query.tasks(null, {}, ctx);
    expect(result.length).toBe(4);
  });

  it("filters tasks by sprint", async () => {
    const result = await taskResolvers.Query.tasks(null, { sprint: "test-sprint" }, ctx);
    expect(result.length).toBe(4);
    expect(result.every((t: any) => t.sprint === "test-sprint")).toBe(true);
  });

  it("filters tasks by status", async () => {
    const result = await taskResolvers.Query.tasks(null, { status: "green" }, ctx);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Set up database");
  });

  it("filters tasks by owner", async () => {
    const result = await taskResolvers.Query.tasks(null, { owner: "alice" }, ctx);
    expect(result.length).toBe(2);
  });

  it("returns empty for no matching filter", async () => {
    const result = await taskResolvers.Query.tasks(null, { owner: "nobody" }, ctx);
    expect(result.length).toBe(0);
  });
});

describe("Task computed fields", () => {
  it("computes actualMinutes from started_at and completed_at", () => {
    const task = {
      startedAt: "2026-02-22T09:00:00",
      completedAt: "2026-02-22T11:30:00",
    };
    expect(taskResolvers.Task.actualMinutes(task)).toBe(150);
  });

  it("returns null actualMinutes when not completed", () => {
    expect(taskResolvers.Task.actualMinutes({ startedAt: "2026-02-22T09:00:00", completedAt: null })).toBeNull();
    expect(taskResolvers.Task.actualMinutes({ startedAt: null, completedAt: null })).toBeNull();
  });

  it("computes blowUpRatio correctly", () => {
    const task = {
      startedAt: "2026-02-22T09:00:00",
      completedAt: "2026-02-22T11:00:00",
      estimatedMinutes: 60,
    };
    // 120 actual / 60 estimated = 2.0
    expect(taskResolvers.Task.blowUpRatio(task)).toBe(2.0);
  });

  it("returns null blowUpRatio when missing fields", () => {
    expect(taskResolvers.Task.blowUpRatio({ startedAt: null, completedAt: null, estimatedMinutes: 60 })).toBeNull();
    expect(taskResolvers.Task.blowUpRatio({ startedAt: "2026-02-22T09:00:00", completedAt: "2026-02-22T10:00:00", estimatedMinutes: null })).toBeNull();
  });
});

// ── Sprint Query Resolvers ────────────────────────────────

describe("Sprint query resolvers", () => {
  it("fetches a sprint by name", async () => {
    const result = await sprintResolvers.Query.sprint(null, { name: "test-sprint" }, ctx);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("test-sprint");
    expect(result!.status).toBe("active");
    expect(result!.goal).toBe("Build the thing");
  });

  it("returns null for nonexistent sprint", async () => {
    const result = await sprintResolvers.Query.sprint(null, { name: "no-sprint" }, ctx);
    expect(result).toBeNull();
  });

  it("lists all sprints", async () => {
    const result = await sprintResolvers.Query.sprints(null, {}, ctx);
    expect(result.length).toBe(2);
  });

  it("filters sprints by status", async () => {
    const result = await sprintResolvers.Query.sprints(null, { status: "active" }, ctx);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("test-sprint");
  });

  it("filters sprints by projectId", async () => {
    const result = await sprintResolvers.Query.sprints(null, { projectId: "test-proj" }, ctx);
    expect(result.length).toBe(2);
  });
});

describe("Sprint field resolvers", () => {
  it("resolves sprint tasks", async () => {
    const sprint = { name: "test-sprint" };
    const tasks = await sprintResolvers.Sprint.tasks(sprint, {}, ctx);
    expect(tasks.length).toBe(4);
  });

  it("filters sprint tasks by status", async () => {
    const sprint = { name: "test-sprint" };
    const tasks = await sprintResolvers.Sprint.tasks(sprint, { status: "blocked" }, ctx);
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe("Deploy");
  });

  it("resolves sprint progress", async () => {
    const sprint = { name: "test-sprint" };
    const progress = await sprintResolvers.Sprint.progress(sprint, null, ctx);
    expect(progress.totalTasks).toBe(4);
    expect(progress.green).toBe(1);
    expect(progress.blocked).toBe(1);
  });

  it("returns zero progress for empty sprint", async () => {
    const sprint = { name: "empty-sprint" };
    const progress = await sprintResolvers.Sprint.progress(sprint, null, ctx);
    expect(progress.totalTasks).toBe(0);
    expect(progress.percentComplete).toBe(0);
  });

  it("resolves sprint project", async () => {
    const sprint = { projectId: "test-proj" };
    const project = await sprintResolvers.Sprint.project(sprint, null, ctx);
    expect(project).not.toBeNull();
    expect(project!.name).toBe("Test Project");
  });

  it("returns null project when no projectId", async () => {
    const sprint = { projectId: null };
    const project = await sprintResolvers.Sprint.project(sprint, null, ctx);
    expect(project).toBeNull();
  });
});

// ── Developer Query Resolvers ─────────────────────────────

describe("Developer query resolvers", () => {
  it("fetches a developer by name", async () => {
    const result = await developerResolvers.Query.developer(null, { name: "alice" }, ctx);
    expect(result).not.toBeNull();
    expect(result!.fullName).toBe("Alice Smith");
    expect(result!.role).toBe("fullstack");
  });

  it("returns null for nonexistent developer", async () => {
    const result = await developerResolvers.Query.developer(null, { name: "nobody" }, ctx);
    expect(result).toBeNull();
  });

  it("lists all developers", async () => {
    const result = await developerResolvers.Query.developers(null, {}, ctx);
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("alice");
    expect(result[1].name).toBe("bob");
  });
});

describe("Developer field resolvers", () => {
  it("resolves developer skills", async () => {
    const dev = { name: "alice" };
    const skills = await developerResolvers.Developer.skills(dev, null, ctx);
    expect(skills.length).toBe(2);
    expect(skills[0].category).toBe("backend");
    expect(skills[0].skill).toBe("node");
    expect(skills[0].rating).toBe(3.8);
  });

  it("resolves developer tasks", async () => {
    const dev = { name: "alice" };
    const tasks = await developerResolvers.Developer.tasks(dev, {}, ctx);
    expect(tasks.length).toBe(2);
  });

  it("filters developer tasks by status", async () => {
    const dev = { name: "alice" };
    const tasks = await developerResolvers.Developer.tasks(dev, { status: "green" }, ctx);
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe("Set up database");
  });

  it("resolves developer availability for a date", async () => {
    const dev = { name: "alice" };
    const avail = await developerResolvers.Developer.availability(dev, { date: "2026-02-23" }, ctx);
    expect(avail).not.toBeNull();
    expect(avail!.expectedMinutes).toBe(480);
    expect(avail!.effectiveness).toBe(1.2);
  });

  it("returns null availability for missing date", async () => {
    const dev = { name: "alice" };
    const avail = await developerResolvers.Developer.availability(dev, { date: "2099-01-01" }, ctx);
    expect(avail).toBeNull();
  });

  it("resolves developer context", async () => {
    const dev = { name: "alice" };
    const contexts = await developerResolvers.Developer.context(dev, {}, ctx);
    expect(contexts.length).toBe(1);
    expect(contexts[0].concurrentSessions).toBe(3);
    expect(contexts[0].alertness).toBe(0.85);
    expect(contexts[0].environment).toBe("office");
  });

  it("resolves developer context with latest=true", async () => {
    const dev = { name: "alice" };
    const contexts = await developerResolvers.Developer.context(dev, { latest: true }, ctx);
    expect(contexts.length).toBe(1);
  });
});

// ── Mutation Resolvers ────────────────────────────────────
// Mutations use Postgres-specific features (NOW(), RETURNING) so we mock ctx.db.query

describe("Mutation resolvers", () => {
  it("setAvailability returns correct defaults", async () => {
    const mockCtx = {
      db: { query: async () => ({ rows: [] }) },
      loaders: ctx.loaders,
    };
    const result = await mutationResolvers.Mutation.setAvailability(
      null,
      { developer: "bob", date: "2026-03-01", expectedMinutes: 360 },
      mockCtx
    );
    expect(result.developer).toBe("bob");
    expect(result.date).toBe("2026-03-01");
    expect(result.expectedMinutes).toBe(360);
    expect(result.effectiveness).toBe(1.0);
    expect(result.status).toBe("available");
    expect(result.notes).toBeNull();
  });

  it("setSkill returns correct defaults", async () => {
    const mockCtx = {
      db: { query: async () => ({ rows: [] }) },
      loaders: ctx.loaders,
    };
    const result = await mutationResolvers.Mutation.setSkill(
      null,
      { developer: "bob", category: "backend", skill: "python", rating: 3.5 },
      mockCtx
    );
    expect(result.developer).toBe("bob");
    expect(result.category).toBe("backend");
    expect(result.skill).toBe("python");
    expect(result.rating).toBe(3.5);
    expect(result.source).toBe("manager");
  });

  it("recordContext returns mapped result", async () => {
    const mockCtx = {
      db: {
        query: async () => ({
          rows: [{
            id: 99, developer: "alice", recorded_at: "2026-03-01T10:00:00",
            concurrent_sessions: 2, hour_of_day: 14, alertness: 0.9,
            environment: "office", notes: null,
          }],
        }),
      },
      loaders: ctx.loaders,
    };
    const result = await mutationResolvers.Mutation.recordContext(
      null,
      { developer: "alice", concurrentSessions: 2, hourOfDay: 14, alertness: 0.9, environment: "office" },
      mockCtx
    );
    expect(result.id).toBe(99);
    expect(result.developer).toBe("alice");
    expect(result.concurrentSessions).toBe(2);
    expect(result.alertness).toBe(0.9);
  });

  it("logActivity returns mapped result", async () => {
    const mockCtx = {
      db: {
        query: async () => ({
          rows: [{
            id: 1, timestamp: "2026-03-01T10:00:00", developer: "alice",
            action: "task_completed", sprint: "s1", task_num: 1,
            summary: "Done", metadata: null,
          }],
        }),
      },
      loaders: ctx.loaders,
    };
    const result = await mutationResolvers.Mutation.logActivity(
      null,
      { developer: "alice", action: "task_completed", sprint: "s1", taskNum: 1, summary: "Done" },
      mockCtx
    );
    expect(result.id).toBe(1);
    expect(result.action).toBe("task_completed");
    expect(result.sprint).toBe("s1");
  });
});
