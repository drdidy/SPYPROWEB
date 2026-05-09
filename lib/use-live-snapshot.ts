"use client";
// Shared client hooks for live SPY + SPX snapshots.
//
// Server components seed initial values via props; these hooks then
// poll their respective endpoints every 30s and replace the seed
// with the freshest data. That way the page renders instantly
// (no flicker) AND the numbers stay current without a reload.

import { useEffect, useState } from "react";

import { adaptSnapshot, applySpxSessionGate, type RawSnapshot, type AdaptedSnapshot } from "./snapshot-adapter";
import {
  decision as mockDecision,
  shellState as mockShell,
} from "./mock-data";
import { spxSnapshot as mockSpx } from "./spx-mock-data";
import type { DecisionState, SPXSnapshot } from "./types";

const POLL_MS = 30_000;

export interface LiveSPYView {
  decision: DecisionState;
  shell: AdaptedSnapshot["shellState"];
  source: AdaptedSnapshot["source"];
  currentState: AdaptedSnapshot["currentState"];
  flipCondition: AdaptedSnapshot["flipCondition"];
}

export interface LiveSPYInitial {
  decision?: DecisionState;
  shell?: AdaptedSnapshot["shellState"];
  source?: AdaptedSnapshot["source"];
  currentState?: AdaptedSnapshot["currentState"];
  flipCondition?: AdaptedSnapshot["flipCondition"];
}

export function useLiveSPY(initial?: LiveSPYInitial): LiveSPYView {
  const [view, setView] = useState<LiveSPYView>(() => ({
    decision: initial?.decision ?? mockDecision,
    shell: initial?.shell ?? {
      spy: mockShell.spy,
      change: mockShell.change,
      changePct: mockShell.changePct,
      vix: mockShell.vix,
      vixDelta: 0,
      isLive: false,
      sessionLabel: mockShell.sessionLabel,
      sessionCloses: mockShell.sessionCloses,
      feedHealth: { lastTickTs: new Date().toISOString(), source: "seed" },
    },
    source: initial?.source ?? "seed",
    currentState: initial?.currentState ?? "WAIT",
    flipCondition: initial?.flipCondition ?? "",
  }));

  useEffect(() => {
    let abort = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        if (!res.ok) return;
        const raw = (await res.json()) as RawSnapshot;
        if (abort) return;
        const adapted = adaptSnapshot(raw);
        setView({
          decision: adapted.decision,
          shell: adapted.shellState,
          source: adapted.source,
          currentState: adapted.currentState,
          flipCondition: adapted.flipCondition,
        });
      } catch {
        // keep last good state
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      abort = true;
      clearInterval(id);
    };
  }, []);

  return view;
}

export function useLiveSPX(initial?: SPXSnapshot): SPXSnapshot {
  // Initial-state fallback: mockSpx has action=TAKE / direction=ASCENDING
  // / a stale price. Without gating it, a TopBar consumer of this hook
  // shows "TAKE · 5872.00" on weekends before the first poll completes.
  // Gate the seed so the very first paint is honest.
  const [snap, setSnap] = useState<SPXSnapshot>(
    () => initial ?? applySpxSessionGate(mockSpx),
  );
  useEffect(() => {
    let abort = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/spx/snapshot", { cache: "no-store" });
        if (!res.ok) {
          // API failed — keep what we have, but ensure it's gated for
          // the current moment (session phase may have changed since
          // mount, e.g. a Sunday 17:00 transition).
          if (!abort) setSnap((s) => applySpxSessionGate(s));
          return;
        }
        const next = (await res.json()) as SPXSnapshot;
        if (!abort) setSnap(applySpxSessionGate(next));
      } catch {
        // keep last good
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      abort = true;
      clearInterval(id);
    };
  }, []);
  return snap;
}
