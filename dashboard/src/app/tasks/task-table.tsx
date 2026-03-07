// Table view for the tasks page: sortable columns, claim/unclaim/assign buttons,
// time-in-status, blow-up ratio, and dependency chips.
"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import type { Task } from "./types";
import type { SortClause } from "@/lib/filter-dimensions";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  taskKey,
  blowUpColor,
} from "./helpers";
import {
  sortTasks,
  multiSortTasks,
  isTaskClaimable,
  type SortColumn,
  type SortDirection,
} from "./task-table-helpers";

interface TaskTableProps {
  tasks: Task[];
  taskIndex: Map<string, Task>;
  timeInStatusMap: Map<string, string>;
  allOwners: string[];
  sortByClauses?: SortClause[];
  onSelectTask: (key: string) => void;
  claimTask: (sprint: string, taskNum: number, developer: string) => void;
  unclaimTask: (sprint: string, taskNum: number) => void;
  assignTask: (sprint: string, taskNum: number, developer: string) => void;
}

const COLUMNS: { key: SortColumn; label: string; align?: "right" }[] = [
  { key: "taskNum", label: "#" },
  { key: "title", label: "Title" },
  { key: "owner", label: "Owner" },
  { key: "status", label: "Status" },
  { key: "sprint", label: "Sprint" },
  { key: "timeInStatus", label: "Time in Status", align: "right" },
  { key: "blowUp", label: "Blow-up", align: "right" },
  { key: "deps", label: "Deps" },
];

