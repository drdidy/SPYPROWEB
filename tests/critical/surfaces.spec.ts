import { expect, test } from "@playwright/test";

const ROUTES: Array<{ path: string; expected: RegExp }> = [
  { path: "/", expected: /SPY Prophet|Discipline before conviction/i },
  { path: "/dashboard", expected: /Decision Slate/i },
  { path: "/spy", expected: /SPY/i },
  { path: "/es", expected: /ES/i },
  { path: "/replay?date=2026-04-29", expected: /Replay a session/i },
  { path: "/foresight", expected: /Foresight/i },
  { path: "/brief", expected: /Open Brief/i },
  { path: "/options", expected: /Options Intelligence/i },
  { path: "/context", expected: /Market Context|Context/i },
  { path: "/flow", expected: /Order Flow|Flow/i },
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
