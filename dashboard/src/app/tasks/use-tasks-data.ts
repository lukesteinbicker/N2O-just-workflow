import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  TASKS_BOARD_QUERY,
  CLAIM_TASK_MUTATION,
  UNCLAIM_TASK_MUTATION,
  ASSIGN_TASK_MUTATION,
  RESOLVE_STALE_TASKS_MUTATION,
} from "@/lib/graphql/queries";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import type { Task, GanttGroup, ProjectGroup, DeveloperGroup, SprintTaskGroup } from "./types";
import {
  taskKey,
  isStaleTask,
  formatDuration,
  computeTicks,
  LABEL_WIDTH,
  SPRINT_HEADER_HEIGHT,
  ROW_TOTAL,
  MS_PER_HOUR,
  ZOOM_PRESETS,
} from "./helpers";
import { tasksFilterConfig } from "./filter-config";

// ── Exported types (keep SprintGroup for backwards compat) ────

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

// ── Pure functions (exported for testing) ────────────────────

export function groupTasksByProject(
  tasks: Task[],
  sprintProjects: Map<string, string | null>
): ProjectGroup[] {
  if (tasks.length === 0) return [];

  const projectMap = new Map<string | null, Map<string, Task[]>>();

  for (const t of tasks) {
    const projectId = sprintProjects.get(t.sprint) ?? null;

    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, new Map());
    }
    const sprintMap = projectMap.get(projectId)!;

    if (!sprintMap.has(t.sprint)) {
      sprintMap.set(t.sprint, []);
    }
    sprintMap.get(t.sprint)!.push(t);
  }

  const groups: ProjectGroup[] = [];
  for (const [projectId, sprintMap] of projectMap) {
    const sprints: SprintTaskGroup[] = [];
    for (const [sprint, sprintTasks] of sprintMap) {
      sprintTasks.sort((a, b) => a.taskNum - b.taskNum);
      sprints.push({ sprint, tasks: sprintTasks });
    }
    groups.push({ projectId, sprints });
  }

  return groups;
}

export function groupTasksByDeveloper(tasks: Task[]): DeveloperGroup[] {
  if (tasks.length === 0) return [];

  const devMap = new Map<string, Task[]>();

  for (const t of tasks) {
    const dev = t.owner?.name ?? "unassigned";
    if (!devMap.has(dev)) {
      devMap.set(dev, []);
    }
    devMap.get(dev)!.push(t);
  }

  return Array.from(devMap.entries())
    .map(([developer, devTasks]) => ({ developer, tasks: devTasks }))
    .sort((a, b) => a.developer.localeCompare(b.developer));
}

export function computeTimeInStatus(task: Task): string {
  if (task.status !== "red" && task.status !== "blocked") return "\u2014";
  if (!task.startedAt) return "\u2014";

  return formatDuration(task.startedAt, null);
}

