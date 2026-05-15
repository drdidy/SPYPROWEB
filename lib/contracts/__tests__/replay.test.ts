import { BarSize, DecisionTrailEntry, ReplaySnapshot } from "../replay";

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare const expect: {
  (value: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
  };
};

describe("replay contracts", () => {
  it("parses a strict replay snapshot", () => {
    const parsed = ReplaySnapshot.parse({
      sessionId: "2026-04-29",
      engine: "both",
      barSize: "5m",
      bars: [
        {
          at: "2026-04-29T14:30:00.000Z",
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        },
      ],
      channelOverlay: [],
      anchorOverlay: [],
      decisionTrail: [],
      lineTouches: [],
      builtAt: "2026-04-29T20:00:00.000Z",
      ruleVersion: "v1.0.0",
      status: "ready",
    });
    expect(parsed.barSize).toBe("5m");
  });

  it("keeps bar-size enum exhaustive", () => {
    expect(BarSize.options).toEqual(["1m", "5m", "15m", "30m", "60m"]);
  });

  it("parses the decision trail discriminator", () => {
    const entry = DecisionTrailEntry.parse({
      kind: "rule_note",
      id: "entry_1",
      engine: "spy",
      at: "2026-04-29T15:00:00.000Z",
      detail: "No qualified rejection yet.",
    });
    expect(entry.kind).toBe("rule_note");
  });
});
