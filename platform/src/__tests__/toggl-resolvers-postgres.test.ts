import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock toggl-api to track if Toggl API is called
vi.mock("../services/toggl-api.js", () => ({
  fetchToggl: vi.fn(),
  getToken: vi.fn().mockReturnValue("test-token"),
  cacheGet: vi.fn().mockReturnValue(null),
  cacheSet: vi.fn(),
  TOGGL_API_BASE: "https://api.track.toggl.com/api/v9",
  TOGGL_REPORTS_BASE: "https://api.track.toggl.com/reports/api/v3",
}));

// Mock auth (requireAdmin)
vi.mock("../auth.js", () => ({
  requireAdmin: vi.fn(),
}));

// Mock toggl-sync (for triggerTimeTrackingSync)
vi.mock("../services/toggl-sync.js", () => ({
  runSync: vi.fn(),
  isSyncing: vi.fn(),
  startSyncLoop: vi.fn(),
  stopSyncLoop: vi.fn(),
}));

import { timeTrackingResolvers } from "../resolvers/time-tracking.js";
import { healthResolvers } from "../resolvers/health.js";
import { fetchToggl } from "../services/toggl-api.js";
import { runSync } from "../services/toggl-sync.js";

const mockFetchToggl = vi.mocked(fetchToggl);
const mockRunSync = vi.mocked(runSync);

function createMockCtx(queryResponses: Record<string, any[]> = {}) {
  const queryLog: Array<{ sql: string; params: any[] }> = [];
  const mockPool = {
    query: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      queryLog.push({ sql, params });
      for (const [pattern, rows] of Object.entries(queryResponses)) {
        if (sql.includes(pattern)) return { rows };
      }
      return { rows: [] };
    }),
    clearCache: vi.fn(),
    end: vi.fn(),
  };
  return {
    ctx: {
      db: mockPool,
      loaders: {},
      currentUser: { name: "admin", accessRole: "admin", email: "a@b.com" },
      pageRoute: null,
    } as any,
    queryLog,
    mockPool,
  };
}

// ── Resolvers migrated to Postgres ────────────────────────

