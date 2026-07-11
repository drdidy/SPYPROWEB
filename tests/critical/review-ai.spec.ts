import { expect, test } from "@playwright/test";

test("Review AI renders an evidence-bound session plan", async ({ page }) => {
  await page.goto("/agents", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /Review the trade/i })).toBeVisible();
  await expect(page.getByText(/never changes the trading rules automatically/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Run review/i })).toBeVisible();
  await expect(page.getByText(/Recommendations remain advisory/i)).toBeVisible();
});
