import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { analyticsResolvers } from "../resolvers/analytics.js";
import { createTestDb, wrapDbAsPool } from "./test-helpers.js";
import { createLoaders } from "../loaders.js";

function seedDateFilterData(db: Database.Database) {
  // Developer
  db.prepare(
    `INSERT INTO developers (name, full_name, role) VALUES ('alice', 'Alice Smith', 'fullstack')`
  ).run();
  db.prepare(
    `INSERT INTO developers (name, full_name, role) VALUES ('bob', 'Bob Jones', 'frontend')`
  ).run();

  // Sprint
  db.prepare(
    `INSERT INTO sprints (name, status) VALUES ('s1', 'active')`
  ).run();

  // Task completed in January
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, owner, estimated_minutes, started_at, completed_at, reversions, testing_posture, pattern_audited, pattern_audit_notes)
     VALUES ('s1', 1, 'Jan task', 'green', 'database', 'alice', 60, '2026-01-10T09:00:00', '2026-01-10T10:30:00', 0, 'A', 1, 'clean')`
  ).run();

  // Task completed in February
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, owner, estimated_minutes, started_at, completed_at, reversions, testing_posture, pattern_audited, pattern_audit_notes)
     VALUES ('s1', 2, 'Feb task', 'green', 'frontend', 'alice', 120, '2026-02-15T09:00:00', '2026-02-15T12:00:00', 2, 'B', 1, 'fake test found')`
  ).run();

  // Task completed in March
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, owner, estimated_minutes, started_at, completed_at, reversions, testing_posture, pattern_audited, pattern_audit_notes)
     VALUES ('s1', 3, 'Mar task', 'green', 'actions', 'bob', 90, '2026-03-01T09:00:00', '2026-03-01T11:00:00', 1, 'A', 1, 'violation found')`
  ).run();

  // Workflow events at different timestamps for skillUsage filtering
  db.prepare(
    `INSERT INTO workflow_events (timestamp, session_id, sprint, task_num, event_type, tool_name)
     VALUES ('2026-01-10T10:00:00', 'sess-jan', 's1', 1, 'tool_call', 'Read')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (timestamp, session_id, sprint, task_num, event_type, tool_name)
     VALUES ('2026-01-10T10:05:00', 'sess-jan', 's1', 1, 'tool_call', 'Read')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (timestamp, session_id, sprint, task_num, event_type, tool_name)
     VALUES ('2026-02-15T10:00:00', 'sess-feb', 's1', 2, 'tool_call', 'Edit')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (timestamp, session_id, sprint, task_num, event_type, tool_name)
     VALUES ('2026-03-01T10:00:00', 'sess-mar', 's1', 3, 'tool_call', 'Read')`
  ).run();
}

describe("Date filters on analytics queries", () => {
  let db: Database.Database;
  let ctx: any;

  beforeAll(() => {
    db = createTestDb();
    seedDateFilterData(db);
    const pool = wrapDbAsPool(db);
    ctx = { db: pool, loaders: createLoaders(db) };
  });

  // ── developerQuality ────────────────────────────

  it("developerQuality returns all tasks when no date filters", async () => {
    const rows = await analyticsResolvers.Query.developerQuality(null, {}, ctx);
    // alice has 2 tasks, bob has 1
    const alice = rows.find((r: any) => r._owner === "alice");
    expect(alice).toBeDefined();
    expect(alice.totalTasks).toBe(2);
  });

  it("developerQuality filters by dateFrom on completed_at", async () => {
    const rows = await analyticsResolvers.Query.developerQuality(
      null,
      { dateFrom: "2026-02-01" },
      ctx
    );
    // Only Feb task for alice (completed 2026-02-15)
    const alice = rows.find((r: any) => r._owner === "alice");
    expect(alice).toBeDefined();
    expect(alice.totalTasks).toBe(1);
    expect(alice.totalReversions).toBe(2); // Feb task had 2 reversions
  });

  it("developerQuality filters by dateTo on completed_at", async () => {
    const rows = await analyticsResolvers.Query.developerQuality(
      null,
      { dateTo: "2026-01-31" },
      ctx
    );
    // Only Jan task for alice
    const alice = rows.find((r: any) => r._owner === "alice");
    expect(alice).toBeDefined();
    expect(alice.totalTasks).toBe(1);
    expect(alice.totalReversions).toBe(0);
    // Bob has no tasks in Jan
    const bob = rows.find((r: any) => r._owner === "bob");
    expect(bob).toBeUndefined();
  });

  // ── commonAuditFindings ─────────────────────────

  it("commonAuditFindings filters by dateFrom", async () => {
    const rows = await analyticsResolvers.Query.commonAuditFindings(
      null,
      { dateFrom: "2026-02-01" },
      ctx
    );
    const alice = rows.find((r: any) => r._owner === "alice");
    expect(alice).toBeDefined();
    expect(alice.totalTasks).toBe(1); // Only Feb task
    expect(alice.fakeTestIncidents).toBe(1); // "fake test found" in notes
  });

  // ── estimationAccuracy ──────────────────────────

  it("estimationAccuracy filters by dateFrom", async () => {
    const rows = await analyticsResolvers.Query.estimationAccuracy(
      null,
      { dateFrom: "2026-02-01" },
      ctx
    );
    const alice = rows.find((r: any) => r._owner === "alice");
    expect(alice).toBeDefined();
    expect(alice.tasksWithEstimates).toBe(1); // Only Feb task
  });

  // ── sprintVelocity ─────────────────────────────

  it("sprintVelocity filters by dateFrom", async () => {
    const rows = await analyticsResolvers.Query.sprintVelocity(
      null,
      { dateFrom: "2026-02-01" },
      ctx
    );
    expect(rows.length).toBe(1);
    expect(rows[0].completedTasks).toBe(2); // Feb + Mar tasks
  });

  it("sprintVelocity filters by dateFrom and dateTo together", async () => {
    const rows = await analyticsResolvers.Query.sprintVelocity(
      null,
      { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
      ctx
    );
    expect(rows.length).toBe(1);
    expect(rows[0].completedTasks).toBe(1); // Only Feb task
  });

  // ── skillUsage ──────────────────────────────────

  it("skillUsage filters by dateFrom on workflow_events.timestamp", async () => {
    const rows = await analyticsResolvers.Query.skillUsage(
      null,
      { dateFrom: "2026-02-01" },
      ctx
    );
    // Feb: 1 Edit event, Mar: 1 Read event. Jan excluded.
    const readTool = rows.find((r: any) => r._skillName === "Read");
    const editTool = rows.find((r: any) => r._skillName === "Edit");
    expect(readTool).toBeDefined();
    expect(readTool.invocations).toBe(1); // Only March's Read (Jan excluded)
    expect(editTool).toBeDefined();
    expect(editTool.invocations).toBe(1);
  });
});
