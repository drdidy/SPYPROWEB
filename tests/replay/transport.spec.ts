import { expect, test } from "@playwright/test";

test("Replay has independent moving transports for SPY and ES", async ({ page }) => {
  const replayBars = buildReplayBars();
  await page.addInitScript((payload) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes("/api/replay/intraday")) {
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (url.includes("/api/snapshot") || url.includes("/api/spx/snapshot")) {
        return Promise.resolve(new Response("", { status: 404 }));
      }
      return originalFetch(input, init);
    };
  }, replayBars);
  await page.route(/\/api\/snapshot/, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.route(/\/api\/spx\/snapshot/, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.route(/\/api\/replay\/intraday/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(replayBars),
    }),
  );

  await page.goto("/replay?date=2026-04-29", { waitUntil: "domcontentloaded" });

  const spyChart = page.getByTestId("spy-replay-chart");
  const esChart = page.getByTestId("es-replay-chart");
  await expect(spyChart).toBeVisible({ timeout: 20_000 });
  await expect(esChart).toBeVisible({ timeout: 20_000 });

  const spySlider = page.getByLabel(/SPY .* replay timeline/i);
  const esSlider = page.getByLabel(/ES .* replay timeline/i);

  const spyBefore = Number(await spySlider.inputValue());
  await page.getByTestId("spy-replay-play").click();
  await expect(page.getByTestId("spy-replay-play")).toHaveText(/Pause SPY/i);
  await page.waitForTimeout(900);
  await page.getByTestId("spy-replay-play").click();
  const spyAfter = Number(await spySlider.inputValue());
  expect(spyAfter).toBeGreaterThan(spyBefore);

  const esBefore = Number(await esSlider.inputValue());
  await page.getByTestId("es-replay-play").click();
  await expect(page.getByTestId("es-replay-play")).toHaveText(/Pause ES/i);
  await page.waitForTimeout(900);
  await page.getByTestId("es-replay-play").click();
  const esAfter = Number(await esSlider.inputValue());
  expect(esAfter).toBeGreaterThan(esBefore);
});

function buildReplayBars() {
  const spy = Array.from({ length: 24 }, (_, index) => {
    const hh = 8 + Math.floor(index / 12);
    const mm = (index % 12) * 5;
    const close = 738 + Math.sin(index / 3) * 0.7 + index * 0.03;
    return {
      t: `2026-04-29T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-05:00`,
      o: close - 0.12,
      h: close + 0.28,
      l: close - 0.22,
      c: close,
    };
  });
  const es = spy.map((bar, index) => ({
    ...bar,
    c: 7420 + Math.cos(index / 4) * 4 + index * 0.4,
    o: 7420 + Math.cos(index / 4) * 4 + index * 0.4 - 0.5,
    h: 7420 + Math.cos(index / 4) * 4 + index * 0.4 + 1.1,
    l: 7420 + Math.cos(index / 4) * 4 + index * 0.4 - 1.2,
  }));
  return { date: "2026-04-29", spy, es };
}
