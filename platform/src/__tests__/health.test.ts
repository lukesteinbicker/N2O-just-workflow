import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../schema/typeDefs.js";
import { resolvers } from "../resolvers/index.js";
import { createTestDb, wrapDbAsPool } from "./test-helpers.js";
import type { Context } from "../context.js";
import type Database from "better-sqlite3";
import { createLoaders } from "../loaders.js";

let db: Database.Database;
let server: ApolloServer<Context>;

beforeAll(() => {
  db = createTestDb();
  seedHealthData(db);
  server = new ApolloServer<Context>({ typeDefs, resolvers });
});

afterAll(() => {
  db.close();
});

function executeQuery(query: string, variables?: Record<string, any>) {
  const pool = wrapDbAsPool(db);
  return server.executeOperation(
    { query, variables },
    { contextValue: { db: pool, loaders: createLoaders(pool) } }
  );
}

function getData(res: any) {
  expect(res.body.kind).toBe("single");
  const result = (res.body as any).singleResult;
  if (result.errors) {
    throw new Error(
      `GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`
    );
  }
  return result.data;
}

/**
 * Seed data for health monitoring tests.
 * Each core table gets at least one row so we can verify counts and timestamps.
 */
function seedHealthData(db: Database.Database) {
  // Developer (needed as FK for developer_context)
  db.prepare(
    `INSERT INTO developers (name, full_name, role) VALUES ('alice', 'Alice Smith', 'fullstack')`
  ).run();

  // Projects + Sprint (needed as FK for tasks)
  db.prepare(
    `INSERT INTO projects (id, name, status) VALUES ('proj-1', 'Test Project', 'active')`
  ).run();
  db.prepare(
    `INSERT INTO sprints (name, project_id, start_at, status) VALUES ('sprint-1', 'proj-1', '2026-02-01', 'active')`
  ).run();

  // Tasks (2 rows)
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, created_at)
     VALUES ('sprint-1', 1, 'Task one', 'green', 'database', '2026-03-01T10:00:00')`
  ).run();
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, created_at)
     VALUES ('sprint-1', 2, 'Task two', 'red', 'frontend', '2026-03-03T08:00:00')`
  ).run();

  // Transcripts (3 rows)
  db.prepare(
    `INSERT INTO transcripts (session_id, file_path, started_at)
     VALUES ('sess-1', '/tmp/sess1.jsonl', '2026-03-02T12:00:00')`
  ).run();
  db.prepare(
    `INSERT INTO transcripts (session_id, file_path, started_at)
     VALUES ('sess-2', '/tmp/sess2.jsonl', '2026-03-03T09:00:00')`
  ).run();
  db.prepare(
    `INSERT INTO transcripts (session_id, file_path, started_at)
     VALUES ('sess-3', '/tmp/sess3.jsonl', '2026-03-03T10:00:00')`
  ).run();

  // Workflow events (5 rows)
  db.prepare(
    `INSERT INTO workflow_events (session_id, event_type, timestamp)
     VALUES ('sess-1', 'tool_call', '2026-03-02T12:01:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, event_type, timestamp)
     VALUES ('sess-1', 'phase_entered', '2026-03-02T12:05:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, event_type, timestamp)
     VALUES ('sess-2', 'tool_call', '2026-03-03T09:01:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, event_type, timestamp)
     VALUES ('sess-2', 'skill_invoked', '2026-03-03T09:02:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, event_type, timestamp)
     VALUES ('sess-3', 'tool_call', '2026-03-03T10:01:00')`
  ).run();

  // Developer context (1 row)
  db.prepare(
    `INSERT INTO developer_context (developer, concurrent_sessions, hour_of_day, recorded_at)
     VALUES ('alice', 3, 14, '2026-03-03T09:00:00')`
  ).run();

  // Skill versions (2 rows)
  db.prepare(
    `INSERT INTO skill_versions (skill_name, version, introduced_at)
     VALUES ('tdd-agent', '1.0', '2026-02-15T00:00:00')`
  ).run();
  db.prepare(
    `INSERT INTO skill_versions (skill_name, version, introduced_at)
     VALUES ('pm-agent', '1.0', '2026-03-01T00:00:00')`
  ).run();
}