/** Build GanttGroups based on the first groupBy dimension. */
export function buildGanttGroups(
  tasks: Task[],
  groupByDim: string,
  sprintProjects: Map<string, string | null>
): GanttGroup[] {
  if (tasks.length === 0) return [];

  switch (groupByDim) {
    case "person": {
      const devMap = new Map<string, Task[]>();
      for (const t of tasks) {
        const dev = t.owner?.name ?? "unassigned";
        if (!devMap.has(dev)) devMap.set(dev, []);
        devMap.get(dev)!.push(t);
      }
      return Array.from(devMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dev, devTasks]) => ({
          label: dev,
          groupKey: dev,
          tasks: devTasks.sort((a, b) => a.taskNum - b.taskNum),
        }));
    }
    case "status": {
      const statusOrder = ["red", "blocked", "pending", "green"];
      const statusMap = new Map<string, Task[]>();
      for (const t of tasks) {
        if (!statusMap.has(t.status)) statusMap.set(t.status, []);
        statusMap.get(t.status)!.push(t);
      }
      return statusOrder
        .filter((s) => statusMap.has(s))
        .map((s) => ({
          label: s,
          groupKey: s,
          tasks: statusMap.get(s)!.sort((a, b) => a.taskNum - b.taskNum),
        }));
    }
    case "project": {
      const projMap = new Map<string, Task[]>();
      for (const t of tasks) {
        const proj = sprintProjects.get(t.sprint) ?? "unknown";
        if (!projMap.has(proj)) projMap.set(proj, []);
        projMap.get(proj)!.push(t);
      }
      return Array.from(projMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([proj, projTasks]) => ({
          label: proj,
          groupKey: proj,
          tasks: projTasks.sort((a, b) => a.taskNum - b.taskNum),
        }));
    }
    case "sprint":
    default: {
      const sprintOrder: string[] = [];
      const sprintMap = new Map<string, Task[]>();
      for (const t of tasks) {
        if (!sprintMap.has(t.sprint)) {
          sprintOrder.push(t.sprint);
          sprintMap.set(t.sprint, []);
        }
        sprintMap.get(t.sprint)!.push(t);
      }
      for (const tasks of sprintMap.values()) {
        tasks.sort((a, b) => a.taskNum - b.taskNum);
      }
      return sprintOrder.map((sprint) => ({
        label: sprint,
        groupKey: sprint,
        tasks: sprintMap.get(sprint)!,
      }));
    }
  }
}

// ── Hook ─────────────────────────────────────────────────────

