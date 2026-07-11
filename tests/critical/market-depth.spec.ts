import { expect, test } from "@playwright/test";

test("cinematic market journey changes scenes without page scrolling", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /A chart shows what already happened/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Pause cinematic sequence/i })).toBeVisible();

  await page.getByRole("button", { name: /Show scene 2/i }).click();
  await expect(page.getByRole("heading", { name: /Buy and sell orders move price/i })).toBeVisible();
});
