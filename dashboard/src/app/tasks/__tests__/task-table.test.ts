import { describe, it, expect } from "vitest";
import type { Task } from "../types";

// ── Import the functions we will implement ────────────────────
import { sortTasks, isTaskClaimable } from "../task-table-helpers";

// ── Helpers ───────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> & { sprint: string; taskNum: number }): Task {
  return {
    title: `Task ${overrides.taskNum}`,
    spec: null,
    status: "pending",
    blockedReason: null,
    type: "feature",
    owner: null,
    complexity: null,
    startedAt: null,
    completedAt: null,
    estimatedMinutes: null,
    actualMinutes: null,
    blowUpRatio: null,
    dependencies: [],
    dependents: [],
    ...overrides,
  };
}

// ── sortTasks ─────────────────────────────────────────────────

describe("sortTasks", () => {
  const tasks: Task[] = [
    makeTask({ sprint: "s1", taskNum: 3, title: "Charlie task", status: "red", owner: { name: "bob" }, blowUpRatio: 2.0 }),
    makeTask({ sprint: "s1", taskNum: 1, title: "Alpha task", status: "green", owner: { name: "alice" }, blowUpRatio: 1.1 }),
    makeTask({ sprint: "s1", taskNum: 2, title: "Bravo task", status: "pending", owner: null, blowUpRatio: null }),
  ];

  const timeInStatusMap = new Map<string, string>([
    ["s1::3", "2.5h"],
    ["s1::1", "\u2014"],
    ["s1::2", "\u2014"],
  ]);

  it("sorts by taskNum ascending", () => {
    const sorted = sortTasks(tasks, "taskNum", "asc", timeInStatusMap);
    expect(sorted.map((t) => t.taskNum)).toEqual([1, 2, 3]);
  });

  it("sorts by taskNum descending", () => {
    const sorted = sortTasks(tasks, "taskNum", "desc", timeInStatusMap);
    expect(sorted.map((t) => t.taskNum)).toEqual([3, 2, 1]);
  });

  it("sorts by title ascending", () => {
    const sorted = sortTasks(tasks, "title", "asc", timeInStatusMap);
    expect(sorted.map((t) => t.title)).toEqual(["Alpha task", "Bravo task", "Charlie task"]);
  });

  it("sorts by title descending", () => {
    const sorted = sortTasks(tasks, "title", "desc", timeInStatusMap);
    expect(sorted.map((t) => t.title)).toEqual(["Charlie task", "Bravo task", "Alpha task"]);
  });

  it("sorts by owner ascending (null owners sort last)", () => {
    const sorted = sortTasks(tasks, "owner", "asc", timeInStatusMap);
    expect(sorted.map((t) => t.owner?.name ?? null)).toEqual(["alice", "bob", null]);
  });

  it("sorts by owner descending (null owners sort last)", () => {
    const sorted = sortTasks(tasks, "owner", "desc", timeInStatusMap);
    expect(sorted.map((t) => t.owner?.name ?? null)).toEqual(["bob", "alice", null]);
  });

  it("sorts by status ascending", () => {
    const sorted = sortTasks(tasks, "status", "asc", timeInStatusMap);
    // Status order: blocked, green, pending, red (alphabetical)
    expect(sorted.map((t) => t.status)).toEqual(["green", "pending", "red"]);
  });

  it("sorts by status descending", () => {
    const sorted = sortTasks(tasks, "status", "desc", timeInStatusMap);
    expect(sorted.map((t) => t.status)).toEqual(["red", "pending", "green"]);
  });

  it("sorts by blowUp ascending (nulls sort last)", () => {
    const sorted = sortTasks(tasks, "blowUp", "asc", timeInStatusMap);
    expect(sorted.map((t) => t.blowUpRatio)).toEqual([1.1, 2.0, null]);
  });

  it("sorts by blowUp descending (nulls sort last)", () => {
    const sorted = sortTasks(tasks, "blowUp", "desc", timeInStatusMap);
    expect(sorted.map((t) => t.blowUpRatio)).toEqual([2.0, 1.1, null]);
  });

  it("sorts by sprint ascending", () => {
    const multiSprint = [
      makeTask({ sprint: "beta", taskNum: 1 }),
      makeTask({ sprint: "alpha", taskNum: 1 }),
      makeTask({ sprint: "gamma", taskNum: 1 }),
    ];
    const sorted = sortTasks(multiSprint, "sprint", "asc", new Map());
    expect(sorted.map((t) => t.sprint)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("does not mutate original array", () => {
    const original = [...tasks];
    sortTasks(tasks, "taskNum", "asc", timeInStatusMap);
    expect(tasks.map((t) => t.taskNum)).toEqual(original.map((t) => t.taskNum));
  });

  it("returns empty array for empty input", () => {
    const sorted = sortTasks([], "taskNum", "asc", new Map());
    expect(sorted).toEqual([]);
  });

  it("sorts by timeInStatus ascending (em-dash values sort last)", () => {
    const tisTasks = [
      makeTask({ sprint: "s1", taskNum: 1, status: "red", startedAt: "2025-03-01T09:00:00Z" }),
      makeTask({ sprint: "s1", taskNum: 2, status: "red", startedAt: "2025-03-01T06:00:00Z" }),
      makeTask({ sprint: "s1", taskNum: 3, status: "pending" }),
    ];
    const tisMap = new Map<string, string>([
      ["s1::1", "3.0h"],
      ["s1::2", "6.0h"],
      ["s1::3", "\u2014"],
    ]);
    const sorted = sortTasks(tisTasks, "timeInStatus", "asc", tisMap);
    // 3.0h < 6.0h, dash last
    expect(sorted.map((t) => t.taskNum)).toEqual([1, 2, 3]);
  });
});

// ── isTaskClaimable ───────────────────────────────────────────

describe("isTaskClaimable", () => {
  it("returns true for pending task with no dependencies", () => {
    const task = makeTask({ sprint: "s1", taskNum: 1, status: "pending" });
    const taskIndex = new Map<string, Task>();
    expect(isTaskClaimable(task, taskIndex)).toBe(true);
  });

  it("returns false for non-pending task", () => {
    const redTask = makeTask({ sprint: "s1", taskNum: 1, status: "red" });
    const greenTask = makeTask({ sprint: "s1", taskNum: 1, status: "green" });
    const blockedTask = makeTask({ sprint: "s1", taskNum: 1, status: "blocked" });
    const taskIndex = new Map<string, Task>();
    expect(isTaskClaimable(redTask, taskIndex)).toBe(false);
    expect(isTaskClaimable(greenTask, taskIndex)).toBe(false);
    expect(isTaskClaimable(blockedTask, taskIndex)).toBe(false);
  });

  it("returns true for pending task with all dependencies completed", () => {
    const dep1 = makeTask({ sprint: "s1", taskNum: 1, status: "green" });
    const dep2 = makeTask({ sprint: "s1", taskNum: 2, status: "green" });
    const task = makeTask({
      sprint: "s1",
      taskNum: 3,
      status: "pending",
      dependencies: [
        { sprint: "s1", taskNum: 1 },
        { sprint: "s1", taskNum: 2 },
      ],
    });
    const taskIndex = new Map<string, Task>([
      ["s1::1", dep1],
      ["s1::2", dep2],
    ]);
    expect(isTaskClaimable(task, taskIndex)).toBe(true);
  });

  it("returns false for pending task with unfinished dependency", () => {
    const dep1 = makeTask({ sprint: "s1", taskNum: 1, status: "green" });
    const dep2 = makeTask({ sprint: "s1", taskNum: 2, status: "red" });
    const task = makeTask({
      sprint: "s1",
      taskNum: 3,
      status: "pending",
      dependencies: [
        { sprint: "s1", taskNum: 1 },
        { sprint: "s1", taskNum: 2 },
      ],
    });
    const taskIndex = new Map<string, Task>([
      ["s1::1", dep1],
      ["s1::2", dep2],
    ]);
    expect(isTaskClaimable(task, taskIndex)).toBe(false);
  });

  it("returns false for pending task when dependency is missing from index", () => {
    const task = makeTask({
      sprint: "s1",
      taskNum: 2,
      status: "pending",
      dependencies: [{ sprint: "s1", taskNum: 1 }],
    });
    const taskIndex = new Map<string, Task>();
    // Missing dependency = treat as unfinished (conservative)
    expect(isTaskClaimable(task, taskIndex)).toBe(false);
  });

  it("returns false for pending task with blocked dependency", () => {
    const dep = makeTask({ sprint: "s1", taskNum: 1, status: "blocked" });
    const task = makeTask({
      sprint: "s1",
      taskNum: 2,
      status: "pending",
      dependencies: [{ sprint: "s1", taskNum: 1 }],
    });
    const taskIndex = new Map<string, Task>([["s1::1", dep]]);
    expect(isTaskClaimable(task, taskIndex)).toBe(false);
  });

  it("returns false for pending task with pending dependency", () => {
    const dep = makeTask({ sprint: "s1", taskNum: 1, status: "pending" });
    const task = makeTask({
      sprint: "s1",
      taskNum: 2,
      status: "pending",
      dependencies: [{ sprint: "s1", taskNum: 1 }],
    });
    const taskIndex = new Map<string, Task>([["s1::1", dep]]);
    expect(isTaskClaimable(task, taskIndex)).toBe(false);
  });
});
