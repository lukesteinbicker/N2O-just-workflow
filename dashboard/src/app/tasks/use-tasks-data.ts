import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { TASKS_BOARD_QUERY } from "@/lib/graphql/queries";
import { useRealtimeTable } from "@/hooks/use-realtime";
import type { Task } from "./types";
import {
  taskKey,
  isStaleTask,
  relativeTime,
  computeTicks,
  LABEL_WIDTH,
  SPRINT_HEADER_HEIGHT,
  ROW_TOTAL,
  ROW_HEIGHT,
  MS_PER_HOUR,
  ZOOM_PRESETS,
} from "./helpers";

export interface SprintGroup {
  sprint: string;
  tasks: Task[];
  yStart: number;
  spec: string | null;
  done: number;
  total: number;
  blockedCount: number;
  summaryStart: string | null;
  summaryEnd: string | null;
}

export interface Kpis {
  doneCount: number;
  avgBlowUp: string | null;
  inProgressCount: number;
  staleCount: number;
  remainingCount: number;
  blockedCount: number;
  latestCompleted: string | null;
}

export interface Contributor {
  name: string;
  done: number;
  inProgress: number;
  remaining: number;
  avgBlowUp: string;
  lastActive: string;
}

export function useTasksData() {
  const { data, loading, error, refetch } = useQuery<any>(TASKS_BOARD_QUERY);
  useRealtimeTable("tasks", refetch);

  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set(["pending", "red", "green", "blocked"])
  );
  const [sprintFilter, setSprintFilter] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [zoomPreset, setZoomPreset] = useState(3);

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width - LABEL_WIDTH);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const allTasks: Task[] = useMemo(() => data?.tasks ?? [], [data]);

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

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (!statusFilter.has(t.status)) return false;
      if (sprintFilter && t.sprint !== sprintFilter) return false;
      if (ownerFilter && t.owner?.name !== ownerFilter) return false;
      return true;
    });
  }, [allTasks, statusFilter, sprintFilter, ownerFilter]);

  const taskIndex = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of allTasks) m.set(taskKey(t.sprint, t.taskNum), t);
    return m;
  }, [allTasks]);

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

  const pxPerHour = useMemo(() => {
    const preset = ZOOM_PRESETS[zoomPreset];
    const totalHours = (timeRange.end - timeRange.start) / MS_PER_HOUR;
    if (preset.hours === 0 || containerWidth <= 0) {
      return Math.max(containerWidth / totalHours, 0.1);
    }
    return Math.max(containerWidth / preset.hours, 0.1);
  }, [zoomPreset, timeRange, containerWidth]);

  const timelineWidth = useMemo(() => {
    const totalHours = (timeRange.end - timeRange.start) / MS_PER_HOUR;
    return Math.max(totalHours * pxPerHour, containerWidth);
  }, [timeRange, pxPerHour, containerWidth]);

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
    const groups: SprintGroup[] = [];

    for (const sprint of sprintOrder) {
      const sprintTasks = sprintMap.get(sprint)!;
      const collapsed = collapsedSprints.has(sprint);
      const done = sprintTasks.filter((t) => t.status === "green").length;
      const blocked = sprintTasks.filter((t) => t.status === "blocked").length;
      const spec = sprintTasks.find((t) => t.spec)?.spec ?? null;

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

  const ticks = useMemo(
    () => computeTicks(timeRange.start, timeRange.end, pxPerHour),
    [timeRange, pxPerHour]
  );

  const nowPx = useMemo(
    () => ((Date.now() - timeRange.start) / MS_PER_HOUR) * pxPerHour,
    [timeRange, pxPerHour]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(nowPx - containerWidth / 2, 0);
  }, [nowPx, containerWidth, pxPerHour]);

  const kpis: Kpis = useMemo(() => {
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

  const contributors: Contributor[] = useMemo(() => {
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

  const selectedTask = selectedTaskKey ? taskIndex.get(selectedTaskKey) ?? null : null;

  const navigateToTask = useCallback((sprint: string, taskNum: number) => {
    setSelectedTaskKey(taskKey(sprint, taskNum));
  }, []);

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

  const timeToPx = useCallback(
    (ts: string | null): number => {
      if (!ts) return 0;
      return ((new Date(ts).getTime() - timeRange.start) / MS_PER_HOUR) * pxPerHour;
    },
    [timeRange, pxPerHour]
  );

  return {
    loading,
    error,
    allSprints,
    allOwners,
    statusFilter,
    sprintFilter,
    ownerFilter,
    zoomPreset,
    setZoomPreset,
    scrollRef,
    containerRef,
    containerWidth,
    filteredTasks,
    taskIndex,
    timelineWidth,
    sprintGroups,
    rowPositions,
    totalHeight,
    ticks,
    nowPx,
    kpis,
    contributors,
    selectedTask,
    selectedTaskKey,
    setSelectedTaskKey,
    collapsedSprints,
    navigateToTask,
    toggleStatus,
    toggleSprint,
    setSprintFilter,
    setOwnerFilter,
    timeToPx,
  };
}
