"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";
import { Tickertape } from "@/components/tickertape";
import { DecisionSlate, type Verb } from "@/components/decision-slate";
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

function biasToVerb(score: number): Verb {
  if (score <= -50) return "SHORT";
  if (score <= -15) return "WAIT";
  if (score >= 50) return "LONG";
  if (score >= 15) return "HOLD";
  return "WAIT";
}

export default function Home() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [page, setPage] = useState("chart");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/snapshot")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Snapshot) => setSnap(data))
      .catch((e: Error) => setErr(e.message));
  }, []);

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
              <DecisionSlate verb={biasToVerb(snap.bias.score)} />
              <ProphetChart />
              <TriggerMap snap={snap} />
              <SignalTape />
              <StructureRead />
              <LearningPanel />
            </>
          )}

          {snap && page === "trigger" && (
            <>
              <PageHeader
                title="Trigger Map"
                desc="Every armed level on the board, with distance, bias contribution, and status."
              />
              <TriggerMap snap={snap} />
            </>
          )}

          {snap && page === "structure" && (
            <>
              <PageHeader title="Structure Read" desc="The session in three paragraphs and a one-line directive." />
              <StructureRead />
            </>
          )}

          {page === "signal" && (
            <>
              <PageHeader title="Signal Tape" desc="The last eight signals, with score, line, and outcome." />
              <SignalTape />
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
          {page === "replay"    && <ReplayLab      />}
          {page === "options"   && <OptionsCockpit />}
          {page === "flow"      && <OrderFlow      />}
          {page === "context"   && <MarketContext  />}
          {page === "log"       && <SignalLog      />}
          {page === "analytics" && <Analytics      />}
          {page === "config"    && <Configuration  />}
        </div>
      </main>
    </div>
  );
}
