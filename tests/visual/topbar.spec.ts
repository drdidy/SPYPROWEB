/**
 * Visual-regression / overflow guard for the TopBar.
 *
 * STATUS: Playwright is not yet installed in this repo. This file is
 * the ready-to-run spec for when it lands. Until then, the static-
 * analysis guard at scripts/test-topbar-layout.ts provides
 * structural-invariant coverage (run via `npx tsx
 * scripts/test-topbar-layout.ts`).
 *
 * Plan when Playwright is added (one line to enable, plus the spec):
 *   1. `npm i -D @playwright/test && npx playwright install chromium`
 *   2. Add a `test:visual` script: `playwright test tests/visual`.
 *   3. Wire it into the CI workflow on every PR.
 *
 * What this spec asserts:
 *   - At each of 1440 / 1280 / 1024 widths, the top bar's
 *     scrollWidth <= clientWidth (no horizontal overflow / clipped
 *     content).
 *   - No two text-bearing elements inside the top bar have
 *     overlapping bounding rects (the literal symptom of every
 *     previous regression).
 *
 * The bar is selected by `data-testid="topbar"` on the <header>.
 */

// @ts-nocheck — Playwright types aren't installed yet; stub safely.
// Once `@playwright/test` is added remove this line and the test
// runs as-is.

import { test, expect } from "@playwright/test";

const WIDTHS = [1440, 1280, 1024] as const;

const TARGET_URL = process.env.E2E_BASE_URL
  ? `${process.env.E2E_BASE_URL}/dashboard`
  : "http://localhost:3000/dashboard";

for (const width of WIDTHS) {
  test(`TopBar fits without overflow @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });

    const bar = page.getByTestId("topbar");
    await expect(bar).toBeVisible();

    const { scrollW, clientW } = await bar.evaluate((el: HTMLElement) => ({
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    }));
    expect(scrollW).toBeLessThanOrEqual(clientW);
  });

  test(`TopBar has no overlapping text segments @ ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });

    const overlapping = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="topbar"]');
      if (!bar) return [];
      // Collect every leaf text-bearing node inside the bar.
      const candidates = Array.from(
        bar.querySelectorAll(
          "span, button, a, [data-num]",
        ),
      ).filter((el) => (el.textContent || "").trim().length > 0);
      const rects = candidates.map((el) => el.getBoundingClientRect());
      const collisions: string[] = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          // Skip ancestor/descendant pairs — they obviously overlap.
          if (
            candidates[i].contains(candidates[j]) ||
            candidates[j].contains(candidates[i])
          ) {
            continue;
          }
          const overlapsX = a.left < b.right && b.left < a.right;
          const overlapsY = a.top < b.bottom && b.top < a.bottom;
          if (overlapsX && overlapsY) {
            collisions.push(
              `${candidates[i].textContent?.trim().slice(0, 30)} ↔ ${candidates[
                j
              ].textContent?.trim().slice(0, 30)}`,
            );
          }
        }
      }
      return collisions;
    });

    expect(overlapping, `overlapping text pairs: ${overlapping.join(" | ")}`).toEqual([]);
  });
}
