"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Task } from "./types";
import type { SprintGroup } from "./use-tasks-data";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  ROW_HEIGHT,
  ROW_TOTAL,
  SPRINT_HEADER_HEIGHT,
  isStaleTask,
  barColor,
  taskKey,
  formatDuration,
  blowUpColor,
} from "./helpers";

interface GanttTimelineProps {
  sprintGroups: SprintGroup[];
  filteredTasks: Task[];
  taskIndex: Map<string, Task>;
  rowPositions: Map<string, number>;
  collapsedSprints: Set<string>;
  totalHeight: number;
  timelineWidth: number;
  ticks: { label: string; px: number }[];
  nowPx: number;
  onSelectTask: (key: string) => void;
  timeToPx: (ts: string | null) => number;
}

export function GanttTimeline({
  sprintGroups,
  filteredTasks,
  taskIndex,
  rowPositions,
  collapsedSprints,
  totalHeight,
  timelineWidth,
  ticks,
  nowPx,
  onSelectTask,
  timeToPx,
}: GanttTimelineProps) {
  return (
    <div style={{ width: timelineWidth, position: "relative" }}>
      {/* Time axis (top) */}
      <div className="relative border-b border-border/30" style={{ height: 20 }}>
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
        {ticks.map((tick, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{ left: tick.px, width: 1, borderLeft: "1px dashed #39404830" }}
          />
        ))}

        <div
          className="absolute top-0 bottom-0"
          style={{ left: nowPx, width: 1, borderLeft: "1px dashed #2D72D2", opacity: 0.5 }}
        />

        {sprintGroups.map(({ sprint, tasks: sprintTasks, summaryStart, summaryEnd, done, total }) => {
          const collapsed = collapsedSprints.has(sprint);
          return (
            <div key={sprint}>
              <div style={{ height: SPRINT_HEADER_HEIGHT }} />

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

              {!collapsed &&
                sprintTasks.map((t) => {
                  const key = taskKey(t.sprint, t.taskNum);
                  const stale = isStaleTask(t);

                  if (!t.startedAt) {
                    const label =
                      t.status === "green"
                        ? "done (no timing)"
                        : STATUS_LABELS[t.status]?.toLowerCase() ?? t.status;
                    return (
                      <div key={key} className="relative" style={{ height: ROW_TOTAL }}>
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
                    <div key={key} className="relative" style={{ height: ROW_TOTAL }}>
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
                            onClick={() => onSelectTask(key)}
                          >
                            {widthPx > 60 && t.owner?.name && (
                              <span className="text-[10px] text-white/80 truncate mr-1">
                                {t.owner.name}
                              </span>
                            )}
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
                              <span>
                                {STATUS_LABELS[t.status] ?? t.status}
                                {stale ? " (stale)" : ""}
                              </span>
                              {t.owner?.name && (
                                <>
                                  <span className="text-muted-foreground">Owner</span>
                                  <span>{t.owner.name}</span>
                                </>
                              )}
                              <span className="text-muted-foreground">Duration</span>
                              <span className="font-mono" data-mono>
                                {formatDuration(t.startedAt, t.completedAt)}
                              </span>
                              {t.blowUpRatio != null && (
                                <>
                                  <span className="text-muted-foreground">Blow-up</span>
                                  <span
                                    className="font-mono"
                                    style={{ color: blowUpColor(t.blowUpRatio) }}
                                    data-mono
                                  >
                                    {t.blowUpRatio.toFixed(1)}x
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
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

        {/* Dependency lines */}
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

              // Active blocker = dep is not green (still blocking the target)
              const isActiveBlocker = depTask.status !== "green";
              const lineColor = isActiveBlocker ? "#CD4246" : "#394048";
              const lineOpacity = isActiveBlocker ? 0.7 : 0.4;
              const dashArray = isActiveBlocker ? undefined : "4 3";
              const lineWidth = isActiveBlocker ? 1.5 : 1;

              const tooltipText = isActiveBlocker
                ? `Task #${dep.taskNum} blocks #${t.taskNum}`
                : `Task #${dep.taskNum} \u2192 #${t.taskNum} (resolved)`;

              return (
                <g
                  key={`${depKey}->${targetKey}`}
                  style={{ pointerEvents: "auto" }}
                  className="cursor-default"
                  data-testid={`dep-line-${dep.taskNum}-${t.taskNum}`}
                >
                  <title>{tooltipText}</title>
                  {/* Invisible wider hit area for hover */}
                  <line x1={fromX} y1={fromY} x2={midX} y2={fromY} stroke="transparent" strokeWidth={10} />
                  <line x1={midX} y1={fromY} x2={midX} y2={toY} stroke="transparent" strokeWidth={10} />
                  <line x1={midX} y1={toY} x2={toX} y2={toY} stroke="transparent" strokeWidth={10} />
                  {/* Visible lines */}
                  <line x1={fromX} y1={fromY} x2={midX} y2={fromY} stroke={lineColor} strokeWidth={lineWidth} opacity={lineOpacity} strokeDasharray={dashArray} />
                  <line x1={midX} y1={fromY} x2={midX} y2={toY} stroke={lineColor} strokeWidth={lineWidth} opacity={lineOpacity} strokeDasharray={dashArray} />
                  <line x1={midX} y1={toY} x2={toX} y2={toY} stroke={lineColor} strokeWidth={lineWidth} opacity={lineOpacity} strokeDasharray={dashArray} />
                  <circle cx={toX} cy={toY} r={isActiveBlocker ? 3 : 2.5} fill={lineColor} opacity={isActiveBlocker ? 0.8 : 0.5} />
                </g>
              );
            });
          })}
        </svg>
      </div>

      {/* Time axis (bottom) */}
      <div className="relative border-t border-border/30" style={{ height: 20 }}>
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
  );
}
