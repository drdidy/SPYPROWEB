// Slate-deliverable name for the existing live-ticking countdown.
// LiveCountdown is the canonical implementation; we re-export under
// `<Countdown />` so consumers can reach for the deliverable name from
// the spec without breaking in-tree references.

export { LiveCountdown as Countdown } from "./LiveCountdown";