describe("Resolvers migrated to Postgres", () => {
  beforeEach(() => {
    mockFetchToggl.mockReset();
  });

  it("timeTrackingEntries queries tt_entries with deleted_at filter", async () => {
    const { ctx, queryLog } = createMockCtx({
      tt_entries: [
        {
          id: 100, description: "Work", start: "2026-03-01T09:00:00Z",
          stop: "2026-03-01T10:00:00Z", seconds: 3600, user_id: 1,
          project_id: 10, tag_ids: [1, 2], billable: false,
        },
      ],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingEntries(
      null, { startDate: "2026-03-01", endDate: "2026-03-07" }, ctx,
    );

    // Must query Postgres, not Toggl
    expect(queryLog.some((q) => q.sql.includes("tt_entries"))).toBe(true);
    expect(queryLog.some((q) => q.sql.includes("deleted_at IS NULL"))).toBe(true);
    expect(mockFetchToggl).not.toHaveBeenCalled();

    // Result maps all DB columns to GraphQL fields
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("100");  // String coercion from numeric id
    expect(result[0].description).toBe("Work");
    expect(result[0].start).toBe("2026-03-01T09:00:00Z");
    expect(result[0].stop).toBe("2026-03-01T10:00:00Z");
    expect(result[0].seconds).toBe(3600);
    expect(result[0].userId).toBe(1);
    expect(result[0].projectId).toBe(10);
    expect(result[0].tagIds).toEqual([1, 2]);
    expect(result[0].billable).toBe(false);
  });

  it("timeTrackingEntries supports limit and offset", async () => {
    const { ctx, queryLog } = createMockCtx({ tt_entries: [] });

    await timeTrackingResolvers.Query.timeTrackingEntries(
      null, { startDate: "2026-03-01", endDate: "2026-03-07", limit: 100, offset: 50 }, ctx,
    );

    const entry = queryLog.find((q) => q.sql.includes("tt_entries"));
    expect(entry!.sql).toContain("LIMIT");
    expect(entry!.sql).toContain("OFFSET");
    // Params include the limit and offset values
    expect(entry!.params).toContain(100);
    expect(entry!.params).toContain(50);
  });

  it("timeTrackingEntries uses default limit of 5000", async () => {
    const { ctx, queryLog } = createMockCtx({ tt_entries: [] });

    await timeTrackingResolvers.Query.timeTrackingEntries(
      null, { startDate: "2026-03-01", endDate: "2026-03-07" }, ctx,
    );

    const entry = queryLog.find((q) => q.sql.includes("tt_entries"));
    expect(entry!.params).toContain(5000);  // default limit
    expect(entry!.params).toContain(0);     // default offset
  });

  it("timeTrackingProjects queries tt_projects", async () => {
    const { ctx, queryLog } = createMockCtx({
      tt_projects: [{ id: 10, name: "Project A", client_id: 1, color: "#ff0000", active: true }],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingProjects(null, null, ctx);

    expect(queryLog.some((q) => q.sql.includes("tt_projects"))).toBe(true);
    expect(mockFetchToggl).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(10);
    expect(result[0].name).toBe("Project A");
    expect(result[0].clientId).toBe(1);
    expect(result[0].color).toBe("#ff0000");
    expect(result[0].active).toBe(true);
  });

  it("timeTrackingClients queries tt_clients", async () => {
    const { ctx, queryLog } = createMockCtx({
      tt_clients: [{ id: 1, name: "Client A" }],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingClients(null, null, ctx);

    expect(queryLog.some((q) => q.sql.includes("tt_clients"))).toBe(true);
    expect(mockFetchToggl).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].name).toBe("Client A");
  });

  it("timeTrackingTags queries tt_tags", async () => {
    const { ctx, queryLog } = createMockCtx({
      tt_tags: [{ id: 1, name: "Tag A" }],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingTags(null, null, ctx);

    expect(queryLog.some((q) => q.sql.includes("tt_tags"))).toBe(true);
    expect(mockFetchToggl).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].name).toBe("Tag A");
  });
});

// ── Live resolvers still use Toggl ────────────────────────

describe("Live resolvers unchanged", () => {
  beforeEach(() => {
    mockFetchToggl.mockReset();
    mockFetchToggl.mockImplementation(async (url: string) => {
      if (url.includes("/workspaces")) return [{ id: 123, name: "WS" }];
      return [];
    });
  });

  it("timeTrackingDashboardActivity still calls Toggl API", async () => {
    await timeTrackingResolvers.Query.timeTrackingDashboardActivity();

    expect(mockFetchToggl).toHaveBeenCalled();
    const urls = mockFetchToggl.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes("dashboard"))).toBe(true);
  });

  it("timeTrackingCurrentTimer still calls Toggl API", async () => {
    mockFetchToggl.mockResolvedValue(null);

    await timeTrackingResolvers.Query.timeTrackingCurrentTimer();

    expect(mockFetchToggl).toHaveBeenCalled();
    const urls = mockFetchToggl.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes("time_entries/current"))).toBe(true);
  });
});

// ── Schema + resolver behavior verification ─────────────

