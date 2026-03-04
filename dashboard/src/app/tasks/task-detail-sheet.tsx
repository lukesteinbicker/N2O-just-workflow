"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Task } from "./types";
import { taskKey, formatDuration, formatMinutes, blowUpColor } from "./helpers";

interface TaskDetailSheetProps {
  task: Task | null;
  taskIndex: Map<string, Task>;
  onClose: () => void;
  onNavigate: (sprint: string, taskNum: number) => void;
}

export function TaskDetailSheet({ task, taskIndex, onClose, onNavigate }: TaskDetailSheetProps) {
  return (
    <Sheet open={task != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] bg-[#1C2127] border-border overflow-y-auto"
        data-testid="task-detail-sheet"
      >
        {task && (
          <>
            <SheetHeader>
              <SheetTitle className="text-sm flex items-center gap-2">
                <span className="font-mono text-muted-foreground" data-mono>
                  #{task.taskNum}
                </span>
                {task.title}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={task.status} />
                {task.owner?.name && (
                  <span className="text-xs text-foreground">{task.owner.name}</span>
                )}
                <span className="text-xs text-muted-foreground">{task.type}</span>
                {task.complexity && (
                  <span className="text-xs font-mono text-muted-foreground" data-mono>
                    {task.complexity}
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="px-4 pb-4 space-y-4">
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Sprint
                </h4>
                <div className="text-xs text-foreground">
                  {task.sprint}
                  {task.spec && (
                    <span className="text-muted-foreground ml-1">({task.spec})</span>
                  )}
                </div>
              </div>

              {task.dependencies.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Blocked By
                  </h4>
                  <div className="space-y-1">
                    {task.dependencies.map((dep) => {
                      const depTask = taskIndex.get(taskKey(dep.sprint, dep.taskNum));
                      return (
                        <button
                          key={`${dep.sprint}-${dep.taskNum}`}
                          className="flex items-center gap-1.5 text-xs text-[#2D72D2] hover:underline"
                          onClick={() => onNavigate(dep.sprint, dep.taskNum)}
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

              {task.dependents.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Blocks
                  </h4>
                  <div className="space-y-1">
                    {task.dependents.map((dep) => {
                      const depTask = taskIndex.get(taskKey(dep.sprint, dep.taskNum));
                      return (
                        <button
                          key={`${dep.sprint}-${dep.taskNum}`}
                          className="flex items-center gap-1.5 text-xs text-[#2D72D2] hover:underline"
                          onClick={() => onNavigate(dep.sprint, dep.taskNum)}
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

              {task.status === "blocked" && task.blockedReason && (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Blocked Reason
                  </h4>
                  <div className="text-xs text-[#CD4246] bg-[#CD4246]/10 rounded-sm px-2 py-1.5 border border-[#CD4246]/20">
                    {task.blockedReason}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Timing
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-mono text-foreground" data-mono>
                    {task.startedAt
                      ? new Date(task.startedAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>

                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-mono text-foreground" data-mono>
                    {task.completedAt
                      ? new Date(task.completedAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>

                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-mono text-foreground" data-mono>
                    {formatDuration(task.startedAt, task.completedAt)}
                  </span>

                  <span className="text-muted-foreground">Estimated</span>
                  <span className="font-mono text-foreground" data-mono>
                    {formatMinutes(task.estimatedMinutes)}
                  </span>

                  <span className="text-muted-foreground">Actual</span>
                  <span className="font-mono text-foreground" data-mono>
                    {formatMinutes(task.actualMinutes)}
                  </span>

                  {task.blowUpRatio != null && (
                    <>
                      <span className="text-muted-foreground">Blow-up Ratio</span>
                      <span
                        className="font-mono font-semibold"
                        style={{ color: blowUpColor(task.blowUpRatio) }}
                        data-mono
                      >
                        {task.blowUpRatio.toFixed(2)}x
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
  );
}