export function TaskTable({
  tasks,
  taskIndex,
  timeInStatusMap,
  allOwners,
  sortByClauses,
  onSelectTask,
  claimTask,
  unclaimTask,
  assignTask,
}: TaskTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("taskNum");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [assigningTask, setAssigningTask] = useState<string | null>(null);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Use global sort clauses if available, otherwise fall back to local column sort
  const sorted = useMemo(() => {
    if (sortByClauses && sortByClauses.length > 0) {
      return multiSortTasks(tasks, sortByClauses, timeInStatusMap);
    }
    return sortTasks(tasks, sortColumn, sortDirection, timeInStatusMap);
  }, [tasks, sortByClauses, sortColumn, sortDirection, timeInStatusMap]);

  return (
    <Card className="p-3 bg-card border-border overflow-hidden" data-testid="task-table">
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tasks match filters</p>
      ) : (
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="border-border/30 hover:bg-transparent">
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-[11px] font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none h-8 ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                  onClick={() => handleSort(col.key)}
                  data-testid={`sort-${col.key}`}
                >
                  {col.label}
                  {sortColumn === col.key && (
                    <span className="ml-1 text-[10px]">
                      {sortDirection === "asc" ? "\u25B2" : "\u25BC"}
                    </span>
                  )}
                </TableHead>
              ))}
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground h-8 w-[120px]">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((t) => {
              const key = taskKey(t.sprint, t.taskNum);
              const tis = timeInStatusMap.get(key) ?? "\u2014";
              const claimable = isTaskClaimable(t, taskIndex);
              const isOwned = t.owner !== null;
              const showAssignDropdown = assigningTask === key;

              return (
                <TableRow
                  key={key}
                  className="border-border/10 hover:bg-[#2F343C] transition-colors cursor-pointer"
                  onClick={() => onSelectTask(key)}
                  data-testid={`table-row-${t.sprint}-${t.taskNum}`}
                >
                  {/* Task # */}
                  <TableCell className="font-mono text-muted-foreground py-1.5" data-mono>
                    #{t.taskNum}
                  </TableCell>

                  {/* Title */}
                  <TableCell className="text-foreground/80 py-1.5 max-w-[280px] truncate">
                    {t.title}
                  </TableCell>

                  {/* Owner */}
                  <TableCell className="text-muted-foreground py-1.5">
                    {t.owner?.name ?? "\u2014"}
                  </TableCell>

                  {/* Status */}
                  <TableCell className="py-1.5">
                    <span
                      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[11px]"
                      style={{
                        backgroundColor: `${STATUS_COLORS[t.status]}20`,
                        color: STATUS_COLORS[t.status],
                        border: `1px solid ${STATUS_COLORS[t.status]}40`,
                      }}
                    >
                      <span
                        className="rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          backgroundColor: STATUS_COLORS[t.status],
                        }}
                      />
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </TableCell>

                  {/* Sprint */}
                  <TableCell className="text-muted-foreground py-1.5 font-mono text-[11px]" data-mono>
                    {t.sprint}
                  </TableCell>

                  {/* Time in Status */}
                  <TableCell className="text-right font-mono py-1.5" data-mono>
                    <span
                      style={{
                        color:
                          tis !== "\u2014" && t.status === "red"
                            ? "#EC9A3C"
                            : tis !== "\u2014" && t.status === "blocked"
                            ? "#CD4246"
                            : "#738694",
                      }}
                    >
                      {tis}
                    </span>
                  </TableCell>

                  {/* Blow-up */}
                  <TableCell className="text-right font-mono py-1.5" data-mono>
                    {t.blowUpRatio != null ? (
                      <span style={{ color: blowUpColor(t.blowUpRatio) }}>
                        {t.blowUpRatio.toFixed(1)}x
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{"\u2014"}</span>
                    )}
                  </TableCell>

                  {/* Dependencies */}
                  <TableCell className="py-1.5">
                    {t.dependencies.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {t.dependencies.map((dep) => {
                          const depTask = taskIndex.get(taskKey(dep.sprint, dep.taskNum));
                          const isBlocking = depTask ? depTask.status !== "green" : true;
                          return (
                            <span
                              key={`${dep.sprint}-${dep.taskNum}`}
                              className="inline-flex items-center px-1 py-0.5 rounded-sm text-[10px] font-mono"
                              style={{
                                backgroundColor: isBlocking ? "#CD424620" : "#23855120",
                                color: isBlocking ? "#CD4246" : "#238551",
                                border: `1px solid ${isBlocking ? "#CD424640" : "#23855140"}`,
                              }}
                              data-mono
                            >
                              #{dep.taskNum}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{"\u2014"}</span>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {claimable && (
                        <button
                          className="px-2 py-0.5 text-[11px] rounded-sm border transition-colors"
                          style={{
                            borderColor: "#2D72D2",
                            backgroundColor: "#2D72D220",
                            color: "#2D72D2",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const dev = allOwners[0] ?? "unknown";
                            claimTask(t.sprint, t.taskNum, dev);
                          }}
                          data-testid={`claim-${t.sprint}-${t.taskNum}`}
                        >
                          Claim
                        </button>
                      )}
                      {isOwned && t.status !== "green" && (
                        <button
                          className="px-2 py-0.5 text-[11px] rounded-sm border transition-colors"
                          style={{
                            borderColor: "#394048",
                            backgroundColor: "transparent",
                            color: "#738694",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            unclaimTask(t.sprint, t.taskNum);
                          }}
                          data-testid={`unclaim-${t.sprint}-${t.taskNum}`}
                        >
                          Unclaim
                        </button>
                      )}
                      {!isOwned && !claimable && t.status === "pending" && (
                        <span className="text-[10px] text-muted-foreground/50 italic">
                          blocked
                        </span>
                      )}
                      <button
                        className="px-1.5 py-0.5 text-[11px] rounded-sm border transition-colors"
                        style={{
                          borderColor: "#394048",
                          backgroundColor: showAssignDropdown ? "#2D72D220" : "transparent",
                          color: "#738694",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssigningTask(showAssignDropdown ? null : key);
                        }}
                        data-testid={`assign-toggle-${t.sprint}-${t.taskNum}`}
                        title="Assign to developer"
                      >
                        {"\u2192"}
                      </button>
                      {showAssignDropdown && (
                        <select
                          className="text-[11px] bg-[#252A31] border border-border rounded-sm px-1 py-0.5 text-foreground"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              assignTask(t.sprint, t.taskNum, e.target.value);
                              setAssigningTask(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`assign-select-${t.sprint}-${t.taskNum}`}
                        >
                          <option value="">Assign...</option>
                          {allOwners.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