export function useTasksData() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Turbopack requires <any> for Apollo hooks
  const { data, loading, error, refetch } = useQuery<any>(TASKS_BOARD_QUERY);
  useRealtimeTable("tasks", refetch);

  // Global filters
  const { filters, groupBy, sortBy } = useGlobalFilters();

  // Effective groupBy — fall back to page default
  const effectiveGroupBy = groupBy.length > 0
    ? groupBy
    : tasksFilterConfig.defaultGroupBy ?? ["sprint"];

  // Claim/assign mutations
  /* eslint-disable @typescript-eslint/no-explicit-any -- Turbopack requires <any> for Apollo hooks */
  const [claimTaskMutation] = useMutation<any>(CLAIM_TASK_MUTATION, {
    refetchQueries: [{ query: TASKS_BOARD_QUERY }],
  });
  const [unclaimTaskMutation] = useMutation<any>(UNCLAIM_TASK_MUTATION, {
    refetchQueries: [{ query: TASKS_BOARD_QUERY }],
  });
  const [assignTaskMutation] = useMutation<any>(ASSIGN_TASK_MUTATION, {
    refetchQueries: [{ query: TASKS_BOARD_QUERY }],
  });
  const [resolveStaleTasksMutation] = useMutation<any>(RESOLVE_STALE_TASKS_MUTATION, {
    refetchQueries: [{ query: TASKS_BOARD_QUERY }],
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const claimTask = useCallback(
    (sprint: string, taskNum: number, developer: string) =>
      claimTaskMutation({ variables: { sprint, taskNum, developer } }),
    [claimTaskMutation]
  );

  const unclaimTask = useCallback(
    (sprint: string, taskNum: number) =>
      unclaimTaskMutation({ variables: { sprint, taskNum } }),
    [unclaimTaskMutation]
  );

  const assignTask = useCallback(
    (sprint: string, taskNum: number, developer: string) =>
      assignTaskMutation({ variables: { sprint, taskNum, developer } }),
    [assignTaskMutation]
  );

  const resolveStaleTasks = useCallback(
    () => resolveStaleTasksMutation(),
    [resolveStaleTasksMutation]
  );

  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());
  const [zoomPreset, setZoomPreset] = useState(3);

  // Time-in-status tick counter (forces re-computation every 60s)
  const [timeInStatusTick, setTimeInStatusTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTimeInStatusTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // Sprint-to-projectId lookup
  const sprintProjects = useMemo(() => {
    const m = new Map<string, string | null>();
    const sprints = data?.sprints ?? [];
    for (const s of sprints) {
      m.set(s.name, s.projectId ?? null);
    }
    return m;
  }, [data]);

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

  // Apply global multi-select filters
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      // person filter (multi-select)
      const personFilter = filters.person;
      if (personFilter && personFilter.length > 0) {
        if (!t.owner?.name || !personFilter.includes(t.owner.name)) return false;
      }
      // project filter (multi-select)
      const projectFilter = filters.project;
      if (projectFilter && projectFilter.length > 0) {
        const taskProject = sprintProjects.get(t.sprint);
        if (!taskProject || !projectFilter.includes(taskProject)) return false;
      }
      // status filter (multi-select)
      const statusFilter = filters.status;
      if (statusFilter && statusFilter.length > 0) {
        if (!statusFilter.includes(t.status)) return false;
      }
      // sprint filter (multi-select)
      const sprintFilter = filters.sprint;
      if (sprintFilter && sprintFilter.length > 0) {
        if (!sprintFilter.includes(t.sprint)) return false;
      }
      // type filter (multi-select)
      const typeFilter = filters.type;
      if (typeFilter && typeFilter.length > 0) {
        if (!typeFilter.includes(t.type)) return false;
      }
      return true;
    });
  }, [allTasks, filters, sprintProjects]);

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

  // Build Gantt groups based on primary groupBy dimension
  const ganttGroups: GanttGroup[] = useMemo(
    () => buildGanttGroups(filteredTasks, effectiveGroupBy[0], sprintProjects),
    [filteredTasks, effectiveGroupBy, sprintProjects]
  );

  // Convert GanttGroups -> SprintGroup format for Gantt chart rendering
  const { sprintGroups, rowPositions, totalHeight } = useMemo(() => {
    const rowPos = new Map<string, number>();
    let currentY = 0;
    const groups: SprintGroup[] = [];

    for (const gg of ganttGroups) {
      const sprintTasks = gg.tasks;
      const collapsed = collapsedSprints.has(gg.groupKey);
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
        sprint: gg.label,
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
  }, [ganttGroups, collapsedSprints]);

  // Project grouping
  const projectGroups: ProjectGroup[] = useMemo(
    () => groupTasksByProject(filteredTasks, sprintProjects),
    [filteredTasks, sprintProjects]
  );

  // Developer grouping
  const developerGroups: DeveloperGroup[] = useMemo(
    () => groupTasksByDeveloper(filteredTasks),
    [filteredTasks]
  );

  // Time-in-status map (task key -> duration string), recomputed every 60s via tick
  const timeInStatusMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of allTasks) {
      m.set(taskKey(t.sprint, t.taskNum), computeTimeInStatus(t));
    }
    return m;
    // timeInStatusTick drives periodic re-computation without re-querying
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, timeInStatusTick]);

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

  const selectedTask = selectedTaskKey ? taskIndex.get(selectedTaskKey) ?? null : null;

  const navigateToTask = useCallback((sprint: string, taskNum: number) => {
    setSelectedTaskKey(taskKey(sprint, taskNum));
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
    zoomPreset,
    setZoomPreset,
    scrollRef,
    containerRef,
    containerWidth,
    filteredTasks,
    taskIndex,
    timelineWidth,
    sprintGroups,
    ganttGroups,
    rowPositions,
    totalHeight,
    ticks,
    nowPx,
    kpis,
    // Global filter state
    filters,
    groupBy: effectiveGroupBy,
    sortBy,
    // Grouping views
    projectGroups,
    developerGroups,
    timeInStatusMap,
    // Mutations
    claimTask,
    unclaimTask,
    assignTask,
    resolveStaleTasks,
    // Selection & navigation
    selectedTask,
    selectedTaskKey,
    setSelectedTaskKey,
    collapsedSprints,
    navigateToTask,
    toggleSprint,
    timeToPx,
  };
}
