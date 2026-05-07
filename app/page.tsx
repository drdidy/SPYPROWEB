"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";
import { Tickertape } from "@/components/tickertape";
import { DecisionSlate } from "@/components/decision-slate";
import { ProphetChart } from "@/components/prophet-chart";
import { TriggerMap } from "@/components/trigger-map";
import { SignalTape } from "@/components/signal-tape";
import { StructureRead } from "@/components/structure-read";
import { LearningPanel } from "@/components/learning-panel";
import { DailyBrief } from "@/components/pages/daily-brief";
import { Foresight } from "@/components/pages/foresight";
import { ReplayLab } from "@/components/pages/replay-lab";
import { OptionsCockpit } from "@/components/pages/options-cockpit";
import { OrderFlow } from "@/components/pages/order-flow";
import { MarketContext } from "@/components/pages/market-context";
import { SignalLog } from "@/components/pages/signal-log";
import { Analytics } from "@/components/pages/analytics";
import { Configuration } from "@/components/pages/configuration";
import { PageHeader } from "@/components/page-header";
import { Landing } from "@/components/landing";
import { PivotSource } from "@/components/pivot-source";

const ENTERED_KEY = "spy-prophet-entered";

export default function Home() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [page, setPage] = useState("chart");
  const [err, setErr] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ENTERED_KEY) === "1") setEntered(true);
    } catch { /* sessionStorage unavailable; stay on landing */ }
  }, []);

  useEffect(() => {
    fetch("/api/snapshot")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Snapshot) => setSnap(data))
      .catch((e: Error) => setErr(e.message));
  }, []);

  const handleEnter = () => {
    setEntered(true);
    try { sessionStorage.setItem(ENTERED_KEY, "1"); } catch { /* ignore */ }
  };

  if (!entered) {
    return <Landing snap={snap} err={err} onEnter={handleEnter} />;
  }

  return (
    <div className="app">
      <Sidebar page={page} onNav={setPage} />
      <main className="main">
        {snap && <Tickertape snap={snap} />}

        <div className="page">
          {!snap && !err && <div className="t-body c-secondary">Loading snapshot…</div>}
          {err && <div className="t-body c-amber">Could not load /api/snapshot: {err}</div>}

          {snap && page === "chart" && (
            <>
              <DecisionSlate snap={snap} />
              <ProphetChart snap={snap} />
              <TriggerMap snap={snap} />
              <SignalTape snap={snap} />
              <StructureRead snap={snap} />
              <LearningPanel />
            </>
          )}

          {snap && page === "trigger" && (
            <>
              <PageHeader
                title="Trigger Map"
                desc="Every armed level on the board, with distance, bias contribution, and status. Pivot source below shows where today's structure is anchored."
              />
              <TriggerMap snap={snap} />
              <PivotSource pivots={snap.pivots} />
            </>
          )}

          {snap && page === "structure" && (
            <>
              <PageHeader title="Structure Read" desc="The session in three paragraphs and a one-line directive." />
              <StructureRead snap={snap} />
            </>
          )}

          {snap && page === "signal" && (
            <>
              <PageHeader title="Signal Tape" desc="The last eight signals, with score, line, and outcome." />
              <SignalTape snap={snap} />
            </>
          )}

          {page === "learning" && (
            <>
              <PageHeader title="Learning Panel" desc="What the current session is teaching you." />
              <LearningPanel />
            </>
          )}

          {page === "brief"     && <DailyBrief     />}
          {page === "foresight" && <Foresight      />}
          {snap && page === "replay" && <ReplayLab snap={snap} />}
          {snap && page === "options" && <OptionsCockpit snap={snap} />}
          {snap && page === "flow"    && <OrderFlow      snap={snap} />}
          {page === "context"   && <MarketContext snap={snap ?? undefined} />}
          {snap && page === "log" && <SignalLog snap={snap} />}
          {page === "analytics" && <Analytics      />}
          {page === "config"    && <Configuration  />}
        </div>
      </main>
    </div>
  );
}
