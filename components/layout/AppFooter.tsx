"use client";

import Link from "next/link";

const BUILD_LABEL = "Build 0.9.7";
const RULE_VERSION = "v1.0.0";

export function AppFooter() {
  return (
    <footer className="mt-8 rounded-[14px] border border-rule bg-paper-tier2 px-4 py-3 text-[11px] leading-relaxed text-ink-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p>
          SPY Prophet is decision-support software, not financial advice. Market
          and options data may be delayed, incomplete, or unavailable.
        </p>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em]">
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/risk" className="hover:text-ink">
            Options risk
          </Link>
          <span>{BUILD_LABEL}</span>
          <span>Rules {RULE_VERSION}</span>
          <Link href="/contact" className="hover:text-ink">
            Report an issue
          </Link>
        </div>
      </div>
    </footer>
  );
}
