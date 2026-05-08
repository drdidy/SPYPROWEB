"use client";
// Shared client hooks for live SPY + SPX snapshots.
//
// Server components seed initial values via props; these hooks then
// poll their respective endpoints every 30s and replace the seed
// with the freshest data. That way the page renders instantly
// (no flicker) AND the numbers stay current without a reload.

import { useEffect, useState } from "react";

import { adaptSnapshot, type RawSnapshot, type AdaptedSnapshot } from "./snapshot-adapter";
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
}

export interface LiveSPYInitial {
  decision?: DecisionState;
  shell?: AdaptedSnapshot["shellState"];
  source?: AdaptedSnapshot["source"];
}

export function useLiveSPY(initial?: LiveSPYInitial): LiveSPYView {
  const [view, setView] = useState<LiveSPYView>(() => ({
    decision: initial?.decision ?? mockDecision,
    shell: initial?.shell ?? {
      spy: mockShell.spy,
      change: mockShell.change,
      changePct: mockShell.changePct,
      vix: mockShell.vix,
      isLive: false,
      sessionLabel: mockShell.sessionLabel,
      sessionCloses: mockShell.sessionCloses,
    },
    source: initial?.source ?? "seed",
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
  const [snap, setSnap] = useState<SPXSnapshot>(initial ?? mockSpx);
  useEffect(() => {
    let abort = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/spx/snapshot", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as SPXSnapshot;
        if (!abort) setSnap(next);
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
