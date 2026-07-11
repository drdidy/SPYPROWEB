import { expect, test } from "@playwright/test";

test("Prophet command center renders", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Current command").first()).toBeVisible();
  await expect(page.getByText("Execution ticket").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Open map/i })).toBeVisible();
});
