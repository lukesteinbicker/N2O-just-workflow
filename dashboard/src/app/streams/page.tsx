// Streams: Session cards and concurrency timeline with draggable scrubber.
"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { STREAMS_QUERY } from "@/lib/graphql/queries";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { Session } from "./types";
import {
  computeStreamKpis,
  computeSessionStatus,
  filterSessionsByTimestamp,
  groupSessionsByDeveloper,
  computeChartData,
  formatCost,
  formatTokensCompact,
} from "./streams-helpers";
import { formatDuration, formatTokens } from "./helpers";

// Developer colors for stacked area chart
const DEV_COLORS_HEX = ["#2D72D2", "#238551", "#EC9A3C", "#CD4246", "#00A396"];

function getDevColorHex(index: number): string {
  return DEV_COLORS_HEX[index % DEV_COLORS_HEX.length];
}

export default function StreamsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, loading, error, refetch } = useQuery<any>(STREAMS_QUERY);
  useRealtimeTable("agents", refetch);
  const { person, project } = useGlobalFilters();

  const [now] = useState(() => Date.now());
  const [scrubberTime, setScrubberTime] = useState<number | null>(null);
  const [collapsedDevs, setCollapsedDevs] = useState<Set<string>>(new Set());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Apply global filters
  const allSessions: Session[] = useMemo(() => {
    const raw: Session[] = data?.sessionTimeline ?? [];
    return raw.filter((s) => {
      if (person && s.developer !== person) return false;
      if (project && s.sprint !== project) return false;
      return true;
    });
  }, [data, person, project]);

  // Chart data
  const chartData = useMemo(() => computeChartData(allSessions), [allSessions]);
  const developers = useMemo(() => {
    const devs = new Set<string>();
    for (const s of allSessions) devs.add(s.developer ?? "unassigned");
    return Array.from(devs).sort();
  }, [allSessions]);

  // Chart time range
  const timeRange = useMemo(() => {
    if (chartData.length === 0) return { min: now - 3600000, max: now };
    const times = chartData.map((d) => d.time);
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [chartData, now]);

  // Scrubber position
  const effectiveTime = scrubberTime ?? now;
  const isLive = scrubberTime === null;

  // Filtered sessions based on scrubber
  const visibleSessions = useMemo(() => {
    if (isLive) {
      // Show all active sessions + recently ended ones
      return allSessions.filter(
        (s) => s.endedAt === null || new Date(s.endedAt).getTime() > now - 30 * 60 * 1000
      );
    }
    return filterSessionsByTimestamp(allSessions, effectiveTime);
  }, [allSessions, effectiveTime, isLive, now]);

  // KPIs (always based on full session list for totals, but active count based on current view)
  const kpis = useMemo(() => computeStreamKpis(allSessions, now), [allSessions, now]);

  // Groups
  const devGroups = useMemo(
    () => groupSessionsByDeveloper(visibleSessions),
    [visibleSessions]
  );

  // Toggle collapse
  const toggleDev = useCallback((dev: string) => {
    setCollapsedDevs((prev) => {
      const next = new Set(prev);
      if (next.has(dev)) next.delete(dev);
      else next.add(dev);
      return next;
    });
  }, []);

  // Scrubber drag handling
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleChartMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleChartMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleChartMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging.current || !chartContainerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      // Account for Y-axis label area (approx 40px)
      const chartLeft = 40;
      const chartWidth = rect.width - chartLeft - 10;
      const x = e.clientX - rect.left - chartLeft;
      const pct = Math.max(0, Math.min(1, x / chartWidth));
      const t = timeRange.min + pct * (timeRange.max - timeRange.min);
      setScrubberTime(t);
    },
    [timeRange]
  );

  const handleChartClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!chartContainerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const chartLeft = 40;
      const chartWidth = rect.width - chartLeft - 10;
      const x = e.clientX - rect.left - chartLeft;
      const pct = Math.max(0, Math.min(1, x / chartWidth));
      const t = timeRange.min + pct * (timeRange.max - timeRange.min);
      setScrubberTime(t);
    },
    [timeRange]
  );

  const resetToLive = useCallback(() => {
    setScrubberTime(null);
  }, []);

  // Format chart time labels
  const formatChartTime = useCallback((ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, []);

  // ── Loading state ──────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Streams</h1>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-3 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-md border border-border bg-card p-3 space-y-3">
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="streams-page">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Streams</h1>
        {!isLive && (
          <button
            onClick={resetToLive}
            className="text-xs px-2 py-1 rounded bg-[#2D72D2] text-white hover:bg-[#2D72D2]/80 transition-colors"
          >
            Back to Live
          </button>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Active Sessions"
          value={kpis.activeSessions}
          deltaType={kpis.activeSessions > 0 ? "positive" : "neutral"}
        />
        <KpiCard
          label="Online Developers"
          value={kpis.onlineDevs}
          deltaType={kpis.onlineDevs > 0 ? "positive" : "neutral"}
        />
        <KpiCard
          label="Total Tokens"
          value={formatTokensCompact(kpis.totalTokens)}
        />
        <KpiCard
          label="Total Cost"
          value={formatCost(kpis.totalCost)}
        />
      </div>

      {/* Stacked Area Chart with Scrubber */}
      <Card className="p-3 bg-card border-border overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions by Developer Over Time
          </h3>
          {!isLive && (
            <span className="text-xs text-muted-foreground font-mono" data-mono>
              {new Date(effectiveTime).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {isLive && (
            <span className="text-xs text-[#238551] font-semibold">LIVE</span>
          )}
        </div>

        {allSessions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            No session data
          </p>
        ) : (
          <div
            ref={chartContainerRef}
            className="select-none cursor-crosshair"
            onMouseDown={handleChartMouseDown}
            onMouseUp={handleChartMouseUp}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseUp}
            onClick={handleChartClick}
          >
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={formatChartTime}
                  stroke="#738694"
                  tick={{ fontSize: 10 }}
                  axisLine={{ stroke: "#394048" }}
                  tickLine={{ stroke: "#394048" }}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="#738694"
                  tick={{ fontSize: 10 }}
                  axisLine={{ stroke: "#394048" }}
                  tickLine={{ stroke: "#394048" }}
                  width={30}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "#1C2127",
                    border: "1px solid #394048",
                    borderRadius: "2px",
                    fontSize: "11px",
                  }}
                  labelFormatter={(label) =>
                    new Date(Number(label)).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />
                {developers.map((dev, i) => (
                  <Area
                    key={dev}
                    type="monotone"
                    dataKey={dev}
                    stackId="1"
                    stroke={getDevColorHex(i)}
                    fill={getDevColorHex(i)}
                    fillOpacity={0.6}
                  />
                ))}
                {/* Scrubber line */}
                <ReferenceLine
                  x={effectiveTime}
                  stroke={isLive ? "#238551" : "#EC9A3C"}
                  strokeWidth={2}
                  strokeDasharray={isLive ? undefined : "4 2"}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Developer legend */}
        {developers.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-2 px-1">
            {developers.map((dev, i) => (
              <div key={dev} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: getDevColorHex(i) }}
                />
                <span className="text-[11px] text-muted-foreground">{dev}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Session Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {isLive ? "Current Sessions" : "Sessions at Selected Time"}
          <span className="ml-2 text-foreground font-mono" data-mono>
            {visibleSessions.length}
          </span>
        </h3>

        {devGroups.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No sessions at this time.
          </p>
        )}

        {devGroups.map((group) => {
          const devIndex = developers.indexOf(group.developer);
          const isCollapsed = collapsedDevs.has(group.developer);

          return (
            <div key={group.developer}>
              {/* Developer header */}
              <button
                onClick={() => toggleDev(group.developer)}
                className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-[#2F343C] transition-colors"
              >
                <span
                  className="text-[10px]"
                  style={{ color: getDevColorHex(devIndex >= 0 ? devIndex : 0) }}
                >
                  {isCollapsed ? "\u25B6" : "\u25BC"}
                </span>
                <span className="text-xs font-semibold text-accent-foreground">
                  {group.developer}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono" data-mono>
                  {group.sessionCount} session{group.sessionCount !== 1 ? "s" : ""}
                </span>
              </button>

              {/* Session cards */}
              {!isCollapsed && (
                <div className="grid gap-2 pl-5 mt-1">
                  {group.sessions.map((session) => (
                    <SessionCard
                      key={session.sessionId}
                      session={session}
                      now={now}
                      isSelected={selectedSessionId === session.sessionId}
                      onClick={() => setSelectedSessionId(
                        selectedSessionId === session.sessionId ? null : session.sessionId
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .streams-pulse {
          animation: streamsPulse 2s ease-in-out infinite;
        }
        @keyframes streamsPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `,
        }}
      />
    </div>
  );
}

// ── Session Card Component ───────────────────────────────

interface SessionCardProps {
  session: Session;
  now: number;
  isSelected: boolean;
  onClick: () => void;
}

function SessionCard({ session, now, isSelected, onClick }: SessionCardProps) {
  const status = computeSessionStatus(session, now);
  const inputTokens = session.totalInputTokens ?? 0;
  const outputTokens = session.totalOutputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const cost = inputTokens * 0.003 / 1000 + outputTokens * 0.015 / 1000;

  const statusColor =
    status === "ACTIVE"
      ? "#238551"
      : status === "IDLE"
        ? "#EC9A3C"
        : "#738694";

  const statusBg =
    status === "ACTIVE"
      ? "rgba(35, 133, 81, 0.15)"
      : status === "IDLE"
        ? "rgba(236, 154, 60, 0.15)"
        : "rgba(115, 134, 148, 0.1)";

  // Recent tool badges (show skill name and model)
  const badges: { label: string; color: string }[] = [];
  if (session.skillName) {
    badges.push({ label: session.skillName, color: "#2D72D2" });
  }
  if (session.model) {
    const short = session.model.includes("opus")
      ? "opus"
      : session.model.includes("sonnet")
        ? "sonnet"
        : session.model.includes("haiku")
          ? "haiku"
          : session.model.split("-").slice(-1)[0];
    badges.push({ label: short, color: "#738694" });
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded border p-3 transition-colors ${
        isSelected
          ? "border-[#2D72D2] bg-[#2D72D2]/10"
          : "border-border bg-card hover:bg-[#2F343C]"
      } ${status === "ACTIVE" ? "streams-pulse" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Sprint / Task # */}
          {session.sprint && session.taskNum != null && (
            <span className="text-[10px] font-mono text-muted-foreground" data-mono>
              {session.sprint} #{session.taskNum}
            </span>
          )}
          {/* Task title */}
          <div className="text-xs font-semibold text-foreground truncate mt-0.5">
            {session.taskTitle ?? session.sessionId.slice(0, 12)}
          </div>
        </div>

        {/* Status badge */}
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
          style={{ color: statusColor, backgroundColor: statusBg }}
        >
          {status}
        </span>
      </div>

      {/* Duration + Tokens + Cost row */}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
        <span className="font-mono" data-mono>
          {formatDuration(session.durationMinutes)}
        </span>
        <span className="font-mono" data-mono>
          {formatTokens(totalTokens)} tok
        </span>
        <span className="font-mono" data-mono>
          {formatCost(cost)}
        </span>
        {(session.toolCallCount ?? 0) > 0 && (
          <span className="font-mono" data-mono>
            {session.toolCallCount} tools
          </span>
        )}
      </div>

      {/* Tool badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {badges.map((b) => (
            <span
              key={b.label}
              className="text-[9px] px-1.5 py-0.5 rounded font-mono"
              style={{
                backgroundColor: `${b.color}20`,
                color: b.color,
              }}
              data-mono
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
