import { test } from "@playwright/test";

test("tasks page screenshot", async ({ page }) => {
  await page.goto("/tasks");
  await page.waitForSelector('[data-testid="tasks-gantt"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "e2e/screenshots/tasks.png", fullPage: true });
});
