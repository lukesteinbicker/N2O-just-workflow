// Pure helper functions for the task table view (sorting, claimability).
// Extracted from the component for testability.

import type { Task } from "./types";
import { taskKey } from "./helpers";

export type SortColumn =
  | "taskNum"
  | "title"
  | "owner"
  | "status"
  | "sprint"
  | "timeInStatus"
  | "blowUp"
  | "deps";

export type SortDirection = "asc" | "desc";

/**
 * Parse a time-in-status string like "3.0h", "15m", "2.1d" into minutes
 * for numeric comparison. Returns Infinity for em-dash / unknown values
 * so they sort last.
 */
function parseTimeInStatus(tis: string): number {
  if (tis === "\u2014" || !tis) return Infinity;
  const match = tis.match(/^([\d.]+)(m|h|d)$/);
  if (!match) return Infinity;
  const value = parseFloat(match[1]);
  switch (match[2]) {
    case "m":
      return value;
    case "h":
      return value * 60;
    case "d":
      return value * 1440;
    default:
      return Infinity;
  }
}

/**
 * Sort tasks by a given column and direction.
 * Returns a new sorted array; does not mutate the input.
 * Null values always sort last regardless of direction.
 */
export function sortTasks(
  tasks: Task[],
  column: SortColumn,
  direction: SortDirection,
  timeInStatusMap: Map<string, string>
): Task[] {
  const sorted = [...tasks];
  const dir = direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (column) {
      case "taskNum":
        return (a.taskNum - b.taskNum) * dir;

      case "title":
        return a.title.localeCompare(b.title) * dir;

      case "owner": {
        const aName = a.owner?.name ?? null;
        const bName = b.owner?.name ?? null;
        if (aName === null && bName === null) return 0;
        if (aName === null) return 1; // null sorts last
        if (bName === null) return -1;
        return aName.localeCompare(bName) * dir;
      }

      case "status":
        return a.status.localeCompare(b.status) * dir;

      case "sprint":
        return a.sprint.localeCompare(b.sprint) * dir;

      case "timeInStatus": {
        const aKey = taskKey(a.sprint, a.taskNum);
        const bKey = taskKey(b.sprint, b.taskNum);
        const aVal = parseTimeInStatus(timeInStatusMap.get(aKey) ?? "\u2014");
        const bVal = parseTimeInStatus(timeInStatusMap.get(bKey) ?? "\u2014");
        if (aVal === Infinity && bVal === Infinity) return 0;
        if (aVal === Infinity) return 1;
        if (bVal === Infinity) return -1;
        return (aVal - bVal) * dir;
      }

      case "blowUp": {
        const aRatio = a.blowUpRatio;
        const bRatio = b.blowUpRatio;
        if (aRatio === null && bRatio === null) return 0;
        if (aRatio === null) return 1;
        if (bRatio === null) return -1;
        return (aRatio - bRatio) * dir;
      }

      case "deps":
        return (a.dependencies.length - b.dependencies.length) * dir;

      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * Determine if a task is claimable.
 * A task is claimable when it is "pending" and all its dependencies
 * are "green" (completed). Missing dependencies are treated as unfinished.
 */
export function isTaskClaimable(task: Task, taskIndex: Map<string, Task>): boolean {
  if (task.status !== "pending") return false;

  for (const dep of task.dependencies) {
    const depTask = taskIndex.get(taskKey(dep.sprint, dep.taskNum));
    if (!depTask || depTask.status !== "green") return false;
  }

  return true;
}
