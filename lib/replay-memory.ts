export type ReplayMemoryQuestion = {
  key: string;
  prompt: string;
  value: "pending";
};

export type ReplayMemorySnapshot = {
  status: "collecting";
  summary: string;
  questions: ReplayMemoryQuestion[];
  nextWrite: string;
};

export function buildReplayMemorySnapshot(): ReplayMemorySnapshot {
  return {
    status: "collecting",
    summary:
      "Replay Memory is ready to grade completed sessions. It stores outcomes, gate behavior, alert timing, and contract confirmation notes without exposing calibration logic.",
    questions: [
      { key: "control-line", prompt: "Did the Control Line matter today?", value: "pending" },
      { key: "gate", prompt: "Which gate produced the cleanest reaction?", value: "pending" },
      { key: "direction", prompt: "Was buy-bottom or sell-top the better read?", value: "pending" },
      { key: "target", prompt: "Did price reach the next gate before invalidation?", value: "pending" },
      { key: "timing", prompt: "Was the alert early, late, or correct?", value: "pending" },
      { key: "options", prompt: "Did the chosen contract confirm with premium momentum?", value: "pending" },
    ],
    nextWrite: "After the next completed session",
  };
}
