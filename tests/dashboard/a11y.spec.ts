import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.skip("Decision Slate can run axe without crashing @a11y", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(Array.isArray(results.violations)).toBe(true);
});
