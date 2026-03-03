import { test } from "@playwright/test";

test("streams page screenshot", async ({ page }) => {
  await page.goto("/streams");
  await page.waitForSelector('[data-testid="streams-timeline"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "e2e/screenshots/streams.png", fullPage: true });
});