// ── Data Health Query ─────────────────────────────────────

describe("dataHealth query", () => {
  it("returns health data for all 5 core streams", async () => {
    const res = await executeQuery(`
      query { dataHealth {
        stream count lastUpdated recentCount
      }}
    `);
    const data = getData(res);
    expect(data.dataHealth).toHaveLength(5);

    const streams = data.dataHealth.map((s: any) => s.stream);
    expect(streams).toContain("transcripts");
    expect(streams).toContain("workflow_events");
    expect(streams).toContain("tasks");
    expect(streams).toContain("developer_context");
    expect(streams).toContain("skill_versions");
  });

  it("returns correct count for each stream", async () => {
    const res = await executeQuery(`
      query { dataHealth { stream count } }
    `);
    const data = getData(res);
    const byStream = Object.fromEntries(
      data.dataHealth.map((s: any) => [s.stream, s])
    );

    expect(byStream.transcripts.count).toBe(3);
    expect(byStream.workflow_events.count).toBe(5);
    expect(byStream.tasks.count).toBe(2);
    expect(byStream.developer_context.count).toBe(1);
    expect(byStream.skill_versions.count).toBe(2);
  });

  it("returns lastUpdated as the most recent timestamp per stream", async () => {
    const res = await executeQuery(`
      query { dataHealth { stream lastUpdated } }
    `);
    const data = getData(res);
    const byStream = Object.fromEntries(
      data.dataHealth.map((s: any) => [s.stream, s])
    );

    expect(byStream.transcripts.lastUpdated).toBe("2026-03-03T10:00:00");
    expect(byStream.workflow_events.lastUpdated).toBe("2026-03-03T10:01:00");
    expect(byStream.tasks.lastUpdated).toBe("2026-03-03T08:00:00");
    expect(byStream.developer_context.lastUpdated).toBe("2026-03-03T09:00:00");
    expect(byStream.skill_versions.lastUpdated).toBe("2026-03-01T00:00:00");
  });

  it("returns zero recentCount for seed data with past timestamps", async () => {
    // All seed data has fixed timestamps in the past (2026-03-01 to 2026-03-03),
    // so none fall within the 1-hour recency window relative to "now"
    const res = await executeQuery(`
      query { dataHealth { stream recentCount } }
    `);
    const data = getData(res);
    const byStream = Object.fromEntries(
      data.dataHealth.map((s: any) => [s.stream, s])
    );

    expect(byStream.transcripts.recentCount).toBe(0);
    expect(byStream.workflow_events.recentCount).toBe(0);
    expect(byStream.tasks.recentCount).toBe(0);
    expect(byStream.developer_context.recentCount).toBe(0);
    expect(byStream.skill_versions.recentCount).toBe(0);
  });

  it("returns zero count and null lastUpdated for empty tables", async () => {
    const emptyDb = createTestDb();
    const emptyPool = wrapDbAsPool(emptyDb);

    const emptyServer = new ApolloServer<Context>({ typeDefs, resolvers });
    const res = await emptyServer.executeOperation(
      { query: `query { dataHealth { stream count lastUpdated } }` },
      { contextValue: { db: emptyPool, loaders: createLoaders(emptyPool) } }
    );

    const data = getData(res);
    const byStream = Object.fromEntries(
      data.dataHealth.map((s: any) => [s.stream, s])
    );

    expect(byStream.transcripts.count).toBe(0);
    expect(byStream.transcripts.lastUpdated).toBeNull();
    expect(byStream.workflow_events.count).toBe(0);
    expect(byStream.workflow_events.lastUpdated).toBeNull();

    emptyDb.close();
  });
});
