import { test, expect, Route } from "@playwright/test";
import path from "path";
import fs from "fs";

// ── Screenshot directory ──────────────────────────────────

const SCREENSHOT_DIR = "e2e/screenshots/adversarial";

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

// ── GraphQL intercept helper ──────────────────────────────

function interceptGraphQL(mockData: Record<string, unknown>) {
  return async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: mockData }),
    });
  };
}

// ── Helpers: session & task factories ─────────────────────

function makeSession(overrides: Record<string, unknown> = {}) {
  const id = overrides.sessionId ?? crypto.randomUUID();
  return {
    sessionId: id,
    developer: null,
    sprint: null,
    taskNum: null,
    taskTitle: null,
    skillName: null,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMinutes: 30,
    totalInputTokens: 5000,
    totalOutputTokens: 3000,
    toolCallCount: 12,
    messageCount: 8,
    model: "claude-opus-4-20250514",
    subagents: [],
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    sprint: "sprint-1",
    taskNum: 1,
    title: "Test task",
    spec: null,
    status: "pending",
    blockedReason: null,
    type: "feature",
    owner: null,
    complexity: "M",
    startedAt: null,
    completedAt: null,
    estimatedMinutes: 60,
    actualMinutes: null,
    blowUpRatio: null,
    dependencies: [],
    dependents: [],
    ...overrides,
  };
}

// ── STREAMS SCENARIOS ─────────────────────────────────────

