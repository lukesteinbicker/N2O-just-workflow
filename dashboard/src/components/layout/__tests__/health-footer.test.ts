import { describe, it, expect } from "vitest";
import { computeAggregateStatus } from "../health-footer";

// ── Types matching the GraphQL DataHealthStream shape ────
interface Stream {
  stream: string;
  count: number;
  lastUpdated: string | null;
  recentCount: number;
}

// ── Helpers ──────────────────────────────────────────────

/** Create a stream with lastUpdated at `hoursAgo` hours before the session end. */
function makeStream(name: string, hoursAgo: number): Stream {
  return {
    stream: name,
    count: 100,
    lastUpdated: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
    recentCount: 5,
  };
}

const SESSION_NOW = new Date().toISOString();

// ── Tests ────────────────────────────────────────────────

describe("computeAggregateStatus", () => {
  it("returns green when all streams are within tolerance", () => {
    // All streams updated very recently — lag is 0
    const streams: Stream[] = [
      makeStream("transcripts", 0),
      makeStream("workflow_events", 0),
      makeStream("tasks", 0),
      makeStream("developer_context", 0),
      makeStream("skill_versions", 0),
    ];
    expect(computeAggregateStatus(streams, SESSION_NOW)).toBe("green");
  });

  it("returns yellow when at least one stream is stale (within 2x tolerance)", () => {
    // transcripts tolerance = 1h. Lag of 1.5h => yellow
    const sessionEnd = new Date().toISOString();
    const streams: Stream[] = [
      makeStream("transcripts", 0),
      makeStream("workflow_events", 0),
      makeStream("tasks", 0),
      makeStream("developer_context", 0),
      makeStream("skill_versions", 0),
    ];
    // Make transcripts 1.5 hours behind the session
    const sessionMs = new Date(sessionEnd).getTime();
    streams[0].lastUpdated = new Date(sessionMs - 1.5 * 3600_000).toISOString();
    expect(computeAggregateStatus(streams, sessionEnd)).toBe("yellow");
  });

  it("returns red when at least one stream is very stale (beyond 2x tolerance)", () => {
    const sessionEnd = new Date().toISOString();
    const streams: Stream[] = [
      makeStream("transcripts", 0),
      makeStream("workflow_events", 0),
      makeStream("tasks", 0),
      makeStream("developer_context", 0),
      makeStream("skill_versions", 0),
    ];
    // Make transcripts 3 hours behind session (tolerance=1h, 2x=2h, so 3h => red)
    const sessionMs = new Date(sessionEnd).getTime();
    streams[0].lastUpdated = new Date(sessionMs - 3 * 3600_000).toISOString();
    expect(computeAggregateStatus(streams, sessionEnd)).toBe("red");
  });

  it("returns red when a stream has null lastUpdated", () => {
    const streams: Stream[] = [
      makeStream("transcripts", 0),
      { stream: "workflow_events", count: 0, lastUpdated: null, recentCount: 0 },
      makeStream("tasks", 0),
      makeStream("developer_context", 0),
      makeStream("skill_versions", 0),
    ];
    expect(computeAggregateStatus(streams, SESSION_NOW)).toBe("red");
  });

  it("returns gray when lastSessionEndedAt is null", () => {
    const streams: Stream[] = [makeStream("transcripts", 0)];
    expect(computeAggregateStatus(streams, null)).toBe("gray");
  });

  it("returns gray when streams array is empty", () => {
    expect(computeAggregateStatus([], SESSION_NOW)).toBe("gray");
  });

  it("picks the worst status across all streams", () => {
    const sessionEnd = new Date().toISOString();
    const sessionMs = new Date(sessionEnd).getTime();
    const streams: Stream[] = [
      // green: within tolerance
      { stream: "transcripts", count: 10, lastUpdated: new Date(sessionMs).toISOString(), recentCount: 1 },
      // yellow: tasks tolerance=24h, 30h behind => within 2x (48h) => yellow
      { stream: "tasks", count: 10, lastUpdated: new Date(sessionMs - 30 * 3600_000).toISOString(), recentCount: 1 },
    ];
    expect(computeAggregateStatus(streams, sessionEnd)).toBe("yellow");
  });

  it("red beats yellow when both present", () => {
    const sessionEnd = new Date().toISOString();
    const sessionMs = new Date(sessionEnd).getTime();
    const streams: Stream[] = [
      // yellow: tasks 30h behind (tolerance=24h, 2x=48h)
      { stream: "tasks", count: 10, lastUpdated: new Date(sessionMs - 30 * 3600_000).toISOString(), recentCount: 1 },
      // red: transcripts 5h behind (tolerance=1h, 2x=2h)
      { stream: "transcripts", count: 10, lastUpdated: new Date(sessionMs - 5 * 3600_000).toISOString(), recentCount: 1 },
    ];
    expect(computeAggregateStatus(streams, sessionEnd)).toBe("red");
  });
});
