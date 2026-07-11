import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/dashboard", "/map", "/replay?date=2026-04-29", "/log", "/agents", "/learn", "/settings"];

test.describe("critical accessibility", () => {
  for (const route of ROUTES) {
    test(`${route} has no serious or critical axe violations`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await expect(page).toHaveTitle(/SPY Prophet/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");

      const results = await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );

      expect(blocking).toEqual([]);
    });
  }
});