describe("Schema fields produce correct resolver behavior", () => {
  it("entry id is coerced to string (ID! scalar)", async () => {
    const { ctx } = createMockCtx({
      tt_entries: [{ id: 999, description: "", start: "2026-03-01T00:00:00Z", stop: null, seconds: 0, user_id: 1, project_id: null, tag_ids: null, billable: null }],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingEntries(
      null, { startDate: "2026-03-01", endDate: "2026-03-07" }, ctx,
    );

    expect(result[0].id).toBe("999");  // String, not number
    expect(typeof result[0].id).toBe("string");
  });

  it("billable defaults to false when DB returns null", async () => {
    const { ctx } = createMockCtx({
      tt_entries: [{ id: 1, description: "", start: "2026-03-01T00:00:00Z", stop: null, seconds: 0, user_id: 1, project_id: null, tag_ids: null, billable: null }],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingEntries(
      null, { startDate: "2026-03-01", endDate: "2026-03-07" }, ctx,
    );

    expect(result[0].billable).toBe(false);
  });

  it("null tag_ids defaults to empty array", async () => {
    const { ctx } = createMockCtx({
      tt_entries: [{ id: 1, description: "", start: "2026-03-01T00:00:00Z", stop: null, seconds: null, user_id: 1, project_id: null, tag_ids: null, billable: null }],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingEntries(
      null, { startDate: "2026-03-01", endDate: "2026-03-07" }, ctx,
    );

    expect(result[0].tagIds).toEqual([]);
    expect(result[0].seconds).toBe(0);  // null seconds → 0
  });
});

// ── dataHealth integration ────────────────────────────────

describe("dataHealth includes sync streams", () => {
  it("dataHealth returns tt_entries and tt_sync_log streams", async () => {
    const { ctx } = createMockCtx({
      tt_entries: [{ count: 1000, last_updated: "2026-03-12", recent_count: 50 }],
      tt_sync_log: [{ count: 10, last_updated: "2026-03-12", recent_count: 1 }],
      transcripts: [{ count: 5, last_updated: "2026-03-12", recent_count: 0 }],
    });

    const result = await healthResolvers.Query.dataHealth(null, null, ctx);

    const streamNames = result.streams.map((s: any) => s.stream);
    expect(streamNames).toContain("tt_entries");
    expect(streamNames).toContain("tt_sync_log");
  });
});

// ── E2E verification (Task #4) ──────────────────────────

describe("E2E: soft-deleted entries are filtered out", () => {
  it("entries with deleted_at set are excluded from results", async () => {
    const { ctx, queryLog } = createMockCtx({
      // Only non-deleted entries should be returned
      tt_entries: [
        { id: 1, description: "Active entry", start: "2026-03-01T09:00:00Z", stop: "2026-03-01T10:00:00Z", seconds: 3600, user_id: 1, project_id: 10, tag_ids: [], billable: false },
      ],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingEntries(
      null, { startDate: "2026-03-01", endDate: "2026-03-07" }, ctx,
    );

    // The SQL WHERE clause must include deleted_at IS NULL
    const entrySql = queryLog.find((q) => q.sql.includes("tt_entries"));
    expect(entrySql!.sql).toContain("deleted_at IS NULL");

    // Only non-deleted entries returned
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Active entry");
  });
});

describe("E2E: historical data beyond 60 days is queryable", () => {
  beforeEach(() => {
    mockFetchToggl.mockReset();
  });

  it("entries from 90 days ago are returned when date range covers them", async () => {
    const { ctx } = createMockCtx({
      tt_entries: [
        { id: 200, description: "Old entry", start: "2025-12-15T09:00:00Z", stop: "2025-12-15T17:00:00Z", seconds: 28800, user_id: 2, project_id: 5, tag_ids: [3], billable: true },
      ],
    });

    const result = await timeTrackingResolvers.Query.timeTrackingEntries(
      null, { startDate: "2025-12-01", endDate: "2025-12-31" }, ctx,
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("200");
    expect(result[0].seconds).toBe(28800);
    expect(result[0].billable).toBe(true);
    // No Toggl API call — Postgres serves historical data
    expect(mockFetchToggl).not.toHaveBeenCalled();
  });
});

describe("E2E: triggerTimeTrackingSync mutation", () => {
  beforeEach(() => {
    mockRunSync.mockReset();
  });

  it("triggers sync and returns status", async () => {
    mockRunSync.mockResolvedValue({
      status: "success",
      entriesUpserted: 42,
      lastSyncAt: "2026-03-12T12:00:00Z",
    });
    const { ctx } = createMockCtx();

    const result = await timeTrackingResolvers.Mutation.triggerTimeTrackingSync(null, null, ctx);

    expect(mockRunSync).toHaveBeenCalledWith(ctx.db);
    expect(result.status).toBe("success");
    expect(result.entriesUpserted).toBe(42);
    expect(result.lastSyncAt).toBe("2026-03-12T12:00:00Z");
  });

  it("returns error status when sync fails", async () => {
    mockRunSync.mockResolvedValue({
      status: "error",
      entriesUpserted: 0,
      error: "Reference sync failed",
    });
    const { ctx } = createMockCtx();

    const result = await timeTrackingResolvers.Mutation.triggerTimeTrackingSync(null, null, ctx);

    expect(result.status).toBe("error");
    expect(result.entriesUpserted).toBe(0);
  });
});

describe("E2E: zero Toggl API calls for migrated resolvers", () => {
  beforeEach(() => {
    mockFetchToggl.mockReset();
  });

  it("entries + projects + clients + tags make zero fetchToggl calls", async () => {
    const { ctx } = createMockCtx({
      tt_entries: [],
      tt_projects: [],
      tt_clients: [],
      tt_tags: [],
    });

    await timeTrackingResolvers.Query.timeTrackingEntries(null, { startDate: "2026-03-01", endDate: "2026-03-07" }, ctx);
    await timeTrackingResolvers.Query.timeTrackingProjects(null, null, ctx);
    await timeTrackingResolvers.Query.timeTrackingClients(null, null, ctx);
    await timeTrackingResolvers.Query.timeTrackingTags(null, null, ctx);

    expect(mockFetchToggl).not.toHaveBeenCalled();
  });
});
