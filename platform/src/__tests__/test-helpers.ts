import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Creates an in-memory SQLite database with the full schema applied.
 * Runs the base schema + migration 004 so tests have all tables.
 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  // Apply base schema
  const baseSchema = readFileSync(
    resolve(__dirname, "../../test-fixtures/nos-schema.sql"),
    "utf-8"
  );
  db.exec(baseSchema);

  // Apply migration 004 (data platform tables)
  const migration = readFileSync(
    resolve(__dirname, "../../test-fixtures/004-data-platform.sql"),
    "utf-8"
  );
  db.exec(migration);

  return db;
}

/**
 * Seeds the test database with sample data for integration tests.
 */
export function seedTestData(db: Database.Database) {
  // Developer
  db.prepare(
    `INSERT INTO developers (name, full_name, role, strengths)
     VALUES ('alice', 'Alice Smith', 'fullstack', 'Systems thinking')`
  ).run();

  db.prepare(
    `INSERT INTO developers (name, full_name, role)
     VALUES ('bob', 'Bob Jones', 'frontend')`
  ).run();

  // Skills
  db.prepare(
    `INSERT INTO developer_skills (developer, category, skill, rating, source)
     VALUES ('alice', 'frontend', 'react', 4.2, 'manager')`
  ).run();
  db.prepare(
    `INSERT INTO developer_skills (developer, category, skill, rating, source)
     VALUES ('alice', 'backend', 'node', 3.8, 'manager')`
  ).run();
  db.prepare(
    `INSERT INTO developer_skills (developer, category, skill, rating, source)
     VALUES ('bob', 'frontend', 'react', 4.8, 'manager')`
  ).run();

  // Project
  db.prepare(
    `INSERT INTO projects (id, name, description, repo_url, start_at, status)
     VALUES ('test-proj', 'Test Project', 'A test project', 'https://github.com/test/repo', '2026-02-22T00:00:00', 'active')`
  ).run();

  // Sprints
  db.prepare(
    `INSERT INTO sprints (name, project_id, start_at, deadline, status, goal)
     VALUES ('test-sprint', 'test-proj', '2026-02-22T00:00:00', '2026-03-01T00:00:00', 'active', 'Build the thing')`
  ).run();
  db.prepare(
    `INSERT INTO sprints (name, project_id, start_at, status)
     VALUES ('empty-sprint', 'test-proj', '2026-02-22T00:00:00', 'planning')`
  ).run();

  // Tasks
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, description, done_when, status, type, owner, estimated_minutes, complexity, priority, horizon, started_at, completed_at)
     VALUES ('test-sprint', 1, 'Set up database', 'Create tables', 'Tables exist', 'green', 'database', 'alice', 120, 'medium', 1.0, 'active', '2026-02-22T09:00:00', '2026-02-22T11:30:00')`
  ).run();
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, description, done_when, status, type, owner, estimated_minutes, complexity, priority, horizon, started_at)
     VALUES ('test-sprint', 2, 'Build API', 'GraphQL API', 'Queries work', 'red', 'actions', 'alice', 240, 'high', 2.0, 'active', '2026-02-22T12:00:00')`
  ).run();
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, description, done_when, status, type, estimated_minutes, priority, horizon)
     VALUES ('test-sprint', 3, 'Frontend components', 'React UI', 'Components render', 'pending', 'frontend', 180, 3.0, 'active')`
  ).run();
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, priority, horizon, blocked_reason)
     VALUES ('test-sprint', 4, 'Deploy', 'blocked', 'infra', 4.0, 'active', 'Waiting on CI')`
  ).run();

  // Dependencies: task 2 depends on task 1, task 3 depends on task 2
  db.prepare(
    `INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task)
     VALUES ('test-sprint', 2, 'test-sprint', 1)`
  ).run();
  db.prepare(
    `INSERT INTO task_dependencies (sprint, task_num, depends_on_sprint, depends_on_task)
     VALUES ('test-sprint', 3, 'test-sprint', 2)`
  ).run();

  // Contributor availability
  db.prepare(
    `INSERT INTO contributor_availability (developer, date, expected_minutes, effectiveness, status)
     VALUES ('alice', '2026-02-23', 480, 1.2, 'available')`
  ).run();

  // Developer context
  db.prepare(
    `INSERT INTO developer_context (developer, concurrent_sessions, hour_of_day, alertness, environment)
     VALUES ('alice', 3, 14, 0.85, 'office')`
  ).run();

  // Activity log
  db.prepare(
    `INSERT INTO activity_log (developer, action, sprint, task_num, summary)
     VALUES ('alice', 'task_completed', 'test-sprint', 1, 'Alice completed test-sprint #1')`
  ).run();
}

/**
 * Wraps a better-sqlite3 Database to match the SupabasePool interface.
 * Resolvers call pool.query(sql, params) — this shim translates
 * Postgres-style $1,$2 placeholders back to ? for SQLite.
 *
 * Handles both SELECT (returns rows) and non-SELECT statements (INSERT/UPDATE/DELETE)
 * by detecting the statement type and using .all() vs .run() accordingly.
 */
export function wrapDbAsPool(db: Database.Database): any {
  return {
    query(sql: string, params: any[] = []) {
      const sqliteSql = sql.replace(/\$\d+/g, "?");
      const trimmed = sqliteSql.trimStart().toUpperCase();
      if (
        trimmed.startsWith("SELECT") ||
        trimmed.startsWith("WITH") ||
        sqliteSql.toUpperCase().includes("RETURNING")
      ) {
        const rows = db.prepare(sqliteSql).all(...params);
        return Promise.resolve({ rows });
      } else {
        db.prepare(sqliteSql).run(...params);
        return Promise.resolve({ rows: [] });
      }
    },
    end() {
      return Promise.resolve();
    },
  };
}
