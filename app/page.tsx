"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";
import { LandingHero } from "@/components/landing";
import { TriggerMap } from "@/components/trigger-map";

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
    <main className="flex min-h-screen text-text-primary bg-canvas">
      <Sidebar page={page} onNav={setPage} />
      <div className="flex-1 min-w-0">
        {!snap && !err && (
          <div className="px-10 py-10 text-text-muted text-sm">Loading snapshot…</div>
        )}
        {err && (
          <div className="px-10 py-10 text-accent-amber text-sm">
            Could not load /api/snapshot: {err}
          </div>
        )}
        {snap && (
          <>
            <LandingHero snap={snap} />
            {(page === "chart" || page === "trigger") && <TriggerMap snap={snap} />}
            {page !== "chart" && page !== "trigger" && (
              <section className="px-10 py-12 text-text-muted text-sm">
                <div className="text-text-primary text-base font-medium mb-2">
                  {pageTitle(page)}
                </div>
                <p>Page shell not ported yet — coming in a follow-up commit on this branch.</p>
              </section>
            )}
            <footer className="px-10 py-6 border-t border-border text-[10px] tracking-[0.14em] uppercase text-text-dim flex justify-between">
              <span>Source: {snap.source}</span>
              <span className="tabular">{new Date(snap.asOf).toLocaleString()}</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

function pageTitle(id: string) {
  return (
    {
      chart: "Prophet Chart",
      trigger: "Trigger Map",
      structure: "Structure Read",
      signal: "Signal Tape",
      decision: "Decision Quality",
      options: "Premium Flow",
      learning: "Learning Panel",
      journal: "Trade Journal",
    }[id] ?? id
  );
}
