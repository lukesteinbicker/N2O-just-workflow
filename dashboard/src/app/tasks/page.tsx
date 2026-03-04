"use client";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { relativeTime } from "./helpers";
import { useTasksData } from "./use-tasks-data";
import { TaskFilters } from "./task-filters";
import { GanttChart } from "./gantt-chart";
import { ContributorsTable } from "./contributors-table";
import { TaskDetailSheet } from "./task-detail-sheet";

export default function TasksPage() {
  const {
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
    setSelectedTaskKey,
    collapsedSprints,
    navigateToTask,
    toggleStatus,
    toggleSprint,
    setSprintFilter,
    setOwnerFilter,
    timeToPx,
  } = useTasksData();

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

      <TaskFilters
        statusFilter={statusFilter}
        sprintFilter={sprintFilter}
        ownerFilter={ownerFilter}
        allSprints={allSprints}
        allOwners={allOwners}
        onToggleStatus={toggleStatus}
        onSprintChange={setSprintFilter}
        onOwnerChange={setOwnerFilter}
      />

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

      <ContributorsTable contributors={contributors} />

      <TaskDetailSheet
        task={selectedTask}
        taskIndex={taskIndex}
        onClose={() => setSelectedTaskKey(null)}
        onNavigate={navigateToTask}
      />
    </div>
  );
}
