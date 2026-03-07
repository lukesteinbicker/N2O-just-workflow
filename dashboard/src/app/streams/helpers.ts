import type { Session, SessionWithLane, DevRow } from "./types";

export function formatTokens(n: number | null): string {
  if (!n) return "0";
  return n > 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
}

export function formatDuration(mins: number | null): string {
  if (!mins) return "0m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function shortModel(model: string | null): string {
  if (!model) return "";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model.split("-").slice(-1)[0];
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}

export function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function modelColor(model: string | null): string {
  const m = shortModel(model);
  if (m === "opus") return "#2D72D2";
  if (m === "sonnet") return "#238551";
  if (m === "haiku") return "#EC9A3C";
  return "#738694";
}

function assignLanes(sessions: Session[], now: number): { items: SessionWithLane[]; laneCount: number } {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  const laneEnds: number[] = [];
  const items: SessionWithLane[] = [];

  for (const s of sorted) {
    const startMs = new Date(s.startedAt).getTime();
    const endMs = s.endedAt ? new Date(s.endedAt).getTime() : now;

    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= startMs) {
        assigned = i;
        laneEnds[i] = endMs;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(endMs);
    }

    items.push({ ...s, lane: assigned });
  }

  return { items, laneCount: Math.max(laneEnds.length, 1) };
}

export function computeTimeline(sessions: Session[]) {
  const devMap = new Map<string, Session[]>();

  for (const s of sessions) {
    const dev = s.developer?.name ?? "unassigned";
    if (!devMap.has(dev)) devMap.set(dev, []);
    devMap.get(dev)!.push(s);
  }

  const now = Date.now();

  const rows: DevRow[] = Array.from(devMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, sess]) => {
      const { items, laneCount } = assignLanes(sess, now);
      return { name, sessions: items, laneCount };
    });

  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const s of sessions) {
    const start = new Date(s.startedAt).getTime();
    const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
    if (start < minTime) minTime = start;
    if (end > maxTime) maxTime = end;
  }

  if (!isFinite(minTime)) {
    minTime = now - 3600000;
    maxTime = now;
  }

  const range = maxTime - minTime || 3600000;
  const padding = range * 0.02;
  const rangeStart = minTime - padding;
  const rangeEnd = maxTime + padding;
  const totalRange = rangeEnd - rangeStart;

  return { rows, rangeStart, rangeEnd, totalRange, now };
}

export function peakConcurrency(sessions: Session[]): number {
  if (sessions.length === 0) return 0;
  const events: { time: number; delta: number }[] = [];
  for (const s of sessions) {
    events.push({ time: new Date(s.startedAt).getTime(), delta: 1 });
    const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
    events.push({ time: end, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let current = 0;
  let max = 0;
  for (const e of events) {
    current += e.delta;
    max = Math.max(max, current);
  }
  return max;
}

export function computeTicks(rangeStart: number, rangeEnd: number): { label: string; pct: number }[] {
  const total = rangeEnd - rangeStart;
  const tickCount = 6;
  const ticks: { label: string; pct: number }[] = [];

  for (let i = 0; i <= tickCount; i++) {
    const time = rangeStart + (total * i) / tickCount;
    const d = new Date(time);
    const label = `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    ticks.push({ label, pct: (i / tickCount) * 100 });
  }

  return ticks;
}
