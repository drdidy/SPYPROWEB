import { expect, test } from "@playwright/test";

test("Decision Slate renders", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Decision Slate").first()).toBeVisible();
});
