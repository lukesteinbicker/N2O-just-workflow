"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { TASKS_BOARD_QUERY } from "@/lib/graphql/queries";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types ────────────────────────────────────────────────

interface Dependency {
  sprint: string;
  taskNum: number;
}

interface Task {
  sprint: string;
  taskNum: number;
  title: string;
  spec: string | null;
  status: string;
  blockedReason: string | null;
  type: string;
  owner: { name: string } | null;
  complexity: string | null;
  startedAt: string | null;
  completedAt: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  blowUpRatio: number | null;
  dependencies: Dependency[];
  dependents: Dependency[];
}

// ── Helpers ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: "#404854",
  red: "#EC9A3C",
  green: "#238551",
  blocked: "#CD4246",
  stale: "#8F4B2E",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  red: "In Progress",
  green: "Done",
  blocked: "Blocked",
};

function isStaleTask(t: { status: string; startedAt: string | null }): boolean {
  if (t.status !== "red" || !t.startedAt) return false;
  return Date.now() - new Date(t.startedAt).getTime() > 48 * 60 * 60 * 1000;
}

function barColor(status: string, stale: boolean): string {
  if (stale) return STATUS_COLORS.stale;
  return STATUS_COLORS[status] ?? "#404854";
}

function taskKey(sprint: string, taskNum: number): string {
  return `${sprint}::${taskNum}`;
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const hours = (end - start) / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatMinutes(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

function relativeTime(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = diff / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function blowUpColor(ratio: number): string {
  if (ratio <= 1.2) return "#238551";
  if (ratio <= 2.0) return "#EC9A3C";
  return "#CD4246";
}

// ── Constants ────────────────────────────────────────────

const ROW_HEIGHT = 24;
const ROW_GAP = 4;
const ROW_TOTAL = ROW_HEIGHT + ROW_GAP;
const LABEL_WIDTH = 220;
const SPRINT_HEADER_HEIGHT = 32;
const MS_PER_HOUR = 3600000;

// Zoom presets: how many hours to fit into the container
const ZOOM_PRESETS = [
  { label: "Day", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "Week", hours: 168 },
  { label: "All", hours: 0 }, // 0 = fit entire range
] as const;

// ── Time tick computation ────────────────────────────────

function computeTicks(
  rangeStart: number,
  rangeEnd: number,
  pxPerHour: number
): { label: string; px: number }[] {
  const totalHours = (rangeEnd - rangeStart) / MS_PER_HOUR;
  // Choose interval: hourly, 6h, daily, weekly
  let intervalHours: number;
  if (pxPerHour >= 30) intervalHours = 1;
  else if (pxPerHour >= 8) intervalHours = 6;
  else if (pxPerHour >= 1.5) intervalHours = 24;
  else intervalHours = 168;

  const intervalMs = intervalHours * MS_PER_HOUR;
  // Snap start to interval boundary
  const firstTick = Math.ceil(rangeStart / intervalMs) * intervalMs;
  const ticks: { label: string; px: number }[] = [];

  for (let t = firstTick; t <= rangeEnd; t += intervalMs) {
    const d = new Date(t);
    let label: string;
    if (intervalHours <= 6) {
      label = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (intervalHours <= 24) {
      label = d.toLocaleDateString([], { month: "short", day: "numeric" });
    } else {
      label = d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
    const px = ((t - rangeStart) / MS_PER_HOUR) * pxPerHour;
    ticks.push({ label, px });
  }
  return ticks;
}

// ── Page ─────────────────────────────────────────────────

export default function TasksPage() {
  const { data, loading, error, refetch } = useQuery<any>(TASKS_BOARD_QUERY);
  useRealtimeTable("tasks", refetch);

  // State
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set(["pending", "red", "green", "blocked"])
  );
  const [sprintFilter, setSprintFilter] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [zoomPreset, setZoomPreset] = useState(3); // default: "All"

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width - LABEL_WIDTH);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Derived data ────────────────────────────────────────

  const allTasks: Task[] = useMemo(() => data?.tasks ?? [], [data]);

  // Unique sprints + owners for filter dropdowns
  const allSprints = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTasks) s.add(t.sprint);
    return Array.from(s);
  }, [allTasks]);

  const allOwners = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTasks) if (t.owner?.name) s.add(t.owner.name);
    return Array.from(s).sort();
  }, [allTasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (!statusFilter.has(t.status)) return false;
      if (sprintFilter && t.sprint !== sprintFilter) return false;
      if (ownerFilter && t.owner?.name !== ownerFilter) return false;
      return true;
    });
  }, [allTasks, statusFilter, sprintFilter, ownerFilter]);

  // Task index (all tasks, for dependency lookup)
  const taskIndex = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of allTasks) m.set(taskKey(t.sprint, t.taskNum), t);
    return m;
  }, [allTasks]);

  // Time range
  const timeRange = useMemo(() => {
    const timestamps: number[] = [];
    for (const t of allTasks) {
      if (t.startedAt) timestamps.push(new Date(t.startedAt).getTime());
      if (t.completedAt) timestamps.push(new Date(t.completedAt).getTime());
    }
    const now = Date.now();
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : now - 86400000;
    const maxTime = Math.max(now, ...(timestamps.length > 0 ? timestamps : [now]));
    const padding = (maxTime - minTime) * 0.02 || MS_PER_HOUR;
    return { start: minTime - padding, end: maxTime + padding };
  }, [allTasks]);

  // Pixels per hour
  const pxPerHour = useMemo(() => {
    const preset = ZOOM_PRESETS[zoomPreset];
    const totalHours = (timeRange.end - timeRange.start) / MS_PER_HOUR;
    if (preset.hours === 0 || containerWidth <= 0) {
      // Fit all
      return Math.max(containerWidth / totalHours, 0.1);
    }
    return Math.max(containerWidth / preset.hours, 0.1);
  }, [zoomPreset, timeRange, containerWidth]);

  const timelineWidth = useMemo(() => {
    const totalHours = (timeRange.end - timeRange.start) / MS_PER_HOUR;
    return Math.max(totalHours * pxPerHour, containerWidth);
  }, [timeRange, pxPerHour, containerWidth]);

  // Sprint groups from filtered tasks
  const { sprintGroups, rowPositions, totalHeight } = useMemo(() => {
    const sprintOrder: string[] = [];
    const sprintMap = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      if (!sprintMap.has(t.sprint)) {
        sprintOrder.push(t.sprint);
        sprintMap.set(t.sprint, []);
      }
      sprintMap.get(t.sprint)!.push(t);
    }
    for (const tasks of sprintMap.values()) {
      tasks.sort((a, b) => a.taskNum - b.taskNum);
    }

    const rowPos = new Map<string, number>();
    let currentY = 0;
    const groups: {
      sprint: string;
      tasks: Task[];
      yStart: number;
      spec: string | null;
      done: number;
      total: number;
      blockedCount: number;
      summaryStart: string | null;
      summaryEnd: string | null;
    }[] = [];

    for (const sprint of sprintOrder) {
      const sprintTasks = sprintMap.get(sprint)!;
      const collapsed = collapsedSprints.has(sprint);
      const done = sprintTasks.filter((t) => t.status === "green").length;
      const blocked = sprintTasks.filter((t) => t.status === "blocked").length;
      // Derive spec from first task that has one
      const spec = sprintTasks.find((t) => t.spec)?.spec ?? null;

      // Compute summary time range for collapsed view
      let summaryStart: string | null = null;
      let summaryEnd: string | null = null;
      for (const t of sprintTasks) {
        if (t.startedAt) {
          if (!summaryStart || t.startedAt < summaryStart) summaryStart = t.startedAt;
          const end = t.completedAt ?? new Date().toISOString();
          if (!summaryEnd || end > summaryEnd) summaryEnd = end;
        }
      }

      groups.push({
        sprint,
        tasks: sprintTasks,
        yStart: currentY,
        spec,
        done,
        total: sprintTasks.length,
        blockedCount: blocked,
        summaryStart,
        summaryEnd,
      });
      currentY += SPRINT_HEADER_HEIGHT;

      if (collapsed) {
        // Reserve one row for the summary bar
        if (summaryStart) currentY += ROW_TOTAL;
      } else {
        for (const t of sprintTasks) {
          rowPos.set(taskKey(t.sprint, t.taskNum), currentY);
          currentY += ROW_TOTAL;
        }
      }
      currentY += 8;
    }

    return { sprintGroups: groups, rowPositions: rowPos, totalHeight: currentY };
  }, [filteredTasks, collapsedSprints]);

  // Ticks
  const ticks = useMemo(
    () => computeTicks(timeRange.start, timeRange.end, pxPerHour),
    [timeRange, pxPerHour]
  );

  // Now marker position
  const nowPx = useMemo(
    () => ((Date.now() - timeRange.start) / MS_PER_HOUR) * pxPerHour,
    [timeRange, pxPerHour]
  );

  // Auto-scroll to now on mount or zoom change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(nowPx - containerWidth / 2, 0);
  }, [nowPx, containerWidth, pxPerHour]);

  // ── KPIs ──────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const done = allTasks.filter((t) => t.status === "green");
    const inProgress = allTasks.filter((t) => t.status === "red");
    const blocked = allTasks.filter((t) => t.status === "blocked");
    const pending = allTasks.filter((t) => t.status === "pending");
    const staleCount = inProgress.filter((t) => isStaleTask(t)).length;

    const blowUps = done.filter((t) => t.blowUpRatio != null).map((t) => t.blowUpRatio!);
    const avgBlowUp =
      blowUps.length > 0
        ? (blowUps.reduce((a, b) => a + b, 0) / blowUps.length).toFixed(1)
        : null;

    // Most recent completedAt
    let latestCompleted: string | null = null;
    for (const t of done) {
      if (t.completedAt && (!latestCompleted || t.completedAt > latestCompleted)) {
        latestCompleted = t.completedAt;
      }
    }

    return {
      doneCount: done.length,
      avgBlowUp,
      inProgressCount: inProgress.length,
      staleCount,
      remainingCount: pending.length + blocked.length,
      blockedCount: blocked.length,
      latestCompleted,
    };
  }, [allTasks]);

  // ── Contribution table ────────────────────────────────────

  const contributors = useMemo(() => {
    const byOwner = new Map<
      string,
      { done: number; inProgress: number; remaining: number; blowUps: number[]; lastActive: number }
    >();

    for (const t of allTasks) {
      const name = t.owner?.name ?? "unassigned";
      if (!byOwner.has(name)) {
        byOwner.set(name, { done: 0, inProgress: 0, remaining: 0, blowUps: [], lastActive: 0 });
      }
      const entry = byOwner.get(name)!;
      if (t.status === "green") entry.done++;
      else if (t.status === "red") entry.inProgress++;
      else entry.remaining++;
      if (t.blowUpRatio != null) entry.blowUps.push(t.blowUpRatio);

      // Last active = max of startedAt, completedAt
      if (t.startedAt) {
        const ts = new Date(t.startedAt).getTime();
        if (ts > entry.lastActive) entry.lastActive = ts;
      }
      if (t.completedAt) {
        const ts = new Date(t.completedAt).getTime();
        if (ts > entry.lastActive) entry.lastActive = ts;
      }
    }

    return Array.from(byOwner.entries())
      .map(([name, d]) => ({
        name,
        done: d.done,
        inProgress: d.inProgress,
        remaining: d.remaining,
        avgBlowUp:
          d.blowUps.length > 0
            ? (d.blowUps.reduce((a, b) => a + b, 0) / d.blowUps.length).toFixed(1)
            : "—",
        lastActive: d.lastActive > 0 ? relativeTime(new Date(d.lastActive).toISOString()) : "—",
      }))
      .sort((a, b) => b.done - a.done);
  }, [allTasks]);

  // ── Selected task for Sheet ───────────────────────────────

  const selectedTask = selectedTaskKey ? taskIndex.get(selectedTaskKey) ?? null : null;

  const navigateToTask = useCallback((sprint: string, taskNum: number) => {
    setSelectedTaskKey(taskKey(sprint, taskNum));
  }, []);

  // ── Toggle helpers ────────────────────────────────────────

  const toggleStatus = useCallback((status: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const toggleSprint = useCallback((sprint: string) => {
    setCollapsedSprints((prev) => {
      const next = new Set(prev);
      if (next.has(sprint)) next.delete(sprint);
      else next.add(sprint);
      return next;
    });
  }, []);

  // ── Time → px ────────────────────────────────────────────

  const timeToPx = useCallback(
    (ts: string | null): number => {
      if (!ts) return 0;
      return ((new Date(ts).getTime() - timeRange.start) / MS_PER_HOUR) * pxPerHour;
    },
    [timeRange, pxPerHour]
  );

  // ── Render ────────────────────────────────────────────────

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
    <div className="space-y-4" data-testid="tasks-gantt">
      <h1 className="text-lg font-semibold">Tasks</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Completed"
          value={kpis.doneCount}
          delta={kpis.avgBlowUp ? `avg ${kpis.avgBlowUp}x` : undefined}
          deltaType="neutral"
        />
        <KpiCard
          label="In Progress"
          value={kpis.inProgressCount}
          delta={kpis.staleCount > 0 ? `${kpis.staleCount} stale` : undefined}
          deltaType={kpis.staleCount > 0 ? "negative" : "neutral"}
        />
        <KpiCard
          label="Remaining"
          value={kpis.remainingCount}
          delta={kpis.blockedCount > 0 ? `${kpis.blockedCount} blocked` : undefined}
          deltaType={kpis.blockedCount > 0 ? "negative" : "neutral"}
        />
        <KpiCard
          label="Last Updated"
          value={kpis.latestCompleted ? relativeTime(kpis.latestCompleted) : "—"}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status pills */}
        {(["green", "red", "blocked", "pending"] as const).map((status) => (
          <button
            key={status}
            onClick={() => toggleStatus(status)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs border transition-colors"
            style={{
              borderColor: statusFilter.has(status) ? STATUS_COLORS[status] : "#394048",
              backgroundColor: statusFilter.has(status)
                ? `${STATUS_COLORS[status]}20`
                : "transparent",
              color: statusFilter.has(status) ? STATUS_COLORS[status] : "#738694",
              opacity: statusFilter.has(status) ? 1 : 0.5,
            }}
            data-testid={`filter-${status}`}
          >
            <div
              className="rounded-sm"
              style={{
                width: 8,
                height: 8,
                backgroundColor: STATUS_COLORS[status],
                opacity: statusFilter.has(status) ? 1 : 0.3,
              }}
            />
            {STATUS_LABELS[status] ?? status}
          </button>
        ))}

        {/* Sprint select */}
        <select
          className="text-xs bg-[#252A31] border border-border rounded-sm px-2 py-1 text-foreground"
          value={sprintFilter ?? ""}
          onChange={(e) => setSprintFilter(e.target.value || null)}
          data-testid="filter-sprint"
        >
          <option value="">All sprints</option>
          {allSprints.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Owner select */}
        <select
          className="text-xs bg-[#252A31] border border-border rounded-sm px-2 py-1 text-foreground"
          value={ownerFilter ?? ""}
          onChange={(e) => setOwnerFilter(e.target.value || null)}
          data-testid="filter-owner"
        >
          <option value="">All owners</option>
          {allOwners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {/* Gantt Chart */}
      <Card className="p-3 bg-card border-border overflow-hidden" ref={containerRef}>
        {/* Sticky header: legend + zoom controls */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            {Object.entries(STATUS_COLORS)
              .filter(([s]) => s !== "stale")
              .map(([status, color]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div
                    className="rounded-sm"
                    style={{ width: 12, height: 8, backgroundColor: color }}
                  />
                  <span className="text-[11px] text-muted-foreground capitalize">
                    {STATUS_LABELS[status] ?? status}
                  </span>
                </div>
              ))}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1" data-testid="zoom-controls">
            {ZOOM_PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                onClick={() => setZoomPreset(i)}
                className="px-2 py-0.5 text-[11px] rounded-sm border transition-colors"
                style={{
                  borderColor: zoomPreset === i ? "#2D72D2" : "#394048",
                  backgroundColor: zoomPreset === i ? "#2D72D220" : "transparent",
                  color: zoomPreset === i ? "#2D72D2" : "#738694",
                }}
                data-testid={`zoom-${preset.label.toLowerCase()}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tasks match filters</p>
        ) : (
          <div className="flex" style={{ minWidth: 600 }}>
            {/* Fixed label column */}
            <div className="shrink-0" style={{ width: LABEL_WIDTH }}>
              {sprintGroups.map(({ sprint, tasks: sprintTasks, spec, done, total, blockedCount }) => {
                const collapsed = collapsedSprints.has(sprint);
                return (
                  <div key={sprint}>
                    {/* Sprint header */}
                    <button
                      className="flex items-center gap-1.5 w-full text-left"
                      style={{ height: SPRINT_HEADER_HEIGHT }}
                      onClick={() => toggleSprint(sprint)}
                      data-testid={`sprint-header-${sprint}`}
                    >
                      <span className="text-[10px] text-muted-foreground">
                        {collapsed ? "▸" : "▾"}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
                        {sprint}
                      </span>
                      {spec && (
                        <span className="text-[10px] text-muted-foreground/60 truncate">
                          ({spec})
                        </span>
                      )}
                      <span
                        className="text-[10px] font-mono ml-auto shrink-0 pr-2"
                        style={{ color: done === total ? "#238551" : "#738694" }}
                        data-mono
                      >
                        {done}/{total}
                        {blockedCount > 0 && (
                          <span style={{ color: "#CD4246" }}> {blockedCount}B</span>
                        )}
                      </span>
                    </button>

                    {/* Collapsed: summary label row */}
                    {collapsed && sprintTasks.some((t) => t.startedAt) && (
                      <div
                        className="flex items-center text-[10px] text-muted-foreground/60 italic pl-4"
                        style={{ height: ROW_TOTAL }}
                      >
                        {done}/{total} done
                      </div>
                    )}

                    {/* Task labels (hidden when collapsed) */}
                    {!collapsed &&
                      sprintTasks.map((t) => (
                        <button
                          key={taskKey(t.sprint, t.taskNum)}
                          className="flex items-center text-xs w-full text-left truncate pr-2 hover:bg-[#2F343C] transition-colors"
                          style={{ height: ROW_TOTAL }}
                          onClick={() => setSelectedTaskKey(taskKey(t.sprint, t.taskNum))}
                          data-testid={`task-row-${t.sprint}-${t.taskNum}`}
                        >
                          <span
                            className="font-mono text-muted-foreground mr-1.5 shrink-0"
                            style={{ width: 28 }}
                            data-mono
                          >
                            #{t.taskNum}
                          </span>
                          <span className="truncate text-foreground/80 mr-1">{t.title}</span>
                          {t.owner?.name && (
                            <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-auto">
                              {t.owner.name}
                            </span>
                          )}
                        </button>
                      ))}

                    <div style={{ height: 8 }} />
                  </div>
                );
              })}
            </div>

            {/* Scrollable timeline area */}
            <div className="flex-1 overflow-x-auto" ref={scrollRef}>
              <div style={{ width: timelineWidth, position: "relative" }}>
                {/* Time axis (top) */}
                <div
                  className="relative border-b border-border/30"
                  style={{ height: 20 }}
                >
                  {ticks.map((tick, i) => (
                    <span
                      key={i}
                      className="absolute text-[10px] text-muted-foreground font-mono whitespace-nowrap"
                      style={{ left: tick.px, top: 2, transform: "translateX(-50%)" }}
                      data-mono
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>

                {/* Bars + gridlines */}
                <div className="relative" style={{ height: totalHeight }}>
                  {/* Gridlines */}
                  {ticks.map((tick, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0"
                      style={{
                        left: tick.px,
                        width: 1,
                        borderLeft: "1px dashed #39404830",
                      }}
                    />
                  ))}

                  {/* Now marker */}
                  <div
                    className="absolute top-0 bottom-0"
                    style={{
                      left: nowPx,
                      width: 1,
                      borderLeft: "1px dashed #2D72D2",
                      opacity: 0.5,
                    }}
                  />

                  {/* Sprint groups */}
                  {sprintGroups.map(({ sprint, tasks: sprintTasks, summaryStart, summaryEnd, done, total }) => {
                    const collapsed = collapsedSprints.has(sprint);
                    return (
                      <div key={sprint}>
                        {/* Sprint header spacer */}
                        <div style={{ height: SPRINT_HEADER_HEIGHT }} />

                        {/* Collapsed: summary bar */}
                        {collapsed && summaryStart && (
                          <div className="relative" style={{ height: ROW_TOTAL }}>
                            <div
                              className="absolute rounded-sm"
                              style={{
                                left: timeToPx(summaryStart),
                                width: Math.max(timeToPx(summaryEnd!) - timeToPx(summaryStart), 20),
                                height: ROW_HEIGHT,
                                backgroundColor: done === total ? "#238551" : done > 0 ? "#2D72D2" : "#404854",
                                opacity: 0.5,
                              }}
                            />
                          </div>
                        )}

                        {/* Task bars */}
                        {!collapsed &&
                          sprintTasks.map((t) => {
                            const key = taskKey(t.sprint, t.taskNum);
                            const stale = isStaleTask(t);

                            if (!t.startedAt) {
                              const label =
                                t.status === "green" ? "done (no timing)" : STATUS_LABELS[t.status]?.toLowerCase() ?? t.status;
                              return (
                                <div
                                  key={key}
                                  className="relative"
                                  style={{ height: ROW_TOTAL }}
                                >
                                  <div
                                    className="absolute flex items-center text-[10px] text-muted-foreground/50 italic"
                                    style={{ top: 0, left: 8, height: ROW_HEIGHT }}
                                  >
                                    {label}
                                  </div>
                                </div>
                              );
                            }

                            const leftPx = timeToPx(t.startedAt);
                            const rightPx = t.completedAt ? timeToPx(t.completedAt) : nowPx;
                            const widthPx = Math.max(rightPx - leftPx, 20);

                            return (
                              <div
                                key={key}
                                className="relative"
                                style={{ height: ROW_TOTAL }}
                              >
                                <Tooltip delayDuration={0}>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="absolute rounded-sm flex items-center px-1.5 overflow-hidden hover:opacity-100 transition-opacity cursor-pointer"
                                      style={{
                                        left: leftPx,
                                        width: widthPx,
                                        height: ROW_HEIGHT,
                                        backgroundColor: barColor(t.status, stale),
                                        opacity: 0.85,
                                      }}
                                      onClick={() => setSelectedTaskKey(key)}
                                    >
                                      {widthPx > 60 && t.owner?.name && (
                                        <span className="text-[10px] text-white/80 truncate mr-1">
                                          {t.owner.name}
                                        </span>
                                      )}
                                      {/* Blow-up ratio label on completed bars */}
                                      {t.status === "green" && t.blowUpRatio != null && widthPx > 40 && (
                                        <span
                                          className="text-[10px] font-mono ml-auto shrink-0"
                                          style={{ color: blowUpColor(t.blowUpRatio) }}
                                          data-mono
                                        >
                                          {t.blowUpRatio.toFixed(1)}x
                                        </span>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    sideOffset={6}
                                    className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[260px]"
                                  >
                                    <div className="space-y-1">
                                      <div className="text-xs font-semibold">{t.title}</div>
                                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                                        <span className="text-muted-foreground">Status</span>
                                        <span>{STATUS_LABELS[t.status] ?? t.status}{stale ? " (stale)" : ""}</span>
                                        {t.owner?.name && (
                                          <>
                                            <span className="text-muted-foreground">Owner</span>
                                            <span>{t.owner.name}</span>
                                          </>
                                        )}
                                        <span className="text-muted-foreground">Duration</span>
                                        <span className="font-mono" data-mono>{formatDuration(t.startedAt, t.completedAt)}</span>
                                        {t.blowUpRatio != null && (
                                          <>
                                            <span className="text-muted-foreground">Blow-up</span>
                                            <span className="font-mono" style={{ color: blowUpColor(t.blowUpRatio) }} data-mono>
                                              {t.blowUpRatio.toFixed(1)}x
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                {/* Stale marker */}
                                {stale && (
                                  <span
                                    className="absolute text-[9px] font-semibold"
                                    style={{
                                      left: leftPx + widthPx + 4,
                                      top: 4,
                                      color: STATUS_COLORS.stale,
                                    }}
                                  >
                                    STALE
                                  </span>
                                )}
                              </div>
                            );
                          })}

                        <div style={{ height: 8 }} />
                      </div>
                    );
                  })}

                  {/* Dependency lines (SVG overlay) */}
                  <svg
                    className="absolute inset-0"
                    style={{ width: timelineWidth, height: totalHeight, pointerEvents: "none" }}
                  >
                    {filteredTasks.map((t) => {
                      if (!t.dependencies || t.dependencies.length === 0) return null;
                      const targetKey = taskKey(t.sprint, t.taskNum);
                      const targetY = rowPositions.get(targetKey);
                      if (targetY === undefined) return null;

                      const targetStartPx = t.startedAt ? timeToPx(t.startedAt) : 0;

                      return t.dependencies.map((dep) => {
                        const depKey = taskKey(dep.sprint, dep.taskNum);
                        const depTask = taskIndex.get(depKey);
                        const depY = rowPositions.get(depKey);
                        if (!depTask || depY === undefined) return null;

                        const depEndPx = depTask.startedAt
                          ? depTask.completedAt
                            ? timeToPx(depTask.completedAt)
                            : nowPx
                          : 0;

                        if (depEndPx === 0 || targetStartPx === 0) return null;

                        const fromX = depEndPx;
                        const fromY = depY + ROW_HEIGHT / 2;
                        const toX = targetStartPx;
                        const toY = targetY + ROW_HEIGHT / 2;
                        const midX = fromX + 8;

                        const depStatus = STATUS_LABELS[depTask.status] ?? depTask.status;
                        const targetStatus = STATUS_LABELS[t.status] ?? t.status;

                        return (
                          <g key={`${depKey}->${targetKey}`} style={{ pointerEvents: "auto" }} className="cursor-default">
                            <title>{`#${dep.taskNum} (${depStatus}) → #${t.taskNum} (${targetStatus})`}</title>
                            {/* Invisible wider hit area */}
                            <line
                              x1={fromX} y1={fromY} x2={midX} y2={fromY}
                              stroke="transparent" strokeWidth={8}
                            />
                            <line
                              x1={midX} y1={fromY} x2={midX} y2={toY}
                              stroke="transparent" strokeWidth={8}
                            />
                            <line
                              x1={midX} y1={toY} x2={toX} y2={toY}
                              stroke="transparent" strokeWidth={8}
                            />
                            {/* Visible lines */}
                            <line
                              x1={fromX} y1={fromY} x2={midX} y2={fromY}
                              stroke="#5C7080" strokeWidth={1} opacity={0.4}
                            />
                            <line
                              x1={midX} y1={fromY} x2={midX} y2={toY}
                              stroke="#5C7080" strokeWidth={1} opacity={0.4}
                            />
                            <line
                              x1={midX} y1={toY} x2={toX} y2={toY}
                              stroke="#5C7080" strokeWidth={1} opacity={0.4}
                            />
                            <circle
                              cx={toX} cy={toY} r={2.5}
                              fill="#5C7080" opacity={0.5}
                            />
                          </g>
                        );
                      });
                    })}
                  </svg>
                </div>

                {/* Time axis (bottom) */}
                <div
                  className="relative border-t border-border/30"
                  style={{ height: 20 }}
                >
                  {ticks.map((tick, i) => (
                    <span
                      key={i}
                      className="absolute text-[10px] text-muted-foreground font-mono whitespace-nowrap"
                      style={{ left: tick.px, bottom: 2, transform: "translateX(-50%)" }}
                      data-mono
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Contributors table */}
      {contributors.length > 0 && (
        <Card className="p-3 bg-card border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Contributors
          </h3>
          <table className="w-full text-xs" data-testid="contributors-table">
            <thead>
              <tr className="text-muted-foreground border-b border-border/30">
                <th className="text-left py-1.5 font-medium">Person</th>
                <th className="text-right py-1.5 font-medium">Done</th>
                <th className="text-right py-1.5 font-medium">In Progress</th>
                <th className="text-right py-1.5 font-medium">Remaining</th>
                <th className="text-right py-1.5 font-medium">Avg Blow-up</th>
                <th className="text-right py-1.5 font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {contributors.map((c) => (
                <tr key={c.name} className="border-b border-border/10 hover:bg-[#2F343C] transition-colors">
                  <td className="py-1.5 text-foreground font-medium">{c.name}</td>
                  <td className="py-1.5 text-right font-mono" data-mono>
                    <span style={{ color: "#238551" }}>{c.done}</span>
                  </td>
                  <td className="py-1.5 text-right font-mono" data-mono>
                    <span style={{ color: "#EC9A3C" }}>{c.inProgress}</span>
                  </td>
                  <td className="py-1.5 text-right font-mono" data-mono>{c.remaining}</td>
                  <td className="py-1.5 text-right font-mono" data-mono>
                    {c.avgBlowUp !== "—" ? (
                      <span style={{ color: blowUpColor(parseFloat(c.avgBlowUp)) }}>
                        {c.avgBlowUp}x
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">{c.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Task Detail Sheet */}
      <Sheet
        open={selectedTask != null}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskKey(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-[420px] sm:max-w-[420px] bg-[#1C2127] border-border overflow-y-auto"
          data-testid="task-detail-sheet"
        >
          {selectedTask && (
            <>
              <SheetHeader>
                <SheetTitle className="text-sm flex items-center gap-2">
                  <span className="font-mono text-muted-foreground" data-mono>
                    #{selectedTask.taskNum}
                  </span>
                  {selectedTask.title}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={selectedTask.status} />
                  {selectedTask.owner?.name && (
                    <span className="text-xs text-foreground">{selectedTask.owner.name}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{selectedTask.type}</span>
                  {selectedTask.complexity && (
                    <span className="text-xs font-mono text-muted-foreground" data-mono>
                      {selectedTask.complexity}
                    </span>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className="px-4 pb-4 space-y-4">
                {/* Sprint context */}
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Sprint
                  </h4>
                  <div className="text-xs text-foreground">
                    {selectedTask.sprint}
                    {selectedTask.spec && (
                      <span className="text-muted-foreground ml-1">({selectedTask.spec})</span>
                    )}
                  </div>
                </div>

                {/* Dependencies */}
                {selectedTask.dependencies.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Blocked By
                    </h4>
                    <div className="space-y-1">
                      {selectedTask.dependencies.map((dep) => {
                        const depTask = taskIndex.get(taskKey(dep.sprint, dep.taskNum));
                        return (
                          <button
                            key={`${dep.sprint}-${dep.taskNum}`}
                            className="flex items-center gap-1.5 text-xs text-[#2D72D2] hover:underline"
                            onClick={() => navigateToTask(dep.sprint, dep.taskNum)}
                          >
                            <span className="font-mono" data-mono>#{dep.taskNum}</span>
                            {depTask && <span>{depTask.title}</span>}
                            {depTask && <StatusBadge status={depTask.status} className="ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedTask.dependents.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Blocks
                    </h4>
                    <div className="space-y-1">
                      {selectedTask.dependents.map((dep) => {
                        const depTask = taskIndex.get(taskKey(dep.sprint, dep.taskNum));
                        return (
                          <button
                            key={`${dep.sprint}-${dep.taskNum}`}
                            className="flex items-center gap-1.5 text-xs text-[#2D72D2] hover:underline"
                            onClick={() => navigateToTask(dep.sprint, dep.taskNum)}
                          >
                            <span className="font-mono" data-mono>#{dep.taskNum}</span>
                            {depTask && <span>{depTask.title}</span>}
                            {depTask && <StatusBadge status={depTask.status} className="ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Blocked reason */}
                {selectedTask.status === "blocked" && selectedTask.blockedReason && (
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Blocked Reason
                    </h4>
                    <div className="text-xs text-[#CD4246] bg-[#CD4246]/10 rounded-sm px-2 py-1.5 border border-[#CD4246]/20">
                      {selectedTask.blockedReason}
                    </div>
                  </div>
                )}

                {/* Timing */}
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Timing
                  </h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Started</span>
                    <span className="font-mono text-foreground" data-mono>
                      {selectedTask.startedAt
                        ? new Date(selectedTask.startedAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>

                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-mono text-foreground" data-mono>
                      {selectedTask.completedAt
                        ? new Date(selectedTask.completedAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>

                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-mono text-foreground" data-mono>
                      {formatDuration(selectedTask.startedAt, selectedTask.completedAt)}
                    </span>

                    <span className="text-muted-foreground">Estimated</span>
                    <span className="font-mono text-foreground" data-mono>
                      {formatMinutes(selectedTask.estimatedMinutes)}
                    </span>

                    <span className="text-muted-foreground">Actual</span>
                    <span className="font-mono text-foreground" data-mono>
                      {formatMinutes(selectedTask.actualMinutes)}
                    </span>

                    {selectedTask.blowUpRatio != null && (
                      <>
                        <span className="text-muted-foreground">Blow-up Ratio</span>
                        <span
                          className="font-mono font-semibold"
                          style={{ color: blowUpColor(selectedTask.blowUpRatio) }}
                          data-mono
                        >
                          {selectedTask.blowUpRatio.toFixed(2)}x
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
