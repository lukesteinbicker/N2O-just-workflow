"use client";

import { RefObject } from "react";
import { Card } from "@/components/ui/card";
import type { Task } from "./types";
import type { SprintGroup } from "./use-tasks-data";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  ZOOM_PRESETS,
  ROW_TOTAL,
  LABEL_WIDTH,
  SPRINT_HEADER_HEIGHT,
  taskKey,
} from "./helpers";
import { GanttTimeline } from "./gantt-timeline";

interface GanttChartProps {
  containerRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  sprintGroups: SprintGroup[];
  filteredTasks: Task[];
  taskIndex: Map<string, Task>;
  rowPositions: Map<string, number>;
  collapsedSprints: Set<string>;
  totalHeight: number;
  timelineWidth: number;
  containerWidth: number;
  ticks: { label: string; px: number }[];
  nowPx: number;
  zoomPreset: number;
  onZoomChange: (preset: number) => void;
  onToggleSprint: (sprint: string) => void;
  onSelectTask: (key: string) => void;
  timeToPx: (ts: string | null) => number;
}

export function GanttChart({
  containerRef,
  scrollRef,
  sprintGroups,
  filteredTasks,
  taskIndex,
  rowPositions,
  collapsedSprints,
  totalHeight,
  timelineWidth,
  containerWidth,
  ticks,
  nowPx,
  zoomPreset,
  onZoomChange,
  onToggleSprint,
  onSelectTask,
  timeToPx,
}: GanttChartProps) {
  return (
    <Card className="p-3 bg-card border-border overflow-hidden" ref={containerRef}>
      {/* Legend + zoom controls */}
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

        <div className="flex items-center gap-1" data-testid="zoom-controls">
          {ZOOM_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              onClick={() => onZoomChange(i)}
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
                  <button
                    className="flex items-center gap-1.5 w-full text-left"
                    style={{ height: SPRINT_HEADER_HEIGHT }}
                    onClick={() => onToggleSprint(sprint)}
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

                  {collapsed && sprintTasks.some((t) => t.startedAt) && (
                    <div
                      className="flex items-center text-[10px] text-muted-foreground/60 italic pl-4"
                      style={{ height: ROW_TOTAL }}
                    >
                      {done}/{total} done
                    </div>
                  )}

                  {!collapsed &&
                    sprintTasks.map((t) => (
                      <button
                        key={taskKey(t.sprint, t.taskNum)}
                        className="flex items-center text-xs w-full text-left truncate pr-2 hover:bg-[#2F343C] transition-colors"
                        style={{ height: ROW_TOTAL }}
                        onClick={() => onSelectTask(taskKey(t.sprint, t.taskNum))}
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

          {/* Scrollable timeline */}
          <div className="flex-1 overflow-x-auto" ref={scrollRef}>
            <GanttTimeline
              sprintGroups={sprintGroups}
              filteredTasks={filteredTasks}
              taskIndex={taskIndex}
              rowPositions={rowPositions}
              collapsedSprints={collapsedSprints}
              totalHeight={totalHeight}
              timelineWidth={timelineWidth}
              ticks={ticks}
              nowPx={nowPx}
              onSelectTask={onSelectTask}
              timeToPx={timeToPx}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
