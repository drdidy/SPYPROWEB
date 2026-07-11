import { expect, test } from "@playwright/test";

test("Replay renders readable moving candlesticks for SPY and ES", async ({ page }) => {
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

  await expect(page.getByRole("img", { name: /SPY candlestick replay chart/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Weekly gates" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("WEEKLY RESISTANCE", { exact: true })).toBeVisible();
  await expect(page.getByText("WEEKLY SUPPORT", { exact: true })).toBeVisible();
  await expect(page.getByText("Data integrity")).toBeVisible();
  await expect(page.getByText("Historical context")).toBeVisible();
  await expect(page.getByText(/VIX regime:/)).toBeVisible();
  await expect(page.getByText("Engine archive")).toBeVisible();
  await expect(page.getByText("ENTRY", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Gate tape")).toBeVisible();
  await page.getByRole("button", { name: "Weekly gates" }).click();
  await expect(page.getByText("WEEKLY RESISTANCE", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Weekly gates" }).click();
  await expect(page.getByText("WEEKLY RESISTANCE", { exact: true })).toBeVisible();
  const slider = page.getByLabel("Replay position");
  const spyBefore = Number(await slider.inputValue());
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Pause" }).click();
  const spyAfter = Number(await slider.inputValue());
  expect(spyAfter).toBeGreaterThan(spyBefore);

  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByRole("img", { name: /ES candlestick replay chart/i })).toBeVisible();
  const esBefore = Number(await slider.inputValue());
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Pause" }).click();
  const esAfter = Number(await slider.inputValue());
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
  const control = {
    sourceDate: "2026-04-27",
    sourceWindow: "12:00-14:00 CT",
    anchorAt: "2026-04-27T17:00:00.000Z",
    anchorPrice: 741.2,
    slopePerHour: 0.12,
    spacing: 3.4,
    zoneWidth: 0.4,
    valueAtFirstBar: 738.6,
    slopePerBar: 0.01,
    gateIndices: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
    method: "Completed Monday 12-2 CT high carried through the week",
  };
  return {
    date: "2026-04-29",
    spy,
    es,
    controls: {
      spy: control,
      es: {
        ...control,
        anchorPrice: 7442,
        valueAtFirstBar: 7418,
        slopePerHour: 1.04,
        slopePerBar: 1.04 / 12,
        spacing: 34,
        zoneWidth: null,
      },
    },
    context: {
      spx: spy.map((bar) => ({ ...bar, o: bar.o * 10, h: bar.h * 10, l: bar.l * 10, c: bar.c * 10 })),
      vix: spy.map((bar) => ({ ...bar, o: 18.1, h: 18.3, l: 17.9, c: 18.2 })),
    },
    events: [{
      id: "accepted-entry",
      at: spy[0].t,
      symbol: "SPY",
      kind: "entry",
      direction: "long",
      price: spy[0].c,
      status: "accepted",
    }],
  };
}
