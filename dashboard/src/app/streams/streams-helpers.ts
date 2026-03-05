import type { Session } from "./types";

// ── Cost rates ───────────────────────────────────────────
const INPUT_RATE = 0.003 / 1000; // $0.003 per 1k input tokens
const OUTPUT_RATE = 0.015 / 1000; // $0.015 per 1k output tokens
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ── KPI computation ──────────────────────────────────────

export interface StreamKpis {
  activeSessions: number;
  onlineDevs: number;
  totalTokens: number;
  totalCost: number;
}

export function computeStreamKpis(
  sessions: Session[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _now: number,
): StreamKpis {
  let activeSessions = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const onlineDevSet = new Set<string>();

  for (const s of sessions) {
    const inputTokens = s.totalInputTokens ?? 0;
    const outputTokens = s.totalOutputTokens ?? 0;
    totalTokens += inputTokens + outputTokens;
    totalCost += inputTokens * INPUT_RATE + outputTokens * OUTPUT_RATE;

    if (s.endedAt === null) {
      activeSessions++;
      const dev = s.developer ?? "unassigned";
      onlineDevSet.add(dev);
    }
  }

  return {
    activeSessions,
    onlineDevs: onlineDevSet.size,
    totalTokens,
    totalCost,
  };
}

// ── Session status ───────────────────────────────────────

export type SessionStatus = "ACTIVE" | "IDLE" | "ENDED";

export function computeSessionStatus(session: Session, now: number): SessionStatus {
  if (session.endedAt !== null) return "ENDED";

  const startMs = new Date(session.startedAt).getTime();
  const elapsed = now - startMs;

  // If session started less than 5 minutes ago, it's active
  if (elapsed <= IDLE_THRESHOLD_MS) return "ACTIVE";

  // For longer sessions, check tool call rate as a proxy for recent activity.
  // If there are tool calls, the session is likely active.
  const toolCalls = session.toolCallCount ?? 0;
  if (toolCalls > 0) return "ACTIVE";

  return "IDLE";
}

// ── Filter sessions by scrubber timestamp ────────────────

export function filterSessionsByTimestamp(sessions: Session[], timestamp: number): Session[] {
  return sessions.filter((s) => {
    const start = new Date(s.startedAt).getTime();
    if (timestamp < start) return false;
    if (s.endedAt === null) return true; // active session — always visible after start
    const end = new Date(s.endedAt).getTime();
    return timestamp < end; // exclude if timestamp is at or after endedAt
  });
}

// ── Group sessions by developer ──────────────────────────

export interface DeveloperGroup {
  developer: string;
  sessions: Session[];
  sessionCount: number;
}

export function groupSessionsByDeveloper(sessions: Session[]): DeveloperGroup[] {
  if (sessions.length === 0) return [];

  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const dev = s.developer ?? "unassigned";
    if (!map.has(dev)) map.set(dev, []);
    map.get(dev)!.push(s);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([developer, sess]) => ({
      developer,
      sessions: sess,
      sessionCount: sess.length,
    }));
}

// ── Chart data for stacked area chart ────────────────────

export interface ChartDataPoint {
  time: number;
  [developer: string]: number;
}

export function computeChartData(sessions: Session[]): ChartDataPoint[] {
  if (sessions.length === 0) return [];

  // Collect all start/end events
  const events: { time: number; developer: string; delta: number }[] = [];
  for (const s of sessions) {
    const dev = s.developer ?? "unassigned";
    events.push({ time: new Date(s.startedAt).getTime(), developer: dev, delta: 1 });
    if (s.endedAt) {
      events.push({ time: new Date(s.endedAt).getTime(), developer: dev, delta: -1 });
    }
  }

  events.sort((a, b) => a.time - b.time);

  // Get unique developers
  const developers = Array.from(new Set(sessions.map((s) => s.developer ?? "unassigned"))).sort();

  // Build chart data points at each event time
  const counts: Record<string, number> = {};
  for (const dev of developers) counts[dev] = 0;

  const data: ChartDataPoint[] = [];
  let lastTime = -1;

  for (const event of events) {
    // If same time as last, update counts and overwrite the last data point
    if (event.time === lastTime && data.length > 0) {
      counts[event.developer] += event.delta;
      const point = data[data.length - 1];
      for (const dev of developers) {
        point[dev] = counts[dev];
      }
    } else {
      counts[event.developer] += event.delta;
      const point: ChartDataPoint = { time: event.time };
      for (const dev of developers) {
        point[dev] = counts[dev];
      }
      data.push(point);
      lastTime = event.time;
    }
  }

  return data;
}

// ── Format helpers ───────────────────────────────────────

export function formatCost(cost: number): string {
  if (cost < 0.01) return "$0.00";
  return `$${cost.toFixed(2)}`;
}

export function formatTokensCompact(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
