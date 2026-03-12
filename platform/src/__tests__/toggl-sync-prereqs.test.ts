import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SupabasePool } from "../db.js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── escapeParam: Array handling ─────────────────────────────

describe("escapeParam array handling", () => {
  let pool: SupabasePool;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pool = new SupabasePool();
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("escapes integer arrays into Postgres array literals", async () => {
    await pool.query("INSERT INTO t (tag_ids) VALUES ($1)", [[123, 456, 789]]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    // Should produce a valid Postgres array literal like '{123,456,789}'
    expect(body.query).toBe("INSERT INTO t (tag_ids) VALUES ('{123,456,789}')");
  });

  it("escapes empty arrays as empty Postgres array", async () => {
    await pool.query("INSERT INTO t (tag_ids) VALUES ($1)", [[]]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.query).toBe("INSERT INTO t (tag_ids) VALUES ('{}')");
  });

  it("escapes string arrays with proper quoting", async () => {
    await pool.query("INSERT INTO t (names) VALUES ($1)", [["alice", "bob"]]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    // Strings inside Postgres arrays need double-quote escaping
    expect(body.query).toBe(`INSERT INTO t (names) VALUES ('{"alice","bob"}')`);
  });

  it("escapes arrays containing null values", async () => {
    await pool.query("INSERT INTO t (ids) VALUES ($1)", [[1, null, 3]]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.query).toBe("INSERT INTO t (ids) VALUES ('{1,NULL,3}')");
  });

  it("escapes string arrays with special characters", async () => {
    await pool.query("INSERT INTO t (names) VALUES ($1)", [["O'Brien", 'say "hi"']]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    // Single quotes in array strings need escaping, double quotes need backslash
    expect(body.query).toContain("O'Brien");
    expect(body.query).toContain("say");
    // Verify the whole thing is a valid Postgres array literal (starts with '{ ends with }')
    const valueMatch = body.query.match(/VALUES \((.+)\)/);
    expect(valueMatch).not.toBeNull();
    const arrayLiteral = valueMatch![1];
    expect(arrayLiteral.startsWith("'")).toBe(true);
    expect(arrayLiteral.endsWith("'")).toBe(true);
  });
});

// ── SupabasePool.clearCache() ──────────────────────────────

describe("SupabasePool.clearCache()", () => {
  let pool: SupabasePool;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pool = new SupabasePool();
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 1 }],
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clearCache() is a callable method on SupabasePool", () => {
    expect(typeof pool.clearCache).toBe("function");
  });

  it("clearCache() invalidates cached queries so next call hits fetch", async () => {
    // First call — populates cache
    await pool.query("SELECT 1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call — served from cache
    await pool.query("SELECT 1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Clear cache
    pool.clearCache();

    // Third call — cache cleared, must hit fetch again
    await pool.query("SELECT 1");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("clearCache() does not throw when cache is empty", () => {
    expect(() => pool.clearCache()).not.toThrow();
  });
});

// ── Migration file ──────────────────────────────────────────

describe("Migration 003: toggl-sync-tables", () => {
  const migrationPath = resolve(
    __dirname,
    "../../migrations/003-toggl-sync-tables.sql"
  );

  it("migration file exists", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("creates tt_entries table with required columns", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("tt_entries");
    expect(sql).toContain("BIGINT");         // id is BIGINT for large Toggl IDs
    expect(sql).toContain("TIMESTAMPTZ");    // start/stop are TIMESTAMPTZ
    expect(sql).toContain("tag_ids");        // array column
    expect(sql).toContain("deleted_at");     // soft-delete for reconciliation
    expect(sql).toContain("synced_at");      // sync cursor
  });

  it("creates tt_projects, tt_clients, tt_tags tables", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("tt_projects");
    expect(sql).toContain("tt_clients");
    expect(sql).toContain("tt_tags");
  });

  it("creates tt_sync_log table with backfill tracking", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("tt_sync_log");
    expect(sql).toContain("backfill_cursor");
    expect(sql).toContain("backfill_complete");
    expect(sql).toContain("entries_failed");
  });

  it("creates required indexes including partial index for running entries", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("idx_tt_entries_start");
    expect(sql).toContain("idx_tt_entries_user");
    expect(sql).toContain("idx_tt_entries_project");
    expect(sql).toContain("idx_tt_entries_synced");
    // Partial index for dashboard activity query (WHERE stop IS NULL)
    expect(sql).toContain("idx_tt_entries_running");
    expect(sql).toContain("WHERE stop IS NULL");
  });
});
