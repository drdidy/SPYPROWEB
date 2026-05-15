"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { useAnonymousUserId } from "./SlateCompliance";

interface VerdictRecord {
  id: string;
  type: "render" | "acknowledged";
  timestamp: string;
  verdictState: string;
  spyState: string;
  spxState: string;
  sessionDate: string;
}

export function VerdictActions({
  verdictState,
  spyState,
  spxState,
  sessionDate,
  ruleVersion = "v1.0.0",
}: {
  verdictState: string;
  spyState: string;
  spxState: string;
  sessionDate: string;
  ruleVersion?: string;
}) {
  const userId = useAnonymousUserId();
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<VerdictRecord[]>([]);

  useEffect(() => {
    const payload = { type: "render", userId, verdictState, spyState, spxState, ruleVersion, sessionDate };
    fetch("/api/slate/verdicts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
  }, [sessionDate, ruleVersion, spxState, spyState, userId, verdictState]);

  async function openHistory() {
    setOpen(true);
    const res = await fetch(`/api/slate/verdicts?userId=${encodeURIComponent(userId)}`).catch(() => null);
    if (!res) return;
    const data = await res.json();
    setRecords(data.records ?? []);
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openHistory}
          className="inline-flex h-9 items-center gap-2 rounded-pill border border-paper/15 bg-paper/[0.06] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-paper/78 outline-none transition-colors hover:bg-paper/[0.10] focus-visible:ring-2 focus-visible:ring-gold/60"
        >
          <History size={13} aria-hidden />
          Decision history
        </button>
      </div>
      {open && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-rule bg-paper p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Decision history
              </p>
              <h2 className="mt-1 font-serif text-h2 text-ink">Recent slate records</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close decision history"
              className="grid h-9 w-9 place-items-center rounded-full border border-rule text-ink-3 hover:text-ink"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
          <ol className="mt-5 space-y-3">
            {records.length === 0 ? (
              <li className="rounded-soft border border-rule bg-paper-2/50 p-3 text-body text-ink-3">
                No verdict records yet.
              </li>
            ) : (
              records.map((record) => (
                <li key={record.id} className="rounded-soft border border-rule bg-paper-2/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-serif text-h3 text-ink">{record.verdictState}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-ink-3">
                      {record.type}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-ink-3 tabular-nums">
                    {new Date(record.timestamp).toLocaleString()}
                  </p>
                  <Link
                    href={`/replay?date=${encodeURIComponent(record.sessionDate)}`}
                    className="mt-2 inline-flex font-mono text-[10px] uppercase tracking-[0.12em] text-gold-ink hover:text-ink"
                  >
                    Replay this session
                  </Link>
                </li>
              ))
            )}
          </ol>
        </div>
      )}
    </>
  );
}
