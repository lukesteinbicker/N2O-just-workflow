import { test, expect } from "@playwright/test";

test("root redirects to /streams", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/streams/);
  await expect(page.locator("h1")).toContainText("Streams");
  await page.screenshot({ path: "e2e/screenshots/observatory.png", fullPage: true });
});
