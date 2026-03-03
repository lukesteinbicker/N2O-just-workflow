"use client";

import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { STREAMS_QUERY } from "@/lib/graphql/queries";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Helpers ──────────────────────────────────────────────

function formatTokens(n: number | null): string {
  if (!n) return "0";
  return n > 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
}

function formatDuration(mins: number | null): string {
  if (!mins) return "0m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function shortModel(model: string | null): string {
  if (!model) return "";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model.split("-").slice(-1)[0];
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Types ────────────────────────────────────────────────

interface SubagentSession {
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  toolCallCount: number | null;
  model: string | null;
}

interface Session {
  sessionId: string;
  developer: string | null;
  sprint: string | null;
  taskNum: number | null;
  taskTitle: string | null;
  skillName: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  toolCallCount: number | null;
  messageCount: number | null;
  model: string | null;
  subagents: SubagentSession[];
}

// ── Timeline computation ─────────────────────────────────

interface SessionWithLane extends Session {
  lane: number;
}

interface DevRow {
  name: string;
  sessions: SessionWithLane[];
  laneCount: number;
}

/** Assign non-overlapping lanes to sessions within a developer row */
function assignLanes(sessions: Session[], now: number): { items: SessionWithLane[]; laneCount: number } {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  // Each lane tracks when it becomes free (end time of last session in that lane)
  const laneEnds: number[] = [];
  const items: SessionWithLane[] = [];

  for (const s of sorted) {
    const startMs = new Date(s.startedAt).getTime();
    const endMs = s.endedAt ? new Date(s.endedAt).getTime() : now;

    // Find first lane where the session fits (no overlap)
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

function computeTimeline(sessions: Session[]) {
  const devMap = new Map<string, Session[]>();

  for (const s of sessions) {
    const dev = s.developer ?? "unassigned";
    if (!devMap.has(dev)) devMap.set(dev, []);
    devMap.get(dev)!.push(s);
  }

  const now = Date.now();

  // Sort sessions within each dev by startedAt and assign lanes
  const rows: DevRow[] = Array.from(devMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, sess]) => {
      const { items, laneCount } = assignLanes(sess, now);
      return { name, sessions: items, laneCount };
    });

  // Compute time range
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

  // Add 2% padding on each side
  const range = maxTime - minTime || 3600000;
  const padding = range * 0.02;
  const rangeStart = minTime - padding;
  const rangeEnd = maxTime + padding;
  const totalRange = rangeEnd - rangeStart;

  return { rows, rangeStart, rangeEnd, totalRange, now };
}

function peakConcurrency(sessions: Session[]): number {
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

// ── Time axis tick marks ─────────────────────────────────

function computeTicks(rangeStart: number, rangeEnd: number): { label: string; pct: number }[] {
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

// ── Model badge color ────────────────────────────────────

function modelColor(model: string | null): string {
  const m = shortModel(model);
  if (m === "opus") return "#2D72D2";
  if (m === "sonnet") return "#238551";
  if (m === "haiku") return "#EC9A3C";
  return "#738694";
}

// ── Page ─────────────────────────────────────────────────

export default function StreamsPage() {
  const { data, loading, error, refetch } = useQuery<any>(STREAMS_QUERY);
  useRealtimeTable("agents", refetch);

  const sessions: Session[] = useMemo(() => data?.sessionTimeline ?? [], [data]);

  const timeline = useMemo(() => computeTimeline(sessions), [sessions]);
  const ticks = useMemo(
    () => computeTicks(timeline.rangeStart, timeline.rangeEnd),
    [timeline.rangeStart, timeline.rangeEnd]
  );

  // KPI computations
  const activeSessions = sessions.filter((s) => s.endedAt === null).length;
  const totalSessions = sessions.length;
  const globalPeak = peakConcurrency(sessions);
  const totalTokens = sessions.reduce(
    (sum, s) => sum + (s.totalInputTokens ?? 0) + (s.totalOutputTokens ?? 0),
    0
  );

  // Subagent count across all sessions
  const subagentCount = sessions.reduce(
    (sum, s) => sum + (s.subagents?.length ?? 0),
    0
  );

  // Check if all sessions use the same model (hide badges if so)
  const uniqueModels = useMemo(() => {
    const models = new Set<string>();
    for (const s of sessions) {
      const m = shortModel(s.model);
      if (m) models.add(m);
    }
    return models;
  }, [sessions]);
  const showModelBadges = uniqueModels.size > 1;

  // Staleness: warn if latest session is >24h old
  const latestSessionTime = useMemo(() => {
    let latest = 0;
    for (const s of sessions) {
      const t = new Date(s.startedAt).getTime();
      if (t > latest) latest = t;
      if (s.endedAt) {
        const e = new Date(s.endedAt).getTime();
        if (e > latest) latest = e;
      }
    }
    return latest;
  }, [sessions]);
  const isStale = sessions.length > 0 && Date.now() - latestSessionTime > 24 * 60 * 60 * 1000;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="streams-timeline">
      <h1 className="text-lg font-semibold">Streams</h1>

      {/* Staleness banner */}
      {isStale && (
        <div className="rounded-md border border-[#EC9A3C]/40 bg-[#EC9A3C]/10 px-3 py-2 text-xs text-[#EC9A3C]">
          Data may be stale — latest session is over 24 hours old.
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Parent Sessions"
          value={totalSessions}
          delta={subagentCount > 0 ? `+${subagentCount} subagents` : undefined}
          deltaType="neutral"
        />
        <KpiCard
          label="Active Now"
          value={activeSessions}
          deltaType={activeSessions > 0 ? "positive" : "neutral"}
        />
        <KpiCard label="Peak Concurrency" value={globalPeak} />
        <KpiCard label="Total Tokens" value={formatTokens(totalTokens)} />
      </div>

      {/* Gantt Timeline */}
      <Card className="p-3 bg-card border-border overflow-hidden">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Session Timeline
        </h3>

        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No session data</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Time axis (top) */}
            <div className="flex">
              <div className="w-[120px] shrink-0" />
              <div className="flex-1 relative h-5 border-b border-border/30">
                {ticks.map((tick, i) => (
                  <span
                    key={i}
                    className="absolute text-[10px] text-muted-foreground font-mono whitespace-nowrap"
                    style={{
                      left: `${tick.pct}%`,
                      transform: i === ticks.length - 1 ? "translateX(-100%)" : i > 0 ? "translateX(-50%)" : undefined,
                      top: 0,
                    }}
                    data-mono
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Developer rows */}
            {timeline.rows.map((row) => (
              <div
                key={row.name}
                className="flex items-stretch border-b border-border/20 last:border-0"
              >
                {/* Developer label */}
                <div className="w-[120px] shrink-0 flex items-center pr-2">
                  <span className="text-xs font-semibold text-accent-foreground truncate">
                    {row.name === "unassigned" && timeline.rows.length === 1
                      ? "All Sessions"
                      : row.name}
                  </span>
                  {(() => {
                    const active = row.sessions.filter((s) => s.endedAt === null).length;
                    return active > 0 ? (
                      <span className="text-[10px] text-[#238551] ml-1 shrink-0">
                        ({active} active)
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Timeline bar area */}
                <div
                  className="flex-1 relative"
                  style={{ height: `${row.laneCount * 28 + 8}px` }}
                >
                  {/* Grid lines */}
                  {ticks.map((tick, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/10"
                      style={{ left: `${tick.pct}%` }}
                    />
                  ))}

                  {/* Session bars */}
                  {row.sessions.map((s) => {
                    const startMs = new Date(s.startedAt).getTime();
                    const endMs = s.endedAt
                      ? new Date(s.endedAt).getTime()
                      : timeline.now;
                    const isActive = s.endedAt === null;

                    const leftPct =
                      ((startMs - timeline.rangeStart) / timeline.totalRange) * 100;
                    const widthPct = Math.max(
                      ((endMs - startMs) / timeline.totalRange) * 100,
                      1
                    );

                    const model = shortModel(s.model);
                    const title = s.taskTitle
                      ? truncate(s.taskTitle, 20)
                      : s.sessionId.slice(0, 8);

                    const subCount = s.subagents?.length ?? 0;
                    const barHeight = 24;
                    const laneGap = 4;
                    const topOffset = 4 + s.lane * (barHeight + laneGap);

                    return (
                      <Tooltip key={s.sessionId} delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute rounded-sm flex items-center gap-1 px-1.5 overflow-hidden cursor-default transition-opacity ${
                              isActive ? "streams-pulse" : ""
                            }`}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              top: `${topOffset}px`,
                              height: `${barHeight}px`,
                              backgroundColor: isActive ? "#2D72D2" : "#404854",
                              minWidth: "12px",
                            }}
                          >
                            <span className="text-[11px] text-white truncate leading-none">
                              {title}
                            </span>
                            {s.sprint && s.taskNum != null && widthPct > 12 && (
                              <span
                                className="text-[9px] px-1 py-0 rounded-sm shrink-0 leading-none font-mono"
                                style={{
                                  backgroundColor: "rgba(0,0,0,0.3)",
                                  color: "#A7B6C2",
                                }}
                                data-mono
                              >
                                {s.sprint} #{s.taskNum}
                              </span>
                            )}
                            {s.skillName && widthPct > 12 && (
                              <span
                                className="text-[9px] px-1 py-0 rounded-sm shrink-0 leading-none"
                                style={{
                                  backgroundColor: "rgba(0,0,0,0.3)",
                                  color: "#2D72D2",
                                }}
                              >
                                {s.skillName}
                              </span>
                            )}
                            {showModelBadges && model && widthPct > 6 && (
                              <span
                                className="text-[9px] px-1 py-0 rounded-sm shrink-0 leading-none font-mono"
                                style={{
                                  backgroundColor: "rgba(0,0,0,0.3)",
                                  color: isActive ? "#fff" : modelColor(s.model),
                                }}
                                data-mono
                              >
                                {model}
                              </span>
                            )}
                            {subCount > 0 && widthPct > 10 && (
                              <span
                                className="text-[9px] px-1 py-0 rounded-sm shrink-0 leading-none font-mono"
                                style={{
                                  backgroundColor: "rgba(0,0,0,0.3)",
                                  color: "#238551",
                                }}
                                data-mono
                              >
                                +{subCount}
                              </span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          sideOffset={6}
                          className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[280px]"
                        >
                          <div className="space-y-1.5">
                            {/* Task info */}
                            <div className="text-xs font-semibold">
                              {s.taskTitle ?? s.sessionId.slice(0, 12)}
                            </div>
                            {s.sprint && s.taskNum != null && (
                              <div className="text-[11px] text-muted-foreground">
                                {s.sprint} #{s.taskNum}
                              </div>
                            )}

                            {/* Metrics */}
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                              <span className="text-muted-foreground">Duration</span>
                              <span className="font-mono text-right" data-mono>
                                {formatDuration(s.durationMinutes)}
                              </span>

                              <span className="text-muted-foreground">Input tokens</span>
                              <span className="font-mono text-right" data-mono>
                                {formatTokens(s.totalInputTokens)}
                              </span>

                              <span className="text-muted-foreground">Output tokens</span>
                              <span className="font-mono text-right" data-mono>
                                {formatTokens(s.totalOutputTokens)}
                              </span>

                              <span className="text-muted-foreground">Tool calls</span>
                              <span className="font-mono text-right" data-mono>
                                {s.toolCallCount ?? 0}
                              </span>

                              <span className="text-muted-foreground">Subagents</span>
                              <span className="font-mono text-right" data-mono>
                                {subCount}
                              </span>

                              {s.skillName && (
                                <>
                                  <span className="text-muted-foreground">Skill</span>
                                  <span className="text-right">{s.skillName}</span>
                                </>
                              )}

                              {model && (
                                <>
                                  <span className="text-muted-foreground">Model</span>
                                  <span
                                    className="font-mono text-right"
                                    style={{ color: modelColor(s.model) }}
                                    data-mono
                                  >
                                    {model}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Timing */}
                            <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-1">
                              {formatDate(s.startedAt)} {formatTime(s.startedAt)}
                              {" \u2192 "}
                              {s.endedAt
                                ? `${formatDate(s.endedAt)} ${formatTime(s.endedAt)}`
                                : "active"}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Time axis (bottom) */}
            <div className="flex">
              <div className="w-[120px] shrink-0" />
              <div className="flex-1 relative h-5 border-t border-border/30">
                {ticks.map((tick, i) => (
                  <span
                    key={i}
                    className="absolute text-[10px] text-muted-foreground font-mono whitespace-nowrap"
                    style={{
                      left: `${tick.pct}%`,
                      transform: i === ticks.length - 1 ? "translateX(-100%)" : i > 0 ? "translateX(-50%)" : undefined,
                      bottom: 0,
                    }}
                    data-mono
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Pulse animation for active sessions */}
      <style dangerouslySetInnerHTML={{ __html: `
        .streams-pulse {
          animation: streamsPulse 2s ease-in-out infinite;
        }
        @keyframes streamsPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}} />
    </div>
  );
}
