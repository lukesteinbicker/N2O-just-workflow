// Task board: Gantt/Table views of sprint tasks with filtering, dependency lines, and detail sheet.
"use client";

import { useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageFilterContext } from "@/lib/filter-dimensions";
import { relativeTime } from "./helpers";
import { useTasksData } from "./use-tasks-data";
import { tasksFilterConfig } from "./filter-config";
import { GanttChart } from "./gantt-chart";
import { TaskTable } from "./task-table";
import { TaskDetailSheet } from "./task-detail-sheet";
import { Skeleton } from "@/components/ui/skeleton";

type ViewMode = "gantt" | "table";

export default function TasksPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("gantt");

  const {
    loading,
    error,
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
    rowPositions,
    totalHeight,
    ticks,
    nowPx,
    kpis,
    sortBy,
    timeInStatusMap,
    claimTask,
    unclaimTask,
    assignTask,
    resolveStaleTasks,
    selectedTask,
    setSelectedTaskKey,
    collapsedSprints,
    navigateToTask,
    toggleSprint,
    timeToPx,
  } = useTasksData();

  if (loading) {
    return (
      <PageFilterContext.Provider value={tasksFilterConfig}>
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">Tasks</h1>
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border bg-card p-3 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-sm" />
            ))}
          </div>
          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-[120px] shrink-0" />
                <Skeleton className="h-5 flex-1" />
              </div>
            ))}
          </div>
        </div>
      </PageFilterContext.Provider>
    );
  }

  if (error) {
    return (
      <PageFilterContext.Provider value={tasksFilterConfig}>
        <div className="flex items-center justify-center h-full text-destructive">
          {error.message}
        </div>
      </PageFilterContext.Provider>
    );
  }

  return (
    <PageFilterContext.Provider value={tasksFilterConfig}>
      <div className="space-y-4" data-testid="tasks-gantt">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Tasks</h1>

          {/* Gantt / Table toggle */}
          <div className="flex items-center gap-1" data-testid="view-toggle">
            {(["gantt", "table"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-2.5 py-1 text-xs rounded-sm border transition-colors capitalize"
                style={{
                  borderColor: viewMode === mode ? "#2D72D2" : "#394048",
                  backgroundColor: viewMode === mode ? "#2D72D220" : "transparent",
                  color: viewMode === mode ? "#2D72D2" : "#738694",
                }}
                data-testid={`view-${mode}`}
              >
                {mode === "gantt" ? "Gantt" : "Table"}
              </button>
            ))}
          </div>
        </div>

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
            delta={kpis.staleCount > 0 ? `${kpis.staleCount} stale — resolve` : undefined}
            deltaType={kpis.staleCount > 0 ? "negative" : "neutral"}
            onDeltaClick={kpis.staleCount > 0 ? resolveStaleTasks : undefined}
          />
          <KpiCard
            label="Remaining"
            value={kpis.remainingCount}
            delta={kpis.blockedCount > 0 ? `${kpis.blockedCount} blocked` : undefined}
            deltaType={kpis.blockedCount > 0 ? "negative" : "neutral"}
          />
          <KpiCard
            label="Last Updated"
            value={kpis.latestCompleted ? relativeTime(kpis.latestCompleted) : "\u2014"}
          />
        </div>

        {viewMode === "gantt" ? (
          <GanttChart
            containerRef={containerRef}
            scrollRef={scrollRef}
            sprintGroups={sprintGroups}
            filteredTasks={filteredTasks}
            taskIndex={taskIndex}
            rowPositions={rowPositions}
            collapsedSprints={collapsedSprints}
            totalHeight={totalHeight}
            timelineWidth={timelineWidth}
            containerWidth={containerWidth}
            ticks={ticks}
            nowPx={nowPx}
            zoomPreset={zoomPreset}
            onZoomChange={setZoomPreset}
            onToggleSprint={toggleSprint}
            onSelectTask={setSelectedTaskKey}
            timeToPx={timeToPx}
          />
        ) : (
          <TaskTable
            tasks={filteredTasks}
            taskIndex={taskIndex}
            timeInStatusMap={timeInStatusMap}
            allOwners={allOwners}
            sortByClauses={sortBy}
            onSelectTask={setSelectedTaskKey}
            claimTask={claimTask}
            unclaimTask={unclaimTask}
            assignTask={assignTask}
          />
        )}

        <TaskDetailSheet
          task={selectedTask}
          taskIndex={taskIndex}
          onClose={() => setSelectedTaskKey(null)}
          onNavigate={navigateToTask}
        />
      </div>
    </PageFilterContext.Provider>
  );
}
