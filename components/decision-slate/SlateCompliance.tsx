"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const TERMS_VERSION = "closed-beta-2026-05";

export function SlateCompliance({
  build = "Build 0.9.7",
  environment = "production",
  ruleVersion = "v1.0.0",
}: {
  build?: string;
  environment?: string;
  ruleVersion?: string;
}) {
  const userId = useAnonymousUserId();
  const [needsAck, setNeedsAck] = useState(false);

  useEffect(() => {
    const localKey = `spyprophet.slate.ack.${TERMS_VERSION}`;
    if (window.localStorage.getItem(localKey) === "1") return;
    fetch(`/api/slate/compliance?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => setNeedsAck(!data.acknowledged))
      .catch(() => setNeedsAck(true));
  }, [userId]);

  async function acknowledge() {
    await fetch("/api/slate/compliance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, termsVersion: TERMS_VERSION }),
    }).catch(() => null);
    window.localStorage.setItem(`spyprophet.slate.ack.${TERMS_VERSION}`, "1");
    setNeedsAck(false);
  }

  return (
    <>
      {needsAck && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="slate-compliance-title"
          className="fixed inset-0 z-50 grid place-items-center bg-ink/45 px-4"
        >
          <div className="w-full max-w-lg rounded-card border border-rule bg-paper p-5 shadow-card">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-ink">
              Closed beta acknowledgement
            </p>
            <h2 id="slate-compliance-title" className="mt-2 font-serif text-h2 text-ink">
              Decision support, not financial advice.
            </h2>
            <p className="mt-3 text-body text-ink-2">
              SPY Prophet surfaces rule-based decision support for review. You remain
              responsible for trade decisions, sizing, and risk.
            </p>
            <button
              type="button"
              onClick={acknowledge}
              className="mt-5 h-10 rounded-pill bg-ink px-4 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-paper outline-none transition-colors hover:bg-gold-ink focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              I understand
            </button>
          </div>
        </div>
      )}
      <footer className="mt-8 rounded-card border border-rule bg-paper-tier2 px-4 py-3 text-[11px] text-ink-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>
            TODO(legal): Not financial advice. Historical and live market data are
            decision-support inputs only; options trading involves substantial risk.
          </p>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em]">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/risk" className="hover:text-ink">Options risk</Link>
            <span>{build}</span>
            <span>{environment}</span>
            <span>Rules {ruleVersion}</span>
            <Link href="/contact" className="hover:text-ink">Report an issue</Link>
          </div>
        </div>
      </footer>
    </>
  );
}

export function useAnonymousUserId() {
  return useMemo(() => {
    if (typeof window === "undefined") return "anonymous";
    const key = "spyprophet.anonymousUserId";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  }, []);
}
