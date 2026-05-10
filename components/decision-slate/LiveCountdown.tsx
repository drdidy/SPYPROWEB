"use client";

// Backwards-compatible alias. <Countdown /> is the canonical, tier-
// based, memoized implementation as of v2 of the Decision Slate. Any
// callers that imported `LiveCountdown` continue to work unchanged.

import { Countdown } from "./Countdown";

export const LiveCountdown = Countdown;