test.describe("Streams adversarial", () => {
  test("S1: 100 concurrent sessions across 5 developers", async ({ page }) => {
    const developers = ["alice", "bob", "charlie", "diana", "eve"];
    const baseTime = new Date("2025-01-15T09:00:00Z").getTime();
    const sessions = Array.from({ length: 100 }, (_, i) => {
      const dev = developers[i % 5];
      const offsetMs = i * 10 * 60 * 1000; // stagger by 10min each
      const start = new Date(baseTime + offsetMs);
      const end = new Date(baseTime + offsetMs + 45 * 60 * 1000); // 45min each
      return makeSession({
        sessionId: `s-${i}`,
        developer: dev,
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        durationMinutes: 45,
        taskTitle: `Task ${i}`,
      });
    });

    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: sessions }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify no horizontal overflow crash — page renders
    await expect(page.locator("h1")).toContainText("Streams");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S1-100-concurrent.png`, fullPage: true });
  });

  test("S2: 5 sessions, 1 developer", async ({ page }) => {
    const baseTime = new Date("2025-01-15T09:00:00Z").getTime();
    const sessions = Array.from({ length: 5 }, (_, i) => {
      const start = new Date(baseTime + i * 60 * 60 * 1000);
      const end = new Date(baseTime + i * 60 * 60 * 1000 + 30 * 60 * 1000);
      return makeSession({
        sessionId: `solo-${i}`,
        developer: "alice",
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        durationMinutes: 30,
        taskTitle: `Solo task ${i}`,
      });
    });

    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: sessions }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Streams");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S2-single-developer.png`, fullPage: true });
  });

  test("S3: 0 sessions — empty state", async ({ page }) => {
    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: [] }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("text=No session data")).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S3-empty.png`, fullPage: true });
  });

  test("S4: all active (no endedAt)", async ({ page }) => {
    const baseTime = new Date("2025-01-15T09:00:00Z").getTime();
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession({
        sessionId: `active-${i}`,
        developer: `dev-${i % 3}`,
        startedAt: new Date(baseTime + i * 20 * 60 * 1000).toISOString(),
        endedAt: null,
        durationMinutes: null,
        taskTitle: `Active task ${i}`,
      })
    );

    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: sessions }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // All should be pulsing (active)
    const pulsingBars = page.locator(".streams-pulse");
    await expect(pulsingBars.first()).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S4-all-active.png`, fullPage: true });
  });

  test("S5: huge time span (30 days)", async ({ page }) => {
    const baseTime = new Date("2025-01-01T09:00:00Z").getTime();
    const sessions = Array.from({ length: 10 }, (_, i) => {
      const start = new Date(baseTime + i * 3 * 24 * 60 * 60 * 1000); // every 3 days
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2h each
      return makeSession({
        sessionId: `span-${i}`,
        developer: "alice",
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        durationMinutes: 120,
        taskTitle: `Day ${i * 3} task`,
      });
    });

    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: sessions }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Streams");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S5-huge-span.png`, fullPage: true });
  });

  test("S6: all same timestamp", async ({ page }) => {
    const sameTime = "2025-01-15T12:00:00Z";
    const sameEnd = "2025-01-15T12:30:00Z";
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({
        sessionId: `same-${i}`,
        developer: "alice",
        startedAt: sameTime,
        endedAt: sameEnd,
        durationMinutes: 30,
        taskTitle: `Identical ${i}`,
      })
    );

    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: sessions }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Streams");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S6-same-timestamp.png`, fullPage: true });
  });

  test("S7: mixed models — badges visible", async ({ page }) => {
    const baseTime = new Date("2025-01-15T09:00:00Z").getTime();
    const models = [
      "claude-opus-4-20250514",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
    ];
    const sessions = Array.from({ length: 9 }, (_, i) => {
      const start = new Date(baseTime + i * 30 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return makeSession({
        sessionId: `model-${i}`,
        developer: `dev-${i % 3}`,
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        durationMinutes: 60,
        model: models[i % 3],
        taskTitle: `Model test ${i}`,
      });
    });

    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: sessions }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Streams");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S7-mixed-models.png`, fullPage: true });
  });

  test("S8: streams with sprint/task and skill badges", async ({ page }) => {
    const baseTime = new Date("2025-01-15T09:00:00Z").getTime();
    const sessions = Array.from({ length: 6 }, (_, i) => {
      const start = new Date(baseTime + i * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // wide bars (3h each)
      return makeSession({
        sessionId: `badge-${i}`,
        developer: "alice",
        sprint: `sprint-${Math.floor(i / 3) + 1}`,
        taskNum: (i % 3) + 1,
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        durationMinutes: 180,
        taskTitle: `Badge task ${i}`,
        skillName: i % 2 === 0 ? "tdd-agent" : null,
      });
    });

    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: sessions }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Streams");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S8-sprint-skill-badges.png`, fullPage: true });
  });

  test("S9: active sessions show count in dev label", async ({ page }) => {
    const baseTime = new Date("2025-01-15T09:00:00Z").getTime();
    const sessions = [
      makeSession({
        sessionId: "active-1",
        developer: "alice",
        startedAt: new Date(baseTime).toISOString(),
        endedAt: null,
        durationMinutes: null,
        taskTitle: "Active work 1",
      }),
      makeSession({
        sessionId: "active-2",
        developer: "alice",
        startedAt: new Date(baseTime + 10 * 60 * 1000).toISOString(),
        endedAt: null,
        durationMinutes: null,
        taskTitle: "Active work 2",
      }),
      makeSession({
        sessionId: "done-1",
        developer: "bob",
        startedAt: new Date(baseTime).toISOString(),
        endedAt: new Date(baseTime + 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        taskTitle: "Done work",
      }),
    ];

    await page.route("**/graphql", interceptGraphQL({ sessionTimeline: sessions }));
    await page.goto("/streams");
    await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Alice should show "(2 active)"
    await expect(page.locator("text=(2 active)")).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/S9-active-count.png`, fullPage: true });
  });
});

// ── TASKS SCENARIOS ───────────────────────────────────────

test.describe("Tasks adversarial", () => {
  test("T1: 100 tasks across 5 sprints", async ({ page }) => {
    const statuses = ["green", "red", "pending", "blocked"];
    const tasks = Array.from({ length: 100 }, (_, i) => {
      const sprintNum = Math.floor(i / 20) + 1;
      const status = statuses[i % 4];
      const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
      const hasTiming = status === "green" || status === "red";
      return makeTask({
        sprint: `sprint-${sprintNum}`,
        taskNum: (i % 20) + 1,
        title: `Task ${i + 1}`,
        status,
        startedAt: hasTiming
          ? new Date(baseTime + i * 30 * 60 * 1000).toISOString()
          : null,
        completedAt:
          status === "green"
            ? new Date(baseTime + i * 30 * 60 * 1000 + 45 * 60 * 1000).toISOString()
            : null,
        owner: i % 3 === 0 ? { name: "alice" } : null,
        blowUpRatio: status === "green" ? 1.2 + (i % 5) * 0.3 : null,
        spec: `0${sprintNum}-spec.md`,
      });
    });

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Tasks");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T1-100-tasks.png`, fullPage: true });
  });

  test("T2: all pending (no timing)", async ({ page }) => {
    const tasks = Array.from({ length: 20 }, (_, i) =>
      makeTask({
        sprint: "sprint-1",
        taskNum: i + 1,
        title: `Pending task ${i + 1}`,
        status: "pending",
      })
    );

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // "Pending" labels should be visible
    const pendingLabels = page.locator("text=Pending").first();
    await expect(pendingLabels).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T2-all-pending.png`, fullPage: true });
  });

  test("T3: all green (complete) with timing + blow-up", async ({ page }) => {
    const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
    const tasks = Array.from({ length: 20 }, (_, i) =>
      makeTask({
        sprint: "sprint-1",
        taskNum: i + 1,
        title: `Done task ${i + 1}`,
        status: "green",
        startedAt: new Date(baseTime + i * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(
          baseTime + i * 60 * 60 * 1000 + 45 * 60 * 1000
        ).toISOString(),
        owner: { name: "alice" },
        blowUpRatio: 0.8 + i * 0.1,
        actualMinutes: 45,
      })
    );

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Tasks");
    // Contributors table should show alice
    await expect(page.locator('[data-testid="contributors-table"]')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T3-all-green.png`, fullPage: true });
  });

  test("T4: all blocked with reasons", async ({ page }) => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({
        sprint: "sprint-1",
        taskNum: i + 1,
        title: `Blocked task ${i + 1}`,
        status: "blocked",
        blockedReason: "Waiting on external dependency",
        startedAt: new Date("2025-01-10T09:00:00Z").toISOString(),
      })
    );

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Tasks");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T4-all-blocked.png`, fullPage: true });
  });

  test("T5: deep dependency chain A→B→C→D→E", async ({ page }) => {
    const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
    const tasks = ["A", "B", "C", "D", "E"].map((name, i) =>
      makeTask({
        sprint: "sprint-1",
        taskNum: i + 1,
        title: `Chain ${name}`,
        status: "green",
        startedAt: new Date(baseTime + i * 2 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(
          baseTime + i * 2 * 60 * 60 * 1000 + 90 * 60 * 1000
        ).toISOString(),
        blowUpRatio: 1.0 + i * 0.2,
        dependencies:
          i > 0
            ? [{ sprint: "sprint-1", taskNum: i }]
            : [],
        dependents:
          i < 4
            ? [{ sprint: "sprint-1", taskNum: i + 2 }]
            : [],
      })
    );

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Tasks");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T5-deep-deps.png`, fullPage: true });
  });

  test("T6: tasks with 0-minute duration", async ({ page }) => {
    const baseTime = new Date("2025-01-10T12:00:00Z").toISOString();
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        sprint: "sprint-1",
        taskNum: i + 1,
        title: `Instant task ${i + 1}`,
        status: "green",
        startedAt: baseTime,
        completedAt: baseTime, // same instant
      })
    );

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Tasks");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T6-zero-duration.png`, fullPage: true });
  });

  test("T7: single task, single sprint", async ({ page }) => {
    const tasks = [
      makeTask({
        sprint: "sprint-1",
        taskNum: 1,
        title: "The only task",
        status: "red",
        startedAt: new Date("2025-01-15T10:00:00Z").toISOString(),
        owner: { name: "alice" },
      }),
    ];

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toContainText("Tasks");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T7-single-task.png`, fullPage: true });
  });

  test("T8: task detail Sheet opens on row click", async ({ page }) => {
    const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
    const tasks = [
      makeTask({
        sprint: "sprint-1",
        taskNum: 1,
        title: "Parent task",
        status: "green",
        startedAt: new Date(baseTime).toISOString(),
        completedAt: new Date(baseTime + 2 * 60 * 60 * 1000).toISOString(),
        owner: { name: "alice" },
        estimatedMinutes: 60,
        actualMinutes: 120,
        blowUpRatio: 2.0,
        dependents: [{ sprint: "sprint-1", taskNum: 2 }],
      }),
      makeTask({
        sprint: "sprint-1",
        taskNum: 2,
        title: "Child task",
        status: "blocked",
        blockedReason: "Waiting for parent review",
        startedAt: new Date(baseTime + 2 * 60 * 60 * 1000).toISOString(),
        owner: { name: "bob" },
        dependencies: [{ sprint: "sprint-1", taskNum: 1 }],
      }),
    ];

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Click the first task row
    await page.click('[data-testid="task-row-sprint-1-1"]');
    await page.waitForTimeout(300);

    // Sheet should be visible
    const sheet = page.locator('[data-testid="task-detail-sheet"]');
    await expect(sheet).toBeVisible();

    // Should show task details
    await expect(sheet.locator("text=Parent task")).toBeVisible();
    await expect(sheet.locator("text=alice")).toBeVisible();

    // Should show "Blocks" section with child task
    await expect(sheet.locator("text=Blocks")).toBeVisible();
    await expect(sheet.locator("text=Child task")).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/T8-sheet-open.png`, fullPage: true });
  });

  test("T9: Sheet dependency navigation", async ({ page }) => {
    const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
    const tasks = [
      makeTask({
        sprint: "sprint-1",
        taskNum: 1,
        title: "First task",
        status: "green",
        startedAt: new Date(baseTime).toISOString(),
        completedAt: new Date(baseTime + 60 * 60 * 1000).toISOString(),
        dependents: [{ sprint: "sprint-1", taskNum: 2 }],
      }),
      makeTask({
        sprint: "sprint-1",
        taskNum: 2,
        title: "Second task",
        status: "red",
        startedAt: new Date(baseTime + 60 * 60 * 1000).toISOString(),
        dependencies: [{ sprint: "sprint-1", taskNum: 1 }],
        dependents: [{ sprint: "sprint-1", taskNum: 3 }],
      }),
      makeTask({
        sprint: "sprint-1",
        taskNum: 3,
        title: "Third task",
        status: "pending",
        dependencies: [{ sprint: "sprint-1", taskNum: 2 }],
      }),
    ];

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Open second task
    await page.click('[data-testid="task-row-sprint-1-2"]');
    await page.waitForTimeout(300);

    const sheet = page.locator('[data-testid="task-detail-sheet"]');
    await expect(sheet.locator("text=Second task")).toBeVisible();

    // Click dependency link to navigate to first task
    await sheet.locator("text=First task").click();
    await page.waitForTimeout(300);

    // Sheet should now show first task
    await expect(sheet.locator("text=First task").first()).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/T9-sheet-navigate.png`, fullPage: true });
  });

  test("T10: zoom controls switch views", async ({ page }) => {
    const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({
        sprint: "sprint-1",
        taskNum: i + 1,
        title: `Zoom task ${i + 1}`,
        status: i < 5 ? "green" : "red",
        startedAt: new Date(baseTime + i * 4 * 60 * 60 * 1000).toISOString(),
        completedAt:
          i < 5
            ? new Date(baseTime + i * 4 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString()
            : null,
        blowUpRatio: i < 5 ? 1.0 + i * 0.2 : null,
      })
    );

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Test each zoom level
    for (const zoom of ["day", "3d", "week", "all"]) {
      await page.click(`[data-testid="zoom-${zoom}"]`);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/T10-zoom-${zoom}.png`,
        fullPage: true,
      });
    }

    // Zoom controls should be visible
    await expect(page.locator('[data-testid="zoom-controls"]')).toBeVisible();
  });

  test("T11: filters narrow tasks", async ({ page }) => {
    const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
    const owners = ["alice", "bob"];
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({
        sprint: i < 6 ? "sprint-1" : "sprint-2",
        taskNum: (i % 6) + 1,
        title: `Filter task ${i + 1}`,
        status: ["green", "red", "blocked", "pending"][i % 4],
        startedAt:
          i % 4 < 3
            ? new Date(baseTime + i * 60 * 60 * 1000).toISOString()
            : null,
        completedAt:
          i % 4 === 0
            ? new Date(baseTime + i * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString()
            : null,
        owner: { name: owners[i % 2] },
        spec: i < 6 ? "01-spec.md" : "02-spec.md",
      })
    );

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Toggle off "pending" status
    await page.click('[data-testid="filter-pending"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T11-filter-no-pending.png`, fullPage: true });

    // Select sprint-1 only
    await page.selectOption('[data-testid="filter-sprint"]', "sprint-1");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T11-filter-sprint1.png`, fullPage: true });

    // Select alice only
    await page.selectOption('[data-testid="filter-owner"]', "alice");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T11-filter-alice.png`, fullPage: true });
  });

  test("T12: sprint collapse/expand", async ({ page }) => {
    const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({
        sprint: i < 6 ? "sprint-1" : "sprint-2",
        taskNum: (i % 6) + 1,
        title: `Collapse task ${i + 1}`,
        status: "green",
        startedAt: new Date(baseTime + i * 30 * 60 * 1000).toISOString(),
        completedAt: new Date(baseTime + i * 30 * 60 * 1000 + 20 * 60 * 1000).toISOString(),
        spec: i < 6 ? "01-spec.md" : "02-spec.md",
      })
    );

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Both sprints should be expanded
    await expect(page.locator('[data-testid="sprint-header-sprint-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="sprint-header-sprint-2"]')).toBeVisible();

    // Collapse sprint-1
    await page.click('[data-testid="sprint-header-sprint-1"]');
    await page.waitForTimeout(200);

    // Sprint-1 task rows should be hidden
    await expect(page.locator('[data-testid="task-row-sprint-1-1"]')).not.toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/T12-sprint-collapsed.png`, fullPage: true });

    // Expand sprint-1 again
    await page.click('[data-testid="sprint-header-sprint-1"]');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="task-row-sprint-1-1"]')).toBeVisible();
  });

  test("T13: contributors table with blow-up data", async ({ page }) => {
    const baseTime = new Date("2025-01-10T09:00:00Z").getTime();
    const tasks = [
      makeTask({
        sprint: "sprint-1",
        taskNum: 1,
        title: "Alice task 1",
        status: "green",
        owner: { name: "alice" },
        startedAt: new Date(baseTime).toISOString(),
        completedAt: new Date(baseTime + 60 * 60 * 1000).toISOString(),
        blowUpRatio: 1.1,
      }),
      makeTask({
        sprint: "sprint-1",
        taskNum: 2,
        title: "Alice task 2",
        status: "red",
        owner: { name: "alice" },
        startedAt: new Date(baseTime + 2 * 60 * 60 * 1000).toISOString(),
      }),
      makeTask({
        sprint: "sprint-1",
        taskNum: 3,
        title: "Bob task 1",
        status: "green",
        owner: { name: "bob" },
        startedAt: new Date(baseTime + 60 * 60 * 1000).toISOString(),
        completedAt: new Date(baseTime + 3 * 60 * 60 * 1000).toISOString(),
        blowUpRatio: 2.3,
      }),
      makeTask({
        sprint: "sprint-1",
        taskNum: 4,
        title: "Bob task 2",
        status: "blocked",
        blockedReason: "Waiting on API",
        owner: { name: "bob" },
        startedAt: new Date(baseTime + 3 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    await page.route("**/graphql", interceptGraphQL({ tasks }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Contributors table should be visible
    const table = page.locator('[data-testid="contributors-table"]');
    await expect(table).toBeVisible();

    // Should show both contributors
    await expect(table.locator("text=alice")).toBeVisible();
    await expect(table.locator("text=bob")).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/T13-contributors.png`, fullPage: true });
  });

  test("T14: 0 tasks — empty state with filters", async ({ page }) => {
    await page.route("**/graphql", interceptGraphQL({ tasks: [] }));
    await page.goto("/tasks");
    await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page.locator("text=No tasks match filters")).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/T14-empty.png`, fullPage: true });
  });
});
