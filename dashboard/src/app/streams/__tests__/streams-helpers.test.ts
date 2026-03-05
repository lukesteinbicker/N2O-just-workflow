import { describe, it, expect } from "vitest";
import {
  computeStreamKpis,
  computeSessionStatus,
  filterSessionsByTimestamp,
  groupSessionsByDeveloper,
  computeChartData,
} from "../streams-helpers";
import type { Session } from "../types";

// ── Fixtures ─────────────────────────────────────────────

const NOW = new Date("2025-06-15T12:00:00Z").getTime();

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: "sess-1",
    developer: "alice",
    sprint: "sprint-1",
    taskNum: 1,
    taskTitle: "Build login page",
    skillName: "tdd-agent",
    startedAt: "2025-06-15T10:00:00Z",
    endedAt: "2025-06-15T11:00:00Z",
    durationMinutes: 60,
    totalInputTokens: 50000,
    totalOutputTokens: 10000,
    toolCallCount: 25,
    messageCount: 40,
    model: "claude-sonnet-4-20250514",
    subagents: [],
    ...overrides,
  };
}

// ── computeStreamKpis ────────────────────────────────────

describe("computeStreamKpis", () => {
  it("returns zeros for empty session list", () => {
    const kpis = computeStreamKpis([], NOW);
    expect(kpis.activeSessions).toBe(0);
    expect(kpis.onlineDevs).toBe(0);
    expect(kpis.totalTokens).toBe(0);
    expect(kpis.totalCost).toBe(0);
  });

  it("counts active sessions (endedAt === null)", () => {
    const sessions = [
      makeSession({ sessionId: "s1", endedAt: null, developer: "alice" }),
      makeSession({ sessionId: "s2", endedAt: "2025-06-15T11:00:00Z", developer: "bob" }),
      makeSession({ sessionId: "s3", endedAt: null, developer: "carol" }),
    ];
    const kpis = computeStreamKpis(sessions, NOW);
    expect(kpis.activeSessions).toBe(2);
  });

  it("counts unique online developers with active sessions", () => {
    const sessions = [
      makeSession({ sessionId: "s1", endedAt: null, developer: "alice" }),
      makeSession({ sessionId: "s2", endedAt: null, developer: "alice" }),
      makeSession({ sessionId: "s3", endedAt: null, developer: "bob" }),
      makeSession({ sessionId: "s4", endedAt: "2025-06-15T11:00:00Z", developer: "carol" }),
    ];
    const kpis = computeStreamKpis(sessions, NOW);
    expect(kpis.onlineDevs).toBe(2); // alice and bob (carol's session ended)
  });

  it("sums input + output tokens across all sessions", () => {
    const sessions = [
      makeSession({ sessionId: "s1", totalInputTokens: 10000, totalOutputTokens: 2000 }),
      makeSession({ sessionId: "s2", totalInputTokens: 5000, totalOutputTokens: 1000 }),
    ];
    const kpis = computeStreamKpis(sessions, NOW);
    expect(kpis.totalTokens).toBe(18000);
  });

  it("computes cost using $0.003/1k input, $0.015/1k output", () => {
    const sessions = [
      makeSession({ sessionId: "s1", totalInputTokens: 100000, totalOutputTokens: 20000 }),
    ];
    const kpis = computeStreamKpis(sessions, NOW);
    // 100000 * 0.003/1000 + 20000 * 0.015/1000 = 0.30 + 0.30 = 0.60
    expect(kpis.totalCost).toBeCloseTo(0.60, 2);
  });

  it("handles null token values gracefully", () => {
    const sessions = [
      makeSession({ sessionId: "s1", totalInputTokens: null, totalOutputTokens: null }),
      makeSession({ sessionId: "s2", totalInputTokens: 5000, totalOutputTokens: null }),
    ];
    const kpis = computeStreamKpis(sessions, NOW);
    expect(kpis.totalTokens).toBe(5000);
    expect(kpis.totalCost).toBeCloseTo(0.015, 4); // 5000 * 0.003/1000
  });
});

// ── computeSessionStatus ─────────────────────────────────

describe("computeSessionStatus", () => {
  it("returns ENDED for sessions with endedAt set", () => {
    const session = makeSession({ endedAt: "2025-06-15T11:00:00Z" });
    expect(computeSessionStatus(session, NOW)).toBe("ENDED");
  });

  it("returns ACTIVE when session has no endedAt and started recently", () => {
    // Session started 2 minutes ago (well within 5 min threshold)
    const twoMinAgo = new Date(NOW - 2 * 60 * 1000).toISOString();
    const session = makeSession({ endedAt: null, startedAt: twoMinAgo });
    expect(computeSessionStatus(session, NOW)).toBe("ACTIVE");
  });

  it("returns IDLE when session has no endedAt but started > 5min ago with low tool count", () => {
    // Session started 30 minutes ago, no tool calls -> IDLE
    const thirtyMinAgo = new Date(NOW - 30 * 60 * 1000).toISOString();
    const session = makeSession({
      endedAt: null,
      startedAt: thirtyMinAgo,
      durationMinutes: 30,
      toolCallCount: 0,
    });
    // With no tool calls and duration > 5min, it's IDLE
    expect(computeSessionStatus(session, NOW)).toBe("IDLE");
  });

  it("returns ACTIVE when session has no endedAt, duration > 5min but has recent activity", () => {
    // Active session with many tool calls (high rate = recent activity)
    const thirtyMinAgo = new Date(NOW - 30 * 60 * 1000).toISOString();
    const session = makeSession({
      endedAt: null,
      startedAt: thirtyMinAgo,
      durationMinutes: 30,
      toolCallCount: 100,
      messageCount: 50,
    });
    // High tool call rate suggests active
    expect(computeSessionStatus(session, NOW)).toBe("ACTIVE");
  });
});

