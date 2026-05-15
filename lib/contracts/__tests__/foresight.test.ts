import {
  ProjectionMethod,
  ProjectionSnapshot,
  ScenarioInput,
} from "../foresight";

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare const expect: {
  (value: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
  };
};

const hour = {
  at: "2026-05-08T14:30:00.000Z",
  label: "09:30 CT",
  isCurrent: true,
  isObserved: true,
};

const cell = {
  projectionId: "proj_spy_20260508_test",
  lineId: "line_ua",
  lineCode: "UA",
  hour,
  value: 737.5,
  deltaFromLast: 0.25,
  confidence: { band: "high", score: 82 },
  method: "linear_slope",
  isExtrapolated: false,
  isNearestForHour: true,
};

describe("foresight contracts", () => {
  it("parses a strict projection snapshot", () => {
    const parsed = ProjectionSnapshot.parse({
      status: "live",
      engine: "spy",
      sessionId: "2026-05-08",
      matrix: {
        engine: "spy",
        sessionId: "2026-05-08",
        last: 737.25,
        generatedFromLast: 737.25,
        hours: [hour],
        lines: [
          {
            id: "line_ua",
            code: "UA",
            type: "ascending",
            label: "Upper ascending",
            sourceName: "UA-1",
            slopePerHour: -0.2,
            currentValue: 737.5,
          },
        ],
        cells: [[cell]],
      },
      generatedAt: "2026-05-08T14:30:00.000Z",
      ruleVersion: "v1.0.0",
      sourceLastTick: "2026-05-08T14:30:00.000Z",
      nextRefreshAt: "2026-05-08T14:31:00.000Z",
      projectionId: "proj_spy_20260508_test",
      diagnostics: { message: null, waitingOn: [] },
    });

    expect(parsed.matrix.cells[0][0].projectionId).toBe("proj_spy_20260508_test");
  });

  it("keeps projection methods exhaustive", () => {
    expect(ProjectionMethod.options).toEqual([
      "linear_slope",
      "held_flat",
      "regression_band",
      "engine_override",
    ]);
  });

  it("parses scenario discriminators", () => {
    expect(ScenarioInput.parse({ kind: "mean_reversion", pullPct: 0.2 }).kind).toBe(
      "mean_reversion",
    );
  });
});
