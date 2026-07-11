import { expect, test } from "@playwright/test";

const ROUTES: Array<{ path: string; expected: RegExp }> = [
  { path: "/", expected: /SPY Prophet|Discipline before conviction/i },
  { path: "/dashboard", expected: /Current command/i },
  { path: "/map", expected: /Structure without the chart clutter/i },
  { path: "/replay?date=2026-04-29", expected: /Slow the market down/i },
  { path: "/log", expected: /decision trail/i },
  { path: "/learn", expected: /Learn the language/i },
  { path: "/settings", expected: /Connections you can trust/i },
];

test.describe("critical production surfaces", () => {
  for (const route of ROUTES) {
    test(`${route.path} renders without the Next error surface`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });

      await expect(page.locator("body")).toContainText(route.expected);
      await expect(page.locator("body")).not.toContainText(
        /Application error|Unhandled Runtime Error|Internal Server Error|Hydration failed/i,
      );
    });
  }
});