// ── filterSessionsByTimestamp ─────────────────────────────

describe("filterSessionsByTimestamp", () => {
  const sessions = [
    makeSession({
      sessionId: "s1",
      startedAt: "2025-06-15T08:00:00Z",
      endedAt: "2025-06-15T09:00:00Z",
    }),
    makeSession({
      sessionId: "s2",
      startedAt: "2025-06-15T09:30:00Z",
      endedAt: "2025-06-15T10:30:00Z",
    }),
    makeSession({
      sessionId: "s3",
      startedAt: "2025-06-15T09:00:00Z",
      endedAt: null, // still active
    }),
    makeSession({
      sessionId: "s4",
      startedAt: "2025-06-15T11:00:00Z",
      endedAt: "2025-06-15T11:30:00Z",
    }),
  ];

  it("returns sessions that overlap with the given timestamp", () => {
    const ts = new Date("2025-06-15T09:45:00Z").getTime();
    const result = filterSessionsByTimestamp(sessions, ts);
    expect(result.map((s) => s.sessionId).sort()).toEqual(["s2", "s3"]);
  });

  it("returns active sessions (endedAt=null) for any future timestamp", () => {
    const ts = new Date("2025-06-15T14:00:00Z").getTime();
    const result = filterSessionsByTimestamp(sessions, ts);
    expect(result.map((s) => s.sessionId)).toEqual(["s3"]);
  });

  it("returns empty when timestamp is before all sessions", () => {
    const ts = new Date("2025-06-15T07:00:00Z").getTime();
    const result = filterSessionsByTimestamp(sessions, ts);
    expect(result).toEqual([]);
  });

  it("includes session where timestamp equals startedAt", () => {
    const ts = new Date("2025-06-15T08:00:00Z").getTime();
    const result = filterSessionsByTimestamp(sessions, ts);
    expect(result.map((s) => s.sessionId)).toContain("s1");
  });

  it("excludes session where timestamp equals endedAt (session already ended)", () => {
    const ts = new Date("2025-06-15T09:00:00Z").getTime();
    const result = filterSessionsByTimestamp(sessions, ts);
    expect(result.map((s) => s.sessionId)).not.toContain("s1");
  });
});

// ── groupSessionsByDeveloper ─────────────────────────────

describe("groupSessionsByDeveloper", () => {
  it("groups sessions by developer name", () => {
    const sessions = [
      makeSession({ sessionId: "s1", developer: "alice" }),
      makeSession({ sessionId: "s2", developer: "bob" }),
      makeSession({ sessionId: "s3", developer: "alice" }),
    ];
    const groups = groupSessionsByDeveloper(sessions);
    expect(groups).toHaveLength(2);
    const alice = groups.find((g) => g.developer === "alice");
    const bob = groups.find((g) => g.developer === "bob");
    expect(alice?.sessions).toHaveLength(2);
    expect(bob?.sessions).toHaveLength(1);
  });

  it("sorts groups alphabetically by developer name", () => {
    const sessions = [
      makeSession({ sessionId: "s1", developer: "charlie" }),
      makeSession({ sessionId: "s2", developer: "alice" }),
      makeSession({ sessionId: "s3", developer: "bob" }),
    ];
    const groups = groupSessionsByDeveloper(sessions);
    expect(groups.map((g) => g.developer)).toEqual(["alice", "bob", "charlie"]);
  });

  it("groups null developer as 'unassigned'", () => {
    const sessions = [
      makeSession({ sessionId: "s1", developer: null }),
      makeSession({ sessionId: "s2", developer: "alice" }),
    ];
    const groups = groupSessionsByDeveloper(sessions);
    expect(groups.map((g) => g.developer)).toContain("unassigned");
    const unassigned = groups.find((g) => g.developer === "unassigned");
    expect(unassigned?.sessions).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(groupSessionsByDeveloper([])).toEqual([]);
  });

  it("includes sessionCount in each group", () => {
    const sessions = [
      makeSession({ sessionId: "s1", developer: "alice" }),
      makeSession({ sessionId: "s2", developer: "alice" }),
    ];
    const groups = groupSessionsByDeveloper(sessions);
    expect(groups[0].sessionCount).toBe(2);
  });
});

// ── computeChartData ─────────────────────────────────────

describe("computeChartData", () => {
  it("returns time-bucketed data with per-developer session counts", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        developer: "alice",
        startedAt: "2025-06-15T08:00:00Z",
        endedAt: "2025-06-15T10:00:00Z",
      }),
      makeSession({
        sessionId: "s2",
        developer: "bob",
        startedAt: "2025-06-15T09:00:00Z",
        endedAt: "2025-06-15T11:00:00Z",
      }),
    ];
    const data = computeChartData(sessions);
    expect(data.length).toBeGreaterThan(0);
    // Each data point should have a time key and developer keys
    expect(data[0]).toHaveProperty("time");
  });

  it("returns empty array for empty sessions", () => {
    expect(computeChartData([])).toEqual([]);
  });

  it("includes all unique developers as keys in data points", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        developer: "alice",
        startedAt: "2025-06-15T08:00:00Z",
        endedAt: "2025-06-15T10:00:00Z",
      }),
      makeSession({
        sessionId: "s2",
        developer: "bob",
        startedAt: "2025-06-15T09:00:00Z",
        endedAt: "2025-06-15T11:00:00Z",
      }),
    ];
    const data = computeChartData(sessions);
    const developers = new Set<string>();
    for (const point of data) {
      for (const key of Object.keys(point)) {
        if (key !== "time") developers.add(key);
      }
    }
    expect(developers.has("alice")).toBe(true);
    expect(developers.has("bob")).toBe(true);
  });
});
