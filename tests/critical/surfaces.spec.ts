import { expect, test } from "@playwright/test";

const ROUTES: Array<{ path: string; expected: RegExp }> = [
  { path: "/", expected: /SPY Prophet|Discipline before conviction/i },
  { path: "/dashboard", expected: /Current command/i },
  { path: "/map", expected: /See the levels that matter now/i },
  { path: "/replay?date=2026-04-29", expected: /Replay the session bar by bar/i },
  { path: "/log", expected: /Review every signal from the session/i },
  { path: "/learn", expected: /Learn how to read each instruction/i },
  { path: "/settings", expected: /Check every connection before the market opens/i },
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
